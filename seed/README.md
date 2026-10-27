# Demo data

Everything here is synthetic and deterministic. Nothing personal and nothing random.

| Where | What |
|---|---|
| Postgres `retail_demo` (`infra/postgres/init`) | `raw.customers` (50 rows, 5 without email), `raw.products` (20), `raw.orders` (2,000, 117 cancelled), and `analytics.daily_revenue`, which Airflow fills |
| Airflow (`infra/airflow/dags`) | `retail_analytics_pipeline` (extract → validate → transform → publish), `customer_quality_checks`, and `legacy_orders_export` (delete its file to test forget-on-delete) |
| DataHub (`seed_datahub.py`) | the 4 tables, cataloged by DataHub's own Postgres ingestion, plus the context listed below |

**DataHub context added by the seeder:**
- **Domain:** `Retail Demo`
- **Owner groups:** `Revenue Analytics` and `Data Platform`
- **Tags:** `retail_demo.pii` and `retail_demo.finance`
- **Glossary terms:** `Revenue` and `Customer`
- **Lineage:** `raw.orders` + `raw.products` → `analytics.daily_revenue`, mirroring the DAG's real SQL
- **Missing-metadata case:** `raw.products` is left with no owner, description, tags or terms on purpose

## How the systems are linked

Tasks declare Airflow Assets, which the Airflow connector reads from `/api/v2/assets`. For example:

```python
Asset("postgres://postgres:5432/retail_demo/analytics/daily_revenue")
```

The connector renders this as `retail_demo.analytics.daily_revenue`. That is exactly the name in the DataHub URN `urn:li:dataset:(urn:li:dataPlatform:postgres,retail_demo.analytics.daily_revenue,PROD)`. The link comes from metadata in both systems, not from similar names.

## Commands

| Command | What it does |
|---|---|
| `./seed/airflow_runs.sh` | Adds one successful run and one controlled failure (Airflow Variable `retail_fail_validation=true`). |
| `./seed/seed_datahub.sh` | Ingests the warehouse into DataHub and emits the context listed above. |
| `docker compose run --rm seed python cleanup_datahub.py` | Dry run: lists what would be removed. |
| `docker compose run --rm seed python cleanup_datahub.py --yes` | Hard-deletes only the lab's entities. |

All seeded entities are namespaced `retail_demo*` and recorded in `seed/manifest.json`. Cleanup removes only those entities, plus the containers DataHub created for the 4 tables. The rest of your DataHub is never touched.
