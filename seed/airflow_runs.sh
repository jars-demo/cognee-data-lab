#!/usr/bin/env bash
# Give retail_analytics_pipeline real run history: one successful run, then one
# controlled failure (validate_orders fails while the Airflow Variable
# retail_fail_validation is "true"). Re-runnable: each call adds two new runs.
set -euo pipefail
cd "$(dirname "$0")/.."
af() { docker compose exec -T airflow airflow "$@" 2>/dev/null; }
stamp=$(date +%Y%m%d%H%M%S)

wait_run() {
  for _ in $(seq 1 100); do
    state=$(af dags list-runs retail_analytics_pipeline -o plain | awk -v r="$1" '$0 ~ r {print $3; exit}')
    case "$state" in success|failed) echo "$1: $state"; return;; esac
    sleep 3
  done
  echo "$1: timed out" >&2; return 1
}

af dags unpause retail_analytics_pipeline >/dev/null
af variables set retail_fail_validation false >/dev/null
af dags trigger retail_analytics_pipeline --run-id "lab_success_$stamp" >/dev/null
wait_run "lab_success_$stamp"
af variables set retail_fail_validation true >/dev/null
af dags trigger retail_analytics_pipeline --run-id "lab_failure_$stamp" >/dev/null
wait_run "lab_failure_$stamp"
af variables set retail_fail_validation false >/dev/null
