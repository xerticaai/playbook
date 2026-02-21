#!/bin/bash

# BigQuery Setup Script - Sales Intelligence Data Warehouse
# Este script cria o dataset e as tabelas necessárias no BigQuery

set -e  # Exit on any error

# ========== CONFIGURAÇÃO ==========
PROJECT_ID="operaciones-br"
DATASET_ID="sales_intelligence"
LOCATION="us-central1"  # Same region as Cloud Function

# ========== COLORS ==========
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Sales Intelligence BigQuery Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Project: ${PROJECT_ID}"
echo "Dataset: ${DATASET_ID}"
echo "Location: ${LOCATION}"
echo ""

# ========== 1. Criar Dataset ==========
echo -e "${YELLOW}[1/4] Criando dataset...${NC}"
bq --location=${LOCATION} mk \
    --dataset \
    --description="Sales Intelligence Data Warehouse - Pipeline, Ganhas e Perdidas" \
    ${PROJECT_ID}:${DATASET_ID} || echo "Dataset já existe, continuando..."

echo -e "${GREEN}✓ Dataset criado/verificado${NC}"
echo ""

# ========== 2. Criar Tabela: pipeline ==========
echo -e "${YELLOW}[2/4] Criando tabela 'pipeline'...${NC}"
bq mk --table \
    --description="Oportunidades abertas no pipeline de vendas" \
    --time_partitioning_field=data_carga \
    --time_partitioning_type=DAY \
    --time_partitioning_expiration=7776000 \
    ${PROJECT_ID}:${DATASET_ID}.pipeline \
    ./schema_pipeline.json || echo "Tabela pipeline já existe"

echo -e "${GREEN}✓ Tabela 'pipeline' criada/verificada${NC}"
echo ""

# ========== 3. Criar Tabela: closed_deals ==========
echo -e "${YELLOW}[3/4] Criando tabela 'closed_deals'...${NC}"
bq mk --table \
    --description="Histórico de deals fechados (ganhos e perdidos)" \
    --time_partitioning_field=data_carga \
    --time_partitioning_type=DAY \
    --time_partitioning_expiration=31536000 \
    ${PROJECT_ID}:${DATASET_ID}.closed_deals \
    ./schema_closed.json || echo "Tabela closed_deals já existe"

echo -e "${GREEN}✓ Tabela 'closed_deals' criada/verificada${NC}"
echo ""

# ========== 4. Verificar Setup ==========
echo -e "${YELLOW}[4/4] Verificando setup...${NC}"
bq show ${PROJECT_ID}:${DATASET_ID}
echo ""
bq ls ${PROJECT_ID}:${DATASET_ID}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Setup Completo!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Próximos passos:"
echo "1. Execute: ./load_initial_data.py"
echo "2. Modifique o Apps Script para carregar dados no BigQuery"
echo "3. Atualize a Cloud Function para consultar o BigQuery"
echo ""
