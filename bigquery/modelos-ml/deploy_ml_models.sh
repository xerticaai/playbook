#!/bin/bash
# ============================================================================
# DEPLOY COMPLETO: 6 MODELOS BQML
# ============================================================================
# Executa treinamento de TODOS os modelos ML em sequência
#
# USO:
#   ./deploy_ml_models.sh
#
# PRÉ-REQUISITOS:
#   - gcloud auth configurado
#   - BigQuery dataset 'sales_intelligence' existente
#   - Tabelas pipeline, closed_deals populadas
# ============================================================================

set -e  # Exit on error

PROJECT_ID="operaciones-br"
DATASET_ID="sales_intelligence"

echo "============================================================================"
echo "🚀 DEPLOY MODELOS BQML - SALES INTELLIGENCE ENGINE"
echo "============================================================================"
echo ""
echo "📋 Modelos a serem criados:"
echo "   1. Previsão de Ciclo (BOOSTED_TREE_REGRESSOR)"
echo "   2. Classificador de Perda (BOOSTED_TREE_CLASSIFIER)"
echo "   3. Risco de Abandono (BOOSTED_TREE_CLASSIFIER)"
echo "   4. Performance Vendedor (LINEAR_REG)"
echo "   5. Priorização de Deals (VIEW)"
echo "   6. Próxima Ação (VIEW)"
echo ""
echo "⏱️  Tempo estimado: 15-20 minutos"
echo "============================================================================"
echo ""

# Verificar se dataset existe
echo "🔍 Verificando dataset..."
if ! bq show "${PROJECT_ID}:${DATASET_ID}" > /dev/null 2>&1; then
  echo "❌ ERRO: Dataset ${DATASET_ID} não existe."
  echo "   Execute: bq mk -d ${PROJECT_ID}:${DATASET_ID}"
  exit 1
fi
echo "✅ Dataset ${DATASET_ID} encontrado"
echo ""

# Verificar se tabelas base existem
echo "🔍 Verificando tabelas base..."
for table in pipeline closed_deals; do
  if ! bq show "${PROJECT_ID}:${DATASET_ID}.${table}" > /dev/null 2>&1; then
    echo "❌ ERRO: Tabela ${table} não existe."
    echo "   Execute BigQuerySync no Apps Script primeiro."
    exit 1
  fi
done
echo "✅ Tabelas base encontradas (pipeline, closed_deals)"
echo ""

# ============================================================================
# MODELO 1: PREVISÃO DE CICLO
# ============================================================================
echo "============================================================================"
echo "1️⃣  MODELO 1: PREVISÃO DE CICLO DE VENDAS"
echo "============================================================================"
echo "Tipo: BOOSTED_TREE_REGRESSOR"
echo "Objetivo: Prever dias até fechamento"
echo ""
echo "⏳ Treinando modelo... (pode levar 3-5 minutos)"

bq query --use_legacy_sql=false < ml_previsao_ciclo.sql

echo ""
echo "✅ MODELO 1 CONCLUÍDO"
echo ""

# ============================================================================
# MODELO 2: CLASSIFICADOR DE PERDA
# ============================================================================
echo "============================================================================"
echo "2️⃣  MODELO 2: CLASSIFICADOR DE CAUSA DE PERDA"
echo "============================================================================"
echo "Tipo: BOOSTED_TREE_CLASSIFIER (multiclass)"
echo "Objetivo: Classificar causa de perda (PREÇO/TIMING/CONCORRENTE/BUDGET/FIT)"
echo ""
echo "⏳ Treinando modelo... (pode levar 3-5 minutos)"

bq query --use_legacy_sql=false < ml_classificador_perda.sql

echo ""
echo "✅ MODELO 2 CONCLUÍDO"
echo ""

# ============================================================================
# MODELO 3: RISCO DE ABANDONO
# ============================================================================
echo "============================================================================"
echo "3️⃣  MODELO 3: RISCO DE ABANDONO (CHURN RISK)"
echo "============================================================================"
echo "Tipo: BOOSTED_TREE_CLASSIFIER (binary)"
echo "Objetivo: Predizer se deal vai ser abandonado"
echo ""
echo "⏳ Treinando modelo... (pode levar 3-5 minutos)"

