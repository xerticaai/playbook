# 🔍 REFERÊNCIA DE SCHEMA - BigQuery Tables

## ⚠️ PROBLEMAS COMUNS E COMO EVITAR

### 1. **Nomes de Colunas Incorretos**
- ❌ `Gross_Value` → ✅ `Gross` (FLOAT64)
- ❌ `opportunity` → ✅ `Oportunidade` (STRING)
- ❌ `Net_Value` → ✅ `Net` (FLOAT64)

### 2. **Tipos de Dados Requerem CAST**
- `Ciclo_dias`: STRING ⚠️ → Use `SAFE_CAST(Ciclo_dias AS INT64)`
- `Idle_Dias`: STRING ⚠️ → Use `SAFE_CAST(Idle_Dias AS INT64)`
- `Data_Fechamento`: STRING ⚠️ → Formato inconsistente (DD-MM-YYYY e DD/MM/YYYY)

### 3. **Colunas que NÃO EXISTEM em closed_deals**
- ❌ `Fase_Atual` (só em pipeline)
- ❌ `MEDDIC_Score` (só em pipeline)
- ❌ `BANT_Score` (só em pipeline)
- ❌ `Atividades_Peso` (só em pipeline)
- ❌ `Ativ_7d`, `Ativ_30d` (em closed_deals, NÃO em pipeline)

---

## 📊 TABELA: pipeline (270 deals ativos)

### Identificadores
- `Oportunidade` (STRING) - Chave primária
- `Conta` (STRING)

### Valores Financeiros
- `Gross` (FLOAT64) ⚠️ **NÃO Gross_Value!**
- `Net` (FLOAT64) ⚠️ **NÃO Net_Value!**

### Scores de Qualificação (APENAS em pipeline!)
- `MEDDIC_Score` (INT64)
- `BANT_Score` (INT64)
- `Confiana` (INT64)

### Engajamento
- `Atividades` (INT64)
- `Atividades_Peso` (FLOAT64) - apenas pipeline!
- `Idle_Dias` (STRING ⚠️) - requer CAST

### Mudanças
- `Mudanas_Crticas` (INT64)
- `Total_Mudanas` (INT64)
- `Mudanas_Close_Date` (INT64)
- `Mudanas_Stage` (INT64)
- `Mudanas_Valor` (INT64)

### Contexto
- `Vendedor` (STRING)
- `Perfil` (STRING) - equivalente a Segmento
- `Fase_Atual` (STRING) - apenas pipeline!
- `Fiscal_Q` (STRING)

### Temporal
- `Ciclo_dias` (INT64)
- `Data_Prevista` (DATE)

### Flags e Análise
- `Flags_de_Risco` (STRING)
- `Anomalias_Detectadas` (STRING)
- `Velocity_Predio` (STRING)
- `MEDDIC_Gaps` (STRING)
- `BANT_Gaps` (STRING)
- `MEDDIC_Evidncias` (STRING)
- `BANT_Evidncias` (STRING)

---

## 📊 TABELA: closed_deals (deals históricos)

### Identificadores
- `Oportunidade` (STRING) - Chave primária ⚠️ **NÃO opportunity!**
- `Conta` (STRING)

### Valores Financeiros
- `Gross` (FLOAT64) ⚠️ **NÃO Gross_Value!**
- `Net` (FLOAT64) ⚠️ **NÃO Net_Value!**

### Status
- `Status` (STRING) - 'Won' ou 'Lost'
- `outcome` (STRING)

### Análise de Resultado
- `Causa_Raiz` (STRING) - **Target para classificador de perda!**
- `Causas_Secundrias` (STRING)
- `Fatores_Sucesso` (STRING)
- `Resumo_Anlise` (STRING)
- `Lies_Aprendidas` (STRING)

### Temporal
- `Ciclo_dias` (STRING ⚠️) - **Requer SAFE_CAST para INT64!**
- `Data_Fechamento` (STRING ⚠️) - Formato inconsistente!

### Engajamento (apenas closed_deals!)
- `Atividades` (INT64)
- `Ativ_7d` (INT64) - ⚠️ **NÃO existe em pipeline!**
- `Ativ_30d` (INT64) - ⚠️ **NÃO existe em pipeline!**
- `Distribuio_Tipos` (STRING)
- `Perodo_Pico` (STRING)
- `Cadncia_Mdia_dias` (STRING)

