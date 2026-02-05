# 🤖 ML Intelligence Endpoints - Guia de Uso

## Overview

A Cloud Function `ml-intelligence` expõe**6 modelos de Machine Learning** através de um endpoint HTTP unificado.

**URL Base:** `https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence`

## Modelos Disponíveis

| Modelo | ID | Tipo | Objetivo |
|--------|-----|------|----------|
| **Previsão de Ciclo** | `previsao_ciclo` | BOOSTED_TREE_REGRESSOR | Prever dias até fechamento |
| **Classificador de Perda** | `classificador_perda` | BOOSTED_TREE_CLASSIFIER | Classificar causa provável de perda |
| **Risco de Abandono** | `risco_abandono` | BOOSTED_TREE_CLASSIFIER | Prever risco de churn do deal |
| **Performance de Vendedor** | `performance_vendedor` | LINEAR_REG | Prever win rate do vendedor |
| **Prioridade de Deals** | `prioridade_deals` | View Calculada | Ranquear deals por prioridade |
| **Próxima Ação** | `proxima_acao` | Rule-Based | Recomendar próxima ação |

---

## 📊 Uso do Endpoint

### 1. Buscar Todos os Modelos

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "all",
    "filters": {
      "seller": "João Silva",
      "quarter": "Q1 2026"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "timestamp": "2026-02-04T10:30:00",
  "model": "all",
  "filters_applied": {"seller": "João Silva", "quarter": "Q1 2026"},
  
  "previsao_ciclo": {
    "enabled": true,
    "total_deals": 45,
    "deals": [...],
    "summary": {
      "avg_dias_previstos": 52.3,
      "rapidos": 10,
      "normais": 20,
      "lentos": 12,
      "muito_lentos": 3
    }
  },
  
  "classificador_perda": {...},
  "risco_abandono": {...},
  "performance_vendedor": {...},
  "prioridade_deals": {...},
  "proxima_acao": {...}
}
```

---

### 2. Buscar Modelo Específico

#### 2.1 Previsão de Ciclo

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "previsao_ciclo",
    "filters": {
      "seller": "João Silva",
      "quarter": "Q1 2026"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "previsao_ciclo": {
    "enabled": true,
    "total_deals": 45,
    "deals": [
      {
        "opportunity": "DEAL-2026-001",
        "Gross_Value": 150000,
        "Vendedor": "João Silva",
        "Segmento": "Enterprise",
        "Fase_Atual": "Negociação",
        "Fiscal_Quarter": "Q1 2026",
        "dias_previstos": 23,
        "velocidade_prevista": "RÁPIDO",
        "MEDDIC_Score": 85,
        "BANT_Score": 90,
        "Atividades_Peso": 45
      },
      // ... mais 44 deals
    ],
    "summary": {
      "avg_dias_previstos": 52.3,
      "rapidos": 10,
      "normais": 20,
      "lentos": 12,
      "muito_lentos": 3
    }
  }
}
```

---

#### 2.2 Classificador de Perda

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "classificador_perda",
    "filters": {
      "causa": "PRECO",
      "quarter": "Q1 2026"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "classificador_perda": {
    "enabled": true,
    "total_deals": 18,
    "deals": [
      {
        "opportunity": "DEAL-2026-042",
        "Gross_Value": 200000,
        "Vendedor": "Maria Santos",
        "causa_prevista": "PRECO",
        "confianca_predicao": 0.87,
        "prob_preco": 0.87,
        "prob_timing": 0.05,
        "prob_concorrente": 0.04,
        "prob_budget": 0.03,
        "prob_fit": 0.01,
        "acao_preventiva": "Reforçar ROI e value proposition, preparar case study, considerar desconto estratégico",
        "MEDDIC_Score": 45,
        "BANT_Score": 60
      },
      // ... mais 17 deals
    ],
    "summary": {
      "preco": 18,
      "timing": 12,
      "concorrente": 8,
      "budget": 5,
      "fit": 3
    }
  }
}
```

---

#### 2.3 Risco de Abandono

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "risco_abandono",
    "filters": {
      "riskLevel": "ALTO",
      "seller": "João Silva"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "risco_abandono": {
    "enabled": true,
    "total_deals": 12,
    "deals": [
      {
        "opportunity": "DEAL-2026-099",
        "Gross_Value": 300000,
        "Vendedor": "João Silva",
        "nivel_risco": "ALTO",
        "prob_abandono": 0.78,
        "fatores_risco": "Idle >14 dias, Red flags críticos, Baixo engagement",
        "acao_recomendada": "🚨 Follow-up urgente em 24h - Risco 78%",
        "Idle_Dias": 21,
        "MEDDIC_Score": 35,
        "BANT_Score": 40,
        "Red_Flags": 3,
        "Yellow_Flags": 5
      },
      // ... mais 11 deals
    ],
    "summary": {
      "alto_risco": 12,
      "medio_risco": 18,
      "baixo_risco": 15,
      "avg_prob_abandono": 0.62
    }
  }
}
```

