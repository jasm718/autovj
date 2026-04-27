import re
import unittest

from backend.agent.prompt import VISUAL_MODULE_SYSTEM_PROMPT
from backend.agent.schema import MusicWindowSummary
from backend.strategy.engine import create_demo_module


class VisualMotionGuidanceTests(unittest.TestCase):
    def test_demo_module_keeps_center_motion_and_background_calm(self) -> None:
        summary = MusicWindowSummary(
            windowSeconds=30,
            bpm=132,
            energy=1,
            bassEnergy=1,
            midEnergy=1,
            highEnergy=1,
            beatDensity=1,
            moodHint="intense",
        )

        envelope = create_demo_module(summary)
        code = envelope.code

        self.assertIn("drawBackground(frame, bg)", code)
        self.assertIn("backgroundState", code)
        self.assertIn("api.lerp(backgroundState.wash", code)
        self.assertIn("bg.background('#05070d', 1)", code)

        speed_match = re.search(r"ring\.rotation\.x \+= frame\.delta \* ([0-9.]+)", code)
        self.assertIsNotNone(speed_match)
        self.assertLessEqual(float(speed_match.group(1)), 0.7)

        spin_match = re.search(r"ring\.rotation\.y \+= frame\.delta \* \(([0-9.]+) \+ frame\.audio\.highEnergy \* ([0-9.]+)\)", code)
        self.assertIsNotNone(spin_match)
        self.assertLessEqual(float(spin_match.group(2)), 0.2)

        rgb_shift_match = re.search(r"api\.setRgbShift\(frame\.audio\.beat \? ([0-9.]+) : ([0-9.]+)\)", code)
        self.assertIsNotNone(rgb_shift_match)
        self.assertLessEqual(float(rgb_shift_match.group(1)), 0.08)

    def test_prompt_guides_agent_toward_lower_background_jitter(self) -> None:
        self.assertIn("背景主运动优先跟随 energy、bassEnergy 这类慢变化", VISUAL_MODULE_SYSTEM_PROMPT)
        self.assertIn("不要让整张背景直接跟着 highEnergy 每帧抖动、闪烁或频闪", VISUAL_MODULE_SYSTEM_PROMPT)
        self.assertIn("主体持续旋转默认保持中低速", VISUAL_MODULE_SYSTEM_PROMPT)


if __name__ == "__main__":
    unittest.main()
