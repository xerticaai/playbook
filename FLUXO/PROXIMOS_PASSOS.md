# 🚀 Próximos Passos - Roadmap de Implementação

**Status Atual**: ✅ Google Sheets ↔ BigQuery operacional | 🔧 Cloud Run + Dashboard pendentes

---

## 📋 Sprint 1: Treinar Modelos BQML (Prioridade ALTA)

### **Objetivo**: Treinar os 6 modelos de Machine Learning no BigQuery

### **Tarefas**:

#### 1. Preparar ambiente BQML
```bash
# Verificar se dataset existe
bq ls operaciones-br:sales_intelligence

# Verificar dados carregados
bq query --use_legacy_sql=false \
"SELECT 'pipeline' as table, COUNT(*) as rows FROM \`operaciones-br.sales_intelligence.pipeline\`
UNION ALL
SELECT 'won', COUNT(*) FROM \`operaciones-br.sales_intelligence.closed_deals_won\`
UNION ALL
SELECT 'lost', COUNT(*) FROM \`operaciones-br.sales_intelligence.closed_deals_lost\`"
```
- [ ] Validar 2,864 registros carregados
- [ ] Conferir schemas das tabelas
- [ ] Verificar permissões BQML

#### 2. Executar treinamento dos modelos
```bash
cd /workspaces/playbook/bigquery

# Executar script de deploy
./deploy_ml.sh
```
**Modelos a treinar**:
- [ ] `forecast_ia_model` - Prever win/loss (Logistic Regression)
- [ ] `classificador_perda` - Classificar perdas evitáveis (Logistic Regression)
- [ ] `risco_abandono` - Detectar deals em risco (Boosted Tree)
- [ ] `proxima_acao` - Recomendar ações (Classifier)
- [ ] `prioridade_deal` - Ranquear por valor (Linear Regression)
- [ ] `performance_vendedor` - Avaliar vendedores (Boosted Tree)

**Tempo estimado**: 20-40 minutos por modelo

#### 3. Validar acurácia dos modelos
```sql
-- Avaliar modelo forecast_ia_model
SELECT
  *
FROM
  ML.EVALUATE(MODEL `operaciones-br.sales_intelligence.forecast_ia_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.closed_deals_won` LIMIT 100)
  );
```
- [ ] Verificar accuracy > 80%
- [ ] Analisar confusion matrix
- [ ] Documentar resultados em `ML_MODELS_README.md`

#### 4. Testar predições
```sql
-- Teste de predição no pipeline ativo
SELECT
  Oportunidade,
  predicted_outcome,
  predicted_outcome_probs
FROM
  ML.PREDICT(MODEL `operaciones-br.sales_intelligence.forecast_ia_model`,
    (SELECT * FROM `operaciones-br.sales_intelligence.pipeline` LIMIT 10)
  );
```
- [ ] Executar 10 predições de teste
- [ ] Validar formato do output
- [ ] Salvar exemplos de resposta

**Critérios de Sucesso**:
- ✅ 6 modelos treinados sem erros
- ✅ Accuracy média > 80%
- ✅ Tempo de inferência < 2s

**Duração**: 2-3 horas

---

## 🌐 Sprint 2: Deploy Cloud Run API (Prioridade ALTA)

### **Objetivo**: Fazer deploy da API REST no Google Cloud Run

### **Tarefas**:

#### 1. Preparar ambiente Cloud Run
```bash
cd /workspaces/playbook/cloud-function

# Instalar dependências localmente
pip install -r requirements.txt

# Testar local
python test_local.py
```
- [ ] Validar requirements.txt
- [ ] Testar imports
- [ ] Verificar autenticação BigQuery

#### 2. Configurar Google Cloud
```bash
# Login no Google Cloud
gcloud auth login

# Configurar projeto
gcloud config set project operaciones-br

# Habilitar APIs necessárias
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```
- [ ] Autenticação configurada
- [ ] Projeto selecionado
- [ ] APIs habilitadas

#### 3. Deploy da aplicação
```bash
# Deploy para Cloud Run
./deploy.sh

# Ou manualmente:
gcloud run deploy sales-intelligence-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --max-instances 10
```
- [ ] Build concluído sem erros
- [ ] Serviço deployado
- [ ] URL pública gerada

**URL esperada**: `https://sales-intelligence-api-[hash]-uc.a.run.app`

