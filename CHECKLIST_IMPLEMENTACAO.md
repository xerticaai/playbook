# ✅ CHECKLIST DE IMPLEMENTAÇÃO: PAUTA SEMANAL + WAR ROOM

## 📋 PRÉ-REQUISITOS (Verificar antes de começar)

- [x] **BigQuery Dataset:** `operaciones-br.sales_intelligence` existe
- [x] **Tabelas Fonte:** pipeline, closed_deals_won, closed_deals_lost, sales_specialist
- [x] **RAG Ativo:** deal_embeddings com 2848 registros
- [x] **Vertex AI Connection:** `operaciones-br.us-central1.vertex_ai_conn` configurada
- [x] **Gemini API Key:** Disponível (AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4)
- [x] **Cloud Run:** API existente rodando em `sales-intelligence-api`
- [ ] **Acesso GCP:** Permissões Owner ou Editor no projeto `operaciones-br`
- [ ] **Ambiente Local:** VS Code + Docker (Dev Container)

---

## 🎯 SPRINT 1: BACKEND (3 dias)

### **DIA 1: BigQuery VIEWs**

#### ✅ Tarefa 1.1: Criar VIEW `pauta_semanal_enriquecida`
```bash
cd /workspaces/playbook/bigquery

# Executar criação da VIEW
bq query --use_legacy_sql=false --project_id=operaciones-br <<'EOF'
-- [Cole o SQL da VIEW pauta_semanal_enriquecida do arquivo views_pauta_war_room.sql]
EOF
```

**Validação:**
```bash
# Verificar se VIEW foi criada
bq ls operaciones-br:sales_intelligence | grep pauta_semanal_enriquecida

# Testar query (deve retornar deals críticos)
bq query --use_legacy_sql=false --project_id=operaciones-br \
  "SELECT COUNT(*) as total, 
   COUNT(DISTINCT Vendedor) as sellers,
   SUM(Gross) as total_gross
   FROM \`operaciones-br.sales_intelligence.pauta_semanal_enriquecida\`"
```

**Critério de Sucesso:**
- [ ] VIEW retorna pelo menos 50 deals
- [ ] Campos `Risco_Score` e `Categoria_Pauta` preenchidos
- [ ] Sem erros de colunas ausentes

---

#### ✅ Tarefa 1.2: Criar VIEW `war_room_metrics`
```bash
# Executar criação da VIEW
bq query --use_legacy_sql=false --project_id=operaciones-br <<'EOF'
-- [Cole o SQL da VIEW war_room_metrics do arquivo views_pauta_war_room.sql]
EOF
```

**Validação:**
```bash
# Verificar notas de higiene
bq query --use_legacy_sql=false --project_id=operaciones-br \
  "SELECT Nota_Higiene, COUNT(*) as cnt
   FROM \`operaciones-br.sales_intelligence.war_room_metrics\`
   GROUP BY Nota_Higiene
   ORDER BY Nota_Higiene"
```

**Critério de Sucesso:**
- [ ] VIEW retorna todos os vendedores ativos (~24)
- [ ] Notas A-F distribuídas
- [ ] Campos `Deals_Zumbi` e `Percent_Pipeline_Podre` calculados

---

### **DIA 2: Backend Endpoints**

#### ✅ Tarefa 2.1: Criar `weekly_agenda.py`
```bash
cd /workspaces/playbook/cloud-run/app/api/endpoints

# Criar arquivo
touch weekly_agenda.py
```

**Conteúdo:** Ver ARQUITETURA_PAUTA_WAR_ROOM.md (Seção "CAMADA 2: Backend")

**Estrutura do arquivo:**
```python
"""
Weekly Agenda Endpoint - Pauta Semanal Enriquecida com RAG
"""
from fastapi import APIRouter, Query
from google.cloud import bigquery
from typing import Optional, List, Dict, Any
import os

router = APIRouter()

# [Cole o código do endpoint conforme documentado]
```

**Validação:**
```bash
# Testar localmente
cd /workspaces/playbook/cloud-run
python -c "from app.api.endpoints.weekly_agenda import router; print('Import OK')"
```

