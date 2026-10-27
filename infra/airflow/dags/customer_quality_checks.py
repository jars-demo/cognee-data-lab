"""Data-quality checks on raw.customers (synthetic contact data)."""

from datetime import datetime

from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.sdk import DAG, Asset

RAW_CUSTOMERS = Asset("postgres://postgres:5432/retail_demo/raw/customers")

with DAG(
    dag_id="customer_quality_checks",
    description="Reports customers with missing contact emails.",
    doc_md=__doc__,
    schedule=None,
    start_date=datetime(2026, 10, 1),
    catchup=False,
    tags=["retail_demo", "data-quality"],
    default_args={"owner": "data-quality", "retries": 1},
):
    SQLExecuteQueryOperator(
        task_id="count_missing_emails",
        conn_id="retail_demo",
        sql="SELECT count(*) FROM raw.customers WHERE email IS NULL",
        inlets=[RAW_CUSTOMERS],
    )
