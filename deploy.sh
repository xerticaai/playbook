#!/bin/bash
# ===================================================================
# SCRIPT DE DEPLOY - Sales Intelligence API v2.5
# ===================================================================
# IMPORTANTE: Execute este script SOMENTE APÓS reativar billing!
# ===================================================================

set -e  # Exit on error

PROJECT_ID="operaciones-br"
REGION="us-central1"
SERVICE_NAME="sales-intelligence-api"
APP_DIR="$(dirname "$0")/cloud-run/app"

echo "🚀 INICIANDO DEPLOY - Sales Intelligence API"
echo "============================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check if billing is enabled
echo "✅ Verificando billing..."
BILLING_STATUS=$(gcloud beta billing projects describe $PROJECT_ID --format="value(billingEnabled)" 2>&1 || echo "error")

if [ "$BILLING_STATUS" != "True" ]; then
    echo "❌ ERRO: Billing account não está ativa no projeto $PROJECT_ID"
    echo ""
    echo "AÇÃO NECESSÁRIA:"
    echo "1. Acesse: https://console.cloud.google.com/billing"
    echo "2. Ative a conta de billing do projeto"
    echo "3. Execute este script novamente"
    echo ""
    exit 1
fi

echo "✅ Billing ativa! Continuando..."
echo ""

# Verify required APIs are enabled
echo "✅ Verificando APIs habilitadas..."
REQUIRED_APIS=(
    "run.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --enabled --project=$PROJECT_ID --filter="name:$api" --format="value(name)" | grep -q "$api"; then
        echo "   ✓ $api"
    else
        echo "   ⚠ Habilitando $api..."
        gcloud services enable $api --project=$PROJECT_ID
    fi
done

echo ""
echo "✅ Todas as APIs necessárias estão habilitadas!"
echo ""

# Deploy
echo "🚀 Fazendo deploy do Cloud Run..."
echo ""

gcloud run deploy $SERVICE_NAME \
  --source $APP_DIR \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars "GCP_PROJECT=$PROJECT_ID,GEMINI_API_KEY=AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --project $PROJECT_ID --format="value(status.url)")

echo ""
echo "============================================="
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "============================================="
echo ""
echo "🌐 URL do Serviço: $SERVICE_URL"
echo ""
echo "📋 Endpoints disponíveis:"
echo "   - $SERVICE_URL/health"
echo "   - $SERVICE_URL/api/war-room"
echo "   - $SERVICE_URL/api/weekly-agenda"
echo "   - $SERVICE_URL/api/export/war-room-csv"
echo "   - $SERVICE_URL/api/export/pauta-semanal-csv"
echo ""
echo "🧪 Testando API..."
curl -s $SERVICE_URL/health | jq .

echo ""
echo "✅ PRONTO PARA USO!"
echo ""
