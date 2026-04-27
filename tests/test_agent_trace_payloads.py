import unittest

from backend.agent.graph import build_agent_trace_payloads
from backend.agent.schema import MusicWindowSummary


class AgentTracePayloadTests(unittest.TestCase):
    def test_builds_model_input_and_output_trace_payloads(self) -> None:
        summary = MusicWindowSummary(
            windowSeconds=30,
            bpm=124,
            energy=0.5,
            bassEnergy=0.4,
            midEnergy=0.35,
            highEnergy=0.2,
            beatDensity=0.18,
            moodHint="steady",
        )
        payloads = build_agent_trace_payloads(
            {
                "summary": summary,
                "prompt": "USER\\nmake it slower",
                "raw_output": '{"type":"visual_module","moduleId":"trace-demo"}',
                "metadata": {
                    "agent_model": "gpt-test",
                    "agent_provider": "openai",
                },
            }
        )

        self.assertEqual([payload["stage"] for payload in payloads], ["model_input", "model_output"])
        self.assertIn("gpt-test", payloads[0]["content"])
        self.assertIn("USER\\nmake it slower", payloads[0]["content"])
        self.assertIn("trace-demo", payloads[1]["content"])


if __name__ == "__main__":
    unittest.main()
