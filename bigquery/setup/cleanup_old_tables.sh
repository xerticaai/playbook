#!/bin/bash
# ============================================================================
# Limpeza de Tabelas e Modelos Antigos do BigQuery
# ============================================================================
# Remove recursos que não são mais usados pelo pipeline canônico (sem _v2)
# ============================================================================

set -e

PROJECT_ID="operaciones-br"
DATASET="sales_intelligence"

echo "================================================================================"
echo "🧹 LIMPEZA DE RECURSOS ANTIGOS - BigQuery"
echo "================================================================================"
echo ""
echo "📊 PROJECT: $PROJECT_ID"
echo "📦 DATASET: $DATASET"
echo ""

# ============================================================================
# TABELAS PARA APAGAR
# ============================================================================
OLD_TABLES=(
  "closed_deals"
  "ml_training_features"
  "pipeline_ml_predictions"
  "training_data_v2"
  "treino_previsao_ciclo"
  "ml_prioridade_deal_v2"
  "ml_proxima_acao_v2"
)

# ============================================================================
# MODELOS PARA APAGAR
# ============================================================================
OLD_MODELS=(
  "previsao_ciclo_model"
  "win_loss_predictor"
  "win_loss_predictor_v2"
  "ml_previsao_ciclo_v2"
  "ml_classificador_perda_v2"
  "ml_risco_abandono_v2"
  "ml_performance_vendedor_v2"
)

# ============================================================================
# Apagar Tabelas
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗑️  APAGANDO TABELAS ANTIGAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for table in "${OLD_TABLES[@]}"; do
  echo "   🔍 Verificando: $table"
  
  if bq show --project_id="$PROJECT_ID" "$DATASET.$table" &>/dev/null; then
    echo "   ❌ Apagando: $table"
    bq rm -f -t --project_id="$PROJECT_ID" "$DATASET.$table"
    echo "   ✅ Apagado: $table"
  else
    echo "   ⏭️  Não existe: $table"
  fi
  echo ""
done

# ============================================================================
# Apagar Modelos
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗑️  APAGANDO MODELOS ANTIGOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for model in "${OLD_MODELS[@]}"; do
  echo "   🔍 Verificando: $model"
  
  if bq show --project_id="$PROJECT_ID" -m "$DATASET.$model" &>/dev/null; then
    echo "   ❌ Apagando: $model"
    bq rm -f -m --project_id="$PROJECT_ID" "$DATASET.$model"
    echo "   ✅ Apagado: $model"
  else
    echo "   ⏭️  Não existe: $model"
  fi
  echo ""
done

# ============================================================================
# Resumo
# ============================================================================
echo "================================================================================"
echo "🎉 LIMPEZA COMPLETA!"
echo "================================================================================"
echo ""
echo "✅ MANTIDOS (EM USO):"
echo "   📊 Tabelas:"
echo "      • closed_deals_won (506 deals enriquecidos)"
echo "      • closed_deals_lost (2,069 deals enriquecidos)"
echo "      • pipeline (39 deals abertos)"
echo "      • sales_specialist (12 deals)"
echo ""
echo "   🤖 Modelos:"
echo "      • ml_previsao_ciclo"
echo "      • ml_classificador_perda"
echo "      • ml_risco_abandono"
echo "      • ml_performance_vendedor"
echo ""
echo "   🧠 Views/saídas (pipeline_*):"
echo "      • pipeline_prioridade_deals"
echo "      • pipeline_proxima_acao"
echo ""
echo "❌ REMOVIDOS:"
echo "   📊 Tabelas: ${#OLD_TABLES[@]} removidas"
echo "   🤖 Modelos: ${#OLD_MODELS[@]} removidos"
echo ""
echo "🔗 PRÓXIMO PASSO:"
echo "   Rodar ./deploy_ml.sh (após o BigQuerySync diário)"
echo ""
