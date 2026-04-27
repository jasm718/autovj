import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AgentSettings:
    model: str | None
    provider: str | None
    api_key: str | None
    base_url: str | None
    timeout_seconds: float


def _first_env(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value is not None and value != "":
            return value
    return None


def load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return

    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get_agent_settings() -> AgentSettings:
    load_dotenv()
    model = _first_env(
        "AUTOVJ_AGENT_MODEL",
        "gemini_model",
        "model",
        "oai_model",
    )
    provider = _first_env(
        "AUTOVJ_AGENT_PROVIDER",
        "gemini_provider",
        "provider",
        "oai_provider",
    )
    api_key = _first_env(
        "AUTOVJ_AGENT_API_KEY",
        "gemini_api_key",
        "api_key",
        "oai_api_key",
        "OPENAI_API_KEY",
    )
    base_url = _first_env(
        "AUTOVJ_AGENT_BASE_URL",
        "gemini_base_url",
        "base_url",
        "oai_base_url",
        "OPENAI_BASE_URL",
    )
    timeout_seconds = float(
        _first_env(
            "AUTOVJ_AGENT_TIMEOUT_SECONDS",
            "agent_timeout_seconds",
        )
        or "75"
    )

    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
    if base_url:
        os.environ["OPENAI_BASE_URL"] = base_url

    return AgentSettings(
        model=model,
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        timeout_seconds=timeout_seconds,
    )
