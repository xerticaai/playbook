# 📋 RESUMO EXECUTIVO: ARQUITETURA PAUTA SEMANAL + WAR ROOM

## 🎯 O QUE ESTAMOS CONSTRUINDO?

Duas novas funcionalidades integradas ao Sales Intelligence Dashboard:

### 1️⃣ **PAUTA SEMANAL** (Refatorada)
**Antes:** Frontend-only, sem contexto histórico, sem perguntas estruturadas  
**Depois:** Backend-powered com RAG, perguntas de sabatina IA, contexto de deals similares

### 2️⃣ **APRESENTAÇÃO SEMANAL / WAR ROOM** (Nova)
**Objetivo:** Dashboard executivo "Verdade Nua e Crua" para revisão semanal de forecast  
**Estilo:** Métricas de higiene (notas A-F), hit list de deals críticos, perguntas difíceis

---

## 🏗️ STACK TECNOLÓGICO

```
┌─────────────────────────────────────────────────────────────┐
│                      👤 USUÁRIO                              │
│                  (Sales Manager / VP)                        │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🎨 FRONTEND (HTML + Vanilla JS)                 │
├─────────────────────────────────────────────────────────────┤
│  • pautasemanal.html     → Timeline + Sabatina               │
│  • apresentacao.html     → War Room Dashboard                │
│  • index.html (modified) → Remove seção + Add links          │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           🛰️ BACKEND (Cloud Run - FastAPI)                  │
├─────────────────────────────────────────────────────────────┤
│  • GET /api/weekly-agenda → Pauta enriquecida + RAG         │
│  • GET /api/war-room      → Métricas + Insights IA          │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              🗄️ BIGQUERY (operaciones-br)                   │
├─────────────────────────────────────────────────────────────┤
│  TABELAS:                                                    │
│  • pipeline                    ~400 deals ativos             │
│  • closed_deals_won/lost       ~2400 histórico              │
│  • deal_embeddings (RAG) 🔥    2848 deals + vectors 768d    │
│  • sales_specialist            Camada Sales Ops             │
│                                                              │
│  VIEWs:                                                      │
│  • pauta_semanal_enriquecida   Pipeline + ML + Risco        │
│  • war_room_metrics            Higiene por vendedor         │
└─────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 🤖 IA SERVICES                               │
├─────────────────────────────────────────────────────────────┤
│  • Vertex AI text-embedding-004  → Vector Search            │
│  • Gemini 1.5 Flash              → Insights + Perguntas     │
│  • BigQuery ML Models            → Priorização              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔥 DIFERENCIAL: COMO O RAG FUNCIONA?

### **Tabela `deal_embeddings` (RAG Unificado)**

**Conteúdo:** 2848 deals (pipeline + ganhos + perdas)  
**Embedding:** 768 dimensões (Vertex AI text-embedding-004)  
**Campo `content` (exemplo):**

```
Deal GANHO: Oportunidade X | Cliente: Y | Vendedor: Alex | 
Valor: R$ 500k | Ciclo: 45 dias | 
Fatores de Sucesso: Urgência fiscal, POC bem-sucedido | 
Causa Raiz: Budget aprovado Q4 | 
Lições: Follow-up semanal com C-level manteve deal vivo
```

### **Uso Prático:**

1. **Deal atual está parado há 60 dias sem atividade**
2. **RAG busca:** "Deals similares deste vendedor com mesmo perfil"
3. **Resultado:**
   ```json
   [
     {
       "source": "won",
       "Oportunidade": "Deal Similar",
       "Gross": 450000,
       "content": "...POC técnico foi decisivo...",
       "similarity": 0.87
     },
     {
       "source": "lost",
       "Oportunidade": "Deal Perdido",
       "Gross": 520000,
       "content": "...perdido após 90 dias sem atividade...",
       "similarity": 0.82
     }
   ]
   ```
4. **IA gera insight:**
   > "⚠️ Histórico mostra que após 90 dias sem atividade, taxa de conversão cai 60%. Recomendação: Agendar POC técnico esta semana ou considerar encerrar deal."

---

## 📊 COMPONENTES DA ARQUITETURA

### **CAMADA 1: BigQuery (Views Inteligentes)**

#### **VIEW 1: `pauta_semanal_enriquecida`**
**Combina:**
- `pipeline` (deals ativos)
- `sales_specialist` (análise Sales Ops)
- `ml_prioridade_deal_v2` (score ML)
- `ml_proxima_acao_v2` (ação sugerida)

**Calcula:**
- **Risco_Score (0-5):** Soma de flags negativas
  - Atividades == 0: +1
  - Dias_Funil > 90: +1
  - Território == 'Incorreto': +1
  - Confiana < 30: +1
  - Desalinhamento Especialista vs. SF: +1
- **Categoria_Pauta:** CRITICO | ALTA_PRIORIDADE | ZUMBI | MONITORAR
- **Semana_Quarter:** Semana atual dentro do quarter (1-13)

**Output:** Apenas deals relevantes (conf >= 40% ou ZUMBI)

---

#### **VIEW 2: `war_room_metrics`**
**Métricas por Vendedor:**
- **Pipeline_Gross:** Valor total em pipeline
- **Closed_Gross:** Valor fechado no Q atual
- **Total_Forecast:** Pipeline + Closed
- **Percent_Pipeline_Podre:** % de deals com problemas (atividade 0, território errado)
- **Deals_Zumbi:** Deals >90 dias sem atividade
- **Nota_Higiene (A-F):**
  - A: ≤10% pipeline podre
  - B: 11-20%
  - C: 21-35%
  - D: 36-50%
  - F: >50%

**Output:** Ranking de vendedores por forecast + qualidade

---

### **CAMADA 2: Backend FastAPI (Lógica de Negócio)**

#### **ENDPOINT 1: `GET /api/weekly-agenda`**
**Parâmetros:**
- `?seller=Alex` (opcional, suporta múltiplos: `Alex,Carlos`)
- `?week_offset=0` (0=atual, 1=próxima, -1=anterior)

**Processamento:**
1. Query VIEW `pauta_semanal_enriquecida`
2. Para cada deal:
   - **Busca RAG:** 5 deals similares históricos (won/lost) deste vendedor
   - **Gera Perguntas:** Baseado em flags de risco
3. Retorna JSON enriquecido

**Response Example:**
```json
{
  "total_deals": 12,
  "deals": [
    {
      "Oportunidade": "Deal X",
      "Vendedor": "Alex",
      "Gross": 500000,
      "Risco_Score": 4,
      "Categoria_Pauta": "CRITICO",
      "similar_deals": [
        {
          "source": "won",
          "Oportunidade": "Deal Similar",
          "content": "...POC técnico foi decisivo...",
          "similarity": 0.87
        }
      ],
      "sabatina_questions": [
        "❌ Este deal está abandonado? Qual é a data da próxima reunião agendada?",
        "💰 Como garantimos fechamento sem orçamento confirmado?"
      ]
    }
  ]
}
```

---

#### **ENDPOINT 2: `GET /api/war-room`**
**Parâmetros:** Nenhum (sempre retorna Q atual)

**Processamento:**
1. Calcula resumo executivo (Closed vs. Pipeline)
2. Query VIEW `war_room_metrics` (todos vendedores)
3. Query top 20 deals críticos (`pauta_semanal_enriquecida`)
4. Para cada deal: gera perguntas + tags de risco
5. **Chama Gemini:** Gera insights executivos (3 pontos de atenção, 2 vitórias, 3 ações)

**Response Example:**
```json
{
  "week_info": {
    "fiscal_q": "FY26-Q1",
    "week_in_quarter": 6,
    "total_weeks_in_quarter": 13,
    "current_date": "2026-02-08"
  },
  "executive_summary": {
    "Closed_Gross": 2500000,
    "Pipeline_Gross": 5000000,
    "Total_Zumbis": 15,
    "Closed_Deals": 45,
    "Pipeline_Deals": 120
  },
  "sellers": [
    {
      "Vendedor": "Alex",
      "Total_Forecast": 1200000,
      "Nota_Higiene": "B",
      "Percent_Pipeline_Podre": 15,
      "Deals_Zumbi": 2
    }
  ],
  "hit_list": [
    {
      "Oportunidade": "Deal Crítico",
      "Vendedor": "Alex",
      "Gross": 500000,
      "Risco_Score": 5,
      "risk_tags": ["💀 ZUMBI", "🔴 RISCO ALTO"],
      "sabatina_questions": [...]
    }
  ],
  "ai_insights": {
    "raw_text": "PONTOS DE ATENÇÃO:\n1. 15 deals zumbis representam R$2.5M em risco...",
    "top_sellers": [...],
    "critical_deals": [...]
  }
}
```

---

### **CAMADA 3: Frontend (UX/UI)**

#### **ARQUIVO 1: `/public/pautasemanal.html`**
**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  📅 PAUTA SEMANAL - OPORTUNIDADES CRÍTICAS              │
├──────────────────────────────────────────────────────────┤
│  [Filtros]  Q1 2026  |  Alex ▼  |  Esta Semana ▼        │
├──────────────────────────────────────────────────────────┤
│  [Cards Resumo]                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Críticos │ │Alta Pri │ │Ações    │ │Vendores │       │
│  │   12    │ │   34    │ │Pendentes│ │Ativos   │       │
│  │R$ 5.2M  │ │R$ 8.1M  │ │   46    │ │   18    │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
├──────────────────────────────────────────────────────────┤
│  🧑 ALEX ARAUJO  |  12 deals  |  R$ 1.5M  | 65% conf    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔴 Deal X · R$ 500k · 4/5 risco · [ZUMBI] [SEM_AT]│  │
│  │   Conta: Cliente Y  |  Fase: Negociação           │  │
│  │   📊 Contexto RAG: 3 deals similares encontrados   │  │
│  │   [▼ Ver Contexto]  [🎯 Sabatina]                 │  │
│  │                                                     │  │
│  │   💬 PERGUNTAS SABATINA:                           │  │
│  │   ❌ Este deal está abandonado? Data próxima       │  │
│  │      reunião?                                      │  │
│  │   💰 Como garantimos fechamento sem orçamento?     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Acordeão por vendedor (expansível)
- Badge de risco (0-5, cores: verde → vermelho)
- Tags visuais (ZUMBI, CRÍTICO, SEM_ATIVIDADE)
- Botão "Sabatina" expande perguntas inline
- Seção "Contexto RAG" mostra deals similares históricos

---

#### **ARQUIVO 2: `/public/apresentacao.html`**
**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  🎯 WAR ROOM - REVISÃO SEMANAL FY26-Q1 SEMANA 6/13      │
├──────────────────────────────────────────────────────────┤
│  [Resumo Executivo]                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Q Fechado│ │Pipeline │ │Risco    │ │Zumbis   │       │
│  │R$ 2.5M  │ │R$ 5.0M  │ │Ponderado│ │   15    │       │
│  │45 deals │ │120 deals│ │R$ 800k  │ │R$ 1.2M  │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
├──────────────────────────────────────────────────────────┤
│  [Nav Lateral]        [Painel Vendedor]                  │
│  ┌──────────┐         ┌──────────────────────────────┐  │
│  │Alex   [A]│         │ 🧑 ALEX ARAUJO               │  │
│  │Carlos [B]│         │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  │
│  │Maria  [F]│ ◀────▶  │ NOTA HIGIENE: B (15% podre)  │  │
│  │...       │         │ Forecast: R$ 1.2M            │  │
│  └──────────┘         │ Zumbis: 2 deals              │  │
│                       │                              │  │
│                       │ 📋 HIT LIST (Top 10):        │  │
│                       │ ┌──────────────────────────┐ │  │
│                       │ │Conta │Deal │Valor│Risco │ │  │
│                       │ │─────────────────────────│ │  │
│                       │ │Y    │X   │500k│🔴5/5│PP│ │  │
│                       │ │     │    │    │[ZUMBI]│ │  │
│                       │ │❌ Este deal abandonado? │ │  │
│                       │ │💰 Sem orçamento, como   │ │  │
│                       │ │   fechar?               │ │  │
│                       │ └──────────────────────────┘ │  │
│                       └──────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  🤖 INSIGHTS IA (Gemini)                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  PONTOS DE ATENÇÃO:                                       │
│  1. 15 deals zumbis = R$2.5M em risco (20% do pipeline)  │
│  2. 3 vendedores com nota F - urgente revisar território │
│  3. Pipeline Q1 abaixo da meta em 30% - acelerar prosp  │
│                                                           │
│  VITÓRIAS DA SEMANA:                                      │
│  1. Alex fechou R$500k com ciclo recorde de 28 dias      │
│  2. Carlos recuperou deal zumbi após POC técnico          │
│                                                           │
│  AÇÕES IMEDIATAS:                                         │
│  1. Limpar 15 deals zumbis até sexta (kill or commit)    │
│  2. Realocar 8 deals de território incorreto              │
│  3. Maria precisa coaching urgente (3 perdas seguidas)    │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Dashboard estilo executivo (cores de alerta)
- Navegação lateral por vendedor (click to expand)
- Tabela "Hit List" com perguntas inline
- Notas de Higiene A-F com cores (verde=A, vermelho=F)
- Painel de insights IA (Gemini)
- Deals com risco ≥4 em vermelho
- Zumbis com opacidade reduzida (cinza)

---

## 🔗 FLUXO DE DADOS (Sequência de Chamadas)

### **User Story: Gerente prepara Pauta Semanal**

```
1. User clica "Pauta Semanal" no sidebar
   ↓