### Mudanças
- `Total_Mudanas` (INT64)
- `Mudanas_Crticas` (INT64)
- `Mudanas_Close_Date` (INT64)
- `Mudanas_Stage` (INT64)
- `Mudanas_Valor` (INT64)
- `Campos_Alterados` (STRING)
- `Padro_Mudanas` (STRING)
- `Freq_Mudanas` (STRING)

### Contexto
- `Vendedor` (STRING)
- `Segmento` (STRING)
- `Perfil_Cliente` (STRING)
- `Portflio` (STRING)
- `Famlia_Produto` (STRING)
- `Fiscal_Q` (STRING)

### Sinais e Alertas
- `Sinais_Alerta` (STRING)
- `Momento_Crtico` (STRING)
- `Evitvel` (STRING)

### Qualidade
- `Qualidade_Engajamento` (STRING)
- `Gesto_Oportunidade` (STRING)

---

## 🎯 TEMPLATE PARA COPIAR EM NOVOS SQLs

```sql
-- 🔍 REFERÊNCIA DE SCHEMA - EVITAR ERROS DE NOMENCLATURA
-- ========================================================================
-- TABELA: pipeline (270 deals ativos)
--   Chave: Oportunidade (STRING)
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Scores: MEDDIC_Score (INT64), BANT_Score (INT64) - apenas pipeline!
--   Engajamento: Atividades (INT64), Atividades_Peso (FLOAT64)
--   Mudanças: Mudanas_Crticas (INT64), Total_Mudanas (INT64)
--   Contexto: Vendedor, Perfil (segmento), Fase_Atual, Fiscal_Q
--
-- TABELA: closed_deals (deals históricos)
--   Chave: Oportunidade (STRING) ⚠️ NÃO opportunity!
--   Valores: Gross (FLOAT64), Net (FLOAT64) ⚠️ NÃO Gross_Value!
--   Status: Status ('Won'/'Lost'), outcome (STRING)
--   Análise: Causa_Raiz (TARGET), Fatores_Sucesso, Resumo_Anlise
--   Tempo: Ciclo_dias (STRING ⚠️ usar CAST), Data_Fechamento (STRING ⚠️)
--   Atividades: Atividades (INT64), Ativ_7d, Ativ_30d ⚠️ NÃO em pipeline!
--   ⚠️ NÃO TEM: Fase_Atual, MEDDIC_Score, BANT_Score, Atividades_Peso
-- ========================================================================
```

---

## 📝 CHECKLIST ANTES DE TREINAR MODELO

- [ ] Coluna usa `Gross` (não Gross_Value)
- [ ] Coluna usa `Oportunidade` (não opportunity)
- [ ] Ciclo_dias tem CAST/SAFE_CAST
- [ ] Não usa colunas inexistentes (ex: MEDDIC_Score em closed_deals)
- [ ] WHERE clauses com tipo correto (CAST antes de comparar)
- [ ] Features existem em AMBAS as tabelas (treino e predição)

---

## 🚨 ERROS MAIS COMUNS

### Erro: "Unrecognized name: Gross_Value"
**Causa:** Uso de nome incorreto  
**Solução:** Usar `Gross` (FLOAT64)

### Erro: "No matching signature for operator > for argument types: STRING, INT64"
**Causa:** Comparação sem CAST  
**Solução:** `SAFE_CAST(Ciclo_dias AS INT64) > 0`

### Erro: "Unrecognized name: MEDDIC_Score"
**Causa:** Tentando usar coluna de pipeline em closed_deals  
**Solução:** Usar apenas features disponíveis em ambas as tabelas

### Erro: "Invalid date: '31-05-2024'"
**Causa:** Formato de data inconsistente em STRING  
**Solução:** Evitar usar Data_Fechamento ou usar PARSE_DATE com try/catch

---

**Criado:** 05/02/2026  
**Propósito:** Prevenir erros de schema ao criar queries SQL para treinamento de modelos ML  
**Uso:** Consultar SEMPRE antes de escrever SQL envolvendo pipeline ou closed_deals
