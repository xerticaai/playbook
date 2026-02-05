#!/bin/bash

# Quick Test Script - Valida toda a arquitetura
set -e

PROJECT_ID="operaciones-br"
DATASET_ID="sales_intelligence"
FUNCTION_URL="https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine"

echo "=========================================="
echo "  Sales Intelligence - Quick Test"
echo "=========================================="
echo ""

# ========== Teste 1: BigQuery Dataset ==========
echo "🔍 [1/5] Verificando BigQuery dataset..."
if bq show ${PROJECT_ID}:${DATASET_ID} > /dev/null 2>&1; then
    echo "   ✅ Dataset encontrado"
else
    echo "   ❌ Dataset não encontrado. Execute: ./setup_bigquery.sh"
    exit 1
fi
echo ""

# ========== Teste 2: Tabelas ==========
echo "🔍 [2/5] Verificando tabelas..."
TABLES=$(bq ls ${PROJECT_ID}:${DATASET_ID} | grep -E 'pipeline|closed_deals' | wc -l)
if [ $TABLES -ge 2 ]; then
    echo "   ✅ Tabelas encontradas: pipeline, closed_deals"
    
    # Contar linhas
    PIPELINE_COUNT=$(bq query --use_legacy_sql=false --format=csv \
        "SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET_ID}.pipeline\`" | tail -n 1)
    CLOSED_COUNT=$(bq query --use_legacy_sql=false --format=csv \
        "SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET_ID}.closed_deals\`" | tail -n 1)
    
    echo "      - Pipeline: ${PIPELINE_COUNT} linhas"
    echo "      - Closed: ${CLOSED_COUNT} linhas"
    
    if [ $PIPELINE_COUNT -eq 0 ] || [ $CLOSED_COUNT -eq 0 ]; then
        echo "   ⚠️  Tabelas vazias. Execute: ./load_initial_data.py"
    fi
else
    echo "   ❌ Tabelas não encontradas. Execute: ./setup_bigquery.sh"
    exit 1
fi
echo ""

# ========== Teste 3: Modelo de ML ==========
echo "🔍 [3/5] Verificando modelo de ML..."
if bq show --model ${PROJECT_ID}:${DATASET_ID}.win_loss_predictor > /dev/null 2>&1; then
    echo "   ✅ Modelo win_loss_predictor encontrado"
    
    # Buscar métricas
    echo "   📊 Métricas do modelo:"
    bq query --use_legacy_sql=false --format=pretty \
        "SELECT 
            ROUND(accuracy, 3) as accuracy,
            ROUND(precision, 3) as precision,
            ROUND(recall, 3) as recall,
            ROUND(roc_auc, 3) as roc_auc
         FROM ML.EVALUATE(MODEL \`${PROJECT_ID}.${DATASET_ID}.win_loss_predictor\`)
         LIMIT 1" | tail -n +3
else
    echo "   ⚠️  Modelo não encontrado. Execute: bq query < ml_win_loss_model.sql"
fi
echo ""

# ========== Teste 4: Cloud Function ==========
echo "🔍 [4/5] Verificando Cloud Function..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST ${FUNCTION_URL} \
    -H "Content-Type: application/json" \
    -d '{"source": "bigquery", "filters": {}}')

if [ $HTTP_CODE -eq 200 ]; then
    echo "   ✅ Cloud Function respondendo (HTTP 200)"
    
    # Fazer request real e mostrar resultado
    RESULT=$(curl -s -X POST ${FUNCTION_URL} \
        -H "Content-Type: application/json" \
        -d '{"source": "bigquery", "filters": {}}')
    
    echo "   📊 Resultado da análise:"
    echo "$RESULT" | python3 -m json.tool | grep -A 5 '"data_summary"'
else
    echo "   ❌ Cloud Function com erro (HTTP ${HTTP_CODE})"
    echo "   Verifique: gcloud functions logs read sales-intelligence-engine"
fi
echo ""

# ========== Teste 5: Predições ML ==========
echo "🔍 [5/5] Verificando tabela de predições..."
if bq show ${PROJECT_ID}:${DATASET_ID}.pipeline_predictions > /dev/null 2>&1; then
    echo "   ✅ Tabela pipeline_predictions encontrada"
    
    # Mostrar top 5 em risco
    echo "   🚨 Top 5 deals em risco (alta probabilidade de perda):"
    bq query --use_legacy_sql=false --format=pretty \
        "SELECT 
            oportunidade,
            ROUND(gross, 2) as valor,
            ROUND(win_probability * 100, 1) as win_prob_pct,
            ml_alert
         FROM \`${PROJECT_ID}.${DATASET_ID}.pipeline_predictions\`
         WHERE win_probability < 0.5
         ORDER BY gross DESC
         LIMIT 5" | tail -n +3
else
    echo "   ⚠️  Tabela de predições não encontrada"
    echo "   Execute a Parte 5 do ml_win_loss_model.sql"
fi
echo ""

# ========== Resultado Final ==========
echo "=========================================="
echo "  ✅ Testes Concluídos!"
echo "=========================================="
echo ""
echo "Próximos passos:"
echo "1. Configure o Apps Script (BigQueryLoader.gs)"
echo "2. Execute runFullAnalysis() no Google Sheets"
echo "3. Configure triggers automáticos para carga diária"
echo "4. Retreine o modelo semanalmente"
echo ""
echo "Documentação completa: ./DEPLOYMENT_GUIDE.md"
echo ""