2. Frontend carrega pautasemanal.html
   ↓
3. JavaScript chama: GET /api/weekly-agenda?seller=Alex&week_offset=0
   ↓
4. Backend:
   ├─ Query BigQuery VIEW pauta_semanal_enriquecida
   ├─ Para cada deal:
   │  ├─ Busca RAG (5 deals similares históricos)
   │  └─ Gera perguntas de sabatina (regras de negócio)
   └─ Retorna JSON enriquecido
   ↓
5. Frontend renderiza:
   ├─ Cards de resumo (críticos, alta prioridade, ações)
   ├─ Acordeão por vendedor
   ├─ Badges de risco (cor por score)
   ├─ Seção "Contexto RAG" (deals similares)
   └─ Botão "Sabatina" (expande perguntas)
   ↓
6. User clica "Sabatina" em Deal X
   ↓
7. Frontend expande seção com perguntas:
   "❌ Este deal está abandonado? Data próxima reunião?"
   "💰 Como garantimos fechamento sem orçamento confirmado?"
   ↓
8. User anota perguntas para reunião 1:1 com vendedor
```

---

## 💰 ESTIMATIVA DE CUSTOS

| Componente | Uso Mensal | Custo/Mês |
|------------|-----------|-----------|
| **BigQuery:** Queries VIEWs | ~50 GB processados | $2.50 |
| **BigQuery:** Armazenamento deal_embeddings | ~5 GB (2848 deals × 768d) | $0.10 |
| **Vertex AI:** Text Embeddings (RAG queries) | ~1000 queries | $0.02 |
| **Gemini 1.5 Flash:** Insights generation | ~2000 requests (50/dia) | $1.00 |
| **Cloud Run:** API hosting | ~10k requests/dia | $5.00 |
| **Cloud Storage/Firebase:** Frontend hosting | Estático | $0.10 |
| **TOTAL** | - | **~$9/mês** |

**ROI:**
- Tempo economizado Sales Ops: ~7h/semana
- @ R$50/h = **R$350/semana = R$1400/mês**
- **Payback:** < 1 semana 🎉

---

## ⚡ PRÓXIMOS PASSOS (EXECUÇÃO)

### **Sprint 1: Backend (2-3 dias)**
```bash
# 1. Criar VIEWs BigQuery
cd /workspaces/playbook/bigquery
bq query --use_legacy_sql=false < create_view_pauta_semanal.sql
bq query --use_legacy_sql=false < create_view_war_room_metrics.sql

