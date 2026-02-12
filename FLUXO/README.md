# 🔄 Fluxo Completo do Sistema Sales Intelligence

**Status**: ✅ Google Sheets → BigQuery OPERACIONAL | 🔧 Cloud Run + Dashboard EM IMPLEMENTAÇÃO

---

## 📊 Visão Geral

```
┌─────────────────┐
│  Google Sheets  │  ← Fonte de dados (2,864 opportunities)
│  Forecast 2026  │
└────────┬────────┘
         │
         │ 1️⃣ Apps Script Sync (syncToBigQueryScheduled)
         │    - Load jobs com WRITE_TRUNCATE
         │    - Elimina duplicação
         │    - Tempo: ~17s
         │
         ▼
┌─────────────────┐
│    BigQuery     │  ← Data Warehouse validado
│ sales_intelligence │
│  • pipeline     │  268 records
│  • won          │  506 records
│  • lost         │  2,069 records
│  • specialist   │  21 records
└────────┬────────┘
         │
         │ 2️⃣ BQML Models (Machine Learning)
         │    - Forecast IA
         │    - Risco de perda
         │    - Próxima ação
         │    - Prioridade deal
         │
         ▼
┌─────────────────┐
│   Cloud Run     │  ← API REST em desenvolvimento
│  (Python/Flask) │
│  • /forecast    │
│  • /risk        │
│  • /actions     │
└────────┬────────┘
         │
         │ 3️⃣ HTTP Requests
         │    - JSON responses
         │
         ▼
┌─────────────────┐
│  Dashboard HTML │  ← Frontend em desenvolvimento
│  index.html     │
│  • Métricas     │
│  • KPIs         │
│  • Insights IA  │
└─────────────────┘
```

---

## 🔍 Detalhamento por Camada

### **Camada 1: Google Sheets** 📋

**Arquivo**: `Forecast 2026 - Base`

**Abas principais**:
- 🎯 **Análise Forecast IA** - Pipeline ativo (268 opps)
- 📈 **Análise Ganhas** - Deals fechados ganhos (506 opps)
- 📉 **Análise Perdidas** - Deals fechados perdidos (2,069 opps)
- 💼 **Análise Sales Specialist** - Oportunidades especiais (21 opps)

**Campos-chave**:
```
Oportunidade, Conta, Vendedor, Gross, Net, Fiscal_Q,
Fase_Atual, Forecast_SF, Data_Prevista, Ciclo_dias,
Portfolio, Segmento, Familia_Produto, Tipo_Resultado
```

**Status**: ✅ **Ground truth validado** (R$ 529.6M total)

---

### **Camada 2: Apps Script Sync** 🔄

**Arquivo**: `/appscript/BigQuerySync.gs`

**Fluxo de execução**:
```
1. loadSheetData()
   ├─ Lê headers das abas
   ├─ Normaliza nomes (remove emojis, acentos)
   └─ Retorna array de objetos

2. syncToBigQueryScheduled()
   ├─ Carrega 4 abas em paralelo
   ├─ Gera Run_ID único por sync
   └─ Chama loadToBigQuery() para cada tabela

3. loadToBigQuery()
   ├─ WRITE_TRUNCATE → loadUsingJob() [Load job]
   │  ├─ Sanitiza dados (datas, números)
   │  ├─ Converte para NDJSON
   │  ├─ BigQuery.Jobs.insert()
   │  └─ Polling com location (us-central1)
   │
   └─ WRITE_APPEND → loadUsingStreamingInsert() [Streaming]
      ├─ BigQuery.Tabledata.insertAll()
      └─ Retorna imediatamente
```

**Estratégia de sync**:
- ✅ **WRITE_TRUNCATE** para syncs completos (evita duplicação)
- ⚡ **WRITE_APPEND** para syncs incrementais (mais rápido)

**Performance**:
- Sync completo: ~17s (4 tabelas)
- Pipeline: ~2-3s
- Won: ~3s
- Lost: ~3s
- Sales Specialist: ~2s

**Status**: ✅ **Operacional e validado**

---

### **Camada 3: BigQuery** 🗄️