**Critério de Sucesso:**
- [ ] Arquivo criado sem erros de sintaxe
- [ ] Import funciona sem erros
- [ ] Função `generate_sabatina_questions()` implementada

---

#### ✅ Tarefa 2.2: Criar `war_room.py`
```bash
cd /workspaces/playbook/cloud-run/app/api/endpoints

# Criar arquivo
touch war_room.py
```

**Conteúdo:** Ver ARQUITETURA_PAUTA_WAR_ROOM.md (Seção "CAMADA 2: Backend")

**Validação:**
```bash
# Testar import
python -c "from app.api.endpoints.war_room import router; print('Import OK')"
```

**Critério de Sucesso:**
- [ ] Arquivo criado sem erros
- [ ] Funções `generate_sabatina_questions()` e `generate_risk_tags()` implementadas
- [ ] Integração Gemini configurada

---

#### ✅ Tarefa 2.3: Registrar Routers em `simple_api.py`
```bash
cd /workspaces/playbook/cloud-run/app

# Editar simple_api.py
```

**Modificações:**
```python
# ADICIONAR após linha 18:
from api.endpoints.weekly_agenda import router as weekly_agenda_router
from api.endpoints.war_room import router as war_room_router

# ADICIONAR após linha 41:
app.include_router(weekly_agenda_router, prefix="/api", tags=["Weekly Agenda"])
app.include_router(war_room_router, prefix="/api", tags=["War Room"])
```

**Validação:**
```bash
# Iniciar servidor local
cd /workspaces/playbook
python -m uvicorn cloud-run.app.simple_api:app --host 0.0.0.0 --port 8080 --reload &

# Esperar 5s
sleep 5

# Testar endpoints
curl http://localhost:8080/api/weekly-agenda?seller=Alex | jq '.total_deals'
curl http://localhost:8080/api/war-room | jq '.week_info'

# Parar servidor
pkill -f uvicorn
```

**Critério de Sucesso:**
- [ ] Endpoint `/api/weekly-agenda` retorna JSON válido
- [ ] Endpoint `/api/war-room` retorna JSON válido
- [ ] Sem erros 500 no console

---

### **DIA 3: Deploy Cloud Run**

#### ✅ Tarefa 3.1: Testar Build Local
```bash
cd /workspaces/playbook/cloud-run

# Build da imagem Docker
docker build -t sales-intelligence-api:test .

# Testar container local
docker run -d -p 8080:8080 \
  -e GCP_PROJECT=operaciones-br \
  -e GEMINI_API_KEY=AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4 \
  --name test-api \
  sales-intelligence-api:test

# Esperar 10s
sleep 10

# Testar
curl http://localhost:8080/health | jq '.'

# Parar container
docker stop test-api && docker rm test-api
```

**Critério de Sucesso:**
- [ ] Build sem erros
- [ ] Container inicia corretamente
- [ ] `/health` retorna status healthy

---

#### ✅ Tarefa 3.2: Deploy Cloud Run
```bash
cd /workspaces/playbook/cloud-run

# Deploy
gcloud run deploy sales-intelligence-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project operaciones-br \
  --max-instances 10 \
  --memory 1Gi \
  --timeout 60 \
  --set-env-vars GCP_PROJECT=operaciones-br,GEMINI_API_KEY=AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4

# Aguardar deploy (2-3 min)
```

**Validação:**
```bash
# Obter URL do serviço
SERVICE_URL=$(gcloud run services describe sales-intelligence-api \
  --platform managed \
  --region us-central1 \
  --project operaciones-br \
  --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"

# Testar endpoints
curl "$SERVICE_URL/health" | jq '.'
curl "$SERVICE_URL/api/weekly-agenda?seller=Alex" | jq '.total_deals'
curl "$SERVICE_URL/api/war-room" | jq '.week_info'
```

**Critério de Sucesso:**
- [ ] Deploy finalizado sem erros
- [ ] URL retorna status 200
- [ ] Endpoints funcionam corretamente
- [ ] Latência < 2s (95 percentil)

---

## 🎨 SPRINT 2: FRONTEND (3 dias)

