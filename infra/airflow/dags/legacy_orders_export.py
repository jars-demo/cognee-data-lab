"""Legacy export kept only to test removal: delete this file and the DAG goes
stale in Airflow, so the connector's next sync should forget it."""

from datetime import datetime

from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.sdk import DAG

with DAG(
    dag_id="legacy_orders_export",
    description="Deprecated nightly order export.",
    schedule=None,
    start_date=datetime(2026, 10, 1),
    catchup=False,
    tags=["retail_demo", "deprecated"],
    default_args={"owner": "revenue-analytics"},
):
    SQLExecuteQueryOperator(
        task_id="export_orders",
        conn_id="retail_demo",
        sql="SELECT count(*) FROM raw.orders",
    )
