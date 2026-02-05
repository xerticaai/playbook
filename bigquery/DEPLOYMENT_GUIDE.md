# 🚀 Sales Intelligence - BigQuery + BigQuery ML Architecture

## 📋 Visão Geral

Esta é a arquitetura "Endgame" do Sales Intelligence Engine, usando:
- **BigQuery**: Data Warehouse centralizado para armazenar todos os dados de vendas
- **BigQuery ML**: Machine Learning nativo para predição de Win/Loss
- **Cloud Functions**: Engine de análise e orquestração
- **Apps Script**: Interface com Google Sheets

## 🏗️ Arquitetura

```
┌─────────────────┐
│  Google Sheets  │
│  (Apps Script)  │
└────────┬────────┘
         │ 1. Load Data
         ▼
┌─────────────────────────────────┐
│         BigQuery                │
│  ┌───────────────────────────┐  │
│  │ Dataset: sales_intelligence│  │
│  │                            │  │
│  │ Tables:                    │  │
│  │  • pipeline                │  │
│  │  • closed_deals            │  │
│  │  • pipeline_predictions    │  │
│  │                            │  │
│  │ ML Models:                 │  │
│  │  • win_loss_predictor      │  │
│  └───────────────────────────┘  │
└────────┬────────────────────────┘
         │ 2. Query & Analyze
         ▼
┌─────────────────┐
│ Cloud Function  │
│  (Python 3.12)  │
└────────┬────────┘
         │ 3. Return Results
         ▼
┌─────────────────┐
│  Google Sheets  │
│   (Dashboard)   │
└─────────────────┘
```

## 📦 Estrutura de Arquivos

```
/workspaces/playbook/
├── bigquery/
│   ├── schema_pipeline.json           # Schema da tabela pipeline
│   ├── schema_closed.json             # Schema da tabela closed_deals
│   ├── setup_bigquery.sh              # Script de setup inicial
│   ├── load_initial_data.py           # Carrega CSVs iniciais
│   └── ml_win_loss_model.sql          # Modelo de ML Win/Loss
├── appscript/
│   ├── BigQueryLoader.gs              # Carrega dados no BigQuery
│   ├── DashboardCode.gs               # Dashboard principal
│   └── ...
├── cloud-function/
│   ├── main_bigquery.py               # Cloud Function (versão BigQuery)
│   └── requirements.txt               # Dependências Python
└── *.csv                              # Dados atuais (para carga inicial)
```

## 🚀 Deployment - Passo a Passo

### Pré-requisitos

1. **Autenticação no Google Cloud**
   ```bash
   cd /workspaces/playbook
   gcloud auth login
   gcloud config set project operaciones-br
   ```

### Etapa 1: Setup do BigQuery

```bash
cd /workspaces/playbook/bigquery

# 1. Criar dataset e tabelas
./setup_bigquery.sh

# 2. Carregar dados iniciais dos CSVs
./load_initial_data.py
```

**O que acontece:**
- ✅ Dataset `sales_intelligence` criado
- ✅ Tabela `pipeline` criada com particionamento por data
- ✅ Tabela `closed_deals` criada com particionamento por data
- ✅ ~270 linhas de pipeline carregadas
- ✅ ~2575 linhas de closed deals carregadas (506 WON + 2069 LOST)

**Verificar resultado:**
```bash
bq show operaciones-br:sales_intelligence
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total FROM \`operaciones-br.sales_intelligence.pipeline\`"
```

### Etapa 2: Criar Modelo de ML

```bash
# Executar o SQL de criação do modelo
bq query --use_legacy_sql=false < ml_win_loss_model.sql
```

**O que acontece:**
- ✅ View `training_data` criada (features engenheiradas)
- ✅ Modelo `win_loss_predictor` treinado (XGBoost)
- ✅ Métricas de avaliação calculadas
- ✅ Tabela `pipeline_predictions` criada com probabilidades

**Tempo estimado:** 3-5 minutos para treinar o modelo

**Verificar resultado:**
```bash
bq query --use_legacy_sql=false \
  "SELECT * FROM ML.EVALUATE(MODEL \`operaciones-br.sales_intelligence.win_loss_predictor\`)"
```

### Etapa 3: Deploy da Cloud Function

