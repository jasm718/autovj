from collections import deque

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.agent.graph import (
    build_agent_trace_payloads,
    run_visual_module_generation,
    summarize_recent_module_reference,
)
from backend.agent.schema import MusicWindowSummary
from backend.strategy.validator import validate_visual_module_envelope

router = APIRouter()


@router.websocket("/ws")
async def visual_socket(websocket: WebSocket) -> None:
    recent_modules: deque[str] = deque(maxlen=4)
    try:
        await websocket.accept()
        await websocket.send_json({"type": "server_ready"})

        while True:
            message = await websocket.receive_json()
            if message.get("type") != "music_window":
                raise ValueError(f"unsupported websocket message type: {message.get('type')}")

            try:
                summary = MusicWindowSummary.model_validate(message["payload"])
                state = run_visual_module_generation(summary, list(recent_modules))
                for trace_payload in build_agent_trace_payloads(state):
                    await websocket.send_json(
                        {
                            "type": "agent_trace",
                            **trace_payload,
                        }
                    )
                if state.get("error"):
                    raise RuntimeError(state["error"])
                envelope = state["envelope"]
                validate_visual_module_envelope(envelope)
                recent_modules.append(
                    summarize_recent_module_reference(
                        envelope,
                        state.get("metadata", {}),
                    )
                )
                await websocket.send_json(envelope.model_dump())
            except (ValidationError, ValueError, RuntimeError) as exc:
                await websocket.send_json(
                    {
                        "type": "agent_error",
                        "message": str(exc),
                    }
                )
    except WebSocketDisconnect:
        return
