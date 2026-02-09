# 🏗️ ARQUITETURA: PAUTA SEMANAL + WAR ROOM (APRESENTAÇÃO SEMANAL)

**Projeto:** Sales Intelligence Dashboard  
**Stack:** BigQuery + Cloud Run (FastAPI) + Frontend Vanilla JS  
**RAG:** Vertex AI Text Embeddings (768d) em `deal_embeddings`  
**Data:** 2848 deals (pipeline + won + lost), 24 vendedores  

---

## 📊 ESTADO ATUAL (INVENTÁRIO)

### ✅ Backend Existente (`simple_api.py` + módulos)

**Cloud Run:** Estrutura modular em `/cloud-run/app/`
```
app/
├── simple_api.py (API principal)
└── api/endpoints/
    ├── ai_analysis.py      # Análise com Gemini
    ├── insights.py         # Insights básicos
    ├── insights_rag.py     # 🔥 RAG com Vector Search
    └── performance.py      # Performance de vendedores
```

**Endpoints Ativos:**
- `/api/dashboard` - Métricas agregadas
- `/api/pipeline` - Pipeline ativo (filtrado por year/quarter/seller)
- `/api/closed/won` - Deals ganhos
- `/api/closed/lost` - Deals perdidos
- `/api/insights-rag` - **RAG: Busca semântica + Gemini**
- `/api/performance/seller/{name}` - Performance individual

### ✅ BigQuery Dataset: `sales_intelligence`

| Tabela | Tipo | Descrição | Registros |
|--------|------|-----------|-----------|
| `pipeline` | TABLE | Deals ativos | ~400 |
| `closed_deals_won` | TABLE | Vitórias | ~1200 |
| `closed_deals_lost` | TABLE | Perdas | ~1200 |
| `sales_specialist` | TABLE | Camada de análise Sales Ops | ~400 |
| `deal_embeddings` | TABLE | **RAG unificado** (pipeline+won+lost) | **2848** |
| `ml_prioridade_deal_v2` | VIEW | Priorização ML | - |
| `ml_proxima_acao_v2` | VIEW | Próxima ação sugerida | - |

**Schema RAG (`deal_embeddings`):**
```json
{
  "deal_id": "STRING",
  "source": "STRING",  // pipeline | won | lost
  "Oportunidade": "STRING",
  "Vendedor": "STRING",
  "Conta": "STRING",
  "Gross": "FLOAT",
  "Net": "FLOAT",
  "Fiscal_Q": "STRING",
  "Produtos": "STRING",
  "Fase": "STRING",
  "content": "STRING",  // Texto rico para RAG
  "embedding": "REPEATED FLOAT"  // 768 dimensões
}
```

**Campo Chave:** `content` contém texto estruturado como:
```
Deal GANHO: Oportunidade X | Cliente: Y | Vendedor: Z | 
Valor: R$ 500k | Ciclo: 45 dias | 
Fatores de Sucesso: Urgência fiscal, POC bem-sucedido | 
Causa Raiz: Budget aprovado Q4 | 
Lições: Follow-up semanal com C-level manteve deal vivo
```

### ✅ Frontend Atual (`public/index.html`)

**Seção "Pauta Semanal" (linhas 2075-2180):**
- 🟡 **Implementação:** Frontend-only, sem backend dedicado
- Filtros: "Esta Semana" | "Próxima Semana" | "Todas"
- Lógica: Filtra `pipeline` por `Confiana >= 40%`
- Exibe: Cards por vendedor com deals prioritários
- **PROBLEMA:** Não usa RAG, não tem contexto histórico, não gera perguntas

---

## 🎯 OBJETIVO: NOVA ARQUITETURA

### 1️⃣ **PAUTA SEMANAL** (Refatorada)
**Objetivo:** Timeline de deals prioritários + contexto RAG  
**HTML:** `/public/pautasemanal.html` (novo arquivo)  
**Backend:** `/api/weekly-agenda` (novo endpoint)

### 2️⃣ **APRESENTAÇÃO SEMANAL / WAR ROOM** (Nova Feature)
**Objetivo:** Dashboard executivo estilo "A Verdade Nua e Crua"  
**HTML:** `/public/apresentacao.html` (novo arquivo)  
**Backend:** `/api/war-room` (novo endpoint)

---

## 🔧 ARQUITETURA DETALHADA

### 🏛️ CAMADA 1: BigQuery (Fonte de Verdade)