```bash
cd /workspaces/playbook/cloud-function

# Copiar versão BigQuery como main.py
cp main_bigquery.py main.py

# Deploy
gcloud functions deploy sales-intelligence-engine \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=sales_intelligence_engine \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2GB \
  --timeout=540s
```

**O que acontece:**
- ✅ Cloud Function atualizada para ler do BigQuery
- ✅ Biblioteca `google-cloud-bigquery` instalada
- ✅ Endpoint HTTP disponível

**Verificar resultado:**
```bash
# Testar com curl
curl -X POST https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine \
  -H "Content-Type: application/json" \
  -d '{"source": "bigquery", "filters": {}}'
```

### Etapa 4: Configurar Apps Script

1. **Abrir o Google Sheets** com seus dados

2. **Abrir Editor de Scripts** (Extensions > Apps Script)

3. **Adicionar Biblioteca BigQuery**:
   - Resources > Libraries
   - Script ID: `1JefJJw2F7kd5ykBlF_yFmQ8AJkz3GhCvUYKlv4wWQbfQwkJLnM4xNnqV`
   - Versão: `36` (ou mais recente)
   - Identifier: `BigQuery`

4. **Criar novo arquivo** `BigQueryLoader.gs`:
   - Copiar conteúdo de `/workspaces/playbook/appscript/BigQueryLoader.gs`
   - Colar no Apps Script

5. **Salvar e autorizar**:
   - Salvar o projeto
   - Executar função `runFullAnalysis()`
   - Autorizar acesso ao BigQuery

### Etapa 5: Executar Primeira Análise

No Apps Script, execute:

```javascript
function testFullPipeline() {
  Logger.log('🚀 Testando pipeline completo...');
  
  // 1. Carregar dados no BigQuery
  Logger.log('\n[1/2] Carregando dados...');
  loadPipelineToBigQuery();
  loadClosedDealsToBigQuery();
  
  // 2. Executar análise
  Logger.log('\n[2/2] Executando análise...');
  const result = callCloudFunctionWithBigQuery({});
  
  Logger.log('\n✅ Resultado:');
  Logger.log(JSON.stringify(result, null, 2));
}
```

## 📊 Usando o Modelo de ML

### Query 1: Top Oportunidades em Risco

```sql
SELECT
  oportunidade,
  conta,
  vendedor,
  gross,
  ROUND(win_probability * 100, 1) as win_prob_pct,
  ml_alert,
  fase_atual
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
WHERE win_probability < 0.5
  AND gross > 50000
ORDER BY gross DESC
LIMIT 10;
```

### Query 2: Performance por Vendedor (Predição)

```sql
SELECT
  vendedor,
  COUNT(*) as num_deals,
  ROUND(AVG(win_probability) * 100, 1) as avg_win_prob,
  SUM(gross) as total_pipeline,
  SUM(CASE WHEN win_probability > 0.5 THEN gross ELSE 0 END) as likely_value
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
GROUP BY vendedor
ORDER BY avg_win_prob DESC;
```

### Query 3: Forecast Accuracy (ML vs. Manual)

```sql
SELECT
  forecast_ia,
  COUNT(*) as num_deals,
  ROUND(AVG(win_probability) * 100, 1) as avg_ml_prediction,
  SUM(gross) as total_value
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
GROUP BY forecast_ia
ORDER BY avg_ml_prediction DESC;
```

## 🔄 Fluxo de Uso Diário

### Opção A: Atualização Manual (Apps Script)

1. Abrir Google Sheets
2. Executar função: `runFullAnalysis()`
3. Aguardar 10-30 segundos
4. Visualizar resultados no Dashboard

### Opção B: Atualização Automática (Trigger)

```javascript
// No Apps Script, criar trigger:
function createDailyTrigger() {
  ScriptApp.newTrigger('runFullAnalysis')
    .timeBased()
    .everyDays(1)
    .atHour(8)  // 8 AM
    .create();
}
```

### Opção C: Retreinar Modelo (Semanal)

```bash
# Reexecutar apenas as partes 2, 3, 4, 5 do SQL
bq query --use_legacy_sql=false < ml_win_loss_model.sql
```

## 🧪 Testes e Validação

### Teste 1: Verificar Dados no BigQuery

