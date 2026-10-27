"""Daily revenue pipeline over the retail_demo warehouse.

Task outlets/inlets are Airflow Assets whose URIs name the same Postgres tables
DataHub catalogs (urn:li:dataset:(urn:li:dataPlatform:postgres,retail_demo.<schema>.<table>,PROD)).
That explicit mapping is what links this DAG to DataHub, not table-name matching.

Controlled failure: set the Airflow Variable ``retail_fail_validation`` to
``true`` and validate_orders fails on purpose.
"""

from datetime import datetime

from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.sdk import DAG, Asset, Variable, task

WAREHOUSE = "postgres://postgres:5432/retail_demo"
RAW_ORDERS = Asset(f"{WAREHOUSE}/raw/orders")
RAW_CUSTOMERS = Asset(f"{WAREHOUSE}/raw/customers")
RAW_PRODUCTS = Asset(f"{WAREHOUSE}/raw/products")
DAILY_REVENUE = Asset(f"{WAREHOUSE}/analytics/daily_revenue")

with DAG(
    dag_id="retail_analytics_pipeline",
    description="Builds analytics.daily_revenue from raw orders and products.",
    doc_md=__doc__,
    schedule="0 2 * * *",
    start_date=datetime(2026, 10, 1),
    catchup=False,
    tags=["retail_demo", "finance"],
    default_args={"owner": "revenue-analytics", "retries": 0},
):
    extract_orders = SQLExecuteQueryOperator(
        task_id="extract_orders",
        conn_id="retail_demo",
        sql="SELECT count(*) FROM raw.orders WHERE status = 'completed'",
        inlets=[RAW_ORDERS, RAW_CUSTOMERS],
        doc_md="Counts completed orders available for the revenue build.",
    )

    @task(inlets=[RAW_ORDERS], doc_md="Rejects orders with bad quantities or unknown products.")
    def validate_orders():
        if Variable.get("retail_fail_validation", default="false").lower() == "true":
            raise ValueError("Controlled failure: retail_fail_validation=true")
        hook = PostgresHook(postgres_conn_id="retail_demo")
        bad = hook.get_first(
            "SELECT count(*) FROM raw.orders o LEFT JOIN raw.products p USING (product_id) "
            "WHERE o.quantity <= 0 OR p.product_id IS NULL"
        )[0]
        if bad:
            raise ValueError(f"{bad} invalid order rows")

    transform_revenue = SQLExecuteQueryOperator(
        task_id="transform_revenue",
        conn_id="retail_demo",
        sql="""
            DELETE FROM analytics.daily_revenue;
            INSERT INTO analytics.daily_revenue
            SELECT o.order_date, p.category, count(*), sum(o.quantity * p.unit_price)
            FROM raw.orders o JOIN raw.products p USING (product_id)
            WHERE o.status = 'completed'
            GROUP BY o.order_date, p.category;
        """,
        inlets=[RAW_ORDERS, RAW_PRODUCTS],
        outlets=[DAILY_REVENUE],
        doc_md="Aggregates completed orders into daily revenue per category.",
    )

    publish_daily_revenue = SQLExecuteQueryOperator(
        task_id="publish_daily_revenue",
        conn_id="retail_demo",
        sql="SELECT count(*), sum(gross_revenue) FROM analytics.daily_revenue",
        inlets=[DAILY_REVENUE],
        doc_md="Final check that the published table is populated.",
    )

    extract_orders >> validate_orders() >> transform_revenue >> publish_daily_revenue
