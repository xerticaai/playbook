# Backend Inventory — Sales Intelligence API
> Vistoria realizada em 23/02/2026  
> Base: `cloud-run/` — FastAPI · Cloud Run · BigQuery · Gemini

---

## Visão Geral da Arquitetura

```
cloud-run/
├── Dockerfile
├── requirements.txt
├── cloudbuild.yaml
└── app/
    ├── simple_api.py          ← Aplicação principal (2059 linhas)
    └── api/
        ├── llm_client.py      ← Wrapper Gemini (145 linhas)
        ├── endpoints/
        │   ├── ai_analysis.py      (162 linhas)
        │   ├── export.py           (122 linhas)
        │   ├── insights_rag.py     (599 linhas)
        │   ├── ml_predictions.py   (496 linhas)
        │   ├── performance.py      (1047 linhas)
        │   └── weekly_agenda.py    (1927 linhas)
        └── rag/
            ├── filters.py      (156 linhas)
            ├── insight_generator.py (290 linhas)
            ├── metrics.py      (49 linhas)
            ├── ranker.py       (82 linhas)
            ├── retriever.py    (61 linhas)
            └── stats.py        (86 linhas)
```

**Total backend:** ~7.056 linhas Python

---

## Stack Técnica

| Componente | Tecnologia | Versão/Detalhe |
|---|---|---|
| Framework | FastAPI | 2.5.0 (internal version) |
| Hospedagem | Google Cloud Run | Serverless, auto-scale |
| Banco de dados | Google BigQuery | Projeto: `operaciones-br` Dataset: `sales_intelligence` |
| AI/LLM | Google Gemini | Via `google.generativeai` — key em env `GEMINI_API_KEY` |
| Cache | In-memory dict | TTL 120s por instância (não compartilhado entre réplicas) |
| Auth | Headers IAP / x-goog-authenticated-user-email | Sem middleware de validação Token |
| Static files | Firebase Hosting | Frontend servido separadamente — Cloud Run só expõe `/api/**` |

---

## Tabelas BigQuery

| Tabela | Uso |
|---|---|
| `sales_intelligence.pipeline` | Deals ativos — pipeline e forecast |
| `sales_intelligence.closed_deals_won` | Deals ganhos (histórico) |
| `sales_intelligence.closed_deals_lost` | Deals perdidos (histórico) |
| `sales_intelligence.sales_specialist_deals` | Curadoria manual Sales Specialist |
| `sales_intelligence.vacations` | Férias e ausências dos vendedores |

---

## Mapa Completo de Endpoints

### `simple_api.py` — Endpoints Principais

| Método | Path | Parâmetros de Filtro | Cache | Frontend Caller |
|---|---|---|---|---|
| GET | `/health` | — | ❌ | — |
| GET | `/` | — | ❌ | — |
| GET | `/dashboard` | — | ❌ | — |
| GET | `/api/user-context` | — | ❌ | `admin.js` (fallback auth) |
| GET | `/api/sellers` | `nocache` | ✅ 120s | `vendedores.js` |
| GET | `/api/metrics` | `year, quarter, month, seller, phase, owner_preventa, billing_city, billing_state, vertical_ia, sub_vertical_ia, sub_sub_vertical_ia, subsegmento_mercado, segmento_consolidado, portfolio_fdm, nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/pipeline` | `limit(500), year, quarter, month, seller, phase, owner_preventa, billing_city, billing_state, vertical_ia, sub_vertical_ia, sub_sub_vertical_ia, subsegmento_mercado, segmento_consolidado, portfolio_fdm, nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/filter-options` | `seller, year, quarter` | ✅ 120s | ⚠️ **Nunca chamado pelo frontend** |
| GET | `/api/closed/won` | `limit(5000), year, quarter, month, seller, nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/closed/lost` | `limit(5000), year, quarter, month, seller, nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/actions` | `urgencia(ALTA), limit(50), seller, nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/sales-specialist` | `nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/priorities` | `limit(100), nocache` | ✅ 120s | `api-dados.js` |
| GET | `/api/analyze-patterns` | `year, quarter, month, seller` | ✅ 120s | `api-dados.js` |
| GET | `/api/dashboard` | `year, quarter, month, seller` | ✅ 120s | ⚠️ **Nunca chamado diretamente** (obsoleto?) |