### **DIA 4: Criar `pautasemanal.html`**

#### ✅ Tarefa 4.1: Estrutura Base
```bash
cd /workspaces/playbook/public

# Criar arquivo
touch pautasemanal.html
```

**Template Base:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pauta Semanal - Xertica.ai</title>
  <link rel="icon" type="image/png" href="https://storage.googleapis.com/etp-bucket/Logos%20Xertica.ai%20(.png)/X%20-%20simbolo/Copy%20of%20X_symbol_variation3_Blue_white.png">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
  
  <style>
    /* [Cole estilos do index.html - variáveis CSS, body, cards, etc] */
  </style>
</head>
<body>
  <!-- [Estrutura HTML conforme RESUMO_EXECUTIVO_ARQUITETURA.md] -->
  
  <script>
    const API_BASE = 'https://CLOUD_RUN_URL/api';  // Substituir
    
    async function loadPauta() {
      // [Implementar lógica de fetch]
    }
    
    function renderDeals(deals) {
      // [Implementar renderização]
    }
    
    // Inicializar
    loadPauta();
  </script>
</body>
</html>
```

**Validação:**
```bash
# Testar local
cd /workspaces/playbook/public
python -m http.server 8000 &

# Abrir no navegador
echo "Abrir: http://localhost:8000/pautasemanal.html"

# Parar servidor
pkill -f "http.server"
```

**Critério de Sucesso:**
- [ ] HTML carrega sem erros
- [ ] Estilos aplicados corretamente
- [ ] API fetch funciona (verificar Network tab do DevTools)
- [ ] Deals renderizados corretamente

---

### **DIA 5: Criar `apresentacao.html`**

#### ✅ Tarefa 5.1: Estrutura War Room
```bash
cd /workspaces/playbook/public

# Criar arquivo
touch apresentacao.html
```

**Componentes:**
- Header com metadados da semana
- Cards de resumo executivo
- Navegação lateral (vendedores)
- Painel de vendedor (hit list + insights)

**Validação:**
```bash
# Testar renderização
python -m http.server 8000 &
echo "Abrir: http://localhost:8000/apresentacao.html"
```

**Critério de Sucesso:**
- [ ] Dashboard estilo executivo carrega
- [ ] Navegação por vendedor funciona
- [ ] Notas A-F exibidas com cores
- [ ] Insights IA renderizados
- [ ] Perguntas de sabatina inline

---

### **DIA 6: Integrar no Dashboard Principal**

#### ✅ Tarefa 6.1: Modificar `index.html`
```bash
cd /workspaces/playbook/public

# Backup
cp index.html index.backup.$(date +%Y%m%d_%H%M%S).html
```

**Modificações:**

1. **Remover seção "Pauta Semanal" (linhas ~2075-2180):**
```javascript
// ANTES:
<!-- SEÇÃO 5: PAUTA SEMANAL -->
<div id="agenda" class="section">
  // [Todo o conteúdo]
</div>

// DEPOIS:
<!-- Seção removida - Migrada para pautasemanal.html -->
```

2. **Adicionar links no sidebar:**
```html
<!-- Adicionar após linha ~800 -->
<div class="menu-item" onclick="window.location.href='pautasemanal.html'" style="...">
  <svg class="icon"><use href="#icon-calendar"/></svg>
  Pauta Semanal
</div>

<div class="menu-item" onclick="window.location.href='apresentacao.html'" style="...">
  <svg class="icon"><use href="#icon-target"/></svg>
  Apresentação Semanal
</div>
```

3. **Remover função JavaScript `loadWeeklyAgenda()` (linhas ~5822-5950):**
```javascript
// ANTES:
function loadWeeklyAgenda(period = 'all') {
  // [Todo o código]
}

// DEPOIS:
// Função removida - Migrada para pautasemanal.html
```

**Validação:**
```bash
# Verificar se não quebrou o dashboard
python -m http.server 8000 &
echo "Abrir: http://localhost:8000/index.html"