#### **Nova VIEW: `pauta_semanal_enriquecida`**
```sql
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.pauta_semanal_enriquecida` AS
WITH pipeline_ativo AS (
  SELECT 
    p.*,
    ss.Status as Status_Especialista,
    ss.Comentario as Comentario_Especialista,
    ml_prior.prioridade as Prioridade_ML,
    ml_acao.proxima_acao as Proxima_Acao_ML,
    -- Calcular "semana no quarter"
    DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), QUARTER), WEEK) + 1 as Semana_Quarter
  FROM `operaciones-br.sales_intelligence.pipeline` p
  LEFT JOIN `operaciones-br.sales_intelligence.sales_specialist` ss
    ON p.Oportunidade = ss.Oportunidade
  LEFT JOIN `operaciones-br.sales_intelligence.ml_prioridade_deal_v2` ml_prior
    ON p.Oportunidade = ml_prior.opportunity_id
  LEFT JOIN `operaciones-br.sales_intelligence.ml_proxima_acao_v2` ml_acao
    ON p.Oportunidade = ml_acao.opportunity_id
),
deals_com_risco AS (
  SELECT *,
    -- Score de Risco (0-5)
    CAST(
      (CASE WHEN Atividades = 0 THEN 1 ELSE 0 END) +
      (CASE WHEN CAST(Dias_Funil AS INT64) > 90 THEN 1 ELSE 0 END) +
      (CASE WHEN Territorio = 'Incorreto' THEN 1 ELSE 0 END) +
      (CASE WHEN Confiana < 30 THEN 1 ELSE 0 END) +
      (CASE WHEN Status_Especialista = 'Commit' AND Forecast_SF != 'Committed' THEN 1 ELSE 0 END)
    AS INT64) as Risco_Score,
    -- Flags específicas
    CASE 
      WHEN Atividades = 0 AND CAST(Dias_Funil AS INT64) > 90 THEN 'ZUMBI'
      WHEN Confiana >= 70 THEN 'CRITICO'
      WHEN Confiana >= 40 THEN 'ALTA_PRIORIDADE'
      ELSE 'MONITORAR'
    END as Categoria_Pauta
  FROM pipeline_ativo
)
SELECT * 
FROM deals_com_risco
WHERE Categoria_Pauta IN ('CRITICO', 'ALTA_PRIORIDADE', 'ZUMBI')
ORDER BY Risco_Score DESC, Gross DESC;
```

#### **Nova VIEW: `war_room_metrics`**
```sql
CREATE OR REPLACE VIEW `operaciones-br.sales_intelligence.war_room_metrics` AS
WITH quarter_atual AS (
  SELECT 
    CONCAT('FY', EXTRACT(YEAR FROM CURRENT_DATE()) - 2000, '-Q', EXTRACT(QUARTER FROM CURRENT_DATE())) as Fiscal_Q_Atual
),
metricas_por_vendedor AS (
  SELECT 
    Vendedor,
    -- Pipeline
    ROUND(SUM(CASE WHEN source = 'pipeline' THEN Gross ELSE 0 END), 2) as Pipeline_Gross,
    COUNT(CASE WHEN source = 'pipeline' THEN 1 END) as Pipeline_Deals,
    -- Fechado (Q atual)
    ROUND(SUM(CASE WHEN source = 'won' AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) THEN Gross ELSE 0 END), 2) as Closed_Gross,
    COUNT(CASE WHEN source = 'won' AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) THEN 1 END) as Closed_Deals,
    -- Higiene de Pipeline
    ROUND(
      100 * COUNT(CASE WHEN source = 'pipeline' AND (Atividades = 0 OR Territorio = 'Incorreto') THEN 1 END) / 
      NULLIF(COUNT(CASE WHEN source = 'pipeline' THEN 1 END), 0), 
      2
    ) as Percent_Pipeline_Podre,
    -- Zumbis
    COUNT(CASE WHEN source = 'pipeline' AND Atividades = 0 AND CAST(Dias_Funil AS INT64) > 90 THEN 1 END) as Deals_Zumbi
  FROM (
    -- Unificar pipeline + closed
    SELECT Vendedor, Gross, 'pipeline' as source, Fiscal_Q, Atividades, Territorio, Dias_Funil
    FROM `operaciones-br.sales_intelligence.pipeline`
    UNION ALL
    SELECT Vendedor, Gross, 'won' as source, Fiscal_Q, Atividades, NULL as Territorio, NULL as Dias_Funil
    FROM `operaciones-br.sales_intelligence.closed_deals_won`
  )
  GROUP BY Vendedor
)
SELECT 
  Vendedor,
  Pipeline_Gross,
  Closed_Gross,
  Closed_Gross + Pipeline_Gross as Total_Forecast,
  Pipeline_Deals,
  Closed_Deals,
  Percent_Pipeline_Podre,
  Deals_Zumbi,
  -- Nota de Higiene (A a F)
  CASE 
    WHEN Percent_Pipeline_Podre <= 10 THEN 'A'
    WHEN Percent_Pipeline_Podre <= 20 THEN 'B'
    WHEN Percent_Pipeline_Podre <= 35 THEN 'C'
    WHEN Percent_Pipeline_Podre <= 50 THEN 'D'
    ELSE 'F'
  END as Nota_Higiene