# 2. Implementar endpoints
cd /workspaces/playbook/cloud-run/app/api/endpoints
# Criar: weekly_agenda.py, war_room.py

# 3. Registrar routers
# Editar: /cloud-run/app/simple_api.py

# 4. Testar local
cd /workspaces/playbook/cloud-run
uvicorn app.simple_api:app --reload --port 8080

# 5. Deploy Cloud Run
gcloud run deploy sales-intelligence-api \
  --source . \
  --project operaciones-br \
  --region us-central1
```

### **Sprint 2: Frontend (2-3 dias)**
```bash
# 1. Criar novos HTMLs
cd /workspaces/playbook/public
# Criar: pautasemanal.html, apresentacao.html

# 2. Modificar index.html
# - Remover seção "Pauta Semanal" (linhas 2075-2180)
# - Adicionar links no sidebar

# 3. Testar integração com API
# Verificar: CORS, JSON parsing, loading states

# 4. Deploy frontend
firebase deploy --only hosting
```

### **Sprint 3: Go-Live (1 dia)**
```bash
# 1. Treinamento usuários (30 min demo)
# 2. Coleta de feedback
# 3. Ajustes finais (prompts Gemini, UX)
# 4. Documentação final
```

---

## 🎯 CRITÉRIOS DE SUCESSO

### **1. Funcionalidade (Must-Have)**
- [ ] `/api/weekly-agenda` retorna deals enriquecidos com RAG
- [ ] `/api/war-room` gera insights com Gemini
- [ ] Frontend renderiza corretamente (desktop + mobile)
- [ ] Perguntas de sabatina aparecem por deal
- [ ] Notas de Higiene A-F são calculadas

### **2. Performance**
- [ ] API responde em < 2s (95 percentil)
- [ ] BigQuery queries < $0.10/dia
- [ ] Frontend carrega em < 1s

### **3. Adoção**
- [ ] 80% dos gerentes usam pauta semanal (semana 2)
- [ ] War Room vira ritual semanal oficial (semana 4)
- [ ] Pelo menos 10 deals zumbis limpos/mês

---

## 📚 DOCUMENTAÇÃO TÉCNICA

### **Arquivos Criados:**
- [x] `/workspaces/playbook/ARQUITETURA_PAUTA_WAR_ROOM.md` (este arquivo)
- [ ] `/workspaces/playbook/bigquery/create_view_pauta_semanal.sql`
- [ ] `/workspaces/playbook/bigquery/create_view_war_room_metrics.sql`
- [ ] `/workspaces/playbook/cloud-run/app/api/endpoints/weekly_agenda.py`
- [ ] `/workspaces/playbook/cloud-run/app/api/endpoints/war_room.py`
- [ ] `/workspaces/playbook/public/pautasemanal.html`
- [ ] `/workspaces/playbook/public/apresentacao.html`

### **Referências:**
- RAG Setup: [bigquery/setup_rag_embeddings.sql](bigquery/setup_rag_embeddings.sql)
- API Existente: [cloud-run/app/api/endpoints/insights_rag.py](cloud-run/app/api/endpoints/insights_rag.py)
- Frontend Atual: [public/index.html](public/index.html)

---

## 🚦 STATUS: ✅ ARQUITETURA APROVADA

**Decisão:** GO para execução  
**Owner:** Time de Sales Ops + Dev  
**Timeline:** 6-8 dias úteis  
**Kickoff:** Sprint 1 pode começar imediatamente  

---

**Última atualização:** 2026-02-08  
**Arquiteto:** Claude Sonnet 4.5 (GitHub Copilot)  
**Reviewer:** Xertica.ai Sales Intelligence Team