### `performance.py` — Performance + Admin Vacations

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| GET | `/api/admin/vacations` | `year, quarter` | ❌ | `admin.js` |
| POST | `/api/admin/vacations` | `body: {seller, start_date, end_date, notes}` | ❌ | `admin.js` |
| DELETE | `/api/admin/vacations/{vacation_id}` | `vacation_id` (path) | ❌ | `admin.js` |
| GET | `/api/performance` | `year, quarter, month, seller, nocache` | ❌ | `performance-fsr.js` |
| GET | `/api/performance/seller/{seller_name}` | `seller_name` (path), `year, quarter` | ❌ | `detalhes-vendedor.js` |
| GET | `/api/seller-timeline/{seller_name}` | `seller_name` (path), `year, quarter` | ❌ | `detalhes-vendedor.js` |
| GET | `/api/seller-deals/{seller_name}` | `seller_name` (path), `year, quarter` | ❌ | `detalhes-vendedor.js` |

### `weekly_agenda.py` — Agenda Semanal

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| GET | `/api/weekly-agenda` | `week_start, seller, year, quarter` | ❌ | `agenda-semanal-weekly.js` |

### `insights_rag.py` — RAG Insights

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| GET | `/api/rag/insights` | `seller, year, quarter, limit` | ✅ | Desabilitado no frontend (`Promise.resolve('disabled')`) |
| GET | `/api/rag/insights/{deal_id}` | `deal_id` (path) | ✅ | Não chamado |
| GET | `/api/rag/similar/{deal_id}` | `deal_id` (path) | ✅ | Não chamado |

### `ai_analysis.py` — Análise de Deals com AI

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| POST | `/api/ai-analysis` | `body: DealAnalysisRequest` | ❌ | Não identificado |

### `ml_predictions.py` — Predições ML

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| POST | `/api/ml/predictions` | `body: MLPredictionsRequest` | ❌ | `ml.js` |

### `export.py` — Exportação

| Método | Path | Parâmetros | Cache | Frontend Caller |
|---|---|---|---|---|
| GET | `/api/export/...` | (a confirmar) | ❌ | Não identificado diretamente |

---

## Cross-Reference: Frontend → Backend

### `api-dados.js` — `loadDashboardData()` chama 12 endpoints em paralelo:

```
Promise.all([
  GET /api/metrics          ← KPIs consolidados (win rate, totais, avg cycle days)
  GET /api/pipeline         ← Deals ativos (limit=500) → window.pipelineDataRaw
  GET /api/priorities       ← Oportunidades prioritárias (limit=100)
  GET /api/actions          ← Ações urgentes (urgencia=ALTA, limit=50)
  GET /api/closed/won       ← Deals ganhos (limit=5000) → window.wonAgg
  GET /api/closed/lost      ← Deals perdidos (limit=5000) → window.lostAgg
  GET /api/analyze-patterns ← Padrões win/loss (Gemini-powered)
  GET /api/sales-specialist ← Curadoria manual Sales Specialist
  Promise.resolve('disabled') ← RAG desabilitado
  GET /api/pipeline         ← Fallback sem filtro (quando filtrado) → Top Opps unfiltered
  GET /api/closed/won       ← Fallback won
  GET /api/closed/lost      ← Fallback lost
])
```

**Observação:** Quando filtros estão ativos, os itens 1–8 são chamados COM filtros, e os itens 10–12 são chamados SEM filtros para alimentar o painel "Top Oportunidades" que deve sempre mostrar o universo completo. Isso resulta em até **15 chamadas HTTP simultâneas** na carga inicial com filtros.

### Outros scripts:

| Script Frontend | Endpoint Backend |
|---|---|
| `vendedores.js` | `GET /api/sellers` |
| `admin.js` | `GET/POST/DELETE /api/admin/vacations`, `GET /api/user-context` |
| `performance-fsr.js` | `GET /api/performance` |
| `performance-integration.js` | `GET /api/performance` (integração) |
| `detalhes-vendedor.js` | `GET /api/performance/seller/{name}`, `GET /api/seller-timeline/{name}`, `GET /api/seller-deals/{name}` |
| `agenda-semanal-weekly.js` | `GET /api/weekly-agenda` |
| `ml.js` | `POST /api/ml/predictions` |
| `aprendizados.js` | Provavelmente BigQuery direto via endpoint não mapeado |

---

## Endpoints Existentes mas NÃO Usados pelo Frontend

| Endpoint | Problema |
|---|---|
| `GET /api/filter-options` | Retorna opções dinâmicas de filtro, mas frontend usa filtros estáticos/vazios |
| `GET /api/dashboard` | Endpoint agregado completo (sim_api.py L1596) — pode ser uma versão descontinuada do loadDashboardData |
| `GET /api/rag/insights` | RAG desabilitado no frontend com `Promise.resolve('disabled')` |
| `POST /api/ai-analysis` | Não identificado chamador no frontend atual |

---

## Análise de Segurança

