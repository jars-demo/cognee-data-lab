#!/usr/bin/env bash
# Run the lab app natively (no Docker) on http://localhost:8765.
# Pre-fills the Connect page from ../../.env; everything can be changed in the UI.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f ../../.env ]; then set -a; . ../../.env; set +a; fi
export AIRFLOW_URL="${AIRFLOW_URL:-http://localhost:8088}" AIRFLOW_USERNAME="${AIRFLOW_USERNAME:-admin}"
export AIRFLOW_PASSWORD="${AIRFLOW_PASSWORD:-${AIRFLOW_ADMIN_PASSWORD:-admin}}"
export DATAHUB_GMS_URL="${DATAHUB_LOCAL_GMS_URL:-http://localhost:8080}"
export DATAHUB_FRONTEND_URL="${DATAHUB_FRONTEND_URL:-http://localhost:9002}"
export DATAHUB_PLATFORMS="${DATAHUB_PLATFORMS:-postgres}"
exec uv run uvicorn lab.server:app --host 127.0.0.1 --port "${LAB_PORT:-8765}"
