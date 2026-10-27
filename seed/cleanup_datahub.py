"""Remove the lab's demo metadata from DataHub, and nothing else.

Deletes exactly:
* the URNs recorded in seed/manifest.json by seed_datahub.py,
* the retail_demo datasets, and the containers DataHub's Postgres ingestion
  created for them (read from each dataset's own container aspect).

Dry run by default; pass --yes to delete. Other DataHub metadata is untouched.

    python seed/cleanup_datahub.py          # show what would be deleted
    python seed/cleanup_datahub.py --yes    # hard-delete it
"""

import json
import os
import sys
from pathlib import Path

from datahub.ingestion.graph.client import DatahubClientConfig, DataHubGraph
from datahub.metadata.schema_classes import ContainerClass

HERE = Path(__file__).resolve().parent
DATASETS = ["raw.orders", "raw.customers", "raw.products", "analytics.daily_revenue"]


def main() -> None:
    graph = DataHubGraph(DatahubClientConfig(
        server=os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080"),
        token=os.environ["DATAHUB_GMS_TOKEN"],
    ))
    manifest = HERE / "manifest.json"
    urns = json.loads(manifest.read_text())["urns"] if manifest.exists() else []
    datasets = [f"urn:li:dataset:(urn:li:dataPlatform:postgres,retail_demo.{n},PROD)" for n in DATASETS]
    containers: list[str] = []
    for urn in datasets:
        current = graph.get_aspect(urn, ContainerClass)
        while current is not None and current.container not in containers:
            containers.append(current.container)
            current = graph.get_aspect(current.container, ContainerClass)
    targets = list(dict.fromkeys([*urns, *datasets, *containers]))
    for urn in targets:
        print(("deleting " if "--yes" in sys.argv else "would delete ") + urn)
        if "--yes" in sys.argv:
            graph.hard_delete_entity(urn)
    if "--yes" in sys.argv and manifest.exists():
        manifest.unlink()


if __name__ == "__main__":
    main()