FROM metricas_por_vendedor
ORDER BY Total_Forecast DESC;
```

---

### 🛰️ CAMADA 2: Backend API (FastAPI)

#### **Novo Módulo: `/cloud-run/app/api/endpoints/weekly_agenda.py`**
```python
"""
Weekly Agenda Endpoint - Pauta Semanal Enriquecida com RAG
"""
from fastapi import APIRouter, Query
from google.cloud import bigquery
from typing import Optional, List, Dict, Any
import os

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"

def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)

@router.get("/weekly-agenda")
async def get_weekly_agenda(
    seller: Optional[str] = Query(None, description="Filtrar por vendedor"),
    week_offset: int = Query(0, ge=-4, le=4, description="Offset de semanas (0=atual, 1=próxima, -1=anterior)")
):
    """
    Retorna pauta semanal enriquecida com:
    - Deals prioritários da VIEW pauta_semanal_enriquecida
    - Contexto RAG de deals similares históricos (won/lost)
    - Perguntas de sabatina geradas por lógica
    """
    client = get_bq_client()
    
    # 1. Buscar deals da pauta
    where_clauses = []
    if seller:
        sellers = [s.strip() for s in seller.split(',')]
        if len(sellers) == 1:
            where_clauses.append(f"Vendedor = '{sellers[0]}'")
        else:
            where_clauses.append(f"Vendedor IN ('{\"', '\".join(sellers)}')")
    
    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    query_pauta = f"""
    SELECT * 
    FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
    {where_sql}
    """
    
    deals = [dict(row) for row in client.query(query_pauta).result()]
    
    # 2. Para cada deal, enriquecer com contexto RAG
    for deal in deals:
        # Buscar deals similares usando RAG
        query_similar = f"""
        WITH target_embedding AS (
          SELECT embedding
          FROM `{PROJECT_ID}.{DATASET_ID}.deal_embeddings`
          WHERE Oportunidade = @oportunidade
          LIMIT 1
        )
        SELECT 
          de.deal_id,
          de.source,
          de.Oportunidade,
          de.Conta,
          de.Gross,
          de.content,
          -- Similaridade cosseno
          (
            SELECT SUM(a * b) / (SQRT(SUM(a * a)) * SQRT(SUM(b * b)))
            FROM UNNEST(de.embedding) a WITH OFFSET pos
            JOIN UNNEST((SELECT embedding FROM target_embedding)) b WITH OFFSET pos2
            ON pos = pos2
          ) as similarity
        FROM `{PROJECT_ID}.{DATASET_ID}.deal_embeddings` de
        WHERE de.source IN ('won', 'lost') 
          AND de.Vendedor = @vendedor
        ORDER BY similarity DESC
        LIMIT 5
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("oportunidade", "STRING", deal["Oportunidade"]),
                bigquery.ScalarQueryParameter("vendedor", "STRING", deal["Vendedor"])
            ]
        )
        
        similar_deals = [dict(row) for row in client.query(query_similar, job_config=job_config).result()]
        deal["similar_deals"] = similar_deals
        
        # 3. Gerar perguntas de sabatina
        deal["sabatina_questions"] = generate_sabatina_questions(deal)
    
    return {
        "timestamp": "2026-02-08T00:00:00Z",
        "total_deals": len(deals),
        "deals": deals
    }

def generate_sabatina_questions(deal: Dict[str, Any]) -> List[str]:
    """
    Gera perguntas baseadas em flags de risco.
    """
    questions = []
    
    # Regra 1: Atividades zeradas
    if deal.get("Atividades") == 0:
        questions.append("❌ Este deal está abandonado? Qual é a data da próxima reunião agendada?")
    
    # Regra 2: Zumbis
    if deal.get("Categoria_Pauta") == "ZUMBI":
        questions.append("💀 Deal > 90 dias sem atividade. Qual o plano para reviver ou matar este deal?")
    
    # Regra 3: Divergência Especialista vs. SF
    if deal.get("Status_Especialista") == "Commit" and deal.get("Forecast_SF") != "Committed":
        questions.append("⚠️ Especialista diz 'Commit', você diz 'Pipeline'. Quem está certo? Por quê?")
    
    # Regra 4: Alta confiança sem orçamento
    if deal.get("Confiana", 0) >= 70 and "SEM_ORCAMENTO" in (deal.get("Flags_de_Risco") or ""):
        questions.append("💰 Como garantimos fechamento sem orçamento confirmado? Quem assina o contrato?")
    
    # Regra 5: Deal > 500k estagnado
    if deal.get("Gross", 0) > 500000 and int(deal.get("Dias_Funil", 0)) > 180:
        questions.append("📉 Deal de R$500k+ há 6+ meses. Qual o evento compelidor que força o cliente a comprar AGORA?")
    
    # Regra 6: Território incorreto
    if deal.get("Territorio") == "Incorreto":
        questions.append("🚫 Por que este deal ainda está no seu nome se é de outro território?")
    
    return questions
```

#### **Novo Módulo: `/cloud-run/app/api/endpoints/war_room.py`**
```python
"""
War Room Endpoint - Apresentação Semanal Executiva
"""
from fastapi import APIRouter, Query
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import google.generativeai as genai
import os
from datetime import datetime, date

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4")

genai.configure(api_key=GEMINI_API_KEY)

def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)

def get_current_week_in_quarter() -> Dict[str, Any]:
    """
    Retorna metadados da semana atual dentro do quarter.
    Exemplo: Q1 2026, Semana 6 de 13
    """
    today = date.today()
    quarter = (today.month - 1) // 3 + 1
    year_short = today.year - 2000
    fiscal_q = f"FY{year_short}-Q{quarter}"
    
    # Calcular semana dentro do quarter
    quarter_start = date(today.year, (quarter - 1) * 3 + 1, 1)
    days_in_quarter = (today - quarter_start).days
    week_in_quarter = (days_in_quarter // 7) + 1
    
    return {
        "fiscal_q": fiscal_q,
        "quarter": quarter,
        "year": today.year,
        "week_in_quarter": week_in_quarter,
        "total_weeks_in_quarter": 13,  # ~13 semanas por quarter
        "current_date": today.isoformat()
    }

@router.get("/war-room")
async def get_war_room_report():
    """
    Gera relatório War Room com:
    1. Resumo Executivo (Fechado vs. Pipeline)
    2. Métricas por Vendedor (Higiene, Notas, Zumbis)
    3. Hit List de Oportunidades Críticas com Perguntas de Sabatina
    """
    client = get_bq_client()
    week_info = get_current_week_in_quarter()
    
    # 1. Resumo Executivo
    query_summary = f"""
    WITH quarter_atual AS (
      SELECT '{week_info['fiscal_q']}' as Fiscal_Q_Atual
    )
    SELECT 
      ROUND(SUM(CASE WHEN source = 'won' AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) THEN Gross ELSE 0 END), 2) as Closed_Gross,
      ROUND(SUM(CASE WHEN source = 'pipeline' THEN Gross ELSE 0 END), 2) as Pipeline_Gross,
      COUNT(CASE WHEN source = 'won' AND Fiscal_Q = (SELECT Fiscal_Q_Atual FROM quarter_atual) THEN 1 END) as Closed_Deals,
      COUNT(CASE WHEN source = 'pipeline' THEN 1 END) as Pipeline_Deals,
      COUNT(CASE WHEN source = 'pipeline' AND Atividades = 0 AND CAST(Dias_Funil AS INT64) > 90 THEN 1 END) as Total_Zumbis
    FROM (
      SELECT Gross, 'won' as source, Fiscal_Q, NULL as Atividades, NULL as Dias_Funil
      FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
      UNION ALL
      SELECT Gross, 'pipeline' as source, Fiscal_Q, Atividades, Dias_Funil
      FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
    )
    """
    
    summary = dict(next(client.query(query_summary).result()))
    
    # 2. Métricas por Vendedor
    query_sellers = f"""
    SELECT * 
    FROM `{PROJECT_ID}.{DATASET_ID}.war_room_metrics`
    ORDER BY Total_Forecast DESC
    """
    
    sellers = [dict(row) for row in client.query(query_sellers).result()]
    
    # 3. Hit List (Top 20 deals críticos)
    query_hitlist = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
    WHERE Categoria_Pauta IN ('CRITICO', 'ZUMBI')
    ORDER BY Risco_Score DESC, Gross DESC
    LIMIT 20
    """
    
    hitlist = [dict(row) for row in client.query(query_hitlist).result()]
    
    # 4. Para cada deal da hit list, gerar perguntas de sabatina
    for deal in hitlist:
        deal["sabatina_questions"] = generate_sabatina_questions(deal)
        # Calcular tags de risco
        deal["risk_tags"] = generate_risk_tags(deal)
    
    # 5. Gerar insights com Gemini
    ai_insights = generate_executive_insights(summary, sellers, hitlist)
    
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "week_info": week_info,
        "executive_summary": summary,
        "sellers": sellers,
        "hit_list": hitlist,
        "ai_insights": ai_insights
    }