#### 4. Testar endpoints
```bash
# Testar endpoint /forecast
curl -X POST https://sales-intelligence-api-[hash]-uc.a.run.app/forecast \
  -H "Content-Type: application/json" \
  -d '{
    "oportunidade": "TEST-001",
    "gross": 500000,
    "net": 200000,
    "ciclo_dias": 45,
    "vendedor": "Test User"
  }'

# Testar endpoint /metrics
curl https://sales-intelligence-api-[hash]-uc.a.run.app/metrics
```
- [ ] `/forecast` retorna JSON válido
- [ ] `/risk` funciona
- [ ] `/actions` funciona
- [ ] `/metrics` retorna KPIs

#### 5. Configurar CORS
```python
# main.py
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=['https://xerticaai.github.io'])
```
- [ ] CORS habilitado
- [ ] Dashboard pode fazer requests
- [ ] Preflight OPTIONS tratado

**Critérios de Sucesso**:
- ✅ API deployada e acessível
- ✅ Todos os endpoints respondendo
- ✅ Tempo de resposta < 2s
- ✅ CORS configurado

**Duração**: 1-2 horas

---

## 🎨 Sprint 3: Integrar Dashboard HTML (Prioridade MÉDIA)

### **Objetivo**: Conectar dashboard ao Cloud Run e adicionar visualizações

### **Tarefas**:

#### 1. Atualizar index.html com URL da API
```javascript
// public/index.html
const API_URL = 'https://sales-intelligence-api-[hash]-uc.a.run.app';

async function loadDashboard() {
  // Carregar métricas
  const metrics = await fetch(`${API_URL}/metrics`).then(r => r.json());
  updateKPIs(metrics);
  
  // Carregar forecast
  const forecast = await fetch(`${API_URL}/forecast`, {
    method: 'POST',
    body: JSON.stringify({ ... })
  }).then(r => r.json());
  updateForecast(forecast);
}
```
- [ ] Substituir URL placeholder
- [ ] Testar fetch local
- [ ] Tratar erros de rede

#### 2. Implementar funções de visualização
```javascript
function updateKPIs(metrics) {
  document.getElementById('pipeline-value').textContent = 
    formatCurrency(metrics.pipeline.total_gross);
  // ... more KPIs
}

function updateForecast(forecast) {
  const chart = new Chart(ctx, {
    type: 'bar',
    data: { ... }
  });
}
```
- [ ] KPIs principal (4 cards)
- [ ] Tabela de oportunidades
- [ ] Gráfico de pipeline por quarter
- [ ] Alertas críticos

#### 3. Adicionar Chart.js para gráficos
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```
**Gráficos necessários**:
- [ ] Pipeline por Fiscal Quarter (bar chart)
- [ ] Win Rate trend (line chart)
- [ ] Top Vendedores (horizontal bar)
- [ ] Segmento mix (donut chart)

#### 4. Implementar refresh automático
```javascript
// Atualizar a cada 5 minutos
setInterval(() => {
  loadDashboard();
}, 5 * 60 * 1000);
```
- [ ] Auto-refresh configurado
- [ ] Loading indicators
- [ ] Timestamp "Última atualização"

#### 5. Estilização e responsividade
```css
/* Adicionar CSS responsivo */
@media (max-width: 768px) {
  .kpi-card {
    width: 100%;
  }
}
```
- [ ] Desktop (>1024px)
- [ ] Tablet (768-1024px)
- [ ] Mobile (< 768px)

**Critérios de Sucesso**:
- ✅ Dashboard carrega dados da API
- ✅ Gráficos renderizados
- ✅ Responsivo em 3 breakpoints
- ✅ Auto-refresh funciona

**Duração**: 2-3 horas

---

## ✅ Sprint 4: Validação End-to-End (Prioridade ALTA)

### **Objetivo**: Testar fluxo completo e documentar

### **Tarefas**:

#### 1. Teste manual do fluxo completo
```
1. Modificar dados no Google Sheets
   └─ Adicionar 1 deal no Pipeline

2. Executar sync manual
   └─ Apps Script > syncToBigQueryScheduled()

3. Validar no BigQuery
   └─ Query: SELECT COUNT(*) FROM pipeline
   └─ Esperado: 269 records (268 + 1)

4. Aguardar Cloud Run atualizar
   └─ Cache pode levar até 5min

5. Verificar Dashboard
   └─ Abrir index.html
   └─ Confirmar novo deal aparece
```
- [ ] Teste de adição de deal
- [ ] Teste de modificação de deal
- [ ] Teste de exclusão de deal
- [ ] Validar propagação de mudanças

#### 2. Testes de performance
```bash
# Load test no Cloud Run
ab -n 100 -c 10 https://sales-intelligence-api-[hash]-uc.a.run.app/metrics

