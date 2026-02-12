#!/bin/bash
# Deploy FastAPI app to Cloud Run
set -e

# Configuration
PROJECT_ID="operaciones-br"
REGION="us-central1"
SERVICE_NAME="sales-intelligence-api"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🚀 Cloud Run Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "."; then
    echo -e "${RED}❌ Error: Not authenticated with gcloud${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

# Change to cloud-run directory (Docker build context must include app/ and requirements.txt)
cd "$(dirname "$0")"
echo -e "${YELLOW}📁 Working directory: $(pwd)${NC}"

echo -e "${YELLOW}📦 Building Docker image...${NC}"
docker build -t ${IMAGE_NAME}:latest .

echo -e "${YELLOW}📤 Pushing image to Container Registry...${NC}"
docker push ${IMAGE_NAME}:latest

echo -e "${YELLOW}🌐 Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME}:latest \
    --project ${PROJECT_ID} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --max-instances 10 \
    --min-instances 0 \
    --concurrency 80 \
    --port 8080 \
    --set-env-vars "GCP_PROJECT=${PROJECT_ID}" \
    --service-account "operaciones-br@appspot.gserviceaccount.com"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --format 'value(status.url)')

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Service URL: ${SERVICE_URL}${NC}"
echo -e "${GREEN}Health Check: ${SERVICE_URL}/health${NC}"
echo -e "${GREEN}API Docs: ${SERVICE_URL}/docs${NC}"
echo -e "${GREEN}========================================${NC}"

# Test health endpoint
echo -e "${YELLOW}🧪 Testing health endpoint...${NC}"
sleep 5
if curl -s "${SERVICE_URL}/health" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Health check passed!${NC}"
else
    echo -e "${RED}⚠️ Health check failed - check logs${NC}"
    gcloud run services logs tail ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID} --limit 50
fi