def generate_sabatina_questions(deal: Dict[str, Any]) -> List[str]:
    """Mesmo código do weekly_agenda.py"""
    questions = []
    
    if deal.get("Atividades") == 0:
        questions.append("❌ Este deal está abandonado? Qual é a data da próxima reunião agendada?")
    
    if deal.get("Categoria_Pauta") == "ZUMBI":
        questions.append("💀 Deal > 90 dias sem atividade. Qual o plano para reviver ou matar este deal?")
    
    if deal.get("Status_Especialista") == "Commit" and deal.get("Forecast_SF") != "Committed":
        questions.append("⚠️ Especialista diz 'Commit', você diz 'Pipeline'. Quem está certo?")
    
    if deal.get("Confiana", 0) >= 70 and "SEM_ORCAMENTO" in (deal.get("Flags_de_Risco") or ""):
        questions.append("💰 Como garantimos fechamento sem orçamento confirmado?")
    
    if deal.get("Gross", 0) > 500000 and int(deal.get("Dias_Funil", 0)) > 180:
        questions.append("📉 Qual o evento compelidor que força o cliente a comprar AGORA?")
    
    if deal.get("Territorio") == "Incorreto":
        questions.append("🚫 Por que este deal ainda está no seu nome?")
    
    return questions

def generate_risk_tags(deal: Dict[str, Any]) -> List[str]:
    """Gera tags visuais de risco"""
    tags = []
    
    if deal.get("Categoria_Pauta") == "ZUMBI":
        tags.append("💀 ZUMBI")
    if deal.get("Risco_Score", 0) >= 4:
        tags.append("🔴 RISCO ALTO")
    if deal.get("Atividades") == 0:
        tags.append("⏸️ SEM ATIVIDADE")
    if deal.get("Territorio") == "Incorreto":
        tags.append("🚫 TERRITÓRIO ERRADO")
    if deal.get("Status_Especialista") == "Commit" and deal.get("Forecast_SF") != "Committed":
        tags.append("⚠️ DESALINHADO")
    
    return tags

