# ⚡ Quick Commands Reference

## 🚀 Setup Inicial

```bash
# Autenticar no Google Cloud
gcloud auth login
gcloud config set project operaciones-br

# Setup BigQuery (dataset + tabelas)
cd /workspaces/playbook/bigquery
./setup_bigquery.sh

# Carregar dados iniciais
./load_initial_data.py

# Treinar modelo de ML
bq query --use_legacy_sql=false < ml_win_loss_model.sql

# Deploy Cloud Function
cd ../cloud-function
cp main_bigquery.py main.py
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

# Testar tudo
cd ../bigquery
./quick_test.sh
```

---

## 🔍 Queries Úteis

### Verificar dados carregados
```bash
bq query --use_legacy_sql=false "
SELECT 
  'pipeline' as table_name,
  COUNT(*) as rows
FROM \`operaciones-br.sales_intelligence.pipeline\`

UNION ALL

SELECT 
  'closed_deals' as table_name,
  COUNT(*) as rows
FROM \`operaciones-br.sales_intelligence.closed_deals\`
"
```

### Verificar performance do modelo
```bash
bq query --use_legacy_sql=false "
SELECT
  ROUND(accuracy, 3) as accuracy,
  ROUND(precision, 3) as precision,
  ROUND(recall, 3) as recall,
  ROUND(roc_auc, 3) as roc_auc
FROM ML.EVALUATE(MODEL \`operaciones-br.sales_intelligence.win_loss_predictor\`)
"
```

### Top deals em risco
```bash
bq query --use_legacy_sql=false "
SELECT
  oportunidade,
  ROUND(gross, 0) as valor,
  ROUND(win_probability * 100, 1) as win_prob_pct,
  ml_alert
FROM \`operaciones-br.sales_intelligence.pipeline_predictions\`
WHERE win_probability < 0.5
ORDER BY gross DESC
LIMIT 10
"
```

### Win rate por vendedor
```bash
bq query --use_legacy_sql=false "
SELECT
  vendedor,
  COUNT(*) as total_deals,
  ROUND(AVG(CASE WHEN outcome = 'WON' THEN 1.0 ELSE 0.0 END) * 100, 1) as win_rate
FROM \`operaciones-br.sales_intelligence.closed_deals\`
GROUP BY vendedor
ORDER BY win_rate DESC
"
```

---

## 🔄 Operações Diárias

### Recarregar dados do pipeline
```bash
cd /workspaces/playbook/bigquery
./load_initial_data.py
```

### Retreinar modelo de ML
```bash
bq query --use_legacy_sql=false "
CREATE OR REPLACE MODEL \`operaciones-br.sales_intelligence.win_loss_predictor\`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['won'],
  max_iterations=50,
  learn_rate=0.1,
  early_stop=TRUE
) AS
SELECT * FROM \`operaciones-br.sales_intelligence.training_data\`
"
```

### Atualizar predições
```bash
bq query --use_legacy_sql=false < ml_win_loss_model.sql
```

---

## 🧪 Testes

### Testar Cloud Function localmente
```bash
curl -X POST https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine \
  -H "Content-Type: application/json" \
  -d '{"source": "bigquery", "filters": {}}' | jq .
```

### Ver logs da Cloud Function
```bash
gcloud functions logs read sales-intelligence-engine --limit=50
```

### Verificar tabelas
```bash
bq ls operaciones-br:sales_intelligence
```

### Ver schema de uma tabela
```bash
bq show --schema --format=prettyjson \
  operaciones-br:sales_intelligence.pipeline
```

---

## 🗑️ Limpeza

### Deletar tabela
```bash
bq rm -f -t operaciones-br:sales_intelligence.pipeline
```

### Deletar modelo
```bash
bq rm -f -m operaciones-br:sales_intelligence.win_loss_predictor
```

### Deletar dataset (CUIDADO!)
```bash
bq rm -r -f -d operaciones-br:sales_intelligence
```

---

## 🔧 Troubleshooting

### Ver permissões do projeto
```bash
gcloud projects get-iam-policy operaciones-br
```

### Adicionar permissão BigQuery à Cloud Function
```bash
gcloud projects add-iam-policy-binding operaciones-br \
  --member="serviceAccount:operaciones-br@appspot.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor"
```

### Ver status da Cloud Function
```bash
gcloud functions describe sales-intelligence-engine \
  --region=us-central1
```

### Redeploy Cloud Function (force)
```bash
cd /workspaces/playbook/cloud-function
gcloud functions deploy sales-intelligence-engine \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=sales_intelligence_engine \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2GB \
  --timeout=540s \
  --clear-env-vars
```

---

## 📊 Queries de Análise

### Distribuição de probabilidade de vitória
```sql
SELECT
  CASE
    WHEN win_probability >= 0.7 THEN '70-100% (HIGH)'
    WHEN win_probability >= 0.5 THEN '50-70% (MEDIUM)'
    WHEN win_probability >= 0.3 THEN '30-50% (LOW)'
    ELSE '0-30% (VERY LOW)'
  END as confidence_bucket,
  COUNT(*) as num_deals,
  SUM(gross) as total_value
FROM `operaciones-br.sales_intelligence.pipeline_predictions`
GROUP BY confidence_bucket
ORDER BY confidence_bucket DESC;
```

### Causas de perda mais frequentes
```sql
SELECT
  causa_raiz,
  COUNT(*) as occurrences,
  ROUND(AVG(gross), 0) as avg_lost_value,
  ROUND(AVG(ciclo_dias), 0) as avg_cycle_days
FROM `operaciones-br.sales_intelligence.closed_deals`
WHERE outcome = 'LOST' AND causa_raiz IS NOT NULL
GROUP BY causa_raiz
ORDER BY occurrences DESC
LIMIT 10;
```

### Performance histórica por quarter
```sql
SELECT
  fiscal_q,
  COUNT(*) as total_deals,
  SUM(CASE WHEN outcome = 'WON' THEN 1 ELSE 0 END) as won,
  ROUND(AVG(CASE WHEN outcome = 'WON' THEN 1.0 ELSE 0.0 END) * 100, 1) as win_rate,
  SUM(CASE WHEN outcome = 'WON' THEN gross ELSE 0 END) as revenue
FROM `operaciones-br.sales_intelligence.closed_deals`
GROUP BY fiscal_q
ORDER BY fiscal_q DESC;
```

### Feature Importance (ML)
```sql
SELECT
  feature,
  ROUND(importance_weight, 3) as weight,
  ROUND(importance_gain, 3) as gain
FROM ML.FEATURE_IMPORTANCE(
  MODEL `operaciones-br.sales_intelligence.win_loss_predictor`
)
ORDER BY importance_weight DESC
LIMIT 10;
```

---

## 📱 Apps Script Functions

```javascript
// Carregar pipeline
loadPipelineToBigQuery()

// Carregar closed deals
loadClosedDealsToBigQuery()

// Análise completa (load + query)
runFullAnalysis()

// Chamar Cloud Function com filtros
callCloudFunctionWithBigQuery({
  quarter: 'FY26-Q1',
  seller: 'Carlos Moll'
})

// Criar trigger diário
function createDailyTrigger() {
  ScriptApp.newTrigger('runFullAnalysis')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}
```

---

## 🔗 Links Úteis

- BigQuery Console: https://console.cloud.google.com/bigquery?project=operaciones-br
- Cloud Functions Console: https://console.cloud.google.com/functions?project=operaciones-br
- Cloud Logging: https://console.cloud.google.com/logs?project=operaciones-br
- BigQuery ML Docs: https://cloud.google.com/bigquery-ml/docs
