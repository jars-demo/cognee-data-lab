"""Build the two connectors from saved settings, and test each connection for real."""

from cognee_community_connector_airflow import AirflowClient, AirflowSourceError, airflow_source
from cognee_community_connector_datahub import DataHubClient, DataHubSourceError, datahub_source

from .settings import split_list


class SourceNotConfigured(ValueError):
    pass


def _airflow_auth(cfg: dict) -> dict:
    if not cfg.get("url"):
        raise SourceNotConfigured("Add the Airflow API URL first.")
    if cfg.get("token"):
        return {"token": cfg["token"]}
    if cfg.get("username") and cfg.get("password"):
        return {"username": cfg["username"], "password": cfg["password"]}
    raise SourceNotConfigured("Add an Airflow username and password, or a token.")


def test_airflow(cfg: dict) -> dict:
    client = AirflowClient(cfg["url"] if cfg.get("url") else "", **_airflow_auth(cfg))
    version = client.get("/api/v2/version").get("version")
    dags = client.get("/api/v2/dags", [("limit", 1), ("exclude_stale", "true")])
    return {"detail": f"Airflow {version}: {dags.get('total_entries', 0)} DAGs visible"}


def airflow(cfg: dict):
    return airflow_source(
        base_url=cfg["url"],
        dag_id_pattern=cfg.get("dag_id_pattern") or None,
        tags=split_list(cfg.get("tags", "")),
        include_runs=True,
        resource_name="lab_airflow_dags",
        **_airflow_auth(cfg),
    )


def test_datahub(cfg: dict) -> dict:
    if not cfg.get("url"):
        raise SourceNotConfigured("Add the DataHub GMS URL first.")
    client = DataHubClient(cfg["url"], token=cfg.get("token") or None)
    me = client.query("{ me { corpUser { username } } }")["me"]["corpUser"]["username"]
    scope = {"types": ["DATASET"], "query": "*", "start": 0, "count": 0}
    platforms = split_list(cfg.get("platforms", ""))
    if platforms:
        scope["orFilters"] = [
            {
                "and": [
                    {
                        "field": "platform",
                        "values": [
                            p if p.startswith("urn:") else f"urn:li:dataPlatform:{p}"
                            for p in platforms
                        ],
                    }
                ]
            }
        ]
    total = client.query(
        "query($i: SearchAcrossEntitiesInput!) { searchAcrossEntities(input: $i) { total } }",
        {"i": scope},
    )["searchAcrossEntities"]["total"]
    return {"detail": f"Signed in as {me}: {total} datasets in scope"}


def datahub(cfg: dict):
    if not cfg.get("url"):
        raise SourceNotConfigured("Add the DataHub GMS URL first.")
    return datahub_source(
        base_url=cfg["url"],
        token=cfg.get("token") or None,
        platforms=split_list(cfg.get("platforms", "")),
        domains=split_list(cfg.get("domains", "")),
        frontend_url=cfg.get("frontend_url") or None,
        resource_name="lab_datahub_datasets",
    )


SOURCE_ERRORS = (AirflowSourceError, DataHubSourceError, SourceNotConfigured)