def generate_executive_insights(summary: Dict, sellers: List[Dict], hitlist: List[Dict]) -> Dict[str, Any]:
    """
    Usa Gemini para gerar insights executivos baseados nos dados.
    """
    context = f"""
Você é um VP de Sales Ops analisando a Revisão Semanal de Forecast.

DADOS DO QUARTER ATUAL:
- Fechado: R$ {summary['Closed_Gross']:,.2f} ({summary['Closed_Deals']} deals)
- Pipeline: R$ {summary['Pipeline_Gross']:,.2f} ({summary['Pipeline_Deals']} deals)
- Zumbis no Pipeline: {summary['Total_Zumbis']}

TOP 5 VENDEDORES (por forecast total):
{chr(10).join([f"- {s['Vendedor']}: R$ {s['Total_Forecast']:,.2f} | Nota Higiene: {s['Nota_Higiene']} | Zumbis: {s['Deals_Zumbi']}" for s in sellers[:5]])}

TOP 5 DEALS CRÍTICOS:
{chr(10).join([f"- {d['Oportunidade']} ({d['Vendedor']}) | R$ {d['Gross']:,.2f} | Risco: {d['Risco_Score']}/5 | Categoria: {d['Categoria_Pauta']}" for d in hitlist[:5]])}

INSTRUÇÕES:
1. Dê 3 PONTOS DE ATENÇÃO para o CEO (riscos reais, sem enrolação)
2. Dê 2 VITÓRIAS DA SEMANA (se houver)
3. Dê 3 AÇÕES IMEDIATAS para corrigir problemas

Seja direto. Sem enfeites. Foco em números e ações.
"""
    
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(context)
        text = response.text if response else ""
    except Exception as e:
        text = f"Erro ao gerar insights: {str(e)}"
    
    return {
        "raw_text": text,
        "summary": summary,
        "top_sellers": sellers[:5],
        "critical_deals": hitlist[:5]
    }
```

#### **Registrar novos routers em `/cloud-run/app/simple_api.py`:**
```python
# Import modular endpoints
from api.endpoints.ai_analysis import router as ai_router
from api.endpoints.insights import router as insights_router
from api.endpoints.insights_rag import router as insights_rag_router
from api.endpoints.performance import router as performance_router
from api.endpoints.weekly_agenda import router as weekly_agenda_router  # NOVO
from api.endpoints.war_room import router as war_room_router  # NOVO