**Projeto**: `operaciones-br`  
**Dataset**: `sales_intelligence`

**Tabelas**:

#### 1️⃣ **pipeline** (268 records)
```sql
Oportunidade, Conta, Perfil, Vendedor, Gross, Net,
Fase_Atual, Forecast_SF, Fiscal_Q, Data_Prevista,
Ciclo_dias, Dias_Funil, Atividades, MEDDIC_Score,
BANT_Score, Forecast_IA, Confiana (%), Flags_de_Risco
```
- **Total Gross**: R$ 74.1M
- **Total Net**: R$ 28.9M
- **Avg Gross**: R$ 276K

#### 2️⃣ **closed_deals_won** (506 records)
```sql
Oportunidade, Conta, Vendedor, Gross, Net, Portfolio,
Segmento, Familia_Produto, Fiscal_Q, Data_Fechamento,
Ciclo_dias, Causa_Raiz, Resumo_Analise, Fatores_Sucesso,
Tipo_Resultado, Qualidade_Engajamento, Atividades
```
- **Total Gross**: R$ 109.8M
- **Total Net**: R$ 37.7M
- **Avg Gross**: R$ 217K

#### 3️⃣ **closed_deals_lost** (2,069 records)
```sql
Oportunidade, Conta, Vendedor, Gross, Net, Portfolio,
Segmento, Familia_Produto, Fiscal_Q, Data_Fechamento,
Causa_Raiz, Resumo_Analise, Evitavel, Sinais_Alerta,
Momento_Critico, Total_Mudancas, Mudancas_Criticas
```
- **Total Gross**: R$ 330M
- **Total Net**: R$ 143.1M
- **Avg Gross**: R$ 159K

#### 4️⃣ **sales_specialist** (21 records)
```sql
account_name, perfil, opportunity_name, meses_fat, gtm_2026,
booking_total_gross, booking_total_net, opportunity_status,
vendedor, forecast_status, billing_quarter_gross/net,
closed_date, fiscal_quarter
```
- **Total Gross**: R$ 15.5M
- **Total Net**: R$ 4.4M
- **Avg Gross**: R$ 741K

**Validação**:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(DISTINCT Oportunidade) as unique_opps,
  ROUND(SUM(Gross), 2) as total_gross
FROM `operaciones-br.sales_intelligence.pipeline`
-- Result: 268, 268, 74158468.67 ✅
```

**Status**: ✅ **Dados validados sem duplicação**

---

### **Camada 4: BQML Models** 🤖

**Localização**: `/bigquery/ml_*.sql`

**Modelos de Machine Learning**:

#### 1. **Forecast IA** (`ml_win_loss_model.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.forecast_ia_model`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome']
)
AS
SELECT
  Gross, Net, Ciclo_dias, Atividades,
  Portfolio, Segmento, Vendedor,
  outcome -- WON / LOST
FROM `sales_intelligence.closed_deals_*`
```
**Objetivo**: Prever probabilidade de ganhar deal

#### 2. **Classificador de Perda** (`ml_classificador_perda.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.classificador_perda`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['Evitavel']
)
FROM `sales_intelligence.closed_deals_lost`
```
**Objetivo**: Identificar perdas evitáveis

#### 3. **Risco de Abandono** (`ml_risco_abandono.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.risco_abandono`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER'
)
```
**Objetivo**: Detectar deals em risco

#### 4. **Próxima Ação** (`ml_proxima_acao.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.proxima_acao`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['Tipo_Resultado']
)
```
**Objetivo**: Recomendar próximos passos

#### 5. **Prioridade Deal** (`ml_prioridade_deal.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.prioridade_deal`
OPTIONS(
  model_type='LINEAR_REG',
  input_label_cols=['Gross']
)
```
**Objetivo**: Ranquear opportunities por valor potencial

#### 6. **Performance Vendedor** (`ml_performance_vendedor.sql`)
```sql
CREATE OR REPLACE MODEL `sales_intelligence.performance_vendedor`
OPTIONS(
  model_type='BOOSTED_TREE_REGRESSOR'
)
```
**Objetivo**: Avaliar desempenho de vendedores

