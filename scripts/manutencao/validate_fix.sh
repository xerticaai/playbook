#!/bin/bash
# Valida se a correção WRITE_TRUNCATE eliminou duplicações

set -e

echo "🔍 Validando correção de duplicação..."
echo ""

# Contar registros por tabela
echo "📊 CONTAGEM DE REGISTROS:"
bq query --use_legacy_sql=false --format=prettyjson \
"SELECT 
  'pipeline' as tabela,
  COUNT(*) as total_records,
  COUNT(DISTINCT Oportunidade) as unique_opps,
  ROUND(SUM(Gross), 2) as total_gross
FROM \`operaciones-br.sales_intelligence.pipeline\`

UNION ALL

SELECT 
  'closed_deals_won' as tabela,
  COUNT(*) as total_records,
  COUNT(DISTINCT Oportunidade) as unique_opps,
  ROUND(SUM(Gross), 2) as total_gross
FROM \`operaciones-br.sales_intelligence.closed_deals_won\`

UNION ALL

SELECT 
  'closed_deals_lost' as tabela,
  COUNT(*) as total_records,
  COUNT(DISTINCT Oportunidade) as unique_opps,
  ROUND(SUM(Gross), 2) as total_gross
FROM \`operaciones-br.sales_intelligence.closed_deals_lost\`
ORDER BY tabela"

echo ""
echo "📈 VALORES ESPERADOS (Google Sheets ground truth):"
echo "  • Pipeline: 268 opps, R\$ 74.1M gross"
echo "  • Won: 506 opps, R\$ 109.8M gross"
echo "  • Lost: 2,069 opps, R\$ 330M gross"
echo "  • TOTAL: 2,864 records, R\$ 529.6M gross"
echo ""
echo "✅ Se os valores acima coincidirem, duplicação foi eliminada!"
