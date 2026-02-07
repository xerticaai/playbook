# 📊 VALIDAÇÃO DE KPIs - DASHBOARD SALES INTELLIGENCE

## 🎯 OBJETIVO
Validar cada cálculo do dashboard antes de fazer deploy final.

---

## 📝 CENÁRIOS DE TESTE

### CENÁRIO 1: Filtro Padrão (Todos os filtros em "Todos")
```
Quarter: Todos
Vendedor: Todos
Ano: Todos
Mês: Todos
```

**KPIs Esperados:**
- [ ] Pipeline Total: **$74,158,469** (268 deals) ← BigQuery confirmado
- [ ] Pipeline Filtrado: **$74,158,469** (268 deals)
- [ ] Previsão Ponderada IA: **~$27M** (37% confiança média × $74M)
- [ ] Deals ≥50%: **Calcular** 
- [ ] Deals Fechados: **$109,849,113** (506 deals) ← BigQuery confirmado
- [ ] Taxa de Conversão: **50%** (506 won / 1006 total)
- [ ] Vendedores Ativos: **10**

**Status:** ⏳ Aguardando teste

---

### CENÁRIO 2: Q1 2026 (Jan-Mar)
```
Quarter: Q1 (Jan-Mar)
Vendedor: Todos
Ano: 2026
Mês: (auto-selecionado pelo quarter)
```

**KPIs Esperados:**
- [ ] Pipeline Total: **$74,158,469** (268 deals - não muda, é sempre o total)
- [ ] Pipeline Filtrado: **Verificar** (deals do Q1 2026)
- [ ] Deals Fechados: **Verificar** (closed_date em Jan-Mar 2026)
- [ ] Taxa de Conversão: **Calcular**

**Status:** ⏳ Aguardando teste

---

### CENÁRIO 3: Q2 2026 (Abr-Jun) - PROBLEMA ATUAL
```
Quarter: Q2 (Abr-Jun)
Vendedor: Todos
Ano: 2026
Mês: (auto-selecionado)
```

**Resultado Atual (INCORRETO):**
```
❌ Pipeline Total: $0 (deveria ser $74.1M)
❌ Pipeline Filtrado: $0 (pode estar correto se não há deals)
❌ Deals Fechados: $315,900 MAS mostra "0 deals ganhos" (inconsistente!)
✅ Deals ≥50%: $14,896,062 (17 deals) - FUNCIONANDO!
```

**Problemas Identificados:**
1. **Pipeline Total não deveria mudar** - é sempre o total de todos os deals abertos
2. **Deals Fechados está bugado** - mostra valor mas "0 deals ganhos"
3. **Performance lenta** - demora muito para carregar

**Ações:**
- [ ] Verificar query BigQuery para closed deals em Abr-Jun 2026
- [ ] Debugar cálculo de "deals ganhos" no frontend
- [ ] Adicionar cache na API

**Status:** 🔴 CRÍTICO

---

### CENÁRIO 4: Filtro por Vendedor (Alex Araujo)
```
Quarter: Todos
Vendedor: Alex Araujo
Ano: Todos
Mês: Todos
```

**KPIs Esperados:**
- [ ] Pipeline Total: **$74,158,469** (não muda - é o total geral)
- [ ] Pipeline Filtrado: **$21,039,251** (90 deals) ← BigQuery confirmado
- [ ] Deals Fechados: **Verificar** (closed deals do Alex)
- [ ] Taxa de Conversão: **Calcular**
- [ ] Vendedores Ativos: **1** (apenas Alex selecionado)

**Status:** ⏳ Aguardando teste

---

### CENÁRIO 5: Combinado (Q1 + Alex Araujo)
```
Quarter: Q1
Vendedor: Alex Araujo
Ano: 2026
Mês: (auto)
```

**KPIs Esperados:**
- [ ] Pipeline Total: **$74,158,469** (total geral)
- [ ] Pipeline Filtrado: **Verificar** (Alex no Q1 2026)
- [ ] Deals Fechados: **Verificar** (3 deals confirmados pela API)
- [ ] Taxa de Conversão: **Calcular**

**Status:** ⏳ Aguardando teste

---

## 🔍 QUERIES DE VALIDAÇÃO BIGQUERY

### Query 1: Pipeline Total (deve sempre retornar o mesmo)
```sql
SELECT 
  COUNT(*) as total_deals,
  SUM(Gross) as total_gross,
  SUM(Net) as total_net
FROM `operaciones-br.sales_intelligence.pipeline`
```
**Resultado esperado:** 268 deals, $74.1M

---

### Query 2: Closed Deals em Q2 2026 (Abr-Jun)
```sql
SELECT 
  COUNT(*) as deals,
  SUM(Gross) as gross,
  SUM(Net) as net,
  MIN(Data_Fechamento) as primeira_data,
  MAX(Data_Fechamento) as ultima_data
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE EXTRACT(YEAR FROM COALESCE(
  SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), 
  SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento)
)) = 2026
AND EXTRACT(MONTH FROM COALESCE(
  SAFE.PARSE_DATE('%Y-%m-%d', Data_Fechamento), 
  SAFE.PARSE_DATE('%d-%m-%Y', Data_Fechamento)
)) IN (4, 5, 6)
```

---

### Query 3: Pipeline por Vendedor (Alex Araujo)
```sql
SELECT 
  Vendedor,
  COUNT(*) as deals,
  SUM(Gross) as gross,
  SUM(Net) as net
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Vendedor = 'Alex Araujo'
GROUP BY Vendedor
```
**Resultado esperado:** 90 deals, $21M

