#!/bin/bash
#
# Deploy Simplified Sales Intelligence API to Cloud Run
#

set -e

PROJECT_ID="operaciones-br"
REGION="us-central1"
SERVICE_NAME="sales-intelligence-api"

echo "🚀 Deploying simplified API to Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo ""

# Build and deploy
gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 60 \
  --set-env-vars GCP_PROJECT=$PROJECT_ID

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Service URL:"
gcloud run services describe $SERVICE_NAME \
  --project $PROJECT_ID \
  --region $REGION \
  --format 'value(status.url)'

echo ""
echo "📝 Next steps:"
echo "1. Test health: curl \$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')/health"
echo "2. Test metrics: curl \$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')/api/metrics"
echo "3. Update Dashboard HTML with this URL"
