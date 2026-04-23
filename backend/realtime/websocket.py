from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.agent.graph import generate_visual_module
from backend.agent.schema import MusicWindowSummary
from backend.strategy.validator import validate_visual_module_envelope

router = APIRouter()


@router.websocket("/ws")
async def visual_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "server_ready"})

    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") != "music_window":
                raise ValueError(f"unsupported websocket message type: {message.get('type')}")

            summary = MusicWindowSummary.model_validate(message["payload"])
            envelope = generate_visual_module(summary)
            validate_visual_module_envelope(envelope)
            await websocket.send_json(envelope.model_dump())
    except WebSocketDisconnect:
        return