**Deploy**:
```bash
cd /workspaces/playbook/bigquery
./deploy_ml.sh  # Atualiza modelos + saídas do dashboard

```

**Status**: 🔧 **Modelos criados, aguardando treinamento**

---

### **Camada 5: Cloud Run API** 🌐

**Localização**: `/cloud-function/`

**Arquivos principais**:
- `main.py` - Flask API
- `bigquery_schema.py` - Schema mapping
- `metrics_calculators.py` - Cálculos de métricas
- `requirements.txt` - Dependências Python

**Endpoints planejados**:

#### 1. `/forecast` - Forecast IA
```python
POST /forecast
{
  "oportunidade": "OPP-12345",
  "gross": 500000,
  "net": 200000,
  "ciclo_dias": 45,
  "vendedor": "João Silva"
}

Response:
{
  "forecast": "HIGH",
  "confidence": 87.5,
  "probabilidade_ganho": 0.875,
  "proxima_acao": "Agendar reunião C-level"
}
```

#### 2. `/risk` - Análise de Risco
```python
GET /risk?oportunidade=OPP-12345

Response:
{
  "risco": "MEDIO",
  "score": 0.45,
  "flags": ["Sem atividades 7d", "Mudanças críticas"],
  "recomendacao": "Urgente: contatar cliente"
}
```

#### 3. `/actions` - Próximas Ações
```python
GET /actions?fase=Negociação

Response:
{
  "acoes_recomendadas": [
    "Enviar proposta comercial",
    "Validar ROI com stakeholder",
    "Agendar demo técnica"
  ],
  "prioridade": "ALTA"
}
```

#### 4. `/metrics` - Métricas Gerais
```python
GET /metrics?periodo=Q1-2026

Response:
{
  "total_pipeline": "R$ 74.1M",
  "conversion_rate": "19.7%",
  "avg_cycle": "87 dias",
  "top_vendedor": "Maria Santos"
}
```

**Deploy**:
```bash
cd /workspaces/playbook/cloud-function
./deploy.sh  # Deploy para Google Cloud Run
```

**URL esperada**:
```
https://sales-intelligence-api-[hash]-uc.a.run.app
```

**Status**: 🔧 **Código criado, pendente deploy e integração BQML**

---

### **Camada 6: Dashboard HTML** 🎨

**Localização**: `/public/index.html`

**Componentes planejados**:

#### 1. **Header**
```html
┌─────────────────────────────────────────┐
│ 🎯 Sales Intelligence Dashboard        │
│ Última atualização: 06/02/2026 11:52   │
└─────────────────────────────────────────┘
```

#### 2. **KPIs Principais**
```html
┌──────────┬──────────┬──────────┬──────────┐
│ Pipeline │   Won    │   Lost   │ Win Rate │
│ R$ 74.1M │ R$ 109.8M│ R$ 330M  │  19.7%   │
│  268 ops │  506 ops │ 2,069 ops│  ↑ 2.3%  │
└──────────┴──────────┴──────────┴──────────┘
```

#### 3. **Forecast IA**
```html
┌─────────────────────────────────────────┐
│ 🤖 Previsões IA                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ Alto Potencial: 45 opps (R$ 25M)       │
│ Médio Potencial: 123 opps (R$ 35M)     │
│ Baixo Potencial: 100 opps (R$ 14M)     │
└─────────────────────────────────────────┘
```

#### 4. **Alerts e Riscos**
```html
┌─────────────────────────────────────────┐
│ 🚨 Alertas Críticos                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 🔴 15 deals sem atividade 7+ dias       │
│ 🟡 8 deals com mudanças críticas        │
│ 🟢 Pipeline saudável: 245 deals         │
└─────────────────────────────────────────┘
```

#### 5. **Tabela de Oportunidades**
```html
┌─────────────────────────────────────────────────────────┐
│ Oportunidade | Conta      | Forecast | Valor    | Ação  │
│─────────────────────────────────────────────────────────│
│ OPP-12345    | Acme Corp  | 🟢 HIGH  | R$ 500K  | Ver → │
│ OPP-67890    | Tech Inc   | 🟡 MED   | R$ 300K  | Ver → │
│ OPP-11111    | Global Ltd | 🔴 LOW   | R$ 150K  | Ver → │
└─────────────────────────────────────────────────────────┘
```

