# 🤖 MODELOS MACHINE LEARNING - SALES INTELLIGENCE

**Status:** ✅ Modelos criados, prontos para deploy  
**Data:** 2026-02-05  
**Total de modelos:** 6 (4 ML + 2 Views calculadas)

---

## 📊 VISÃO GERAL

### Modelos Treinados (BQML)

| # | Modelo | Tipo | Objetivo | Output | Arquivo |
|---|--------|------|----------|--------|---------|
| 1 | **Previsão de Ciclo** | BOOSTED_TREE_REGRESSOR | Prever dias até fechamento | `dias_previstos`, `velocidade_prevista` | [ml_previsao_ciclo.sql](ml_previsao_ciclo.sql) |
| 2 | **Classificador de Perda** | BOOSTED_TREE_CLASSIFIER | Classificar causa de perda | `causa_prevista` (5 categorias), `confiança` | [ml_classificador_perda.sql](ml_classificador_perda.sql) |
| 3 | **Risco de Abandono** | BOOSTED_TREE_CLASSIFIER | Predizer churn risk | `nivel_risco`, `prob_abandono`, `fatores_risco` | [ml_risco_abandono.sql](ml_risco_abandono.sql) |
| 4 | **Performance Vendedor** | LINEAR_REG | Prever win rate | `win_rate_previsto`, `delta_performance`, `ranking` | [ml_performance_vendedor.sql](ml_performance_vendedor.sql) |

### Views Calculadas (Rule-Based)

| # | View | Tipo | Objetivo | Output | Arquivo |
|---|------|------|----------|--------|---------|
| 5 | **Priorização de Deals** | VIEW | Ranquear por prioridade | `priority_score`, `priority_level`, `ranking` | [ml_prioridade_deal.sql](ml_prioridade_deal.sql) |
| 6 | **Próxima Ação** | VIEW | Recomendar ação | `categoria_acao`, `urgencia`, `checklist` | [ml_proxima_acao.sql](ml_proxima_acao.sql) |

---

## 🚀 DEPLOY

### 1. Pré-requisitos

```bash
# 1. Verificar autenticação
gcloud auth list

# 2. Verificar dataset existe
bq show sales-intelligence-444219:sales_intelligence

# 3. Verificar tabelas base existem
bq show sales-intelligence-444219:sales_intelligence.pipeline
bq show sales-intelligence-444219:sales_intelligence.closed_deals
```

### 2. Executar Deploy

```bash
cd /workspaces/playbook/bigquery

# Deploy TODOS os modelos (15-20 minutos)
./deploy_ml_models.sh
```

**Resultado esperado:**
```
🎉 DEPLOY COMPLETO!
✅ 4 modelos ML treinados
✅ 2 views calculadas criadas
✅ 6 tabelas de predições geradas
```

### 3. Deploy Individual (opcional)

```bash
# Apenas 1 modelo por vez
bq query --use_legacy_sql=false < bigquery/ml_previsao_ciclo.sql
bq query --use_legacy_sql=false < bigquery/ml_classificador_perda.sql
bq query --use_legacy_sql=false < bigquery/ml_risco_abandono.sql
bq query --use_legacy_sql=false < bigquery/ml_performance_vendedor.sql
bq query --use_legacy_sql=false < bigquery/ml_prioridade_deal.sql
bq query --use_legacy_sql=false < bigquery/ml_proxima_acao.sql
```

---

## 📋 DETALHES DOS MODELOS

### 1️⃣ Previsão de Ciclo (171 linhas)

**Features:**
- Gross/Net Value
- Vendedor, Segmento
- Confidence, MEDDIC, BANT
- Idle Days, Atividades, Reuniões
- Red/Yellow Flags

**Output:**
```sql
SELECT 
  opportunity,
  dias_previstos,           -- Ex: 45 dias
  velocidade_prevista,      -- RÁPIDO/NORMAL/LENTO/MUITO_LENTO
  confidence_num,
  meddic_score
FROM `sales_intelligence.pipeline_previsao_ciclo`
ORDER BY dias_previstos ASC
LIMIT 10;
```

**Threshold de velocidade:**
- RÁPIDO: ≤ 30 dias
- NORMAL: 31-60 dias
- LENTO: 61-120 dias
- MUITO_LENTO: > 120 dias

---

### 2️⃣ Classificador de Perda (247 linhas)

**Categorias de perda:**
1. **PRECO** - Caro, custo elevado
2. **TIMING** - Urgência, timing errado
3. **CONCORRENTE** - Perdeu para competidor
4. **BUDGET** - Sem verba, orçamento
5. **FIT** - Não atende requisitos