| Item | Status | Risco |
|---|---|---|
| CORS `allow_origins=["*"]` + `allow_credentials=True` | ❌ Inválido por spec | Médio — requests credenciados podem ser rejeitados por browsers |
| Autenticação nos endpoints `/api/*` | ⚠️ Somente via Cloud IAP (se configurado) | Alto — dados comerciais sensíveis expostos sem token validation |
| Firebase API key hardcoded em `autenticacao.js` | ⚠️ Visível no código público | Baixo (Firebase keys são públicas por design, mas devem ser restritas no console) |
| `GEMINI_API_KEY` via env var | ✅ Correto | — |
| `FORCED_ACTIVE_SELLERS` hardcoded no código | 🟡 Code smell | Baixo |
| SQL queries com `sql_literal()` / `sql_literal` escaping | ✅ Presente | — |
| Dados de vendedores/deals acessíveis sem login | ⚠️ Sem middleware token | Alto |

---

## Performance e Cache

### Dois níveis de cache independentes:

```
Frontend: localStorage (api-dados.js)
  ├─ clearDataCache() limpa o cache
  ├─ Chave: URL completa do endpoint
  └─ TTL: ~5 minutos (hardcoded)

Backend: In-memory dict (simple_api.py)
  ├─ Invalidação: TTL expira
  ├─ Chave: endpoint + query params sorted
  └─ TTL: 120 segundos (CACHE_TTL_SECONDS env var)
         Não compartilhado entre instâncias Cloud Run
```

**Problema:** Com dois níveis de cache independentes, o frontend pode estar mostrando dados com até 7 minutos de diferença do BigQuery. Quando o usuário clica "Atualizar Dashboard", somente o cache do frontend é limpo — o backend ainda servirá o cache de 120s.

**Solução:** O frontend deve enviar `?nocache=true` na chamada de refresh, que é suportado por todos os endpoints.

### Configuração atual:
```
CACHE_TTL_SECONDS = 120   (2 minutos — via env var CACHE_TTL_SECONDS)
BigQuery refresh: dados atualizados pelo AppScript sincronização BigQuery
```

---

## Variáveis de Ambiente Requeridas

| Variável | Obrigatório | Default | Descrição |
|---|---|---|---|
| `GCP_PROJECT` | ✅ | `operaciones-br` | ID do projeto GCP |
| `BQ_DATASET` | ✅ | `sales_intelligence` | Dataset BigQuery |
| `GEMINI_API_KEY` | ❌ | None | Análise de padrões com Gemini — se ausente, `/api/analyze-patterns` retorna dados vazios |
| `CACHE_TTL_SECONDS` | ❌ | `120` | TTL do cache in-memory |

---

## Funções Utilitárias Duplicadas (DRY Violations)

As seguintes funções estão implementadas de forma independente em múltiplos arquivos:

| Função | `simple_api.py` | `performance.py` | `weekly_agenda.py` | Observação |
|---|---|---|---|---|
| `get_bq_client()` | ✅ L138 | ✅ L33 | ✅ L250 | 3 cópias idênticas |
| `normalize_quarter()` / `_normalize_quarter()` | ✅ | ✅ | — | Lógica potencialmente divergente |
| `normalize_email()` / `_normalize_email()` | ✅ L116 | ✅ L51 | — | 2 cópias |
| `extract_request_email()` | ✅ L125 | ✅ L60 | — | 2 cópias |
| `build_seller_filter()` | ✅ L298 | ✅ L97 | — | 2 cópias |
| `build_fiscal_filter()` | ✅ inline | ✅ L88 | ✅ inline | 3 implementações da lógica fiscal |
| `fiscal_quarter_from_date()` | — | ✅ L313 | ✅ L313 | Mesma função, 2 arquivos |

**Recomendação:** Criar `app/api/utils.py` como módulo compartilhado e importar em todos os endpoints.

---

## Estrutura da Resposta dos Endpoints Principais

### `GET /api/sellers` → `vendedores.js`
```json
{
  "active": [
    { "Vendedor": "Nome Vendedor", "deals_pipeline": 5, "deals_won": 12, "deals_lost": 3, "total_net": 450000.0 }
  ],
  "historical": [ ... ],
  "total": 15
}
```

### `GET /api/metrics` → `api-dados.js` → `window.currentApiMetrics`
```json
{
  "pipeline_total": 123,
  "pipeline_filtered": { "deals_count": 45, "gross": 1234567, "net": 987654 },
  "high_confidence": { "deals_count": 12, "gross": 500000, "net": 400000, "avg_confidence": 0.78 },
  "closed_won": { "deals_count": 34, "gross": 890000, "net": 712000, "avg_cycle_days": 45 },
  "closed_lost": { "deals_count": 18, "gross": 340000, "net": 0, "avg_cycle_days": 67 },
  "win_rate": 0.654
}
```

