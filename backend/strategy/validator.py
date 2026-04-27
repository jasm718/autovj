import re

from backend.agent.schema import VisualModuleEnvelope
from backend.strategy.capability import FORBIDDEN_CODE_TOKENS


ENTRYPOINT_PATTERN = re.compile(r"export\s+function\s+createVisualModule\s*\(\s*api\s*\)")
FORBIDDEN_SYNTAX_PATTERNS = (
    re.compile(r"\bwhile\s*\("),
    re.compile(r"\bdo\s*\{"),
    re.compile(r"\bfor\s*\([^;]+(?:\bin\b|\bof\b)"),
    re.compile(r"\bnew\s+(?:Function|Promise|WebSocket|Worker|XMLHttpRequest)\b"),
    re.compile(r"\b(?:window|document|globalThis|self)\s*\."),
)


def validate_visual_module_envelope(envelope: VisualModuleEnvelope) -> None:
    code = envelope.code

    if envelope.type != "visual_module":
        raise ValueError(f"unsupported envelope type: {envelope.type}")
    if envelope.apiVersion != "1":
        raise ValueError(f"unsupported visual api version: {envelope.apiVersion}")
    if envelope.targetLayer != "canvas":
        raise ValueError(f"unsupported target layer: {envelope.targetLayer}")
    if not envelope.moduleId.strip():
        raise ValueError("visual module must include moduleId")
    if not ENTRYPOINT_PATTERN.search(code):
        raise ValueError("visual module must export createVisualModule(api)")
    if len(ENTRYPOINT_PATTERN.findall(code)) != 1:
        raise ValueError("visual module must contain exactly one createVisualModule(api)")
    if "drawBackground(frame, bg)" not in code:
        raise ValueError("visual module lifecycle must include drawBackground(frame, bg)")
    if "update(frame)" not in code:
        raise ValueError("visual module lifecycle must include update(frame)")
    if "return {" not in code:
        raise ValueError("visual module must return a lifecycle object")

    for token in FORBIDDEN_CODE_TOKENS:
        if token in code:
            raise ValueError(f"visual module contains forbidden token: {token}")

    for pattern in FORBIDDEN_SYNTAX_PATTERNS:
        if pattern.search(code):
            raise ValueError(f"visual module contains forbidden syntax: {pattern.pattern}")