bq query --use_legacy_sql=false < ml_risco_abandono.sql

echo ""
echo "✅ MODELO 3 CONCLUÍDO"
echo ""

# ============================================================================
# MODELO 4: PERFORMANCE VENDEDOR
# ============================================================================
echo "============================================================================"
echo "4️⃣  MODELO 4: PERFORMANCE DO VENDEDOR"
echo "============================================================================"
echo "Tipo: LINEAR_REG"
echo "Objetivo: Prever win rate do vendedor"
echo ""
echo "⏳ Treinando modelo... (pode levar 2-3 minutos)"

bq query --use_legacy_sql=false < ml_performance_vendedor.sql

echo ""
echo "✅ MODELO 4 CONCLUÍDO"
echo ""

# ============================================================================
# MODELO 5: PRIORIZAÇÃO DE DEALS
# ============================================================================
echo "============================================================================"
echo "5️⃣  MODELO 5: PRIORIZAÇÃO DE DEALS"
echo "============================================================================"
echo "Tipo: VIEW CALCULADA"
echo "Objetivo: Ranquear deals por prioridade"
echo ""
echo "⏳ Criando view..."

bq query --use_legacy_sql=false < ml_prioridade_deal.sql

echo ""
echo "✅ MODELO 5 CONCLUÍDO"
echo ""

# ============================================================================
# MODELO 6: PRÓXIMA AÇÃO
# ============================================================================
echo "============================================================================"
echo "6️⃣  MODELO 6: RECOMENDADOR DE PRÓXIMA AÇÃO"
echo "============================================================================"
echo "Tipo: RULE-BASED VIEW"
echo "Objetivo: Recomendar próxima ação"
echo ""
echo "⏳ Criando view..."

bq query --use_legacy_sql=false < ml_proxima_acao.sql

echo ""
echo "✅ MODELO 6 CONCLUÍDO"
echo ""

# ============================================================================
# VALIDAÇÃO E ESTATÍSTICAS
# ============================================================================
echo "============================================================================"
echo "📊 VALIDAÇÃO E ESTATÍSTICAS"
echo "============================================================================"
echo ""

# Listar modelos criados
echo "🔍 Modelos BQML criados:"
bq ls -m "${PROJECT_ID}:${DATASET_ID}" | grep -E "(modelo_previsao_ciclo|modelo_classificador_perda|modelo_risco_abandono|modelo_performance_vendedor)"

echo ""
echo "🔍 Views criadas:"
bq ls "${PROJECT_ID}:${DATASET_ID}" | grep -E "(pipeline_prioridade_deals|pipeline_proxima_acao)"

echo ""
echo "🔍 Tabelas de predições criadas:"
bq ls "${PROJECT_ID}:${DATASET_ID}" | grep -E "(pipeline_previsao_ciclo|pipeline_classificador_perda|pipeline_risco_abandono|pipeline_performance_vendedor)"

echo ""
echo "============================================================================"
echo "🎉 DEPLOY COMPLETO!"
echo "============================================================================"
echo ""
echo "📋 RESUMO:"
echo "   ✅ 4 modelos ML treinados"
echo "   ✅ 2 views calculadas criadas"
echo "   ✅ 6 tabelas de predições geradas"
echo ""
echo "🔗 PRÓXIMOS PASSOS:"
echo "   1. Testar endpoint ML: python3 cloud-function/test_local.py --ml"
echo "   2. Deploy Cloud Function com ML enabled"
echo "   3. Adicionar aba 'ML Insights' no Dashboard"
echo ""
echo "📊 MONITORAMENTO:"
echo "   - Ver métricas: SELECT * FROM ML.EVALUATE(MODEL \`${PROJECT_ID}.${DATASET_ID}.modelo_*\`)"
echo "   - Ver predições: SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.pipeline_*\` LIMIT 10"
echo "   - Retreinar: Re-executar este script (modelos serão recriados)"
echo ""
echo "============================================================================"
