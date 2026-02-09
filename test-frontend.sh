#!/bin/bash
# Script de validação completa do deploy
# Execute: chmod +x test-frontend.sh && ./test-frontend.sh

BASE_URL="https://sales-intelligence-api-j7loux7yta-uc.a.run.app"

echo "================================================"
echo "🧪 VALIDAÇÃO COMPLETA DO FRONTEND + APIs"
echo "================================================"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ Health Check: OK (HTTP $STATUS)"
else
    echo "   ❌ Health Check: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 2: Frontend HTML
echo "2️⃣  Testing Frontend HTML..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ index.html: OK (HTTP $STATUS)"
    # Verificar se contém JavaScript crítico
    if curl -s "$BASE_URL/" | grep -q "window.API_BASE_URL"; then
        echo "   ✅ JavaScript: Presente e intacto"
    else
        echo "   ⚠️  JavaScript: Possivelmente corrompido"
    fi
else
    echo "   ❌ index.html: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 3: CSS Loading
echo "3️⃣  Testing CSS Loading..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/loader.css")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ loader.css: OK (HTTP $STATUS)"
    # Verificar content-type
    CONTENT_TYPE=$(curl -s -I "$BASE_URL/loader.css" | grep -i "content-type" | cut -d: -f2 | tr -d '[:space:]')
    if [[ "$CONTENT_TYPE" == *"text/css"* ]]; then
        echo "   ✅ Media Type: text/css"
    else
        echo "   ⚠️  Media Type: $CONTENT_TYPE (esperado: text/css)"
    fi
else
    echo "   ❌ loader.css: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 4: Weekly Agenda API
echo "4️⃣  Testing Weekly Agenda API..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/weekly-agenda?top_n=3")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ Weekly Agenda: OK (HTTP $STATUS)"
    # Verificar se retorna JSON válido
    DEALS=$(curl -s "$BASE_URL/api/weekly-agenda?top_n=3" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['summary']['total_deals'])" 2>/dev/null)
    if [ ! -z "$DEALS" ]; then
        echo "   ✅ Response: $DEALS deals retornados"
    fi
else
    echo "   ❌ Weekly Agenda: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 5: War Room API
echo "5️⃣  Testing War Room API..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/war-room?top_sellers=3&include_ai_insights=true")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ War Room: OK (HTTP $STATUS)"
    # Verificar se AI insights estão presentes
    HAS_INSIGHTS=$(curl -s "$BASE_URL/api/war-room?top_sellers=3&include_ai_insights=true" | python3 -c "import json,sys; data=json.load(sys.stdin); print('yes' if 'ai_insights' in data and len(data['ai_insights'].get('attention_points', [])) > 0 else 'no')" 2>/dev/null)
    if [ "$HAS_INSIGHTS" == "yes" ]; then
        echo "   ✅ AI Insights: Gemini gerando insights"
    else
        echo "   ⚠️  AI Insights: Não encontrados"
    fi
else
    echo "   ❌ War Room: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 6: Export CSV
echo "6️⃣  Testing CSV Export..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/export/war-room-csv")
if [ "$STATUS" -eq 200 ]; then
    echo "   ✅ CSV Export: OK (HTTP $STATUS)"
    # Verificar content-type
    CONTENT_TYPE=$(curl -s -I "$BASE_URL/api/export/war-room-csv" | grep -i "content-type" | cut -d: -f2 | tr -d '[:space:]')
    if [[ "$CONTENT_TYPE" == *"text/csv"* ]]; then
        echo "   ✅ Media Type: text/csv"
    fi
else
    echo "   ❌ CSV Export: FAILED (HTTP $STATUS)"
    exit 1
fi
echo ""

# Test 7: BigQuery Views
echo "7️⃣  Testing BigQuery Views..."
PAUTA_EXISTS=$(bq ls --format=json sales_intelligence 2>/dev/null | jq -r '.[] | select(.tableReference.tableId == "pauta_semanal_enriquecida") | .tableReference.tableId')
WAR_EXISTS=$(bq ls --format=json sales_intelligence 2>/dev/null | jq -r '.[] | select(.tableReference.tableId == "war_room_metrics") | .tableReference.tableId')

if [ "$PAUTA_EXISTS" == "pauta_semanal_enriquecida" ]; then
    echo "   ✅ BigQuery VIEW: pauta_semanal_enriquecida existe"
else
    echo "   ⚠️  BigQuery VIEW: pauta_semanal_enriquecida não encontrada"
fi

if [ "$WAR_EXISTS" == "war_room_metrics" ]; then
    echo "   ✅ BigQuery VIEW: war_room_metrics existe"
else
    echo "   ⚠️  BigQuery VIEW: war_room_metrics não encontrada"
fi
echo ""

# Summary
echo "================================================"
echo "📊 RESUMO DOS TESTES"
echo "================================================"
echo ""
echo "Frontend URL: $BASE_URL"
echo "API Docs: $BASE_URL/docs"
echo "Health Check: $BASE_URL/health"
echo ""
echo "✅ Todos os testes críticos passaram!"
echo ""
echo "🚀 Abra o frontend no navegador:"
echo "   $BASE_URL"
echo ""
echo "📝 Relatório completo: DEPLOY_FRONTEND_REPORT.md"
echo "================================================"
