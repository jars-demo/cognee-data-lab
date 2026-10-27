"""What the lab does with cognee: sync the connectors into memories, ask, inspect.

Three cognee datasets ("memories") make the value of each connector visible:

    lab_airflow   <- Airflow connector only
    lab_datahub   <- DataHub connector only
    lab_combined  <- both connectors

The same question is asked of all three. Nothing is hardcoded: every answer and
every piece of evidence comes from cognee's retrieval over what the connectors
ingested.
"""

import asyncio
import json
import re
import time
import traceback
from dataclasses import dataclass, field
from typing import Any

import cognee
from cognee.modules.search.types import SearchType

from . import sources
from .providers import cognee_llm_config
from .settings import Settings


@dataclass(frozen=True)
class Memory:
    id: str
    dataset: str
    label: str
    sources: tuple[str, ...]


MEMORIES = (
    Memory("airflow", "lab_airflow", "Airflow connector only", ("airflow",)),
    Memory("datahub", "lab_datahub", "DataHub connector only", ("datahub",)),
    Memory("combined", "lab_combined", "Airflow + DataHub", ("airflow", "datahub")),
)


@dataclass
class Job:
    source: str
    state: str = "idle"  # idle | running | done | failed
    started_at: float | None = None
    finished_at: float | None = None
    steps: list[str] = field(default_factory=list)
    error: str | None = None


class Engine:
    def __init__(self, settings: Settings):
        self.settings = settings
        # The last successful sync per source survives restarts; the memories do too.
        self.synced_file = settings.path.parent / "synced.json"
        synced = json.loads(self.synced_file.read_text()) if self.synced_file.exists() else {}
        self.jobs = {
            name: Job(name, state="done", finished_at=synced[name]) if name in synced else Job(name)
            for name in ("airflow", "datahub")
        }
        # cognee's embedded stores run in this process; one operation at a time.
        self.lock = asyncio.Lock()

    # -- LLM -----------------------------------------------------------------
    def apply_llm(self) -> None:
        llm = self.settings.section("llm")
        if not (llm.get("provider") and llm.get("model")):
            raise sources.SourceNotConfigured("Choose an AI provider and model in Settings first.")
        cognee.config.set_llm_config(
            cognee_llm_config(
                llm["provider"], llm["model"], llm.get("api_key", ""), llm.get("endpoint", "")
            )
        )

    # -- Sync ----------------------------------------------------------------
    def start_sync(self, source: str) -> Job:
        job = self.jobs[source]
        if job.state == "running":
            return job
        self.jobs[source] = job = Job(source, state="running", started_at=time.time())
        asyncio.get_running_loop().create_task(self._sync(job))
        return job

    async def _sync(self, job: Job) -> None:
        cfg = self.settings.section(job.source)
        build = sources.airflow if job.source == "airflow" else sources.datahub
        try:
            async with self.lock:
                self.apply_llm()
                for memory in MEMORIES:
                    if job.source not in memory.sources:
                        continue
                    job.steps.append(f"Remembering into {memory.dataset}")
                    # A dlt resource is consumed once, so build a fresh one per memory.
                    await cognee.remember(
                        build(cfg), dataset_name=memory.dataset, max_rows_per_table=0
                    )
                    job.steps.append(f"{memory.dataset} is up to date")
            job.state = "done"
            self._remember_synced(job.source)
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI, sanitized by the connectors
            job.state = "failed"
            job.error = _short_error(exc)
            traceback.print_exc()
        finally:
            job.finished_at = time.time()

    def _remember_synced(self, source: str) -> None:
        synced = json.loads(self.synced_file.read_text()) if self.synced_file.exists() else {}
        synced[source] = time.time()
        self.synced_file.write_text(json.dumps(synced))

    # -- Inspect -------------------------------------------------------------
    async def _datasets(self) -> dict[str, Any]:
        return {d.name: d for d in await cognee.datasets.list_datasets()}

    async def _documents_of(self, dataset) -> dict[str, dict]:
        rows = await cognee.datasets.list_data(dataset.id) if dataset else []
        return {str(row.id): _document(row) for row in rows}

    async def documents(self) -> dict[str, list[dict]]:
        """What each memory holds: one entry per ingested source document."""
        by_name = await self._datasets()
        out: dict[str, list[dict]] = {}
        for memory in MEMORIES:
            docs = await self._documents_of(by_name.get(memory.dataset))
            out[memory.id] = sorted(docs.values(), key=lambda d: (d["source"] or "", d["title"]))
        return out

    # -- Ask -----------------------------------------------------------------
    async def ask(self, question: str) -> dict:
        """Ask the same question of every memory, with cognee's evidence for each answer."""
        async with self.lock:
            self.apply_llm()
            by_name = await self._datasets()
            results = []
            for memory in MEMORIES:
                results.append(await self._ask_one(memory, by_name.get(memory.dataset), question))
        return {"question": question, "results": results}

    async def _ask_one(self, memory: Memory, dataset, question: str) -> dict:
        out = {
            "memory": memory.id,
            "label": memory.label,
            "dataset": memory.dataset,
            "answer": "",
            "context": "",
            "evidence": {"documents": [], "graph": {"nodes": 0, "edges": 0, "relations": []}},
            "error": None,
            "elapsed_ms": 0,
        }
        started = time.perf_counter()
        try:
            docs = await self._documents_of(dataset)
            if not docs:
                needed = " and ".join(memory.sources)
                out["error"] = f"This memory is empty: sync {needed} first."
                return out
            response = await cognee.search(
                query_text=question,
                query_type=SearchType.GRAPH_COMPLETION,
                datasets=[memory.dataset],
                include_references=True,
                verbose=True,
            )
            payload = response[0] if response else {}
            out["answer"] = _answer(payload.get("text_result"))
            out["context"] = _text(payload.get("context_result"))[:8000]
            out["evidence"] = _evidence(payload.get("evidence") or [], docs)
            if payload.get("error"):
                out["error"] = str(payload["error"])
        except Exception as exc:  # noqa: BLE001 - shown as this memory's error
            out["error"] = _short_error(exc)
            traceback.print_exc()
        finally:
            out["elapsed_ms"] = int((time.perf_counter() - started) * 1000)
        return out

    # -- Graph ---------------------------------------------------------------
    async def graph(self, memory_id: str) -> dict:
        from cognee.modules.graph.methods.get_formatted_graph_data import get_formatted_graph_data
        from cognee.modules.users.methods import get_default_user

        memory = next(m for m in MEMORIES if m.id == memory_id)
        dataset = (await self._datasets()).get(memory.dataset)
        if dataset is None:
            return {"nodes": [], "edges": []}
        async with self.lock:
            return await get_formatted_graph_data(dataset.id, await get_default_user())


