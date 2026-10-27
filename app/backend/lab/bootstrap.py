"""Process setup that must run before ``import cognee``.

* Storage lives under ``LAB_HOME`` (default ``./.lab``) so the lab never mixes
  with another cognee install, and one folder delete resets it.
* Embeddings always run on cognee's built-in local model (fastembed), so only
  the LLM is bring-your-own-key and any chat provider works, including ones
  without an embeddings API.
* Native Windows only: the ladybug 0.19 wheel (cognee's embedded graph engine)
  links OpenSSL 3 without bundling it. Point ``LAB_OPENSSL_DLL_DIR`` at a folder
  with ``libcrypto-3-x64.dll`` (Git for Windows ships one; it is found
  automatically). Docker/Linux needs none of this.
"""

import os
from pathlib import Path

LAB_HOME = Path(os.environ.get("LAB_HOME", ".lab")).resolve()
_dll_handle = None


def configure() -> Path:
    global _dll_handle
    LAB_HOME.mkdir(parents=True, exist_ok=True)
    defaults = {
        "DATA_ROOT_DIRECTORY": str(LAB_HOME / "cognee_data"),
        "SYSTEM_ROOT_DIRECTORY": str(LAB_HOME / "cognee_system"),
        "EMBEDDING_PROVIDER": "fastembed",
        "EMBEDDING_MODEL": "BAAI/bge-small-en-v1.5",
        "EMBEDDING_DIMENSIONS": "384",
        # The LLM key arrives at runtime from the settings page, so don't let
        # cognee fall back to the offline GLiNER extractor at import time.
        "GRAPH_EXTRACTOR": "llm",
        "AUTO_FEEDBACK": "false",
        "TELEMETRY_DISABLED": "true",
    }
    for key, value in defaults.items():
        os.environ.setdefault(key, value)

    if os.name == "nt" and _dll_handle is None:
        dll_dir = os.environ.get("LAB_OPENSSL_DLL_DIR") or _find_openssl3()
        if dll_dir:
            _dll_handle = os.add_dll_directory(dll_dir)
            # The DLL folder does not reach cognee's graph worker subprocess.
            os.environ.setdefault("GRAPH_DATABASE_SUBPROCESS_ENABLED", "false")
            os.environ.setdefault("LBUG_PYTHON_BACKEND", "pybind")
    return LAB_HOME


def _find_openssl3() -> str | None:
    for candidate in (r"C:\Program Files\Git\mingw64\bin", r"C:\Program Files\OpenSSL-Win64\bin"):
        if Path(candidate, "libcrypto-3-x64.dll").exists():
            return candidate
    return None
