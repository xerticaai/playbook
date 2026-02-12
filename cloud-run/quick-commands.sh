#!/bin/bash
# QUICK COMMANDS - Pauta Semanal
# Comandos rápidos para usar antes/durante reunião

API="https://sales-intelligence-api-j7loux7yta-uc.a.run.app"

echo "════════════════════════════════════════════════════════════"
echo "🎯 QUICK COMMANDS - Sales Intelligence (Pauta Semanal)"
echo "════════════════════════════════════════════════════════════"
echo ""

# 1. PAUTA VENDEDOR ESPECÍFICO
echo "1️⃣  PAUTA ALEX ARAUJO (exemplo):"
echo "   curl -s \"$API/api/weekly-agenda?seller=Alex%20Araujo\" | jq ."
echo ""

# 2. EXPORT CSV
echo "2️⃣  EXPORT CSV:"
echo "   curl \"$API/api/export/pauta-semanal-csv\" > pauta.csv"
echo ""

# 3. HEALTH CHECK
echo "3️⃣  HEALTH CHECK:"
echo "   curl -s \"$API/health\" | jq ."
echo ""

# 4. API DOCS
echo "4️⃣  API DOCS INTERATIVA:"
echo "   $API/docs"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "💡 EXEMPLOS PRÁTICOS:"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "📊 Ver resumo (pauta semanal):"
curl -s "$API/api/weekly-agenda" | jq -r '.summary | "Quarter: \(.quarter) | Sellers: \(.total_sellers) | Deals: \(.total_deals) | Criticos: \(.total_criticos) | Zumbis: \(.total_zumbis)"'
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ Pronto para usar! Copy/paste o comando que precisar."
echo "════════════════════════════════════════════════════════════"