**Output:**
```sql
SELECT 
  opportunity,
  causa_prevista,           -- PRECO/TIMING/etc
  prob_preco,               -- 0.0 - 1.0
  prob_timing,
  prob_concorrente,
  prob_budget,
  prob_fit,
  confianca_predicao        -- Máxima prob
FROM `sales_intelligence.pipeline_classificador_perda`
WHERE confianca_predicao > 0.5
ORDER BY confianca_predicao DESC;
```

---

### 3️⃣ Risco de Abandono (309 linhas)

**Threshold de risco (alta sensibilidade):**
- ALTO: prob_abandono ≥ 0.6
- MÉDIO: prob_abandono ≥ 0.4
- BAIXO: prob_abandono < 0.4

**Output:**
```sql
SELECT 
  opportunity,
  prob_abandono,            -- 0.0 - 1.0
  nivel_risco,              -- ALTO/MÉDIO/BAIXO
  fatores_risco,            -- "INATIVO_45D, RED_FLAGS_3, BAIXA_CONFIANCA"
  acao_recomendada          -- Texto prescritivo
FROM `sales_intelligence.pipeline_risco_abandono`
WHERE nivel_risco IN ('ALTO', 'MÉDIO')
ORDER BY prob_abandono DESC;
```

**Fatores de risco analisados:**
- Inatividade (>30 dias)
- Red/Yellow Flags
- Baixa confiança (<30%)
- MEDDIC/BANT baixos (<40)
- Poucas atividades (<3)

---

### 4️⃣ Performance Vendedor (294 linhas)

**Classificação de performance:**
- SOBRE_PERFORMANDO: delta > +10%
- PERFORMANDO_BEM: delta > +5%
- NA_META: delta -5% a +5%
- ABAIXO_META: delta -10% a -5%
- SUB_PERFORMANDO: delta < -10%

**Output:**
```sql
SELECT 
  Vendedor,
  win_rate_previsto,        -- Ex: 25.3%
  win_rate_historico,       -- Ex: 20.0%
  delta_performance,        -- +5.3%
  classificacao,            -- PERFORMANDO_BEM
  ranking,                  -- 1 = melhor
  valor_previsto_venda,     -- pipeline × win_rate
  deals_pipeline
FROM `sales_intelligence.pipeline_performance_vendedor`
ORDER BY ranking ASC;
```

---

### 5️⃣ Priorização de Deals (281 linhas - VIEW)

**Fórmula de prioridade:**
```
priority_score = (win_prob × 30%) + (value × 30%) + (urgency × 20%) + (retention × 20%)
```

**Components:**
- **Win Prob (30%)**: Confidence + MEDDIC + BANT
- **Value (30%)**: Gross Value normalizado (0-100)
- **Urgency (20%)**: Velocidade prevista + Close Date proximity
- **Retention (20%)**: Inverso do risco de abandono

**Output:**
```sql
SELECT 
  opportunity,
  priority_score,           -- 0-100
  priority_level,           -- CRÍTICO/ALTO/MÉDIO/BAIXO
  ranking,                  -- 1 = mais prioritário
  ranking_vendedor,         -- Ranking dentro do vendedor
  recomendacao_foco,        -- "FOCO TOTAL: 40-50% do tempo..."
  dias_previstos,
  velocidade_prevista,
  prob_abandono
FROM `sales_intelligence.pipeline_prioridade_deals`
ORDER BY priority_score DESC
LIMIT 20;
```

**Levels:**
- CRÍTICO: score ≥ 80
- ALTO: score ≥ 60
- MÉDIO: score ≥ 40
- BAIXO: score < 40

---

### 6️⃣ Próxima Ação (402 linhas - VIEW)

**10 regras de recomendação:**

1. **REATIVAR_URGENTE** - Idle > 14 dias + Alta Prioridade
2. **PREVENIR_PERDA** - Alto Risco Abandono (≥60%)
3. **QUALIFICAR_MEDDIC_BANT** - Scores baixos (<40) + Close próximo
4. **AUMENTAR_ENGAJAMENTO** - Poucas atividades (<3) + Idle > 7 dias
5. **ACELERAR_CICLO** - Velocidade LENTA + Alta Confiança
6. **ESCALAR_MANAGER** - Red Flags ≥ 3
7. **RESOLVER_FLAGS** - Yellow Flags ≥ 5
8. **FECHAR_URGENTE** - Close ≤ 7 dias + Confiança > 60%
9. **REVISAR_PROPOSTA** - Risco de perda por PREÇO
10. **MANTER_CADENCIA** - Default (tudo OK)

