"""Connection settings, stored locally in ``$LAB_HOME/settings.json``.

Secrets (API key, passwords, tokens) are written to that local file only and are
never sent back to the browser: the public view reports whether each is set.
Environment variables pre-fill a fresh install (see .env.example).
"""

import json
import os
from copy import deepcopy
from pathlib import Path

SECRETS = {"llm": ["api_key"], "airflow": ["password", "token"], "datahub": ["token"]}


def _defaults() -> dict:
    env = os.environ.get
    return {
        "llm": {
            "provider": env("LLM_PROVIDER_ID", ""),
            "api_key": env("LLM_API_KEY", ""),
            "model": env("LLM_MODEL_ID", ""),
            "endpoint": env("LLM_ENDPOINT", ""),
        },
        "airflow": {
            "url": env("AIRFLOW_URL", ""),
            "username": env("AIRFLOW_USERNAME", ""),
            "password": env("AIRFLOW_PASSWORD", ""),
            "token": env("AIRFLOW_TOKEN", ""),
            "dag_id_pattern": env("AIRFLOW_DAG_ID_PATTERN", ""),
            "tags": env("AIRFLOW_TAGS", ""),
        },
        "datahub": {
            "url": env("DATAHUB_GMS_URL", ""),
            "frontend_url": env("DATAHUB_FRONTEND_URL", ""),
            "token": env("DATAHUB_GMS_TOKEN", ""),
            "platforms": env("DATAHUB_PLATFORMS", ""),
            "domains": env("DATAHUB_DOMAINS", ""),
        },
    }


class Settings:
    def __init__(self, home: Path):
        self.path = home / "settings.json"
        self.data = _defaults()
        if self.path.exists():
            saved = json.loads(self.path.read_text(encoding="utf-8"))
            for section, values in saved.items():
                self.data.setdefault(section, {}).update(values)

    def section(self, name: str) -> dict:
        return deepcopy(self.data[name])

    def update(self, name: str, values: dict) -> None:
        current = self.data[name]
        for key, value in values.items():
            if key not in current:
                continue
            # An empty secret in the form means "keep the stored one".
            if key in SECRETS.get(name, []) and not value:
                continue
            current[key] = value.strip() if isinstance(value, str) else value
        self._save()

    def clear(self, name: str) -> None:
        self.data[name] = {key: "" for key in self.data[name]}
        self._save()

    def public(self) -> dict:
        view = deepcopy(self.data)
        for section, keys in SECRETS.items():
            for key in keys:
                view[section][f"has_{key}"] = bool(view[section].pop(key))
        return view

    def _save(self) -> None:
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass


def split_list(value: str) -> list[str] | None:
    items = [v.strip() for v in (value or "").split(",") if v.strip()]
    return items or None
