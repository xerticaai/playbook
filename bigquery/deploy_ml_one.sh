#!/bin/bash
# ==========================================================================
# Deploy de um unico modelo/view SQL
# Uso: ./deploy_ml_one.sh ml_previsao_ciclo.sql
# ==========================================================================

set -euo pipefail

PROJECT_ID="operaciones-br"
SQL_FILE="${1:-}"

if [ -z "${SQL_FILE}" ]; then
  echo "Uso: ./deploy_ml_one.sh <arquivo.sql>"
  exit 1
fi

if [ ! -f "${SQL_FILE}" ]; then
  echo "Arquivo nao encontrado: ${SQL_FILE}"
  exit 1
fi

echo "▶ Deploy: ${SQL_FILE}"

bq query \
  --project_id="${PROJECT_ID}" \
  --use_legacy_sql=false \
  --max_rows=0 \
  < "${SQL_FILE}"

echo "✅ OK"
