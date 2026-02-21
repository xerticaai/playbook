#!/bin/bash
# ==========================================================================
# Deploy de Modelos/Views ML (canônico, sem sufixo v2)
# ==========================================================================
# Pré-requisito:
# - bq CLI autenticado no projeto
# - Tabelas atualizadas via BigQuerySync (pipeline, closed_deals_won, closed_deals_lost)
#
# Uso:
#   ./deploy_ml.sh
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
    echo "   ❌ Arquivo não encontrado: ${sql_file}"
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
echo "🚀 DEPLOY ML (canônico)"
echo "================================================================================"
echo "📊 PROJECT: ${PROJECT_ID}"
echo "📦 DATASET: ${DATASET}"
echo ""

# 7 modelos + 2 views (9 saídas do dashboard)
run_sql "Modelo 1: Previsão de ciclo + pipeline_previsao_ciclo" "ml_previsao_ciclo.sql"
run_sql "Modelo 2: Classificador perda + pipeline_classificador_perda" "ml_classificador_perda.sql"
run_sql "Modelo 3: Risco abandono + pipeline_risco_abandono" "ml_risco_abandono.sql"
run_sql "Modelo 4: Performance vendedor + pipeline_performance_vendedor" "ml_performance_vendedor.sql"
run_sql "Modelo 5: Previsibilidade win + pipeline_previsibilidade" "ml_previsibilidade.sql"
run_sql "Modelo 6: Recomendacao produtos + pipeline_recomendacao_produtos" "ml_recomendacao_produtos.sql"
run_sql "Modelo 7: Deteccao anomalias + pipeline_deteccao_anomalias" "ml_deteccao_anomalias.sql"
run_sql "View 5: Prioridade deals (pipeline_prioridade_deals)" "ml_prioridade_deal.sql"
run_sql "View 6: Próxima ação (pipeline_proxima_acao)" "ml_proxima_acao.sql"

echo ""
echo "================================================================================"
echo "🎉 Deploy completo"
echo "================================================================================"
echo "Objetos principais (dataset ${DATASET}):"
echo "  - ml_previsao_ciclo (MODEL)"
echo "  - ml_classificador_perda (MODEL)"
echo "  - ml_risco_abandono (MODEL)"
echo "  - ml_performance_vendedor (MODEL)"
echo "  - ml_previsibilidade (MODEL)"
echo "  - ml_recomendacao_produtos (MODEL)"
echo "  - ml_deteccao_anomalias (MODEL)"
echo "  - pipeline_previsao_ciclo (TABLE)"
echo "  - pipeline_classificador_perda (TABLE)"
echo "  - pipeline_risco_abandono (TABLE)"
echo "  - pipeline_performance_vendedor (TABLE)"
echo "  - pipeline_previsibilidade (TABLE)"
echo "  - pipeline_recomendacao_produtos (TABLE)"
echo "  - pipeline_deteccao_anomalias (TABLE)"
echo "  - closed_previsibilidade (TABLE)"
echo "  - pipeline_prioridade_deals (VIEW)"
echo "  - pipeline_proxima_acao (VIEW)"
