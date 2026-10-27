#!/usr/bin/env bash
# Catalog the demo warehouse into your DataHub, then add owners, domain, tags,
# glossary terms and lineage. Touches only retail_demo* entities.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose)
"${compose[@]}" run --rm --build seed sh -c \
  'datahub ingest -c postgres_recipe.yml && python seed_datahub.py'
