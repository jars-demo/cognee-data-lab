"""The fixed demo questions and the facts a correct answer must contain.

Expected facts are written by hand from the demo data's ground truth
(infra/airflow/dags, infra/postgres/init, seed/seed_datahub.py). The page shows,
per answer, which expected facts appear in it. That is a transparent check, not
a score. Facts are matched case-insensitively; alternatives are separated by "|".
"""

QUESTIONS = [
    {
        "id": "writes-owner",
        "needs": "both",
        "text": "Which dataset does the Airflow DAG retail_analytics_pipeline write, and who owns "
        "that dataset in DataHub?",
        "expected": ["daily_revenue", "Revenue Analytics"],
    },
    {
        "id": "failure-impact",
        "needs": "both",
        "text": "The latest run of retail_analytics_pipeline failed. Which task failed, which "
        "dataset was not refreshed because of it, and which datasets is that dataset derived from?",
        "expected": ["validate_orders", "daily_revenue", "orders", "products"],
    },
    {
        "id": "pii-readers",
        "needs": "both",
        "text": "Which Airflow tasks read the dataset that DataHub tags as PII, and who owns that "
        "dataset?",
        "expected": ["count_missing_emails", "extract_orders", "customers", "Data Platform"],
    },
    {
        "id": "task-order",
        "needs": "airflow",
        "text": "In retail_analytics_pipeline, which task runs right before publish_daily_revenue?",
        "expected": ["transform_revenue"],
    },
    {
        "id": "glossary",
        "needs": "datahub",
        "text": "Which domain and glossary term is retail_demo.analytics.daily_revenue linked to?",
        "expected": ["Retail Demo", "Revenue"],
    },
]