# Include modular routers
app.include_router(ai_router, prefix="/api", tags=["AI Analysis"])
app.include_router(insights_router, prefix="/api", tags=["Insights"])
app.include_router(insights_rag_router, prefix="/api", tags=["Insights RAG"])
app.include_router(performance_router, prefix="/api", tags=["Performance"])
app.include_router(weekly_agenda_router, prefix="/api", tags=["Weekly Agenda"])  # NOVO
app.include_router(war_room_router, prefix="/api", tags=["War Room"])  # NOVO
```

---

### 🎨 CAMADA 3: Frontend

#### **Novo Arquivo: `/public/pautasemanal.html`**
**Estrutura:**
- **Header:** Filtros (Vendedor, Semana, Quarter)
- **Cards de Resumo:** Deals Críticos, Alta Prioridade, Ações Pendentes
- **Timeline por Vendedor:** Acordeão com lista de deals
  - Para cada deal:
    - **Badge de Risco:** Score 0-5 (cores: verde → vermelho)
    - **Tags:** ZUMBI, SEM_ATIVIDADE, etc.
    - **Contexto RAG:** "Deals similares que este vendedor ganhou/perdeu"
    - **Botão "Sabatina":** Expande perguntas geradas pela IA
- **Chamada API:** `GET /api/weekly-agenda?seller=Alex&week_offset=0`

#### **Novo Arquivo: `/public/apresentacao.html` (War Room)**
**Estrutura:**
- **Header:** Metadados da semana (Q1 2026, Semana 6/13)
- **Resumo Executivo (Cards):**
  - Fechado no Q: R$ X | Y deals
  - Pipeline: R$ Z | W deals
  - Risco Ponderado: R$ K
  - Zumbis: N deals
- **Navegação Lateral:** Lista de Vendedores (com nota A-F)
- **Painel do Vendedor (ao clicar):**
  - **Card de Higiene:** 
    - Nota: A-F
    - % Pipeline Podre
    - Deals Zumbi
  - **Hit List (Tabela):**
    - Colunas: Conta | Oportunidade | Valor | Stage | Risco | Tags | **Perguntas**
    - Estilo: Deals com risco ≥ 4 em vermelho, Zumbis com opacidade reduzida
  - **Insights IA:** Painel lateral com análise do Gemini
- **Chamada API:** `GET /api/war-room`

#### **Modificação: `/public/index.html`**
**Ação:** Remover seção "Pauta Semanal" (linhas 2075-2180) e adicionar link no sidebar:
```html
<div class="menu-item" onclick="navigateToPage('pautasemanal.html')" style="...">
  <svg class="icon"><use href="#icon-calendar"/></svg>
  Pauta Semanal
</div>
<div class="menu-item" onclick="navigateToPage('apresentacao.html')" style="...">
  <svg class="icon"><use href="#icon-target"/></svg>
  Apresentação Semanal
</div>
```

---

## 🔗 ORQUESTRAÇÃO E FLUXO DE DADOS

```mermaid
graph TD
    A[BigQuery: sales_intelligence] -->|Pipeline + Won + Lost| B[deal_embeddings]
    B -->|Vector Search| C[Vertex AI Text Embeddings]
    A -->|SQL Views| D[pauta_semanal_enriquecida]
    A -->|SQL Views| E[war_room_metrics]
    
    D -->|REST API| F[FastAPI: /api/weekly-agenda]
    E -->|REST API| G[FastAPI: /api/war-room]
    C -->|RAG Context| F
    C -->|RAG Context| G
    
    F -->|JSON Response| H[pautasemanal.html]
    G -->|JSON Response| I[apresentacao.html]
    
    J[Gemini 1.5 Flash] -->|Generate Insights| G
    J -->|Enrich Context| F
    
    K[User] -->|Click Sidebar| H
    K -->|Click Sidebar| I
    
    style B fill:#4A9EFF
    style C fill:#C0FF7D
    style J fill:#FF89FF
```

### **Fluxo típico - Pauta Semanal:**
1. **User** acessa `/pautasemanal.html`
2. **Frontend** chama `GET /api/weekly-agenda?seller=Alex&week_offset=0`
3. **Backend**:
   - Consulta VIEW `pauta_semanal_enriquecida`
   - Para cada deal, busca no RAG (`deal_embeddings`) deals similares históricos
   - Gera perguntas de sabatina baseadas em regras
4. **Backend** retorna JSON com:
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
         "similar_deals": [...],
         "sabatina_questions": [
           "❌ Este deal está abandonado?",
           "💰 Como garantimos fechamento sem orçamento?"
         ]
       }
     ]
   }
   ```
5. **Frontend** renderiza:
   - Cards de deals com badges de risco
   - Seção "Contexto Histórico" (similar deals do RAG)
   - Botão "Sabatina" que expande perguntas

### **Fluxo típico - War Room:**
1. **User** acessa `/apresentacao.html`
2. **Frontend** chama `GET /api/war-room`
3. **Backend**:
   - Calcula métricas do quarter atual
   - Consulta VIEW `war_room_metrics` para vendedores
   - Busca top 20 deals críticos
   - **Chama Gemini** para gerar insights executivos
