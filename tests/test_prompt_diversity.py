import unittest

from backend.agent.prompt import build_visual_module_user_prompt, choose_creative_direction
from backend.agent.schema import MusicWindowSummary, VisualModuleEnvelope
from backend.agent.graph import summarize_recent_module_reference


class PromptDiversityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.summary = MusicWindowSummary(
            windowSeconds=30,
            bpm=126,
            energy=0.48,
            bassEnergy=0.4,
            midEnergy=0.37,
            highEnergy=0.24,
            beatDensity=0.19,
            moodHint="groove",
        )

    def test_creative_direction_avoids_recent_direction_when_possible(self) -> None:
        direction = choose_creative_direction(
            self.summary,
            recent_modules=[
                "direction=geometric-quilt; module=recent-a; geometries=box,plane; background=grid,bands",
                "direction=cut-paper-bands; module=recent-b; geometries=plane,cylinder; background=bands,halos",
            ],
        )

        self.assertNotEqual(direction["name"], "geometric-quilt")
        self.assertNotEqual(direction["name"], "cut-paper-bands")
        self.assertTrue(direction["prompt"])

    def test_user_prompt_includes_p5_reference_and_recent_module_guardrails(self) -> None:
        direction = choose_creative_direction(self.summary, recent_modules=[])
        prompt = build_visual_module_user_prompt(
            self.summary,
            recent_modules=[
                "direction=moire-grid; module=recent-a; geometries=torus,sphere; background=scanlines,halos",
            ],
            creative_direction=direction,
        )

        self.assertIn("p5.js 社区里优秀 generative art 作品的语言", prompt)
        self.assertIn("最近模块摘要", prompt)
        self.assertIn("避免重复最近已经用过的主 geometry", prompt)
        self.assertIn(direction["name"], prompt)

    def test_recent_module_reference_extracts_direction_and_visual_signature(self) -> None:
        envelope = VisualModuleEnvelope(
            type="visual_module",
            apiVersion="1",
            moduleId="agent-groove-1234",
            targetLayer="canvas",
            duration=30,
            transitionSeconds=4,
            code="""
export function createVisualModule(api) {
  const root = api.root
  const core = api.createMesh({ geometry: 'sphere', material: 'standard', color: '#fff', radius: 0.4 })
  const ring = api.createMesh({ geometry: 'torus', material: 'emissive', color: '#0ff', radius: 1 })
  return {
    init() { root.add(core); root.add(ring) },
    drawBackground(frame, bg) {
      bg.background('#000', 1)
      bg.rect(0, 0, bg.width, bg.height)
      bg.line(0, 0, bg.width, bg.height)
      bg.circle(bg.width * 0.5, bg.height * 0.5, bg.width * 0.6)
    },
    update(frame) { ring.rotation.y += frame.delta * 0.2 },
    dispose() {},
  }
}
""".strip(),
            source="llm",
        )

        reference = summarize_recent_module_reference(
            envelope,
            {"creative_direction_name": "moire-grid"},
        )

        self.assertIn("direction=moire-grid", reference)
        self.assertIn("geometries=sphere,torus", reference)
        self.assertIn("background=scanlines,bands,halos", reference)


if __name__ == "__main__":
    unittest.main()
