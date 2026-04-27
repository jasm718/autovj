import os
import unittest
from unittest.mock import patch

from backend.settings import get_agent_settings


class AgentSettingsTests(unittest.TestCase):
    def test_reads_gemini_prefixed_settings(self) -> None:
        with patch("backend.settings.load_dotenv"), patch.dict(
            os.environ,
            {
                "gemini_model": "gemini-2.0-pro",
                "gemini_api_key": "gem-key",
                "gemini_base_url": "https://example.invalid/v1",
            },
            clear=True,
        ):
            settings = get_agent_settings()

        self.assertEqual(settings.model, "gemini-2.0-pro")
        self.assertEqual(settings.api_key, "gem-key")
        self.assertEqual(settings.base_url, "https://example.invalid/v1")
        self.assertIsNone(settings.provider)


if __name__ == "__main__":
    unittest.main()
