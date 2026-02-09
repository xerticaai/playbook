#!/bin/bash
# QUICK COMMANDS - War Room & Pauta Semanal
# Comandos rápidos para usar antes/durante reunião

API="https://sales-intelligence-api-j7loux7yta-uc.a.run.app"

echo "════════════════════════════════════════════════════════════"
echo "🎯 QUICK COMMANDS - Sales Intelligence War Room"
echo "════════════════════════════════════════════════════════════"
echo ""

# 1. RESUMO EXECUTIVO DO QUARTER
echo "1️⃣  RESUMO DO QUARTER:"
echo "   curl -s \"$API/api/war-room?top_sellers=3\" | jq .quarter_summary"
echo ""

# 2. TOP VENDEDORES
echo "2️⃣  TOP 5 VENDEDORES:"
echo "   curl -s \"$API/api/war-room?top_sellers=5\" | jq '.seller_metrics[] | {Vendedor, Forecast_Total_Net_K, Deals_Zumbis, Nota_Higiene}'"
echo ""

# 3. INSIGHTS IA
echo "3️⃣  INSIGHTS IA:"
echo "   curl -s \"$API/api/war-room?include_ai_insights=true\" | jq .ai_insights"
echo ""

# 4. PAUTA VENDEDOR ESPECÍFICO
echo "4️⃣  PAUTA ALEX ARAUJO (exemplo):"
echo "   curl -s \"$API/api/weekly-agenda?seller=Alex%20Araujo&top_n=5\" | jq ."
echo ""

# 5. EXPORT CSV
echo "5️⃣  EXPORT CSV:"
echo "   curl \"$API/api/export/war-room-csv\" > vendedores.csv"
echo ""

# 6. DEALS CRÍTICOS
echo "6️⃣  TOP DEALS EM RISCO:"
echo "   curl -s \"$API/api/war-room?top_deals=10\" | jq '.top_deals_at_risk[] | {Oportunidade, Gross, Dias_Funil, Risco_Score}'"
echo ""

# 7. HEALTH CHECK
echo "7️⃣  HEALTH CHECK:"
echo "   curl -s \"$API/health\" | jq ."
echo ""

# 8. API DOCS
echo "8️⃣  API DOCS INTERATIVA:"
echo "   $API/docs"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "💡 EXEMPLOS PRÁTICOS:"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "📊 Ver forecast total:"
curl -s "$API/api/war-room?top_sellers=1" | jq -r '.quarter_summary | "Forecast: R$ \(.total_forecast_k)K | Fechado: R$ \(.total_closed_k)K | Zumbis: \(.total_zumbis)"'
echo ""

echo "🚨 Ver vendedor MAIS crítico:"
curl -s "$API/api/war-room?top_sellers=20" | jq -r '.seller_metrics | sort_by(.Pct_Pipeline_Podre) | reverse | .[0] | "❌ \(.Vendedor): \(.Deals_Zumbis) zumbis (\(.Pct_Pipeline_Podre)% podre) - Nota \(.Nota_Higiene)"'
echo ""

echo "✅ Ver vendedor MELHOR:"
curl -s "$API/api/war-room?top_sellers=20" | jq -r '.seller_metrics | sort_by(.Pct_Pipeline_Podre) | .[0] | "✓ \(.Vendedor): \(.Deals_Zumbis) zumbis (\(.Pct_Pipeline_Podre)% podre) - Nota \(.Nota_Higiene)"'
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ Pronto para usar! Copy/paste o comando que precisar."
echo "════════════════════════════════════════════════════════════"
