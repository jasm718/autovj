from backend.agent.schema import VisualModuleEnvelope
from backend.strategy.capability import FORBIDDEN_CODE_TOKENS


def validate_visual_module_envelope(envelope: VisualModuleEnvelope) -> None:
    code = envelope.code
    if "export function createVisualModule(api)" not in code:
        raise ValueError("visual module must export createVisualModule(api)")

    for token in FORBIDDEN_CODE_TOKENS:
        if token in code:
            raise ValueError(f"visual module contains forbidden token: {token}")
