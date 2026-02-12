#!/bin/bash
# ==========================================================================
# Deploy completo com correcoes e validacoes basicas
# ==========================================================================

set -euo pipefail

PROJECT_ID="operaciones-br"
DATASET="sales_intelligence"

run_sql() {
  local name="$1"
  local sql_file="$2"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶ ${name}"
  echo "   Arquivo: ${sql_file}"
  if [ ! -f "${sql_file}" ]; then
    echo "   ❌ Arquivo nao encontrado: ${sql_file}"
    exit 1
  fi
  bq query \
    --project_id="${PROJECT_ID}" \
    --use_legacy_sql=false \
    --max_rows=0 \
    < "${sql_file}"
  echo "   ✅ OK"
}

echo "================================================================================"
echo "🛠️  DEPLOY FIX ALL"
echo "================================================================================"
echo "📊 PROJECT: ${PROJECT_ID}"
echo "📦 DATASET: ${DATASET}"
echo ""

if [ -f "add_missing_columns.sh" ]; then
  echo "▶ Ajustando schema (add_missing_columns.sh)"
  bash add_missing_columns.sh
fi

if [ -f "fix_views_simplified.sql" ]; then
  run_sql "Views base (fix_views_simplified.sql)" "fix_views_simplified.sql"
fi

./deploy_ml.sh

if [ -f "validate_dashboard_metrics.sql" ]; then
  run_sql "Validacao basica (validate_dashboard_metrics.sql)" "validate_dashboard_metrics.sql"
fi

echo ""
echo "================================================================================"
echo "✅ Deploy fix all concluido"
echo "================================================================================"