4. **Backend** retorna JSON com:
   ```json
   {
     "week_info": {
       "fiscal_q": "FY26-Q1",
       "week_in_quarter": 6,
       "total_weeks_in_quarter": 13
     },
     "executive_summary": {
       "Closed_Gross": 2500000,
       "Pipeline_Gross": 5000000,
       "Total_Zumbis": 15
     },
     "sellers": [...],
     "hit_list": [...],
     "ai_insights": {
       "raw_text": "PONTOS DE ATENÇÃO:\n1. 15 deals zumbis...",
       "top_sellers": [...],
       "critical_deals": [...]
     }
   }
   ```
5. **Frontend** renderiza:
   - Dashboard estilo "War Room" com cores de alerta
   - Abas por vendedor (navegação lateral)
   - Tabela "Hit List" com perguntas de sabatina inline
   - Painel de insights da IA

---

## 🚀 DEPLOYMENT

### **1. BigQuery:**
```bash
# Criar VIEWs
bq query --use_legacy_sql=false < bigquery/create_view_pauta_semanal.sql
bq query --use_legacy_sql=false < bigquery/create_view_war_room_metrics.sql
```

### **2. Cloud Run (Backend):**
```bash
cd /workspaces/playbook/cloud-run
gcloud run deploy sales-intelligence-api \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project operaciones-br \
  --set-env-vars GCP_PROJECT=operaciones-br,GEMINI_API_KEY=...
```

### **3. Frontend (Static Hosting):**
```bash
# Opção 1: Firebase Hosting
firebase deploy --only hosting

# Opção 2: Cloud Storage + Load Balancer
gsutil -m cp -r public/* gs://xertica-dashboard/
```

---

## 📊 COMO O RAG POTENCIALIZA A SOLUÇÃO

### **Uso Estratégico de `deal_embeddings`:**

1. **Contexto Histórico por Vendedor:**
   - "Deals similares que Alex ganhou no passado com mesmo perfil de cliente"
   - Permite gerente comparar: "Por que este deal está parado se você já fechou 3 iguais?"

2. **Padrões de Perdas:**
   - "3 deals similares perdidos pelo mesmo motivo: orçamento cortado em dezembro"
   - Recomendação: "Antecipar fechamento para evitar budget freeze"

3. **Lições Aprendidas Automatizadas:**
   - Campo `content` em deals ganhos contém "Fatores_Sucesso" e "Licoes_Aprendidas"
   - RAG retorna: "Deal similar ganho porque fizemos POC técnico | Lição: Envolver TI desde o início"

4. **Inputs para Gemini:**
   - Gemini recebe contexto RAG + dados estruturados
   - Gera insights personalizados: "Este deal está 30 dias sem atividade. Histórico mostra que após 40 dias, taxa de conversão cai 60%."

### **Queries RAG Implementadas:**

#### **Query 1: Similar Deals por Vendedor**
```sql
-- Busca vetorial: encontra deals históricos similares ao deal atual
WITH target_embedding AS (
  SELECT embedding
  FROM `operaciones-br.sales_intelligence.deal_embeddings`
  WHERE Oportunidade = 'Deal X'
  LIMIT 1
)
SELECT 
  de.Oportunidade,
  de.source,  -- won | lost
  de.Gross,
  de.content,  -- Texto rico com lições
  (
    SELECT SUM(a * b) / (SQRT(SUM(a * a)) * SQRT(SUM(b * b)))
    FROM UNNEST(de.embedding) a WITH OFFSET pos
    JOIN UNNEST((SELECT embedding FROM target_embedding)) b WITH OFFSET pos2
    ON pos = pos2
  ) as similarity
FROM `operaciones-br.sales_intelligence.deal_embeddings` de
WHERE de.source IN ('won', 'lost') 
  AND de.Vendedor = 'Alex'
ORDER BY similarity DESC
LIMIT 5
```

#### **Query 2: Padrões de Risco**
```sql
-- Encontra deals que entraram em "ZUMBI" e depois foram recuperados
SELECT 
  Oportunidade,
  Vendedor,
  Gross,
  content
FROM `operaciones-br.sales_intelligence.deal_embeddings`
WHERE source = 'won'
  AND LOWER(content) LIKE '%recuperado%'
  OR LOWER(content) LIKE '%reativado%'
ORDER BY Gross DESC
LIMIT 10
```

---

## 🎯 DIFERENCIAIS DA ARQUITETURA

### ✅ **1. Reutilização de Componentes**
- RAG unificado (`deal_embeddings`) serve múltiplos contextos
- VIEWs BigQuery são "fonte de verdade" única
- Endpoints FastAPI modulares (fácil manutenção)