### `GET /api/performance` → `performance-fsr.js`
```json
{
  "sellers": [
    {
      "name": "Nome Vendedor",
      "pipeline_deals": 8,
      "pipeline_gross": 450000,
      "won_deals": 3,
      "lost_deals": 1,
      "win_rate": 0.75,
      "avg_cycle_days": 42,
      "capacity": 0.85,
      "consistency_score": 72,
      "activities_total": 145
    }
  ],
  "period": { "year": 2026, "quarter": "Q1" }
}
```

---

## Módulo RAG — Estado Atual

O sistema RAG (Retrieval-Augmented Generation) está **implementado mas desabilitado** no frontend:

```js
// api-dados.js — linha ~95
const insightsRagPromise = Promise.resolve('disabled'); // RAG desabilitado
```

**Backend implementado** (`insights_rag.py`, `rag/`):
- `retriever.py` — recupera deals similares do BigQuery
- `ranker.py` — pontua relevância dos deals recuperados
- `insight_generator.py` — gera insights com Gemini
- `filters.py` — filtra deals por período/vendedor
- `metrics.py` / `stats.py` — métricas de qualidade do RAG

**Para habilitar:** Reativar em `api-dados.js` substituindo `Promise.resolve('disabled')` por `fetchJsonNoCache('/api/rag/insights')`.

---

## Módulo ML Predictions — Estado Atual

**Backend implementado** (`ml_predictions.py`, 496 linhas):
- `POST /api/ml/predictions` — recebe `MLPredictionsRequest` e retorna predições de win probability, priority score, abandono risk, next action
- Consulta views BigQuery de modelos ML préviamente treinados

**Frontend** (`ml.js`, 542 linhas):
- Seção `#ml` com dashboard de predições
- Chama `POST /api/ml/predictions` diretamente
- **Status:** Funcional, mas a seção ML pode estar oculta por padrão

---

## Módulo Weekly Agenda — Resumo

**Backend** (`weekly_agenda.py`, 1927 linhas — maior arquivo do backend):
- Endpoint único `GET /api/weekly-agenda` mas muito rico
- Calcula capacidade por vendedor considerando férias (`vacations` table)
- Acessa Firestore para cache de AI-summaries das atividades (via `_firestore_enabled()`)
- Gera sabatina MEDDIC + risk alignment por deal
- Suporte a múltiplos perfis de prompt: `bdm`, `hunter`, `farmer`

**Frontend** (`agenda-semanal-weekly.js`, 1367 linhas):
- Anti-pattern: também é um arquivo enorme com toda a lógica de renderização
- Dependency de `window.loadWeeklyAgenda` chamada da `filtros.js` quando aba Agenda está ativa

---

## Debt Log do Backend

| ID | Severidade | Descrição | Arquivo |
|---|---|---|---|
| B-01 | 🔴 | CORS `allow_origins=["*"]` + `allow_credentials=True` inválido por spec | `simple_api.py` L34 |
| B-02 | 🟡 | `get_bq_client()` sem singleton — nova instância a cada request | todos os endpoints |
| B-03 | 🟡 | Cache in-memory não compartilhado entre instâncias Cloud Run | `simple_api.py` L70 |
| B-04 | 🟡 | Funções utilitárias duplicadas em 3+ arquivos (`get_bq_client`, `normalize_email`, etc.) | múltiplos |
| B-05 | 🟡 | `FORCED_ACTIVE_SELLERS` hardcoded no código | `simple_api.py` L67 |
| B-06 | 🟡 | `deriveFiscalQuarter` implementado em 4 lugares (1 JS + 3 Python) | múltiplos |
| B-07 | 🟡 | `/api/filter-options` implementado e não consumido pelo frontend | `simple_api.py` L925 |
| B-08 | 🟢 | `/api/dashboard` endpoint agregado possivelmente obsoleto (2059L) | `simple_api.py` L1596 |
| B-09 | 🟢 | RAG totalmente implementado mas desabilitado no frontend | `insights_rag.py`, `api-dados.js` |
| B-10 | 🔵 | `simple_api.py` com 2059 linhas — endpoints principais não migrados para `endpoints/` | `simple_api.py` |
| B-11 | 🔵 | `weekly_agenda.py` com 1927 linhas — maior arquivo do backend | `weekly_agenda.py` |
| B-12 | 🔵 | Sem autenticação token Firebase nos endpoints `/api/*` | todos os endpoints |
| B-13 | 🔵 | Frontend pode enviar `?nocache=true` ao refresh mas nunca faz isso na chamada de refresh manual | `api-dados.js` |
