"""Developer probe: sync both connectors into the three memories, then print raw
search output for one cross-system question. Settings come from the environment
(see .env.example)."""

import asyncio
import sys

from lab import bootstrap

home = bootstrap.configure()

import cognee  # noqa: E402

from lab.engine import MEMORIES, Engine  # noqa: E402
from lab.settings import Settings  # noqa: E402

QUESTION = (
    "The latest run of retail_analytics_pipeline failed. Which dataset does that pipeline "
    "write, who owns that dataset, and which datasets is it derived from?"
)


async def main(skip_sync: bool) -> None:
    engine = Engine(Settings(home))
    if not skip_sync:
        for source in ("airflow", "datahub"):
            job = engine.start_sync(source)
            while job.state == "running":
                await asyncio.sleep(2)
            print(source, job.state, job.error or "", job.steps)
    engine.apply_llm()
    for memory in MEMORIES:
        result = await cognee.search(
            query_text=QUESTION, query_type=cognee.SearchType.GRAPH_COMPLETION,
            datasets=[memory.dataset], include_references=True,
        )
        print(f"\n===== {memory.label}\n{result!r}"[:4000])


if __name__ == "__main__":
    asyncio.run(main("--skip-sync" in sys.argv))