---

## 🐛 BUGS CONHECIDOS

### BUG #1: Pipeline Total mostra $0 quando filtro ativo
**Localização:** [index.html](public/index.html) linha ~2598
**Código suspeito:**
```javascript
// Pipeline (Período Filtrado) - DINÂMICO
setTextSafe('exec-pipeline-total', formatMoney(allPipelineGross));
```

**Problema:** Está usando `allPipelineGross` que pode estar sendo sobrescrito pelo filtro.

**Solução proposta:** Pipeline Total deve SEMPRE usar o total geral, não o filtrado.

---

### BUG #2: Deals Fechados mostra valor mas "0 deals ganhos"
**Sintoma:** "$315,900" mas "0 deals ganhos"

**Causa provável:** 
1. Query retorna dados mas `totalWins` está sendo calculado errado
2. Ou está somando Net negativo

**Localização provável:** [index.html](public/index.html) linha ~2500-2600

---

### BUG #3: Performance lenta ao trocar filtros
**Sintomas:**
- Demora 3-5 segundos para carregar
- Trava a interface durante carregamento
- Sem feedback visual

**Causas prováveis:**
1. Fazendo múltiplas chamadas API sequenciais (quarter agrega 3 meses)
2. Sem cache no backend
3. Processing pesado no frontend (word clouds)
4. Sem loader/skeleton

**Soluções:**
- [ ] Adicionar loader animado com logo Xertica
- [ ] Implementar cache no Cloud Run
- [ ] Otimizar processamento de word clouds
- [ ] Debounce em mudanças de filtro

---

## ✅ CHECKLIST DE VALIDAÇÃO

Antes de fazer deploy final:

### Dados BigQuery
- [x] Pipeline: 268 deals, $74.1M
- [x] Closed Won: 506 deals, $109.8M
- [x] Closed Lost: 500+ deals
- [x] Alex Araujo: 90 pipeline, 7 closed won
- [ ] Q2 2026: Validar se existem deals

### API Endpoints
- [x] /api/pipeline → 268 deals
- [x] /api/closed/won → 506 deals
- [x] /api/pipeline?seller=Alex → 5 deals (limitado)
- [x] /api/closed/won?month=1 → 66 deals
- [ ] /api/closed/won?month=4,5,6 → Q2 2026

### Frontend KPIs
- [ ] Pipeline Total sempre $74.1M (268 deals)
- [ ] Pipeline Filtrado varia conforme filtro
- [ ] Previsão Ponderada = Pipeline × Confiança
- [ ] Deals ≥50% soma apenas deals com confiança ≥50%
- [ ] Deals Fechados = soma closed_won do período
- [ ] Taxa de Conversão = won / (won + lost)
- [ ] Vendedores Ativos = count distinct vendedores

### UX/Performance
- [ ] Loader animado no início
- [ ] Skeleton/loader ao trocar filtros
- [ ] Tempo de carregamento < 2s
- [ ] Sem travamentos na UI
- [ ] Console sem erros

---

## 📋 PRÓXIMOS TESTES

Para cada cenário, colar aqui os resultados:

### Teste Manual 1: Sem filtros
```
URL: https://x-gtm.web.app
Filtros: Todos em "Todos"
Console logs: (colar aqui)
Screenshot: (descrever valores)
```

### Teste Manual 2: Q2 2026
```
URL: https://x-gtm.web.app
Filtros: Q2, 2026, Todos vendedores
Console logs: (colar aqui)
Screenshot: (descrever valores)
```

---

## 🎨 MELHORIAS DE UX

### 1. Loader Inicial (ao entrar no site)
- Logo Xertica animada (fade + scale)
- Texto "Carregando dados..."
- Skeleton dos cards principais
- Duração: até primeira renderização

### 2. Loader ao trocar filtros
- Mini loader no canto do dropdown
- Skeleton nos cards que vão mudar
- Debounce de 300ms
- Duração: até nova renderização

### 3. Estados vazios
- Mensagem clara quando não há dados
- Sugestão de ação (ex: "Selecione outro período")
- Ícone ilustrativo

---

## 📊 MÉTRICAS DE PERFORMANCE

| Métrica | Meta | Atual | Status |
|---------|------|-------|--------|
| First Load | < 2s | ? | ⏳ |
| Filter Change | < 1s | 3-5s | 🔴 |
| API Response | < 500ms | ? | ⏳ |
| Word Cloud Processing | < 500ms | ? | ⏳ |
| Total KPIs | < 1s | ? | ⏳ |

---

## 🚀 PLANO DE AÇÃO

1. **Fase 1: Validação** (agora)
   - [ ] Executar queries BigQuery para Q2 2026
   - [ ] Testar cada cenário no dashboard
   - [ ] Documentar bugs encontrados

2. **Fase 2: Correções** (depois)
   - [ ] Corrigir cálculo de Pipeline Total
   - [ ] Corrigir contagem de Deals Fechados
   - [ ] Adicionar cache na API

3. **Fase 3: Performance** (depois)
   - [ ] Implementar loaders animados
   - [ ] Otimizar processamento frontend
   - [ ] Adicionar debounce

4. **Fase 4: Deploy** (final)
   - [ ] Teste completo em staging
   - [ ] Deploy gradual (canary)
   - [ ] Monitoramento de erros