# Clicar nos novos links do sidebar
# - Pauta Semanal → deve abrir pautasemanal.html
# - Apresentação Semanal → deve abrir apresentacao.html
```

**Critério de Sucesso:**
- [ ] Dashboard principal carrega sem erros
- [ ] Links novos funcionam
- [ ] Seção antiga removida
- [ ] Outras seções não afetadas

---

## 🚀 SPRINT 3: GO-LIVE (2 dias)

### **DIA 7: Testes Integrados**

#### ✅ Tarefa 7.1: Teste End-to-End
```bash
# Checklist de testes:

# 1. Backend
curl "CLOUD_RUN_URL/api/weekly-agenda?seller=Alex" | jq '.deals | length'  # Deve > 0
curl "CLOUD_RUN_URL/api/war-room" | jq '.sellers | length'  # Deve ~24

# 2. Frontend - Pauta Semanal
- [ ] Abrir pautasemanal.html
- [ ] Filtrar por vendedor específico
- [ ] Clicar "Sabatina" em um deal
- [ ] Verificar perguntas aparecem
- [ ] Verificar contexto RAG carrega

# 3. Frontend - War Room
- [ ] Abrir apresentacao.html
- [ ] Verificar metadados da semana (Q, Semana X/13)
- [ ] Clicar em vendedor na navegação lateral
- [ ] Verificar hit list carrega
- [ ] Verificar insights IA aparecem

# 4. Performance
- [ ] Latência API < 2s (usar DevTools Network tab)
- [ ] Frontend carrega < 1s
- [ ] Sem erros no console JavaScript
```

**Critério de Sucesso:**
- [ ] Todos os fluxos funcionam sem erros
- [ ] Performance dentro dos limites
- [ ] UI responsiva (mobile + desktop)

---

#### ✅ Tarefa 7.2: Ajustes de UX
```bash
# Com base em feedback de teste:

# 1. Ajustar prompts Gemini (se insights fracos)
# Editar: cloud-run/app/api/endpoints/war_room.py
# Função: generate_executive_insights()

# 2. Melhorar loading states
# Adicionar spinners durante fetch API

# 3. Tratamento de erros
# Adicionar mensagens amigáveis se API falhar
```

**Critério de Sucesso:**
- [ ] Insights IA relevantes (não genéricos)
- [ ] Loading states visíveis
- [ ] Erros tratados graciosamente

---

### **DIA 8: Deploy Produção + Treinamento**

#### ✅ Tarefa 8.1: Deploy Frontend (Firebase)
```bash
cd /workspaces/playbook

# Verificar firebase.json
cat firebase.json

# Deploy
firebase deploy --only hosting

# Verificar URL
echo "Dashboard: https://xertica-dashboard.web.app"
```

**Validação:**
```bash
# Testar em produção
curl https://xertica-dashboard.web.app/pautasemanal.html | grep "<title>"
curl https://xertica-dashboard.web.app/apresentacao.html | grep "<title>"
```

**Critério de Sucesso:**
- [ ] Deploy bem-sucedido
- [ ] URLs acessíveis
- [ ] HTML correto servido

---

#### ✅ Tarefa 8.2: Treinamento Usuários
**Agenda:** 30 min demo ao vivo

**Roteiro:**
1. **Intro (5 min):** Objetivo das novas funcionalidades
2. **Demo Pauta Semanal (10 min):**
   - Navegação por vendedores
   - Interpretação de Risco_Score
   - Uso das perguntas de sabatina
   - Contexto RAG histórico
3. **Demo War Room (10 min):**
   - Interpretação de Nota de Higiene A-F
   - Hit List de deals críticos
   - Insights IA e como usá-los
4. **Q&A (5 min)**

**Materiais:**
- [ ] Slides de apresentação
- [ ] Documento de FAQ
- [ ] Vídeo gravado (para referência)

---

#### ✅ Tarefa 8.3: Documentação Final
```bash
cd /workspaces/playbook

# Criar README de uso
cat > GUIA_USO_PAUTA_WAR_ROOM.md <<'EOF'
# Guia de Uso: Pauta Semanal + Apresentação Semanal

## Pauta Semanal
**URL:** https://xertica-dashboard.web.app/pautasemanal.html

