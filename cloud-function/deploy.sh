#!/bin/bash
# ============================================================================
# Deploy Automatizado - Sales Intelligence Cloud Function
# ============================================================================
# IMPORTANTE: Cloud Functions Gen2 NÃO PRECISA de container!
# A própria Google Cloud cria o container automaticamente a partir do código.
# ============================================================================

set -e  # Exit on error

echo "🚀 DEPLOY SALES INTELLIGENCE - CLOUD FUNCTION"
echo "════════════════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# 1. VERIFICAÇÕES PRÉ-DEPLOY
# ============================================================================
echo "📋 Verificando pré-requisitos..."

# Verificar se está no diretório correto
if [ ! -f "main.py" ]; then
    echo "❌ Erro: Execute este script do diretório cloud-function/"
    exit 1
fi

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ Erro: Google Cloud SDK não instalado"
    echo "   Instale: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Verificar projeto configurado
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Erro: Projeto GCP não configurado"
    echo "   Execute: gcloud config set project SEU_PROJETO_ID"
    exit 1
fi

echo "✅ Projeto: $PROJECT_ID"
echo "✅ Arquivos: main.py, requirements.txt, column_mapping.py"
echo ""

# ============================================================================
# 2. CONFIGURAÇÕES
# ============================================================================
FUNCTION_NAME="sales-intelligence-engine"
REGION="us-central1"
RUNTIME="python311"
MEMORY="2GB"
TIMEOUT="540s"
MAX_INSTANCES="10"

echo "📦 Configurações do Deploy:"
echo "   Nome: $FUNCTION_NAME"
echo "   Região: $REGION"
echo "   Runtime: $RUNTIME"
echo "   Memória: $MEMORY"
echo "   Timeout: $TIMEOUT"
echo "   Max Instances: $MAX_INSTANCES"
echo ""

# ============================================================================
# 3. CONFIRMAR DEPLOY
# ============================================================================
read -p "❓ Continuar com o deploy? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deploy cancelado"
    exit 0
fi

# ============================================================================
# 4. DEPLOY DA CLOUD FUNCTION (GEN2)
# ============================================================================
echo ""
echo "☁️  Fazendo deploy da Cloud Function..."
echo "────────────────────────────────────────────────────────────────────────"

# IMPORTANTE: --allow-unauthenticated para permitir chamadas do Apps Script
# Em produção, recomenda-se usar autenticação via Service Account
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=$RUNTIME \
  --region=$REGION \
  --source=. \
  --entry-point=sales_intelligence_engine \
  --trigger-http \
  --allow-unauthenticated \
  --memory=$MEMORY \
  --timeout=$TIMEOUT \
  --max-instances=$MAX_INSTANCES \
  --set-env-vars="GCP_PROJECT=$PROJECT_ID"

DEPLOY_STATUS=$?

echo ""
echo "────────────────────────────────────────────────────────────────────────"

if [ $DEPLOY_STATUS -eq 0 ]; then
    echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
    echo ""
    
    # ========================================================================
    # 5. OBTER URL DA FUNCTION
    # ========================================================================
    echo "🔗 Obtendo URL da função..."
    FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
      --gen2 \
      --region=$REGION \
      --format='value(serviceConfig.uri)' 2>/dev/null)
    
    if [ -z "$FUNCTION_URL" ]; then
        echo "⚠️  Não foi possível obter a URL automaticamente"
        echo "   Execute manualmente:"
        echo "   gcloud functions describe $FUNCTION_NAME --gen2 --region=$REGION --format='value(serviceConfig.uri)'"
    else
        echo "✅ URL da Function:"
        echo ""
        echo "   $FUNCTION_URL"
        echo ""
        echo "────────────────────────────────────────────────────────────────────────"
        echo ""
        
        # ====================================================================
        # 6. ATUALIZAR APPS SCRIPT
        # ====================================================================
        echo "📝 PRÓXIMO PASSO: Atualizar Apps Script"
        echo ""
        echo "1. Abra o arquivo: appscript/DashboardCode.gs"
        echo ""
        echo "2. Atualize a linha 60:"
        echo "   const CLOUD_FUNCTION_URL = '$FUNCTION_URL';"
        echo ""
        echo "3. Salve e teste o dashboard"
        echo ""
        
        # ====================================================================
        # 7. TESTAR FUNCTION
        # ====================================================================
        echo "────────────────────────────────────────────────────────────────────────"
        echo ""
        echo "🧪 TESTAR A FUNCTION:"
        echo ""
        echo "curl -X POST $FUNCTION_URL \\"
        echo "  -H 'Content-Type: application/json' \\"
        echo "  -d '{\"mode\": \"bigquery\", \"project_id\": \"$PROJECT_ID\", \"dataset_id\": \"sales_intelligence\"}'"
        echo ""
        
        # ====================================================================
        # 8. LOGS
        # ====================================================================
        echo "────────────────────────────────────────────────────────────────────────"
        echo ""
        echo "📊 VISUALIZAR LOGS:"
        echo ""
        echo "gcloud functions logs read $FUNCTION_NAME \\"
        echo "  --gen2 \\"
        echo "  --region=$REGION \\"
        echo "  --limit=50"
        echo ""
    fi
    
    # ========================================================================
    # 9. SUMMARY
    # ========================================================================
    echo "════════════════════════════════════════════════════════════════════════"
    echo "✅ DEPLOY COMPLETADO!"
    echo ""
    echo "📦 Container: Criado automaticamente pela Google Cloud (Gen2)"
    echo "🔒 Auth: Permitido sem autenticação (allow-unauthenticated)"
    echo "💾 Memória: $MEMORY"
    echo "⏱️  Timeout: $TIMEOUT"
    echo "📈 Max Instances: $MAX_INSTANCES"
    echo ""
    echo "🔗 URL: $FUNCTION_URL"
    echo ""
    echo "IMPORTANTE: NÃO PRECISA de Dockerfile ou container manual!"
    echo "A Google Cloud cria o container automaticamente a partir do main.py"
    echo ""
    echo "════════════════════════════════════════════════════════════════════════"
    
else
    echo "❌ DEPLOY FALHOU!"
    echo ""
    echo "Verifique os logs de erro acima e tente novamente."
    echo ""
    exit 1
fi
