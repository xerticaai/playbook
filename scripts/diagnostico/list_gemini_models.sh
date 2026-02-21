#!/bin/bash
# Script para listar modelos Gemini disponíveis
# Uso: ./list_gemini_models.sh YOUR_API_KEY

if [ -z "$1" ]; then
  echo "❌ Erro: API Key não fornecida"
  echo ""
  echo "Uso: $0 YOUR_GEMINI_API_KEY"
  echo ""
  echo "📋 Modelos Gemini disponíveis (Fevereiro 2026):"
  echo ""
  echo "🚀 Gemini 3 Series (Preview):"
  echo "   • gemini-3.1-pro-preview      (mais recente - advanced reasoning)"
  echo "   • gemini-3-pro-preview        (preview inicial)"
  echo "   • gemini-3-flash-preview      (alto desempenho, baixo custo)"
  echo ""
  echo "✅ Gemini 2.5 Series (GA - Estável):"
  echo "   • gemini-2.5-pro              (recomendado - retira junho 2026)"
  echo "   • gemini-2.5-flash            (rápido - retira junho 2026)"
  echo "   • gemini-2.5-flash-lite       (leve - retira julho 2026)"
  echo ""
  echo "❌ Modelos Depreciados (NÃO USAR):"
  echo "   • gemini-2.0-* (shutdown 31 março 2026)"
  echo "   • gemini-1.5-* (depreciados)"
  exit 1
fi

API_KEY="$1"

echo "🔍 Listando modelos disponíveis na sua conta Gemini..."
echo ""

# Fazer requisição
response=$(curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}")

# Verificar erro
if echo "$response" | grep -q '"error"'; then
  echo "❌ Erro na API:"
  echo "$response" | jq '.error' 2>/dev/null || echo "$response"
  exit 1
fi

# Listar apenas modelos que suportam generateContent
echo "✅ Modelos disponíveis que suportam generateContent:"
echo ""
echo "$response" | jq -r '.models[] | select(.supportedGenerationMethods[]? | contains("generateContent")) | "   • \(.name | sub("models/"; "")) - \(.displayName // "N/A")"' 2>/dev/null

# Se jq falhar, mostrar lista crua
if [ $? -ne 0 ]; then
  echo "$response" | grep -o '"name":"[^"]*"' | sed 's/"name":"models\///g' | sed 's/"//g' | sed 's/^/   • /'
fi

echo ""
echo "📝 Modelo atualmente configurado no ShareCode.gs: gemini-2.5-pro"
echo "📝 Fallbacks: gemini-3.1-pro-preview, gemini-2.5-flash, gemini-2.5-flash-lite"
echo ""