```bash
bq query --use_legacy_sql=false "
SELECT 
  'pipeline' as table_name,
  COUNT(*) as rows,
  MAX(data_carga) as last_load
FROM \`operaciones-br.sales_intelligence.pipeline\`

UNION ALL

SELECT 
  'closed_deals' as table_name,
  COUNT(*) as rows,
  MAX(data_carga) as last_load
FROM \`operaciones-br.sales_intelligence.closed_deals\`
"
```

### Teste 2: Verificar Modelo de ML

```bash
bq query --use_legacy_sql=false "
SELECT
  accuracy,
  precision,
  recall,
  f1_score,
  log_loss,
  roc_auc
FROM ML.EVALUATE(MODEL \`operaciones-br.sales_intelligence.win_loss_predictor\`)
"
```

**Métricas esperadas:**
- Accuracy: > 70%
- ROC AUC: > 0.75
- Precision/Recall: Balanceados

### Teste 3: Verificar Cloud Function

```bash
curl -X POST https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine \
  -H "Content-Type: application/json" \
  -d '{
    "source": "bigquery",
    "filters": {
      "quarter": "FY26-Q1"
    }
  }' | jq .
```

**Resposta esperada:**
```json
{
  "status": "success",
  "data_summary": {
    "pipeline_deals": 150,
    "closed_deals": 500,
    "sellers_analyzed": 5
  },
  "pipeline_analysis": { ... },
  "closed_analysis": {
    "win_rate": 45.2,
    ...
  }
}
```

## 📈 Vantagens desta Arquitetura

### ✅ Performance
- **Antes**: 6.4 MB de payload, timeout em requisições HTTP
- **Depois**: Query otimizada, resultados em < 2 segundos

### ✅ Escalabilidade
- **Antes**: Limitado a ~3000 deals
- **Depois**: Suporta milhões de linhas sem alteração de código

### ✅ Inteligência
- **Antes**: Análise descritiva (o que aconteceu)
- **Depois**: Análise preditiva (o que vai acontecer)

### ✅ Histórico
- **Antes**: Apenas snapshot atual
- **Depois**: Análise histórica (Quarter-over-Quarter, Year-over-Year)

### ✅ Insights de ML
- Probabilidade real de vitória por deal
- Identificação automática de deals em risco
- Comparação de performance entre vendedores
- Causas de perda mais frequentes

## 🔮 Próximos Passos (Opcional)

### Deep Learning para Análise de Texto

Se quiser analisar os campos de texto (`resumo_analise`, `licoes_aprendidas`):

```sql
-- Criar modelo de DNN para análise de sentimento/causa
CREATE OR REPLACE MODEL `operaciones-br.sales_intelligence.loss_cause_predictor`
OPTIONS(
  model_type='DNN_CLASSIFIER',
  input_label_cols=['causa_raiz'],
  hidden_units=[128, 64, 32]
) AS
SELECT
  causa_raiz,
  resumo_analise,
  licoes_aprendidas,
  competidor,
  gross,
  ciclo_dias
FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE outcome = 'LOST'
  AND causa_raiz IS NOT NULL;
```

### Integração com Looker Studio

1. Conectar Looker Studio ao BigQuery
2. Criar dashboard visual com:
   - Pipeline por probabilidade de vitória
   - Top deals em risco
   - Performance por vendedor
   - Tendências históricas

### Alertas Automáticos

Criar Cloud Scheduler para enviar alertas via email quando:
- Deal de alto valor cai abaixo de 30% de probabilidade
- Vendedor tem win rate < 25%
- Pipeline de Q não vai bater a meta

## 🆘 Troubleshooting

### Erro: "Permission denied on BigQuery"
```bash
# Conceder permissões à Cloud Function
gcloud projects add-iam-policy-binding operaciones-br \
  --member="serviceAccount:operaciones-br@appspot.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

### Erro: "Table not found"
```bash
# Verificar se as tabelas existem
bq ls operaciones-br:sales_intelligence
```

### Erro: "Model training failed"
```bash
# Ver logs de treinamento
bq show -j <job_id>
```

## 📚 Referências

- [BigQuery Documentation](https://cloud.google.com/bigquery/docs)
- [BigQuery ML Guide](https://cloud.google.com/bigquery-ml/docs/introduction)
- [Apps Script BigQuery Service](https://developers.google.com/apps-script/advanced/bigquery)
- [Cloud Functions Python](https://cloud.google.com/functions/docs/writing)
