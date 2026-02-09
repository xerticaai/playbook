#!/bin/bash
# War Room Executive Script - Preparação Reunião Semanal
# Uso: ./war-room-exec.sh [vendedor_opcional]

set -e

API_URL="https://sales-intelligence-api-j7loux7yta-uc.a.run.app"
VENDEDOR="${1:-}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     📊 WAR ROOM SEMANAL - SALES INTELLIGENCE              ║${NC}"
echo -e "${GREEN}║     $(date '+%d/%m/%Y %H:%M') - Q$(date +%q) 2026                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. VISÃO EXECUTIVA
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📈 RESUMO EXECUTIVO DO QUARTER${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

curl -s "${API_URL}/api/war-room?top_sellers=10&top_deals=20&include_ai_insights=true" | jq -r '
.quarter_summary | 
"
🎯 FORECAST TOTAL:     R$ \(.total_forecast_k)K
💰 FECHADO NO QUARTER: R$ \(.total_closed_k)K (\((.total_closed_k / .total_forecast_k * 100) | floor)% do forecast)
📊 PIPELINE ATIVO:     R$ \(.total_pipeline_k)K
⚠️  DEALS ZUMBIS:       \(.total_zumbis) deals travando R$ \(.zumbis_gross_k)K
📉 CONFIANÇA MÉDIA:    \(.avg_confianca)%
🔴 DEALS EM RISCO:      \(.deals_at_risk_count) deals (R$ \(.deals_at_risk_gross_k)K)
"'

echo ""
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
echo -e "${RED}🚨 PONTOS DE ATENÇÃO (IA)${NC}"
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"

curl -s "${API_URL}/api/war-room?top_sellers=10&top_deals=20&include_ai_insights=true" | jq -r '
.ai_insights.attention_points[] | 
"❌ \(.)"
'

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ VITÓRIAS (IA)${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"

curl -s "${API_URL}/api/war-room?top_sellers=10&top_deals=20&include_ai_insights=true" | jq -r '
.ai_insights.wins[] | 
"✓ \(.)"
'

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}💡 AÇÕES RECOMENDADAS (IA)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

curl -s "${API_URL}/api/war-room?top_sellers=10&top_deals=20&include_ai_insights=true" | jq -r '
.ai_insights.actions[] | 
"→ \(.)"
'

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}👥 TOP 5 VENDEDORES (por Forecast)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

curl -s "${API_URL}/api/war-room?top_sellers=5&top_deals=20" | jq -r '
.seller_metrics[] | 
"\(.Vendedor | ascii_upcase):
  Forecast:    R$ \(.Forecast_Total_Net_K)K
  Pipeline:    R$ \(.Pipeline_Net_K)K (\(.Total_Deals_Pipeline) deals)
  Fechado Q:   R$ \(.Closed_Net_K_Q)K
  Zumbis:      \(.Deals_Zumbis) deals (\(.Pct_Pipeline_Podre)% podre)
  Confiança:   \(.Avg_Confianca)%
  Nota:        \(.Nota_Higiene)
"
' | head -48

# 2. PAUTA ESPECÍFICA POR VENDEDOR
if [ -n "$VENDEDOR" ]; then
    echo ""
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}🎯 PAUTA DETALHADA: ${VENDEDOR}${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    
    VENDEDOR_ENCODED=$(echo "$VENDEDOR" | sed 's/ /%20/g')
    
    curl -s "${API_URL}/api/weekly-agenda?seller=${VENDEDOR_ENCODED}&top_n=10&include_rag=false" | jq -r '
    .summary | 
    "
RESUMO PAUTA:
  Total Deals: \(.total_deals)
  Valor:       R$ \(.total_gross_k)K gross / R$ \(.total_net_k)K net
  Risco Médio: \(.avg_risco_score)/5
  Categorias:  \(.by_categoria | to_entries | map("\(.key): \(.value)") | join(", "))
"'
    
    echo ""
    echo -e "${YELLOW}TOP 5 DEALS PARA DISCUTIR:${NC}"
    echo ""
    
    curl -s "${API_URL}/api/weekly-agenda?seller=${VENDEDOR_ENCODED}&top_n=5&include_rag=false" | jq -r '
    .deals[] | 
    "
────────────────────────────────────────────────────────────
📌 \(.Oportunidade)
   Cliente:     \(.Conta)
   Valor:       R$ \(.Gross / 1000 | floor)K gross
   Categoria:   \(.Categoria_Pauta) (Risco: \(.Risco_Score)/5)
   Dias Funil:  \(.Dias_Funil) dias
   Confiança:   \(.Confianca)%
   
   ❓ PERGUNTAS SABATINA:
\(.sabatina_questions | to_entries | map("      \(.key + 1). \(.value)") | join("\n"))
"
'
fi

# 3. EXPORTAR CSV
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}📥 EXPORTANDO DADOS...${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CSV_FILE="/tmp/war_room_${TIMESTAMP}.csv"

curl -s "${API_URL}/api/export/war-room-csv" > "$CSV_FILE"

echo -e "✅ CSV criado: ${GREEN}${CSV_FILE}${NC}"
echo -e "   $(wc -l < "$CSV_FILE") linhas exportadas"
echo ""

# 4. COMANDOS ÚTEIS
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔧 COMANDOS ÚTEIS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Ver pauta de vendedor específico:"
echo -e "  ${YELLOW}./war-room-exec.sh \"Alex Araujo\"${NC}"
echo ""
echo -e "Ver API docs interativa:"
echo -e "  ${YELLOW}${API_URL}/docs${NC}"
echo ""
echo -e "Exportar CSV:"
echo -e "  ${YELLOW}curl ${API_URL}/api/export/war-room-csv > vendedores.csv${NC}"
echo ""
echo -e "Health check:"
echo -e "  ${YELLOW}curl ${API_URL}/health${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ War Room preparado! Boa reunião! 🎯                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