**Output:**
```sql
SELECT 
  opportunity,
  categoria_acao,           -- REATIVAR_URGENTE, PREVENIR_PERDA, etc
  acao_recomendada,         -- Texto descritivo da ação
  urgencia,                 -- ALTA/MÉDIA/BAIXA
  detalhes_execucao,        -- "QUEM: Vendedor+Manager | QUANDO: Hoje | COMO: Call 30min"
  checklist,                -- "1. Call agendada? 2. Motivo identificado? 3..."
  priority_level,
  ranking
FROM `sales_intelligence.pipeline_proxima_acao`
WHERE urgencia = 'ALTA'
ORDER BY Gross_Value DESC
LIMIT 20;
```

---

## 📊 MONITORAMENTO

### Métricas de Performance dos Modelos

```sql
-- Modelo 1: Previsão de Ciclo
SELECT * FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_previsao_ciclo`);
-- Expect: R² > 0.6, MAE < 30 dias

-- Modelo 2: Classificador de Perda
SELECT * FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_classificador_perda`);
-- Expect: Accuracy > 0.65, Precision > 0.60

-- Modelo 3: Risco de Abandono
SELECT * FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_risco_abandono`);
-- Expect: Recall > 0.70 (alta sensibilidade), ROC-AUC > 0.75

-- Modelo 4: Performance Vendedor
SELECT * FROM ML.EVALUATE(MODEL `sales_intelligence.modelo_performance_vendedor`);
-- Expect: R² > 0.5, MAE < 10%
```

### Importância das Features

```sql
SELECT feature, importance, RANK() OVER (ORDER BY importance DESC) AS rank
FROM ML.FEATURE_IMPORTANCE(MODEL `sales_intelligence.modelo_previsao_ciclo`)
ORDER BY importance DESC LIMIT 10;
```

### Estatísticas das Predições

```sql
-- Deals por velocidade
SELECT velocidade_prevista, COUNT(*) AS deals
FROM `sales_intelligence.pipeline_previsao_ciclo`
GROUP BY velocidade_prevista;

-- Deals por nível de risco
SELECT nivel_risco, COUNT(*) AS deals, SUM(Gross_Value) AS total_value
FROM `sales_intelligence.pipeline_risco_abandono`
GROUP BY nivel_risco;

-- Ações por urgência
SELECT urgencia, COUNT(*) AS deals
FROM `sales_intelligence.pipeline_proxima_acao`
GROUP BY urgencia;
```

---

## 🔄 RETREINAMENTO

**Quando retreinar:**
- Mensalmente (ou quando houver 100+ novos closed deals)
- Quando métricas de avaliação caírem > 10%
- Após mudanças significativas no processo de vendas

**Como retreinar:**
```bash
# Re-executar deploy (modelos são recriados)
./deploy_ml_models.sh

# Ou retreinar modelo específico
bq query --use_legacy_sql=false < bigquery/ml_previsao_ciclo.sql
```

**Nota:** Modelos BQML são REPLACE, então retreinar sobrescreve o anterior.

---

## 🔗 INTEGRAÇÃO COM CLOUD FUNCTION

Os 6 endpoints ML já estão implementados em [main.py](../cloud-function/main.py):

```python
# Endpoints disponíveis
def get_previsao_ciclo(filters: dict) -> pd.DataFrame
def get_classificador_perda(filters: dict) -> pd.DataFrame
def get_risco_abandono(filters: dict) -> pd.DataFrame
def get_performance_vendedor(filters: dict) -> pd.DataFrame
def get_prioridade_deals(filters: dict) -> pd.DataFrame
def get_proxima_acao(filters: dict) -> pd.DataFrame
```

**Chamar via Cloud Function:**
```bash
curl -X POST https://REGION-PROJECT.cloudfunctions.net/ml_intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "all",
    "filters": {"quarter": "FY26-Q1"}
  }'
```

---

## 📈 RESULTADOS ESPERADOS

**Após deploy, você terá:**

1. ✅ 4 modelos ML treinados no BigQuery
2. ✅ 6 tabelas de predições atualizadas
3. ✅ 2 views calculadas em tempo real
4. ✅ Métricas de avaliação disponíveis
5. ✅ Feature importance análise

**Próximos passos:**
1. Deploy dos modelos: `./deploy_ml_models.sh`
2. Testar Cloud Function ML: `python3 test_local.py --ml`
3. Adicionar aba "ML Insights" no Dashboard
4. Configurar retreinamento mensal

---

**🤖 Modelos prontos para revolucionar seu processo de vendas!**