def _document(row: Any) -> dict:
    meta = getattr(row, "external_metadata", None) or {}
    system = getattr(row, "system_metadata", None) or {}
    if isinstance(system, str):
        system = json.loads(system)
    return {
        "title": system.get("title") or getattr(row, "name", ""),
        "source": system.get("source"),
        "external_id": system.get("external_id") or meta.get("id"),
        "url": system.get("url"),
        "updated_at": str(getattr(row, "updated_at", "") or getattr(row, "created_at", "")),
    }


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(_text(v) for v in value)
    return str(value)


def _evidence(references: list[dict], docs: dict[str, dict]) -> dict:
    """Split cognee's evidence into the connector documents used and the graph parts used.

    Chunk references carry the ``data_id`` of the document they came from; node and edge
    references do not, so those are summarized as counts and relationship names.
    """
    documents: dict[str, dict] = {}
    nodes, edges, relations = set(), set(), []
    for ref in references:
        doc = docs.get(str(ref.get("data_id")))
        if doc:
            documents.setdefault(str(ref["data_id"]), doc)
        elif ref.get("relationship_name"):
            edges.add(ref.get("artifact_id"))
            if ref["relationship_name"] not in relations:
                relations.append(ref["relationship_name"])
        elif ref.get("kind") == "graph_node":
            nodes.add(ref.get("artifact_id"))
    return {
        "documents": sorted(documents.values(), key=lambda d: (d["source"] or "", d["title"])),
        "graph": {"nodes": len(nodes), "edges": len(edges), "relations": relations[:12]},
    }


# cognee's verbose answers end with an "Evidence:" list of raw chunk ids; the page
# shows the same evidence as linked documents instead.
_EVIDENCE_TAIL = re.compile(r"\n+\s*\**Evidence:?\**:?\s*\n.*\Z", re.DOTALL | re.IGNORECASE)


def _answer(value: Any) -> str:
    return _EVIDENCE_TAIL.sub("", _text(value)).strip()


def _short_error(exc: BaseException) -> str:
    # dlt wraps source errors; show the innermost, already-sanitized message.
    while exc.__cause__ is not None or exc.__context__ is not None:
        inner = exc.__cause__ or exc.__context__
        if isinstance(inner, sources.SOURCE_ERRORS):
            return str(inner)
        exc = inner
    return f"{type(exc).__name__}: {str(exc)[:300]}"


__all__ = ["MEMORIES", "Engine", "SearchType"]