---

#### 2.4 Performance de Vendedor

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "performance_vendedor",
    "filters": {
      "classificacao": "SOBRE_PERFORMANDO"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "performance_vendedor": {
    "enabled": true,
    "total_sellers": 8,
    "sellers": [
      {
        "Vendedor": "Ana Costa",
        "win_rate_previsto": 35.2,
        "delta_performance": 12.5,
        "valor_previsto_venda": 1250000,
        "classificacao": "SOBRE_PERFORMANDO",
        "acao_recomendada": "🏆 Compartilhar best practices com o time",
        "ranking": 1,
        "deals_pipeline": 23,
        "win_rate_historico": 32.8,
        "avg_meddic": 87,
        "avg_bant": 85,
        "avg_cycle_won": 42
      },
      // ... mais 7 vendedores
    ],
    "summary": {
      "sobre_performando": 8,
      "performando_bem": 15,
      "na_meta": 22,
      "abaixo_meta": 10,
      "sub_performando": 5,
      "avg_win_rate": 24.3
    }
  }
}
```

---

#### 2.5 Prioridade de Deals

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "prioridade_deals",
    "filters": {
      "priorityLevel": "CRÍTICO",
      "seller": "João Silva"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "prioridade_deals": {
    "enabled": true,
    "total_deals": 8,
    "deals": [
      {
        "opportunity": "DEAL-2026-001",
        "Vendedor": "João Silva",
        "Gross_Value": 500000,
        "priority_score": 92.5,
        "priority_level": "CRÍTICO",
        "win_prob_pct": 85,
        "value_percentile": 98,
        "urgency_pct": 90,
        "retention_pct": 88,
        "recomendacao_foco": "🔥 MÁXIMA PRIORIDADE: Foco imediato, daily check-ins, escalar se necessário",
        "ranking_global": 1,
        "ranking_vendedor": 1,
        "dias_previstos": 18,
        "velocidade_prevista": "RÁPIDO",
        "risco_abandono": "BAIXO",
        "MEDDIC_Score": 88,
        "BANT_Score": 92
      },
      // ... mais 7 deals
    ],
    "summary": {
      "critico": 8,
      "alto": 22,
      "medio": 35,
      "baixo": 15,
      "avg_priority_score": 65.3
    }
  }
}
```

---

#### 2.6 Próxima Ação

```bash
curl -X POST \
  https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence \
  -H "Content-Type: application/json" \
  -d '{
    "model": "proxima_acao",
    "filters": {
      "urgencia": "ALTA",
      "seller": "João Silva"
    }
  }'
```

**Resposta:**
```json
{
  "status": "success",
  "proxima_acao": {
    "enabled": true,
    "total_deals": 15,
    "deals": [
      {
        "opportunity": "DEAL-2026-042",
        "Vendedor": "João Silva",
        "Gross_Value": 300000,
        "categoria_acao": "URGENTE_REATIVAR",
        "acao_recomendada": "🚨 Follow-up urgente em 24h: Deal parado há 21 dias com alto risco de abandono",
        "urgencia": "ALTA",
        "detalhes_execucao": "Ligar para João Silva e agendar reunião com stakeholder principal. Risco abandono: 78%",
        "ordem_prioridade": 1,
        "win_probability_pct": 45,
        "risco_perda": "MÉDIO",
        "causa_provavel_perda": "TIMING",
        "risco_abandono": "ALTO",
        "nivel_prioridade": "ALTO",
        "MEDDIC_Score": 35,
        "BANT_Score": 40,
        "Idle_Dias": 21,
        "Red_Flags": 3,
        "Yellow_Flags": 5
      },
      // ... mais 14 deals
    ],
    "summary": {
      "urgentes": 15,
      "medias": 28,
      "baixas": 12,
      "top_categorias": {
        "URGENTE_REATIVAR": 8,
        "PREVENIR_PERDA_PRECO": 4,
        "RESOLVER_RED_FLAGS": 3,
        "QUALIFICAR_MEDDIC": 2,
        "ACELERAR_DEAL": 1
      }
    }
  }
}
```

---

## 🔧 Filtros Disponíveis

