from backend.agent.schema import MusicWindowSummary, VisualModuleEnvelope
from backend.strategy.engine import create_demo_module


def generate_visual_module(summary: MusicWindowSummary) -> VisualModuleEnvelope:
    return create_demo_module(summary)