#### 6. **Gráficos**
```html
┌─────────────────────────────────────────┐
│ 📊 Pipeline por Quarter                 │
│ FY26-Q1 ████████ 40 opps               │
│ FY26-Q2 ████████████████ 111 opps      │
│ FY26-Q3 ██████████ 74 opps             │
│ FY26-Q4 ████ 25 opps                   │
└─────────────────────────────────────────┘
```

**Tecnologias**:
- HTML5 + CSS3
- JavaScript vanilla (sem frameworks)
- Chart.js para gráficos
- Fetch API para consumir Cloud Run

**Status**: 🔧 **HTML base criado, pendente integração com API**

---

## 🔗 Integrações

### **1. Google Sheets ↔ BigQuery**
```javascript
// Apps Script
function syncToBigQueryScheduled() {
  // Trigger: Time-driven (a cada 1h)
  // Ou: Manual via menu "🔬 Diagnóstico"
}
```

**Status**: ✅ **Operacional**

### **2. BigQuery ↔ Cloud Run**
```python
# Cloud Run: main.py
from google.cloud import bigquery

client = bigquery.Client(project='operaciones-br')

@app.route('/forecast', methods=['POST'])
def get_forecast():
    # Query BQML model
    query = """
    SELECT * FROM ML.PREDICT(
      MODEL `sales_intelligence.forecast_ia_model`,
      (SELECT * FROM `sales_intelligence.pipeline`)
    )
    """
    results = client.query(query).result()
    return jsonify(results)
```

**Status**: 🔧 **Pendente deploy**

### **3. Cloud Run ↔ Dashboard**
```javascript
// Dashboard: index.html
async function loadForecast() {
  const response = await fetch(
    'https://sales-intelligence-api-[hash]-uc.a.run.app/forecast',
    { method: 'POST', body: JSON.stringify(data) }
  );
  const forecast = await response.json();
  updateUI(forecast);
}
```

**Status**: 🔧 **Pendente URL do Cloud Run**

---

## 📝 Próximos Passos

### **Fase 1: Treinar Modelos BQML** 🤖
```bash
cd /workspaces/playbook/bigquery
./deploy_ml.sh
```
- [ ] Treinar 6 modelos de ML
- [ ] Validar acurácia (target: >80%)
- [ ] Gerar predições de teste

### **Fase 2: Deploy Cloud Run** 🌐
```bash
cd /workspaces/playbook/cloud-function
./deploy.sh
```
- [ ] Deploy API Flask
- [ ] Testar endpoints localmente
- [ ] Obter URL pública
- [ ] Configurar autenticação

### **Fase 3: Conectar Dashboard** 🎨
- [ ] Atualizar index.html com URL do Cloud Run
- [ ] Implementar chamadas às APIs
- [ ] Adicionar gráficos interativos
- [ ] Testar responsividade

### **Fase 4: Validação End-to-End** ✅
- [ ] Sync Sheets → BigQuery (já validado ✅)
- [ ] Query BQML → Cloud Run
- [ ] API → Dashboard
- [ ] Dashboard → Usuário final

---

## 🎯 Métricas de Sucesso

| Métrica | Target | Status Atual |
|---------|--------|--------------|
| Data sync accuracy | 100% | ✅ 100% |
| Sync duration | <30s | ✅ 17s |
| BQML model accuracy | >80% | 🔧 Pendente |
| API response time | <2s | 🔧 Pendente |
| Dashboard load time | <3s | 🔧 Pendente |

---

## 📞 Contatos e Recursos

**Projeto BigQuery**: `operaciones-br.sales_intelligence`  
**Repositório**: `xerticaai/playbook`  
**Documentação BQML**: `/bigquery/ML_MODELS_README.md`  
**API Docs**: `/cloud-function/ML_ENDPOINTS.md`

---

**Última atualização**: 06/02/2026 11:55  
**Autor**: GitHub Copilot + Equipe Sales Intelligence
