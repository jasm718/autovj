import json
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from functools import lru_cache
from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph

from backend.agent.prompt import (
    VISUAL_MODULE_SYSTEM_PROMPT,
    build_visual_module_user_prompt,
    choose_creative_direction,
)
from backend.agent.schema import AgentState, MusicWindowSummary, VisualModuleEnvelope
from backend.settings import get_agent_settings
from backend.strategy.validator import validate_visual_module_envelope


_MODEL_EXECUTOR = ThreadPoolExecutor(max_workers=2)


def _extract_json_object(raw_output: str) -> dict[str, Any]:
    stripped = raw_output.strip()

    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("agent output does not contain a JSON object")

    return json.loads(stripped[start : end + 1])


@lru_cache(maxsize=1)
def _get_chat_model():
    settings = get_agent_settings()
    model_name = settings.model
    if not model_name:
        return None

    kwargs: dict[str, Any] = {
        "temperature": 0.7,
        "timeout": settings.timeout_seconds,
        "max_retries": 0,
    }
    if settings.provider:
        kwargs["model_provider"] = settings.provider
    elif settings.api_key and settings.base_url:
        kwargs["model_provider"] = "openai"
    if settings.api_key:
        kwargs["api_key"] = settings.api_key
    if settings.base_url:
        kwargs["base_url"] = settings.base_url

    return init_chat_model(model_name, **kwargs)


def _build_prompt_node(state: AgentState) -> AgentState:
    settings = get_agent_settings()
    recent_modules = state.get("recent_modules", [])
    creative_direction = choose_creative_direction(state["summary"], recent_modules)
    user_prompt = build_visual_module_user_prompt(
        state["summary"],
        recent_modules=recent_modules,
        creative_direction=creative_direction,
    )
    return {
        **state,
        "prompt": user_prompt,
        "metadata": {
            **state.get("metadata", {}),
            "agent_model": settings.model or "local-fallback",
            "agent_provider": settings.provider or ("openai-compatible" if settings.base_url else "local"),
            "creative_direction_name": creative_direction["name"],
        },
    }


def _generate_node(state: AgentState) -> AgentState:
    model = _get_chat_model()

    if model is None:
        raise RuntimeError("agent model is not configured")

    settings = get_agent_settings()
    messages = [
        SystemMessage(content=VISUAL_MODULE_SYSTEM_PROMPT),
        HumanMessage(content=state["prompt"]),
    ]
    future = _MODEL_EXECUTOR.submit(model.invoke, messages)
    try:
        response = future.result(timeout=settings.timeout_seconds)
    except TimeoutError as exc:
        future.cancel()
        raise TimeoutError(f"agent model timed out after {settings.timeout_seconds:g}s") from exc
    raw_output = response.content if isinstance(response.content, str) else json.dumps(response.content)

    parsed = _extract_json_object(raw_output)
    envelope = VisualModuleEnvelope.model_validate(parsed)
    if envelope.source is None:
        envelope.source = "llm"

    return {
        **state,
        "envelope": envelope,
        "raw_output": raw_output,
        "metadata": {
            **state.get("metadata", {}),
            "source": "llm",
        },
    }


def _validate_node(state: AgentState) -> AgentState:
    envelope = state["envelope"]
    validate_visual_module_envelope(envelope)
    return state


def _safe_generate_node(state: AgentState) -> AgentState:
    try:
        return _generate_node(state)
    except Exception as exc:
        return {
            **state,
            "error": str(exc),
        }


def _safe_validate_node(state: AgentState) -> AgentState:
    try:
        return _validate_node(state)
    except Exception as exc:
        return {
            **state,
            "error": str(exc),
        }


def create_visual_agent_graph():
    graph = StateGraph(AgentState)
    graph.add_node("build_prompt", _build_prompt_node)
    graph.add_node("generate", _safe_generate_node)
    graph.add_node("validate", _safe_validate_node)

    graph.add_edge(START, "build_prompt")
    graph.add_edge("build_prompt", "generate")
    graph.add_edge("generate", "validate")
    graph.add_edge("validate", END)

    return graph.compile()


@lru_cache(maxsize=1)
def _compiled_visual_agent_graph():
    return create_visual_agent_graph()


def generate_visual_module(summary: MusicWindowSummary) -> VisualModuleEnvelope:
    state = _compiled_visual_agent_graph().invoke(
        {
            "summary": summary,
            "metadata": {},
        }
    )
    if state.get("error"):
        raise RuntimeError(state["error"])
    envelope = state["envelope"]
    validate_visual_module_envelope(envelope)
    return envelope


def build_agent_trace_payloads(state: AgentState) -> list[dict[str, str]]:
    payloads: list[dict[str, str]] = []
    metadata = state.get("metadata", {})
    model_name = metadata.get("agent_model", "unknown")
    provider = metadata.get("agent_provider", "unknown")
    prompt = state.get("prompt")
    raw_output = state.get("raw_output")

    if isinstance(prompt, str) and prompt.strip():
        payloads.append(
            {
                "stage": "model_input",
                "title": "model input",
                "content": "\n".join(
                    [
                        f"MODEL: {model_name}",
                        f"PROVIDER: {provider}",
                        "",
                        "SYSTEM",
                        VISUAL_MODULE_SYSTEM_PROMPT,
                        "",
                        "USER",
                        prompt,
                    ]
                ),
            }
        )

    if isinstance(raw_output, str) and raw_output.strip():
        payloads.append(
            {
                "stage": "model_output",
                "title": "model output",
                "content": "\n".join(
                    [
                        f"MODEL: {model_name}",
                        f"PROVIDER: {provider}",
                        "",
                        raw_output,
                    ]
                ),
            }
        )

    return payloads


def summarize_recent_module_reference(envelope: VisualModuleEnvelope, metadata: dict[str, Any] | None = None) -> str:
    code = envelope.code
    metadata = metadata or {}

    geometry_matches: list[str] = []
    for match in re.finditer(r"geometry:\s*'([^']+)'", code):
        geometry = match.group(1)
        if geometry not in geometry_matches:
            geometry_matches.append(geometry)

    background_tags: list[str] = []
    if "bg.line(" in code:
        background_tags.append("scanlines")
    if "bg.rect(" in code:
        background_tags.append("bands")
    if "bg.circle(" in code:
        background_tags.append("halos")
    if "bg.ellipse(" in code:
        background_tags.append("ellipses")
    if "bg.beginShape(" in code:
        background_tags.append("polylines")
    if "bg.text(" in code:
        background_tags.append("typography")

    direction_name = str(metadata.get("creative_direction_name") or "unknown")
    geometries = ",".join(geometry_matches[:4]) or "unknown"
    background = ",".join(background_tags[:4]) or "unknown"
    return f"direction={direction_name}; module={envelope.moduleId}; geometries={geometries}; background={background}"


def run_visual_module_generation(summary: MusicWindowSummary, recent_modules: list[str] | None = None) -> AgentState:
    return _compiled_visual_agent_graph().invoke(
        {
            "summary": summary,
            "recent_modules": recent_modules or [],
            "metadata": {},
        }
    )