### ✅ **2. Escalabilidade**
- BigQuery: Queries paralelas, cache automático
- Cloud Run: Auto-scaling baseado em tráfego
- Frontend: HTML estático (CDN-friendly)

### ✅ **3. Inteligência Híbrida**
- **Regras de Negócio** (sabatina_questions): Determinísticas, auditáveis
- **RAG** (similar_deals): Contexto histórico rico
- **Gemini** (insights): Linguagem natural adaptativa

### ✅ **4. "Verdade Nua e Crua"**
- Notas de Higiene A-F (não há como esconder pipeline podre)
- Zumbis identificados automaticamente
- Perguntas de sabatina difíceis (forçam accountability)

### ✅ **5. Acionável**
- Cada insight tem "next step" claro
- Perguntas específicas por deal (não genéricas)
- Timeline semanal (foco no que importa AGORA)

---

## 📈 MÉTRICAS DE SUCESSO

| KPI | Baseline (Hoje) | Target (Pós-Implantação) |
|-----|-----------------|-------------------------|
| Tempo médio de pauta semanal | 2h (manual) | 15 min (automatizado) |
| Deals zumbis identificados | ~30% não detectados | 100% detectados |
| Aderência a perguntas de sabatina | 0% (não existem) | 80% de adoção |
| Insights acionáveis por semana | ~5 (manual) | ~20 (IA-powered) |
| ROI: Tempo economizado Sales Ops | - | ~7h/semana (R$350/semana) |

---

## 🛠️ PRÓXIMOS PASSOS (EXECUÇÃO)

### **Sprint 1: Backend (3 dias)**
- [ ] Criar VIEWs BigQuery (`pauta_semanal_enriquecida`, `war_room_metrics`)
- [ ] Implementar endpoint `/api/weekly-agenda`
- [ ] Implementar endpoint `/api/war-room`
- [ ] Testar queries RAG (similaridade)
- [ ] Deploy Cloud Run

### **Sprint 2: Frontend (3 dias)**
- [ ] Criar `/public/pautasemanal.html`
- [ ] Criar `/public/apresentacao.html`
- [ ] Remover seção "Pauta Semanal" de `/public/index.html`
- [ ] Adicionar links no sidebar
- [ ] Testar integrações API

### **Sprint 3: Refinamento + Go-Live (2 dias)**
- [ ] Ajustar prompts Gemini (qualidade insights)
- [ ] Adicionar loading states
- [ ] Otimizar queries (cache, índices)
- [ ] Documentação de uso
- [ ] Treinamento usuários

---

## 🧠 CONSIDERAÇÕES TÉCNICAS AVANÇADAS

### **1. Cache e Performance**
- **BigQuery:** Ativar cache de 24h em VIEWs (grátis)
- **Cloud Run:** Configurar `max-instances: 10` (evitar cold starts)
- **Frontend:** Service Worker para cache de assets

### **2. Custos**
- **RAG:** ~$0.02 por 1000 queries (text-embedding-004)
- **Gemini:** ~$0.50 por 1M tokens (flash = barato)
- **Cloud Run:** ~$0.10/dia (tráfego baixo)
- **Total estimado:** ~$20/mês

### **3. Segurança**
- **Cloud Run:** IAM roles (apenas operacoes-br)
- **BigQuery:** Row-level security (vendedor só vê seus deals)
- **Frontend:** Autenticação via Firebase Auth (futuro)

### **4. Monitoramento**
- **Logs:** Cloud Logging (estruturados JSON)
- **Métricas:** Cloud Monitoring (latência API)
- **Alertas:** Slack notificações para erros

---

## 📚 REFERÊNCIAS E DOCUMENTAÇÃO

### **Arquivos Relacionados:**
- `/bigquery/setup_rag_embeddings.sql` - Setup do RAG
- `/cloud-run/app/api/endpoints/insights_rag.py` - Exemplo de busca vetorial
- `/public/index.html` - Dashboard principal (referência UI)

### **Documentação Externa:**
- [BigQuery ML Text Embeddings](https://cloud.google.com/bigquery/docs/generate-text-embedding)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Gemini API](https://ai.google.dev/gemini-api/docs)

---

## 🚦 STATUS: PRONTO PARA EXECUÇÃO

**Arquitetura aprovada?** → Próximo passo: Criar tasks no Jira/Linear  
**Dúvidas técnicas?** → Revisar seção de custos e performance  
**Go/No-Go?** → Sprint 1 pode começar AGORA  

---

**Última atualização:** 2026-02-08  
**Autor:** GitHub Copilot (Claude Sonnet 4.5)  
**Reviewer:** Time de Sales Ops Xertica.ai