| Filtro | Tipo | Modelos Aplicáveis | Descrição |
|--------|------|-------------------|-----------|
| `seller` | string | Todos exceto `performance_vendedor` | Filtrar por vendedor específico |
| `quarter` | string | Todos exceto `performance_vendedor` | Filtrar por quarter fiscal (ex: "Q1 2026") |
| `minValue` | number | `previsao_ciclo`, `prioridade_deals` | Filtrar deals com valor mínimo |
| `priorityLevel` | string | `prioridade_deals` | Filtrar por nível de prioridade (CRÍTICO, ALTO, MÉDIO, BAIXO) |
| `urgencia` | string | `proxima_acao` | Filtrar por urgência (ALTA, MÉDIA, BAIXA) |
| `categoria` | string | `proxima_acao` | Filtrar por categoria de ação |
| `causa` | string | `classificador_perda` | Filtrar por causa de perda (PRECO, TIMING, CONCORRENTE, BUDGET, FIT) |
| `riskLevel` | string | `risco_abandono` | Filtrar por nível de risco (ALTO, MÉDIO, BAIXO) |
| `classificacao` | string | `performance_vendedor` | Filtrar por classificação de performance |

---

## 📝 Exemplo Apps Script (DashboardCode.gs)

```javascript
function getMLPredictions(filters) {
  const ML_URL = 'https://us-central1-operaciones-br.cloudfunctions.net/ml-intelligence';
  
  const payload = {
    model: 'all', // ou específico: 'previsao_ciclo', 'risco_abandono', etc
    filters: filters || {}
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(ML_URL, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.status === 'success') {
      return result;
    } else {
      console.error('Erro ML:', result.error);
      return null;
    }
  } catch (error) {
    console.error('Erro ao chamar ML endpoint:', error);
    return null;
  }
}

// Exemplo de uso
function testMLEndpoint() {
  const filters = {
    seller: 'João Silva',
    quarter: 'Q1 2026'
  };
  
  const mlData = getMLPredictions(filters);
  
  if (mlData) {
    console.log('✅ Previsão Ciclo:', mlData.previsao_ciclo.total_deals, 'deals');
    console.log('   • Avg dias:', mlData.previsao_ciclo.summary.avg_dias_previstos);
    
    console.log('✅ Risco Abandono:', mlData.risco_abandono.summary.alto_risco, 'deals em alto risco');
    
    console.log('✅ Próxima Ação:', mlData.proxima_acao.summary.urgentes, 'ações urgentes');
  }
}
```

---

## ⚡ Performance

- **Latência esperada:** 1-3 segundos (dependendo do filtro e volume de dados)
- **Timeout:** 300 segundos
- **Memória:** 2GB
- **Max instâncias:** 10 (auto-scaling)

---

## 🚨 Troubleshooting

### Erro: "ML predictions table not found"

**Causa:** Modelo BigQuery ML não foi treinado ainda.

**Solução:**
1. Ir para BigQuery Console
2. Executar o arquivo SQL correspondente em `cloud-function/bqml/`
3. Aguardar treinamento (5-30min dependendo do modelo)
4. Tentar novamente

### Erro: "Missing request body"

**Causa:** Endpoint esperava POST com JSON body mas recebeu GET vazio.

**Solução:** Use POST com body JSON:
```bash
curl -X POST <URL> -H "Content-Type: application/json" -d '{"model": "all"}'
```

### Response vazio: `{"previsao_ciclo": {"enabled": false}}`

**Causa:** Tabela existe mas não há dados que correspondam aos filtros.

**Solução:** 
- Verificar se os filtros estão corretos
- Verificar se há dados no BigQuery: `SELECT COUNT(*) FROM pipeline_previsao_ciclo`
- Remover filtros para ver todos os dados

---

## 📚 Próximos Passos

1. ✅ Deploy da Cloud Function `ml-intelligence`
2. ⏳ Treinar 6 modelos BigQuery ML (executar arquivos em `bqml/`)
3. ⏳ Testar endpoints com Postman/curl
4. ⏳ Integrar com Dashboard (criar UI em Dashboard.html)
5. ⏳ Configurar scheduled queries para atualização diária

---

## 📊 Roadmap ML

### Fase Atual: 6 Modelos Core ✅
- Previsão de Ciclo
- Classificador de Perda
- Risco de Abandono
- Performance de Vendedor
- Prioridade de Deals
- Próxima Ação

### Futuro (Q2 2026):
- Cross-sell Predictor
- Upsell Score
- Customer Lifetime Value (CLV)
- Lead Scoring
- Optimal Pricing Model