# Verificar response time < 2s
```
- [ ] 100 requests concorrentes
- [ ] P95 < 2s
- [ ] Zero erros 5xx

#### 3. Testes de error handling
```javascript
// Simular API offline
// Verificar se dashboard exibe mensagem de erro
```
- [ ] API offline → erro amigável
- [ ] Timeout → retry automático
- [ ] 400/500 → log e notificação

#### 4. Documentação final
```bash
# Atualizar READMEs
cd /workspaces/playbook/FLUXO
# Adicionar screenshots
# Documentar URLs finais
# Criar guia de troubleshooting
```
- [ ] README.md atualizado
- [ ] Screenshots adicionados
- [ ] URLs documentadas
- [ ] Guia de troubleshooting criado

**Critérios de Sucesso**:
- ✅ Fluxo completo funciona sem intervenção manual
- ✅ Performance dentro do esperado
- ✅ Errors tratados gracefully
- ✅ Documentação completa

**Duração**: 2 horas

---

## 🔧 Sprint 5: Melhorias e Otimizações (Prioridade BAIXA)

### **Objetivo**: Refinar sistema e adicionar features extras

### **Tarefas Opcionais**:

#### 1. Cache na API
```python
from flask_caching import Cache

cache = Cache(app, config={'CACHE_TYPE': 'simple'})

@app.route('/metrics')
@cache.cached(timeout=300)  # 5min cache
def get_metrics():
    # ...
```
- [ ] Cache de 5min em `/metrics`
- [ ] Invalidar cache em sync

#### 2. Notificações de alertas
```javascript
// Dashboard: enviar notificação para Slack
if (criticalDeals.length > 10) {
  sendSlackAlert('🚨 10+ deals críticos!');
}
```
- [ ] Integração Slack webhook
- [ ] Alertas configuráveis

#### 3. Exportação de relatórios
```javascript
// Botão "Download CSV"
function exportToCSV(data) {
  const csv = convertToCSV(data);
  downloadFile(csv, 'pipeline_report.csv');
}
```
- [ ] Export CSV
- [ ] Export PDF (opcional)

#### 4. Histórico de predições
```sql
-- Salvar predições para análise posterior
CREATE TABLE `sales_intelligence.prediction_history` AS
SELECT
  CURRENT_TIMESTAMP() as prediction_time,
  *
FROM ML.PREDICT(...)
```
- [ ] Tabela de histórico
- [ ] Dashboard de acurácia

**Duração**: Conforme necessário

---

## 📅 Timeline Sugerido

```
Semana 1:
├─ Treinar modelos BQML (Sprint 1)           2-3h
├─ Deploy Cloud Run (Sprint 2)               1-2h
└─ Integrar Dashboard (Sprint 3 parcial)     1h

Semana 2:
├─ Finalizar Dashboard (Sprint 3)            2h
├─ Validação E2E (Sprint 4)                  2h
└─ Documentação e ajustes                    1h

Semana 3+ (opcional):
└─ Melhorias (Sprint 5)                      Conforme demanda
```

**Total estimado**: 9-12 horas de trabalho

---

## 🎯 Checklist Final

Antes de considerar o projeto **COMPLETO**, validar:

- [ ] ✅ Google Sheets sincroniza com BigQuery sem erros
- [ ] 🤖 6 modelos BQML treinados e validados (>80% accuracy)
- [ ] 🌐 Cloud Run API deployada e respondendo
- [ ] 🎨 Dashboard HTML conectado e funcional
- [ ] ⚡ Performance E2E < 2s
- [ ] 📝 Documentação completa no `/FLUXO/`
- [ ] 🚨 Error handling implementado
- [ ] 📊 Monitoramento configurado
- [ ] 🔐 Segurança validada (CORS, IAM, etc)
- [ ] ✅ Testes E2E passando

---

## 🆘 Troubleshooting

### Problema: Modelos BQML não treinam
```bash
# Verificar quota
bq show --format=prettyjson --project_id=operaciones-br

# Verificar dados
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) FROM \`operaciones-br.sales_intelligence.closed_deals_won\`"
```
**Solução**: Mínimo 100 registros por modelo

### Problema: Cloud Run retorna 503
```bash
# Verificar logs
gcloud run services logs read sales-intelligence-api --limit=20
```
**Solução**: Aumentar timeout ou memory

### Problema: Dashboard não carrega dados
```javascript
// Abrir DevTools (F12) e verificar Console
// Procurar erros CORS ou network
```
**Solução**: Verificar CORS no Cloud Run

---

**Próxima ação sugerida**: Iniciar **Sprint 1** - Treinar Modelos BQML 🚀

**Criado em**: 06/02/2026  
**Última atualização**: 06/02/2026