**Quando usar:** Preparação semanal de 1:1s com vendedores

**Como usar:**
1. Filtrar por vendedor
2. Revisar deals críticos (risco 4-5)
3. Ler perguntas de sabatina
4. Ver contexto RAG (deals similares históricos)
5. Anotar follow-ups

## Apresentação Semanal (War Room)
**URL:** https://xertica-dashboard.web.app/apresentacao.html

**Quando usar:** Reunião semanal de forecast com liderança

**Como usar:**
1. Revisar metadados (Quarter, Semana X/13)
2. Analisar resumo executivo (Fechado vs. Pipeline)
3. Navegar por vendedor (notas A-F)
4. Revisar Hit List de deals críticos
5. Ler insights IA (pontos de atenção, ações)

EOF
```

**Critério de Sucesso:**
- [ ] Documentação clara e objetiva
- [ ] FAQ cobre dúvidas comuns
- [ ] Vídeo tutorial disponível

---

## 📊 MÉTRICAS DE SUCESSO (Pós-Go-Live)

### **Semana 1:**
- [ ] 50% dos gerentes acessaram Pauta Semanal
- [ ] Feedback inicial coletado
- [ ] Zero bugs críticos

### **Semana 2:**
- [ ] 80% dos gerentes usam Pauta Semanal
- [ ] War Room vira ritual oficial (1x por semana)
- [ ] Pelo menos 5 deals zumbis limpos

### **Mês 1:**
- [ ] 100% adoção de Pauta Semanal
- [ ] War Room usado em todas as revisões
- [ ] 20+ deals zumbis identificados e resolvidos
- [ ] Tempo de preparação de pauta reduzido de 2h → 15 min

---

## 🐛 TROUBLESHOOTING

### **Problema: VIEW não retorna dados**
```bash
# Verificar se tabelas fonte têm dados
bq query --use_legacy_sql=false "SELECT COUNT(*) FROM \`operaciones-br.sales_intelligence.pipeline\`"

# Verificar erros na VIEW
bq show --view operaciones-br:sales_intelligence.pauta_semanal_enriquecida
```

### **Problema: API retorna 500**
```bash
# Verificar logs Cloud Run
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sales-intelligence-api" --limit 50 --format json

# Verificar variáveis de ambiente
gcloud run services describe sales-intelligence-api --region us-central1 --format yaml | grep env -A 10
```

### **Problema: Frontend não carrega dados**
```bash
# Verificar CORS
curl -I "CLOUD_RUN_URL/api/weekly-agenda"

# Deve ter header:
# Access-Control-Allow-Origin: *

# Verificar no DevTools Console do navegador
# - Erros de CORS
# - Erros de JSON parse
```

### **Problema: RAG não retorna similaridade**
```bash
# Verificar embeddings
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as total, 
   COUNT(DISTINCT deal_id) as unique_deals,
   AVG(ARRAY_LENGTH(embedding)) as avg_emb_size
   FROM \`operaciones-br.sales_intelligence.deal_embeddings\`"

# Deve ter ~2848 deals com embeddings de 768 dimensões
```

---

## 📞 CONTATOS DE SUPORTE

- **Tech Lead:** [Nome] - [email]
- **Product Owner:** [Nome] - [email]
- **DevOps:** [Nome] - [email]
- **Slack:** #sales-intelligence-support

---

## 📅 CRONOGRAMA RESUMIDO

| Sprint | Dias | Entregas |
|--------|------|----------|
| **Sprint 1** | 1-3 | Backend (VIEWs + Endpoints + Deploy) |
| **Sprint 2** | 4-6 | Frontend (HTMLs + Integração) |
| **Sprint 3** | 7-8 | Testes + Go-Live + Treinamento |

**Kickoff:** [Data]  
**Go-Live:** [Data] (8 dias úteis após kickoff)  
**Revisão Pós-Go-Live:** [Data] (+2 semanas)

---

**Status:** 🟢 Pronto para começar  
**Próximo Passo:** Executar Tarefa 1.1 (Criar VIEW `pauta_semanal_enriquecida`)
