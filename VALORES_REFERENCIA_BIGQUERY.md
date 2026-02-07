# 📊 VALORES DE REFERÊNCIA - BIGQUERY

> Use este documento como "cheat sheet" para comparar os valores do dashboard com a fonte de verdade.

---

## ✅ PIPELINE TOTAL (sempre o mesmo)

```sql
SELECT COUNT(*) as deals, SUM(Gross) as gross, SUM(Net) as net
FROM `operaciones-br.sales_intelligence.pipeline`
```

### Resultado:
```
Deals:  268
Gross:  $74,158,469
Net:    $28,891,641
```

**⚠️ IMPORTANTE:** Este valor NUNCA deve mudar no dashboard, independente do filtro selecionado!

---

## 📅 PIPELINE POR QUARTER (Data_Prevista)

### Q1 2026 (Jan-Mar):
```
Deals:  ? (testar)
Gross:  ? (testar)
```

### Q2 2026 (Abr-Jun):
```
Deals:  103
Gross:  $33,548,257
Net:    $14,273,983
```

### Q3 2026 (Jul-Set):
```
Deals:  ? (provavelmente 0)
Gross:  ? (provavelmente $0)
```

### Q4 2026 (Out-Dez):
```
Deals:  ? (provavelmente 0)
Gross:  ? (provavelmente $0)
```

---

## 🎯 CLOSED DEALS - WON (Total)

```sql
SELECT COUNT(*) as deals, SUM(Gross) as gross, SUM(Net) as net
FROM `operaciones-br.sales_intelligence.closed_deals_won`
```

### Resultado:
```
Deals:  506
Gross:  $109,849,113
Net:    $37,777,512
```

### Datas:
```
Primeira: 13-02-2025  (sim, ordem alfabética - bug do STRING)
Última:   31-12-2024
```

---

## 🎯 CLOSED DEALS WON - POR QUARTER

### Q1 2026 (Jan-Mar):
```
Deals:  ? (testar)
Gross:  ? (testar)
```

### Q2 2026 (Abr-Jun):
```
Deals:  1  ⚠️
Gross:  $315,900
Net:    -$22,113  ⚠️ NEGATIVO!
Data:   2026-06-01
```

### Q3 2026 (Jul-Set):
```
Deals:  0 (Q3 ainda não aconteceu)
Gross:  $0
```

### Q4 2026 (Out-Dez):
```
Deals:  0 (Q4 ainda não aconteceu)
Gross:  $0
```

---

## 🎯 CLOSED DEALS - LOST (Total)

```
Deals:  500+
Gross:  $252,302,051
Net:    $111,299,226
```

---

## 👤 PIPELINE POR VENDEDOR

### Alex Araujo:
```
Pipeline:
  Deals:  90
  Gross:  $21,039,251
  Net:    ? (calcular)

Closed Won:
  Deals:  7
  Gross:  ? (verificar)
  
Closed Won (month=1):
  Deals:  3
  Gross:  ? (verificar)
```

### Outros vendedores:
```
Total de vendedores ativos: 10
```

---

## 🔢 CÁLCULOS ESPERADOS

### Taxa de Conversão (sem filtro):
```
Won:    506 deals
Lost:   500 deals
Total:  1006 deals
Taxa:   50.3% (506/1006)
```

### Previsão Ponderada IA:
```
Fórmula: Pipeline × (Confiança Média / 100)

Exemplo:
  Pipeline:  $74,158,469
  Confiança: 37%
  Previsão:  $74,158,469 × 0.37 = $27,438,634
```

### Deals ≥50% Confiança:
```
Soma apenas deals onde Confiana >= 0.5
(Depende dos dados - verificar no dashboard)
```

---

## 🚨 VALORES PROBLEMÁTICOS

### ❌ Bugs conhecidos que PODEM aparecer:

#### Bug #1: Pipeline Total = $0
```
Esperado: $74,158,469 (sempre)
Bugado:   $0 (quando filtro ativo)
```

#### Bug #2: Deals Fechados inconsistente (Q2 2026)
```
Esperado: $315,900 com "1 deal ganho"
Bugado:   $315,900 com "0 deals ganhos"
```

#### Bug #3: Net negativo não tratado
```
Q2 2026 Closed Won:
  Gross: $315,900
  Net:   -$22,113  ⚠️
  
Dashboard pode não saber lidar com Net negativo
```

---

## 📋 VALIDAÇÃO RÁPIDA

Use esta tabela para marcar ✅ ou ❌ durante os testes:

| Cenário | Pipeline Total | Pipeline Filtrado | Deals Fechados | Status |
|---------|---------------|-------------------|----------------|--------|
| Baseline | $74.1M? | $74.1M? | $109.8M? | ☐ |
| Q1 2026 | $74.1M? | ? | ? | ☐ |
| Q2 2026 | $74.1M? | $33.5M? | $315k? | ☐ |
| Alex Araujo | $74.1M? | $21M? | ? | ☐ |
| Q1 + Alex | $74.1M? | ? | ? | ☐ |
| Q3 2026 | $74.1M? | $0? | $0? | ☐ |

---

## 🔍 QUERIES ÚTEIS (caso queira testar no BigQuery)

### Teste 1: Verificar deals do Alex em Janeiro 2026
```sql
SELECT 
  COUNT(*) as deals,
  SUM(Gross) as gross
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE Vendedor = 'Alex Araujo'
AND EXTRACT(MONTH FROM COALESCE(
  SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), 
  SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento)
)) = 1
AND EXTRACT(YEAR FROM COALESCE(
  SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), 
  SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento)
)) = 2026
```

### Teste 2: Verificar pipeline Q1 2026
```sql
SELECT 
  COUNT(*) as deals,
  SUM(Gross) as gross,
  SUM(Net) as net
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) IN (1, 2, 3)
AND EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', Data_Prevista)) = 2026
```

### Teste 3: Verificar deals com confiança >= 50%
```sql
SELECT 
  COUNT(*) as deals,
  SUM(Gross) as gross,
  SUM(Net) as net,
  AVG(SAFE_CAST(Confiana AS FLOAT64)) as avg_confidence
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE SAFE_CAST(Confiana AS FLOAT64) >= 0.5
```

---

## 📞 REFERÊNCIA DE ENDPOINTS DA API

### Testar manualmente:

```bash
# Todos os deals
curl "https://sales-intelligence-api-j7loux7yta-uc.a.run.app/api/pipeline?limit=500"

# Pipeline do Alex
curl "https://sales-intelligence-api-j7loux7yta-uc.a.run.app/api/pipeline?seller=Alex%20Araujo&limit=500"

# Closed won em Janeiro
curl "https://sales-intelligence-api-j7loux7yta-uc.a.run.app/api/closed/won?month=1&limit=500"

# Closed won Q2 2026 (Abril)
curl "https://sales-intelligence-api-j7loux7yta-uc.a.run.app/api/closed/won?month=4&year=2026&limit=500"
```

---

## 💡 DICA DE OURO

Se você ver:
- **Pipeline Total = $0** → 🔴 BUG CONFIRMADO
- **Deals Fechados** valor ≠ contador → 🔴 BUG CONFIRMADO
- **Demora > 3 segundos** → 🟡 PROBLEMA DE PERFORMANCE
- **Erro 422** → 🟡 URL malformada (já corrigido, não deve acontecer mais)

---

Voltando sempre que precisar conferir um valor! 📊
