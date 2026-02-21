#!/bin/bash
# ============================================================================
# Deploy de Modelos ML v2 (usando dados enriquecidos)
# ============================================================================
# USO: ./deploy_ml_v2.sh
# ============================================================================

set -e

PROJECT_ID="operaciones-br"
DATASET="sales_intelligence"

echo "================================================================================"
echo "🚀 DEPLOY DE MODELOS ML v2 (Dados Enriquecidos)"
echo "================================================================================"
echo ""
echo "📊 PROJECT: $PROJECT_ID"
echo "📦 DATASET: $DATASET"
echo ""

# ============================================================================
# Função: Deploy de modelo
# ============================================================================
deploy_model() {
  local model_name=$1
  local sql_file=$2
  local description=$3
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔨 MODELO: $model_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "   📄 Arquivo: $sql_file"
  echo "   📝 Descrição: $description"
  echo ""
  
  if [ ! -f "$sql_file" ]; then
    echo "   ❌ ERRO: Arquivo não encontrado: $sql_file"
    return 1
  fi
  
  echo "   ⏳ Treinando modelo..."
  start_time=$(date +%s)
  
  if bq query \
      --project_id="$PROJECT_ID" \
      --use_legacy_sql=false \
      --max_rows=0 \
      < "$sql_file"; then
    
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo ""
    echo "   ✅ SUCESSO! Modelo treinado em ${duration}s"
    echo ""
    
    # Avaliar modelo
    echo "   📊 Avaliando modelo..."
    bq query \
      --project_id="$PROJECT_ID" \
      --use_legacy_sql=false \
      --format=pretty \
      "SELECT * FROM ML.EVALUATE(MODEL \`$PROJECT_ID.$DATASET.$model_name\`)" \
      || echo "   ⚠️ Avaliação falhou (modelo pode não suportar EVALUATE)"
    
    echo ""
    return 0
  else
    echo ""
    echo "   ❌ ERRO: Falha ao treinar modelo"
    echo ""
    return 1
  fi
}

# ============================================================================
# FASE 1: Modelos Base (Previsão + Classificação)
# ============================================================================
echo ""
echo "🎯 FASE 1: Modelos Base"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""

# Modelo 1: Previsão de Ciclo
deploy_model \
  "ml_previsao_ciclo_v2" \
  "ml_previsao_ciclo_v2.sql" \
  "Predição de tempo de ciclo (BOOSTED_TREE_REGRESSOR)"

# Modelo 2: Classificador de Perda
deploy_model \
  "ml_classificador_perda_v2" \
  "ml_classificador_perda_v2.sql" \
  "Classificação de causas de perda (BOOSTED_TREE_CLASSIFIER)"

# Modelo 3: Risco de Abandono
deploy_model \
  "ml_risco_abandono_v2" \
  "ml_risco_abandono_v2.sql" \
  "Predição de risco de abandono (BOOSTED_TREE_CLASSIFIER)"

# Modelo 4: Performance Vendedor
deploy_model \
  "ml_performance_vendedor_v2" \
  "ml_performance_vendedor_v2.sql" \
  "Predição de win rate por vendedor (LINEAR_REG)"

# ============================================================================
# FINALIZAÇÃO
# ============================================================================
echo ""
echo "================================================================================"
echo "🎉 DEPLOY COMPLETO!"
echo "================================================================================"
echo ""
echo "📊 RESUMO:"
echo "   ✅ Modelo 1: ml_previsao_ciclo_v2 (Regression)"
echo "   ✅ Modelo 2: ml_classificador_perda_v2 (Multiclass Classifier)"
echo "   ✅ Modelo 3: ml_risco_abandono_v2 (Binary Classifier)"
echo "   ✅ Modelo 4: ml_performance_vendedor_v2 (Linear Regression)"
echo ""
echo "🔗 PRÓXIMOS PASSOS:"
echo "   1. Validar precisão dos modelos com ML.EVALUATE"
echo "   2. Aplicar predições no pipeline aberto com ML.PREDICT"
echo "   3. Criar views de priorização e recomendação"
echo ""
echo "📝 QUERIES DE TESTE:"
echo "   # Avaliar Modelo 1"
echo "   bq query 'SELECT * FROM ML.EVALUATE(MODEL \`$PROJECT_ID.$DATASET.ml_previsao_ciclo_v2\`)'"
echo ""
echo "   # Avaliar Modelo 2"
echo "   bq query 'SELECT * FROM ML.EVALUATE(MODEL \`$PROJECT_ID.$DATASET.ml_classificador_perda_v2\`)'"
echo ""
echo "   # Predição de ciclo no pipeline"
echo "   bq query 'SELECT * FROM ML.PREDICT(MODEL \`$PROJECT_ID.$DATASET.ml_previsao_ciclo_v2\`, (SELECT * FROM \`$PROJECT_ID.$DATASET.pipeline\` LIMIT 5))'"
echo ""
