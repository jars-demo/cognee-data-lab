"""HTTP API for the lab, and the built frontend when present.

Dev:   uv run uvicorn lab.server:app --port 8765   (frontend: npm run dev, proxies /api)
Prod:  build the frontend (npm run build) and this serves app/frontend/dist at /.
"""

import os
from pathlib import Path

from . import bootstrap

HOME = bootstrap.configure()

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import sources
from .engine import MEMORIES, Engine
from .providers import PROVIDERS, ProviderError, list_models
from .questions import QUESTIONS
from .settings import Settings

FRONTEND = Path(
    os.environ.get("LAB_FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist")
)
SECTIONS = {"llm", "airflow", "datahub"}
TESTS = {"airflow": sources.test_airflow, "datahub": sources.test_datahub}

settings = Settings(HOME)
engine = Engine(settings)
app = FastAPI(title="Cognee Data Engineering Lab")


class ModelsRequest(BaseModel):
    provider: str
    api_key: str = ""
    endpoint: str = ""


class AskRequest(BaseModel):
    question: str


def _section(name: str) -> str:
    if name not in SECTIONS:
        raise HTTPException(404, f"Unknown settings section {name!r}")
    return name


@app.get("/api/state")
def state():
    return {
        "settings": settings.public(),
        "providers": PROVIDERS,
        "jobs": {name: vars(job) for name, job in engine.jobs.items()},
        "memories": [vars(m) | {"sources": list(m.sources)} for m in MEMORIES],
        "questions": QUESTIONS,
    }


@app.post("/api/settings/{name}")
def save_settings(name: str, values: dict):
    settings.update(_section(name), values)
    return settings.public()[name]


@app.delete("/api/settings/{name}")
def remove_settings(name: str):
    settings.clear(_section(name))
    return settings.public()[name]


@app.post("/api/llm/models")
def models(request: ModelsRequest):
    stored = settings.section("llm")
    # Reuse the saved key when the form leaves it blank (it is never sent back to the page).
    key = request.api_key or (stored["api_key"] if stored["provider"] == request.provider else "")
    try:
        return {"models": list_models(request.provider, key, request.endpoint)}
    except ProviderError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/test/{source}")
def test_connection(source: str):
    if source not in TESTS:
        raise HTTPException(404, f"Unknown source {source!r}")
    try:
        return {"ok": True, **TESTS[source](settings.section(source))}
    except (*sources.SOURCE_ERRORS, ValueError) as exc:
        return {"ok": False, "detail": str(exc)}


# async: the sync job is scheduled on the server's event loop.
@app.post("/api/sync/{source}")
async def sync(source: str):
    if source not in engine.jobs:
        raise HTTPException(404, f"Unknown source {source!r}")
    return vars(engine.start_sync(source))


@app.get("/api/documents")
async def documents():
    return await engine.documents()


@app.post("/api/ask")
async def ask(request: AskRequest):
    if not request.question.strip():
        raise HTTPException(400, "Ask a question first.")
    try:
        return await engine.ask(request.question.strip())
    except sources.SourceNotConfigured as exc:
        raise HTTPException(400, str(exc)) from None


@app.get("/api/graph/{memory}")
async def graph(memory: str):
    if memory not in {m.id for m in MEMORIES}:
        raise HTTPException(404, f"Unknown memory {memory!r}")
    return await engine.graph(memory)


if FRONTEND.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        file = FRONTEND / path
        return FileResponse(file if path and file.is_file() else FRONTEND / "index.html")
