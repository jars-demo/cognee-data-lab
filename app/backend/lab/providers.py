"""Bring-your-own-key LLM providers.

Each provider lists the models the given key can use (its own ``/models``
endpoint) and maps a chosen model onto cognee's LLM config.
"""

import requests

PROVIDERS = {
    "openai": {"label": "OpenAI", "key": True},
    "anthropic": {"label": "Anthropic", "key": True},
    "gemini": {"label": "Google Gemini", "key": True},
    "groq": {"label": "Groq", "key": True},
    "openrouter": {"label": "OpenRouter", "key": True},
    "ollama": {"label": "Ollama (local)", "key": False, "endpoint": "http://localhost:11434"},
}

_TIMEOUT = 20


class ProviderError(RuntimeError):
    pass


def _get(url: str, headers: dict | None = None, params: dict | None = None) -> dict:
    try:
        response = requests.get(url, headers=headers, params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ProviderError(f"Could not reach {url.split('/')[2]}: {type(exc).__name__}") from None
    if response.status_code in (401, 403):
        raise ProviderError("The provider rejected this API key.")
    if response.status_code >= 400:
        raise ProviderError(f"The provider answered HTTP {response.status_code}.")
    return response.json()


def list_models(provider: str, api_key: str, endpoint: str = "") -> list[str]:
    if provider not in PROVIDERS:
        raise ProviderError(f"Unknown provider {provider!r}")
    if PROVIDERS[provider]["key"] and not api_key:
        raise ProviderError("Enter an API key first.")
    bearer = {"Authorization": f"Bearer {api_key}"}
    if provider == "openai":
        ids = [m["id"] for m in _get("https://api.openai.com/v1/models", bearer)["data"]]
        skip = (
            "embedding",
            "whisper",
            "tts",
            "dall-e",
            "audio",
            "realtime",
            "image",
            "moderation",
            "transcribe",
            "search",
        )
        ids = [i for i in ids if i.startswith(("gpt", "o")) and not any(s in i for s in skip)]
    elif provider == "anthropic":
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        ids = [
            m["id"]
            for m in _get("https://api.anthropic.com/v1/models", headers, {"limit": 100})["data"]
        ]
    elif provider == "gemini":
        body = _get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": api_key, "pageSize": 200},
        )
        ids = [
            m["name"].removeprefix("models/")
            for m in body.get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        ]
    elif provider == "groq":
        ids = [
            m["id"]
            for m in _get("https://api.groq.com/openai/v1/models", bearer)["data"]
            if m.get("active", True) and "whisper" not in m["id"]
        ]
    elif provider == "openrouter":
        ids = [m["id"] for m in _get("https://openrouter.ai/api/v1/models", bearer)["data"]]
    else:  # ollama
        base = (endpoint or PROVIDERS["ollama"]["endpoint"]).rstrip("/")
        ids = [m["name"] for m in _get(f"{base}/api/tags").get("models", [])]
    return sorted(set(ids))


def cognee_llm_config(provider: str, model: str, api_key: str, endpoint: str = "") -> dict:
    """Translate the chosen provider/model into ``cognee.config.set_llm_config`` values."""
    if provider == "ollama":
        return {
            "llm_provider": "ollama",
            "llm_model": model,
            "llm_api_key": "ollama",
            "llm_endpoint": (endpoint or PROVIDERS["ollama"]["endpoint"]).rstrip("/"),
        }
    cognee_provider = {"groq": "custom", "openrouter": "custom"}.get(provider, provider)
    # Clear any endpoint left over from a previous provider: litellm routes these itself.
    return {
        "llm_provider": cognee_provider,
        "llm_model": f"{provider}/{model}",
        "llm_api_key": api_key,
        "llm_endpoint": "",
    }
