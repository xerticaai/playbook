"""
Weekly Agenda (Pauta Semanal) Endpoint - Enhanced for 1-on-1 Meetings
Provides enriched weekly agenda with seller performance feedback and deal insights.
Shows ONLY current quarter deals, grouped by seller.
"""
from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import os
from datetime import datetime, date, timedelta
import re
import unicodedata
import time
import hashlib

import google.generativeai as genai
from google.cloud import firestore

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-preview-09-2025")

ACTIVITY_SUMMARY_FIRESTORE_COLLECTION = os.getenv("ACTIVITY_SUMMARY_FIRESTORE_COLLECTION", "")

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)  # type: ignore[attr-defined]
        print(f"[WEEKLY_AGENDA] ✅ Gemini configured successfully")
        print(f"[WEEKLY_AGENDA] Model: {GEMINI_MODEL}")
        print(f"[WEEKLY_AGENDA] API Key (first 10 chars): {GEMINI_API_KEY[:10]}...")
    except Exception as e:
        # Fail-safe: keep AI disabled
        print(f"[WEEKLY_AGENDA] ❌ WARN: Gemini config failed: {str(e)}")
        GEMINI_API_KEY = None
else:
    print("[WEEKLY_AGENDA] ❌ WARN: GEMINI_API_KEY not set; activity summaries disabled")

_ACTIVITY_SUMMARY_CACHE_TTL_SECONDS = int(os.getenv("ACTIVITY_SUMMARY_CACHE_TTL_SECONDS", "86400"))
_ACTIVITY_SUMMARY_MAX_ITEMS = int(os.getenv("ACTIVITY_SUMMARY_MAX_ITEMS", "600"))
_ACTIVITY_SUMMARY_MAX_PER_RESPONSE = int(os.getenv("ACTIVITY_SUMMARY_MAX_PER_RESPONSE", "20"))
_ACTIVITY_SUMMARY_CACHE: Dict[str, Dict[str, Any]] = {}

_FIRESTORE_CLIENT: Optional[firestore.Client] = None


def _firestore_enabled() -> bool:
    return bool(ACTIVITY_SUMMARY_FIRESTORE_COLLECTION and ACTIVITY_SUMMARY_FIRESTORE_COLLECTION.strip())


def _get_firestore_client() -> Optional[firestore.Client]:
    global _FIRESTORE_CLIENT
    if not _firestore_enabled():
        return None
    if _FIRESTORE_CLIENT is not None:
        return _FIRESTORE_CLIENT
    try:
        _FIRESTORE_CLIENT = firestore.Client(project=PROJECT_ID)
        return _FIRESTORE_CLIENT
    except Exception:
        # Fail-safe: disable Firestore persistence if client init fails
        return None


def _firestore_get_summary(doc_id: str) -> Optional[str]:
    if not doc_id:
        return None
    client = _get_firestore_client()
    if not client:
        return None
    try:
        doc = client.collection(ACTIVITY_SUMMARY_FIRESTORE_COLLECTION).document(doc_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        summary = data.get("summary")
        return str(summary).strip() if summary else None
    except Exception:
        return None


def _firestore_set_summary(doc_id: str, summary: str, *, model: str, text_len: int) -> None:
    if not doc_id or not summary:
        return
    client = _get_firestore_client()
    if not client:
        return
    try:
        client.collection(ACTIVITY_SUMMARY_FIRESTORE_COLLECTION).document(doc_id).set(
            {
                "summary": summary,
                "model": model,
                "text_len": int(text_len or 0),
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
                "prompt_version": "v2-meddic-risks-actions",
            },
            merge=True,
        )
    except Exception:
        return


def _cache_get_summary(key: str) -> Optional[str]:
    item = _ACTIVITY_SUMMARY_CACHE.get(key)
    if not item:
        return None
    if item.get("expires_at", 0) <= time.time():
        _ACTIVITY_SUMMARY_CACHE.pop(key, None)
        return None
    return item.get("summary")


def _cache_set_summary(key: str, summary: str) -> None:
    if not key:
        return
    # Simple size guard
    if len(_ACTIVITY_SUMMARY_CACHE) >= _ACTIVITY_SUMMARY_MAX_ITEMS:
        # drop ~10% oldest
        items = sorted(_ACTIVITY_SUMMARY_CACHE.items(), key=lambda kv: kv[1].get("expires_at", 0))
        for k, _ in items[: max(1, _ACTIVITY_SUMMARY_MAX_ITEMS // 10)]:
            _ACTIVITY_SUMMARY_CACHE.pop(k, None)
    _ACTIVITY_SUMMARY_CACHE[key] = {
        "summary": summary,
        "expires_at": time.time() + _ACTIVITY_SUMMARY_CACHE_TTL_SECONDS,
    }


def _summarize_activity_text(text: str) -> Optional[str]:
    """Summarize a long activity description in Portuguese.

    Fail-safe: returns None if AI is disabled/unavailable.
    """
    if not GEMINI_API_KEY:
        print(f"[IA] ❌ GEMINI_API_KEY not set, skipping summary")
        return None
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    
    print(f"[IA] 📝 Summarizing text ({len(cleaned)} chars)")

    h = hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
    cached = _cache_get_summary(h)
    if cached:
        print(f"[IA] ✅ Memory cache HIT")
        return cached

    # Persistent cache (optional): Firestore lookup by text hash
    persisted = _firestore_get_summary(h)
    if persisted:
        print(f"[IA] ✅ Firestore cache HIT")
        _cache_set_summary(h, persisted)
        return persisted

    # Input guardrail: prevent huge payloads to the model
    if len(cleaned) > 6000:
        cleaned = cleaned[:6000]

    print(f"[IA] 🤖 Calling Gemini API (model: {GEMINI_MODEL})...")
    prompt = f"""Atue como um Engenheiro de Sales Ops analisando uma transcrição/anotação de CRM.
Seu objetivo é extrair inteligência comercial (MEDDIC) e ação futura.

TEXTO DA ATIVIDADE:
{cleaned}

---
Gere um resumo estruturado seguindo ESTRITAMENTE este formato (se não encontrar a informação, não invente, apenas omita a linha ou coloque 'N/A'):

🎯 PONTOS-CHAVE (MEDDIC):
- [Metrics/Pain] Qual o problema/dor do cliente?
- [Decision] Quem são os decisores citados?
- [Timeline] Alguma data ou prazo mencionado?

⚠️ RISCOS/BLOQUEIOS:
- (Liste impedimentos citados, ex: budget, concorrente, falta de retorno)

🚀 PRÓXIMOS PASSOS (Actionable):
- (O que ficou combinado? Quem faz o que e quando?)

IMPORTANTE:
- Seja conciso (máx 450 caracteres no total).
- Use PT-BR direto e executivo.
- Não use markdown complexo, apenas plain text com quebras de linha.
""".strip()

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)  # type: ignore[attr-defined]
        res = model.generate_content(prompt)
        out = (getattr(res, "text", None) or "").strip()
        if not out:
            return None

        # Guardrail: keep it compact and stable
        out = out.replace("\r\n", "\n").strip()
        lines = [ln.strip() for ln in out.split("\n") if ln.strip()]
        if len(lines) >= 3:
            out = "\n".join(lines[:3])
        out = out[:900]

        # Persist (optional) so we don't regenerate for the same activity text
        _firestore_set_summary(h, out, model=GEMINI_MODEL, text_len=len(cleaned))
        _cache_set_summary(h, out)
        print(f"[IA] ✅ Summary generated ({len(out)} chars)")
        return out
    except Exception as e:
        print(f"[IA] ❌ Gemini API failed: {str(e)}")
        return None


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


def get_current_fiscal_quarter() -> str:
    """
    Calculate current Fiscal Quarter (e.g., FY26-Q1).
    """
    today = datetime.now()
    fiscal_year = today.year - 2000  # FY26 = 2026
    quarter = (today.month - 1) // 3 + 1
    return f"FY{fiscal_year}-Q{quarter}"


def _coerce_to_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def fiscal_quarter_from_date(value: Any) -> Optional[str]:
    d = _coerce_to_date(value)
    if not d:
        return None
    fiscal_year = d.year - 2000
    quarter = (d.month - 1) // 3 + 1
    return f"FY{fiscal_year}-Q{quarter}"


def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        # Expect yyyy-mm-dd (HTML input[type=date])
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def _current_week_start_utc() -> date:
    # Align with BigQuery DATE_TRUNC(CURRENT_DATE(), WEEK) default (Monday)
    today = datetime.utcnow().date()
    return today - timedelta(days=today.weekday())


def parse_audit_questions(value: Any) -> List[str]:
    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []

    # BigQuery/Sheet padrão: perguntas separadas por " | "
    # Também aceitamos novas linhas como fallback.
    raw_parts: List[str]
    if "|" in text:
        raw_parts = [p.strip() for p in text.split("|")]
    else:
        raw_parts = [p.strip() for p in text.splitlines()]

    parts = [p for p in raw_parts if p]
    return parts


def _safe_int(value: Any) -> int:
    try:
        if value is None or value == "":
            return 0
        return int(value)
    except (ValueError, TypeError):
        return 0


def _safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def _split_tokens(value: Any) -> List[str]:
    if value is None:
        return []
    text = str(value).strip()
    if not text:
        return []
    parts = re.split(r"[\|,\n]+", text)
    tokens = [p.strip() for p in parts if p and p.strip()]
    return tokens


def _normalize_vendor(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _token_to_label(token: str) -> str:
    text = (token or "").strip()
    if not text:
        return ""

    # Normaliza: SEM_ATIVIDADE -> "Sem atividade"
    text = text.replace("_", " ").replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip().lower()

    keep_upper = {"bant", "meddic", "ia", "ok"}
    words = []
    for w in text.split(" "):
        if w in keep_upper:
            words.append(w.upper())
        else:
            words.append(w.capitalize())

    return " ".join(words)


def _build_ui_fields(deal: Dict[str, Any]) -> Dict[str, Any]:
    categoria = (deal.get("Categoria_Pauta") or "").strip().upper()
    categoria_label_map = {
        "ZUMBI": "Zumbi",
        "CRITICO": "Crítico",
        "ALTA_PRIORIDADE": "Alta prioridade",
        "MONITORAR": "Monitorar",
    }

    confianca = _safe_float(deal.get("Confianca"))
    # Nota de IA: usar somente a confiança já existente (fonte BigQuery)
    if confianca >= 70:
        ia_label = "Alta"
    elif confianca >= 40:
        ia_label = "Média"
    elif confianca > 0:
        ia_label = "Baixa"
    else:
        ia_label = "N/A"

    risk_tokens = _split_tokens(deal.get("Risk_Tags"))
    risk_items = []
    seen = set()
    for t in risk_tokens:
        key = t.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        risk_items.append({
            "key": key,
            "label": _token_to_label(key),
        })

    return {
        "ui": {
            "categoria": categoria,
            "categoriaLabel": categoria_label_map.get(categoria, categoria.title() if categoria else ""),
            "riscoScore": _safe_int(deal.get("Risco_Score")),
            "riskTags": risk_items,
            "iaNota": round(confianca, 1) if confianca else None,
            "iaNotaLabel": ia_label,
            "riscoPrincipal": (deal.get("Risco_Principal") or "").strip(),
            "acaoSugerida": (deal.get("Acao_Sugerida") or "").strip(),
            "justificativaIA": (deal.get("Justificativa_IA") or "").strip(),
        }
    }


def compute_aligned_risk(deal: Dict[str, Any]) -> Dict[str, Any]:
    """Compute risk score/category using fields that already exist in the opportunity.

    Goal: align what we show with `Risco_Principal` + `Flags_de_Risco` + hygiene signals.
    This is deterministic (no IA on-demand), so it updates whenever BigQuerySync updates.
    """
    score = 0
    tags: List[str] = []
    reasons: List[str] = []

    atividades = _safe_int(deal.get("Atividades"))
    dias_funil = _safe_int(deal.get("Dias_Funil"))
    idle_dias = _safe_int(deal.get("Idle_Dias"))
    confianca = _safe_float(deal.get("Confianca"))
    territorio = (deal.get("Territorio") or "").strip()

    risco_principal = (deal.get("Risco_Principal") or "").strip()
    flags_text = (deal.get("Flags_de_Risco") or "").strip()
    incoerencia = (deal.get("Incoerencia_Detectada") or "").strip()
    bant_score = _safe_int(deal.get("BANT_Score"))
    meddicscore = _safe_int(deal.get("MEDDIC_Score"))

    flags_upper = flags_text.upper()
    risco_upper = risco_principal.upper()

    # Hygiene/basic risk signals
    if atividades <= 0:
        score += 1
        tags.append("SEM_ATIVIDADE")
        reasons.append("Sem atividades")

    if dias_funil > 90:
        score += 1
        tags.append("FUNIL_LONGO")
        reasons.append(f">90 dias no funil ({dias_funil})")

    if territorio.lower() == "incorreto":
        score += 1
        tags.append("TERRITORIO_ERRADO")
        reasons.append("Território incorreto")

    if confianca and confianca < 30:
        score += 1
        tags.append("CONFIANCA_BAIXA")
        reasons.append("Confiança < 30")

    if idle_dias > 30:
        score += 1
        tags.append("IDLE_ALTO")
        reasons.append(f"Idle alto ({idle_dias}d)")

    if incoerencia and incoerencia.upper() not in {"OK", "N/A", "-"}:
        score += 1
        tags.append("INCOERENCIA")
        reasons.append("Incoerência detectada")

    if bant_score and bant_score < 50:
        score += 1
        tags.append("BANT_BAIXO")
        reasons.append("BANT baixo")

    if meddicscore and meddicscore < 50:
        score += 1
        tags.append("MEDDIC_BAIXO")
        reasons.append("MEDDIC baixo")

    # Business/severity signals from IA flags (these should dominate)
    severe = False
    if any(k in risco_upper for k in ["RISCO-OPERACIONAL", "OPERACIONAL", "COBRANCA", "ADMINISTRATIVA"]):
        score += 3
        severe = True
        tags.append("RISCO_OPERACIONAL")
        reasons.append(f"Risco principal: {risco_principal}")

    if any(k in flags_upper for k in ["COBRANCA", "COBRANÇA", "RISCO-OPERACIONAL", "OPERACIONAL"]):
        score += 3
        severe = True
        tags.append("FLAG_OPERACIONAL")
        reasons.append("Flags indicam risco operacional/cobrança")

    if any(k in flags_upper for k in ["ALERTA DE ESTAGNA", "OPORTUNIDADE ESTAGN", "DEAL ESTAGN"]):
        score += 2
        tags.append("ESTAGNADO")
        reasons.append("Estagnação")

    if "BANT AUSENTE" in flags_upper:
        score += 2
        tags.append("BANT_AUSENTE")
        reasons.append("BANT ausente")

    if "PROCESSO PÚBLICO" in flags_upper or "PROCESSO PUBLICO" in flags_upper:
        score += 2
        tags.append("PROCESSO_PUBLICO")
        reasons.append("Processo público")

    # Keep raw score for categorization thresholds, but clamp the displayed score.
    raw_score = score
    score = max(0, min(raw_score, 5))

    # Category aligned to risk (still keeps ZUMBI explicit)
    if atividades <= 0 and dias_funil > 90:
        categoria = "ZUMBI"
    elif severe or raw_score >= 6:
        categoria = "CRITICO"
    elif raw_score >= 3:
        categoria = "ALTA_PRIORIDADE"
    else:
        categoria = "MONITORAR"

    # Build a compact risk tags string for UI
    # Keep existing tokens too (from the view) to not lose compatibility.
    existing_tokens = _split_tokens(deal.get("Risk_Tags"))
    all_tokens = []
    for t in existing_tokens + tags:
        if t and t not in all_tokens:
            all_tokens.append(t)
    risk_tags_str = ",".join(all_tokens) + ("," if all_tokens else "")

    return {
        "Risco_Score": score,
        "Categoria_Pauta": categoria,
        "Risk_Tags": risk_tags_str,
        "risk_reasons": reasons,
    }


def get_sabatina_questions(deal: Dict[str, Any]) -> List[str]:
    """Return questions provided by IA in BigQuery (no hardcoded generation)."""
    return parse_audit_questions(deal.get("Perguntas_de_Auditoria_IA"))


def search_similar_deals_rag(deal_content: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Search for similar historical deals using vector embeddings.
    """
    try:
        client = get_bq_client()
        
        query_sql = f"""
        WITH query_embedding AS (
          SELECT text_embedding AS embedding
          FROM ML.GENERATE_TEXT_EMBEDDING(
            MODEL `{PROJECT_ID}.{DATASET_ID}.text_embedding_model`,
            (SELECT @deal_content AS content)
          )
        )
        SELECT
          base.deal_id,
          base.source,
          base.Oportunidade,
          base.Vendedor,
          base.Conta,
          base.Gross,
          base.Net,
          base.Fiscal_Q,
          base.content,
          distance
        FROM VECTOR_SEARCH(
          (
            SELECT *
            FROM `{PROJECT_ID}.{DATASET_ID}.deal_embeddings`
            WHERE source IN ('won', 'lost')  -- Only historical deals
          ),
          'embedding',
          (SELECT embedding FROM query_embedding),
          top_k => @top_k,
          distance_type => 'COSINE'
        )
        ORDER BY distance ASC
        """
        
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("deal_content", "STRING", deal_content),
                bigquery.ScalarQueryParameter("top_k", "INT64", top_k),
            ]
        )
        
        results = client.query(query_sql, job_config=job_config).result()
        return [dict(row) for row in results]
    
    except Exception as e:
        # If RAG fails, return empty (non-blocking)
        print(f"RAG search failed: {e}")
        return []


def generate_seller_feedback(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate performance feedback for a seller based on their metrics.
    
    Returns:
    - status: "excellent" | "good" | "needs_improvement" | "critical"
    - message: Human-readable feedback
    - recommendations: List of actionable items
    """
    nota = metrics.get("Nota_Higiene", "N/A")
    pipeline_podre = metrics.get("Percent_Pipeline_Podre", 0)
    zumbis = metrics.get("Deals_Zumbi", 0)
    win_rate = metrics.get("Win_Rate")
    pipeline_deals = metrics.get("Pipeline_Deals", 0)
    closed_deals = metrics.get("Closed_Deals", 0)
    
    recommendations = []
    
    # Determine status
    if nota in ["A", "B"] and zumbis == 0 and (win_rate or 0) >= 50:
        status = "excellent"
        message = f"Excelente performance. Nota {nota}, pipeline limpo e win rate de {win_rate or 0:.0f}%."
    elif nota in ["B", "C"] and zumbis <= 2:
        status = "good"
        message = f"Boa performance, nota {nota}. Continue o bom trabalho."
    elif nota in ["D", "F"] or zumbis > 5 or pipeline_podre > 35:
        status = "critical"
        message = f"CRÍTICO: Nota {nota}, {zumbis} deals zumbis, {pipeline_podre:.1f}% pipeline podre."
    else:
        status = "needs_improvement"
        message = f"Performance precisa melhorar. Nota {nota}, {zumbis} deals zumbis."
    
    # Generate recommendations
    if zumbis > 0:
        recommendations.append(f"Limpar {zumbis} deals zumbis: reativar ou desqualificar")
    
    if pipeline_podre > 20:
        recommendations.append(f"Reduzir pipeline podre de {pipeline_podre:.1f}% para < 20%")
    
    if pipeline_deals > 0 and closed_deals == 0:
        recommendations.append("Nenhum deal fechado ainda no quarter - focar em conversão")
    
    if win_rate and win_rate < 40:
        recommendations.append(f"Win rate de {win_rate:.0f}% está baixo - revisar qualificação")
    
    if not recommendations:
        recommendations.append("Manter cadência de atividades e atualização do pipeline")
    
    return {
        "status": status,
        "message": message,
        "recommendations": recommendations
    }


@router.get("/weekly-agenda")
async def get_weekly_agenda(
    quarter: Optional[str] = Query(None, description="Filtrar por quarter (ex: FY26-Q1). Default = quarter atual"),
    seller: Optional[str] = Query(None, description="Filtrar por vendedor específico"),
    start_date: Optional[str] = Query(None, description="Filtro global: data início (yyyy-mm-dd) para atividades (usa Data_de_criacao)"),
    end_date: Optional[str] = Query(None, description="Filtro global: data fim (yyyy-mm-dd) para atividades (usa Data_de_criacao)"),
    include_rag: bool = Query(False, description="Incluir busca RAG de deals similares (pode deixar a resposta mais lenta)"),
    max_rag_deals: int = Query(15, ge=0, le=100, description="Máximo de deals para executar RAG (quando include_rag=true)"),
):
    """
    Get enriched weekly agenda for pipeline review meetings.
    
    **Key Features:**
    - Shows ALL deals from selected quarter (or current quarter by default)
    - Grouped by seller with performance metrics
    - Includes coaching questions for each deal
    - RAG insights from similar historical deals
    - Performance feedback (grade, pipeline health, win rate)
    
    **Returns:**
    - `quarter`: Fiscal quarter being analyzed
    - `sellers`: List of sellers with their deals and metrics
    """
    try:
        client = get_bq_client()
        
        # Use provided quarter or default to current
        target_quarter = quarter if quarter else get_current_fiscal_quarter()
        
        sellers: List[str] = []
        if seller:
            sellers = [s.strip() for s in seller.split(',') if s.strip()]
        apply_seller_filter = len(sellers) > 0

        # Global activity date filter (by creation date)
        parsed_start = _parse_iso_date(start_date)
        parsed_end = _parse_iso_date(end_date)
        if (start_date and not parsed_start) or (end_date and not parsed_end):
            raise HTTPException(status_code=400, detail="Parâmetros start_date/end_date inválidos. Use yyyy-mm-dd")
        if parsed_start and parsed_end and parsed_start > parsed_end:
            raise HTTPException(status_code=400, detail="start_date não pode ser maior que end_date")

        if not parsed_start and not parsed_end:
            parsed_start = _current_week_start_utc()
            parsed_end = datetime.utcnow().date()
        elif parsed_start and not parsed_end:
            parsed_end = datetime.utcnow().date()
        elif parsed_end and not parsed_start:
            # If only end is provided, use a 7-day window ending at end_date.
            parsed_start = parsed_end - timedelta(days=6)

        # From here on, we always operate with a concrete [start, end] window.
        assert parsed_start is not None
        assert parsed_end is not None
        
        # Query 1: Get ALL deals from selected quarter (not just critical ones)
        deals_query = f"""
                SELECT *
                FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
                WHERE Fiscal_Q = @quarter
                    AND (@apply_seller_filter = FALSE OR Vendedor IN UNNEST(@sellers))
                ORDER BY 
                    Vendedor,
                    CASE Categoria_Pauta
                        WHEN 'ZUMBI' THEN 1
                        WHEN 'CRITICO' THEN 2
                        WHEN 'ALTA_PRIORIDADE' THEN 3
                        ELSE 4
                    END,
                    Risco_Score DESC,
                    Gross DESC
                """

        deals_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                bigquery.ScalarQueryParameter("apply_seller_filter", "BOOL", apply_seller_filter),
                bigquery.ArrayQueryParameter("sellers", "STRING", sellers),
            ]
        )

        deals_results = client.query(deals_query, job_config=deals_job_config).result()
        all_deals = [dict(row) for row in deals_results]
        
        if not all_deals:
            return {
                "success": True,
                "timestamp": datetime.utcnow().isoformat(),
                "quarter": target_quarter,
                "message": f"Nenhum deal encontrado para {target_quarter}",
                "sellers": []
            }
        
        # Query 2: Get seller metrics CALCULATED FOR THE SELECTED QUARTER
        vendor_list = list(set(d.get("Vendedor") for d in all_deals if d.get("Vendedor")))
        
        metrics_query = f"""
        WITH pipeline_vendedor AS (
          SELECT 
            Vendedor,
            ROUND(SUM(Gross), 2) as Pipeline_Gross,
            ROUND(SUM(Net), 2) as Pipeline_Net,
            COUNT(*) as Pipeline_Deals,
            -- Zumbis: >90 dias sem atividade
            COUNT(CASE 
              WHEN (Atividades IS NULL OR Atividades = 0)
                AND Dias_Funil IS NOT NULL
                AND SAFE_CAST(Dias_Funil AS INT64) > 90
              THEN 1 
            END) as Deals_Zumbi,
            -- Pipeline Podre (apenas deals sem atividades)
            ROUND(
              100.0 * COUNT(
                CASE 
                  WHEN (Atividades IS NULL OR Atividades = 0)
                  THEN 1 
                END
              ) / NULLIF(COUNT(*), 0), 
              2
            ) as Percent_Pipeline_Podre
          FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
                    WHERE Fiscal_Q = @quarter
                        AND Vendedor IN UNNEST(@vendors)
          GROUP BY Vendedor
        ),
        closed_vendedor AS (
          SELECT 
            Vendedor,
            ROUND(SUM(Gross), 2) as Closed_Gross,
            ROUND(SUM(Net), 2) as Closed_Net,
            COUNT(*) as Closed_Deals
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
                    WHERE Fiscal_Q = @quarter
                        AND Vendedor IN UNNEST(@vendors)
          GROUP BY Vendedor
        ),
        lost_vendedor AS (
          SELECT 
            Vendedor,
            COUNT(*) as Lost_Deals
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
                    WHERE Fiscal_Q = @quarter
                        AND Vendedor IN UNNEST(@vendors)
          GROUP BY Vendedor
        )
        SELECT 
          COALESCE(p.Vendedor, c.Vendedor, l.Vendedor) as Vendedor,
          COALESCE(p.Pipeline_Gross, 0) as Pipeline_Gross,
          COALESCE(p.Pipeline_Net, 0) as Pipeline_Net,
          COALESCE(p.Pipeline_Deals, 0) as Pipeline_Deals,
          COALESCE(c.Closed_Gross, 0) as Closed_Gross,
          COALESCE(c.Closed_Net, 0) as Closed_Net,
          COALESCE(c.Closed_Deals, 0) as Closed_Deals,
          COALESCE(l.Lost_Deals, 0) as Lost_Deals,
          COALESCE(p.Deals_Zumbi, 0) as Deals_Zumbi,
          COALESCE(p.Percent_Pipeline_Podre, 0) as Percent_Pipeline_Podre,
          -- Total Forecast = Pipeline + Closed
          ROUND(COALESCE(p.Pipeline_Net, 0) + COALESCE(c.Closed_Net, 0), 2) as Total_Forecast,
          -- Win Rate (se tiver deals fechados)
          CASE 
            WHEN (COALESCE(c.Closed_Deals, 0) + COALESCE(l.Lost_Deals, 0)) > 0
            THEN ROUND(100.0 * COALESCE(c.Closed_Deals, 0) / 
                 (COALESCE(c.Closed_Deals, 0) + COALESCE(l.Lost_Deals, 0)), 1)
            ELSE NULL
          END as Win_Rate,
          -- Nota de Higiene (simplified)
          CASE 
            WHEN COALESCE(p.Percent_Pipeline_Podre, 0) <= 10 THEN 'A'
            WHEN COALESCE(p.Percent_Pipeline_Podre, 0) <= 25 THEN 'B'
            WHEN COALESCE(p.Percent_Pipeline_Podre, 0) <= 50 THEN 'C'
            WHEN COALESCE(p.Percent_Pipeline_Podre, 0) <= 75 THEN 'D'
            ELSE 'F'
          END as Nota_Higiene
        FROM pipeline_vendedor p
        FULL OUTER JOIN closed_vendedor c ON p.Vendedor = c.Vendedor
        FULL OUTER JOIN lost_vendedor l ON p.Vendedor = l.Vendedor
        """

        metrics_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                bigquery.ArrayQueryParameter("vendors", "STRING", vendor_list),
            ]
        )
        
        try:
            print(f"[WEEKLY_AGENDA] Executing metrics query for {len(vendor_list)} vendors: {vendor_list[:3]}...")
            metrics_results = client.query(metrics_query, job_config=metrics_job_config).result()
            seller_metrics = {row["Vendedor"]: dict(row) for row in metrics_results}
            print(f"[WEEKLY_AGENDA] Got metrics for {len(seller_metrics)} vendors")
            if seller_metrics:
                sample_vendor = list(seller_metrics.keys())[0]
                print(f"[WEEKLY_AGENDA] Sample metrics for {sample_vendor}: {seller_metrics[sample_vendor]}")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] ERROR in metrics query: {str(e)}")
            print(f"[WEEKLY_AGENDA] Query was: {metrics_query[:500]}...")
            seller_metrics = {}  # Continue with empty metrics

        # Query 2.5: Deals Perdidos detalhados (para auditoria)
        lost_deals_by_vendor: Dict[str, List[Dict[str, Any]]] = {}
        print(f"[WEEKLY_AGENDA] DEBUG: Starting lost deals query for quarter={target_quarter}, vendors_count={len(vendor_list)}")
        try:
            lost_deals_query = f"""
            SELECT 
                Vendedor,
                Oportunidade,
                Conta,
                Gross,
                Net,
                Forecast,
                Fiscal_Q,
                Data_Fechamento,
                Motivo_Perda
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
            WHERE Fiscal_Q = @quarter
                AND Vendedor IN UNNEST(@vendors)
            ORDER BY Vendedor, Gross DESC
            LIMIT 1000
            """
            
            lost_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                    bigquery.ArrayQueryParameter("vendors", "STRING", vendor_list),
                ]
            )
            
            lost_results = client.query(lost_deals_query, job_config=lost_job_config).result()
            lost_rows = list(lost_results)
            print(f"[WEEKLY_AGENDA] DEBUG: Lost deals query returned {len(lost_rows)} rows")
            for row in lost_rows:
                vendedor = row["Vendedor"]
                if vendedor not in lost_deals_by_vendor:
                    lost_deals_by_vendor[vendedor] = []
                lost_deals_by_vendor[vendedor].append({
                    "oportunidade": row["Oportunidade"],
                    "conta": row["Conta"],
                    "gross": float(row["Gross"]) if row.get("Gross") else 0,
                    "net": float(row["Net"]) if row.get("Net") else 0,
                    "forecast": row.get("Forecast"),
                    "fiscal_q": row.get("Fiscal_Q"),
                    "data_fechamento": str(row["Data_Fechamento"])[:10] if row.get("Data_Fechamento") else None,
                    "motivo_perda": row.get("Motivo_Perda")
                })
            print(f"[WEEKLY_AGENDA] Got lost deals for {len(lost_deals_by_vendor)} vendors")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: lost deals query failed: {str(e)}")
            lost_deals_by_vendor = {}

        # Query 2B: Closed Deals (won) Drill-Down for "auditoria"
        closed_deals_by_vendor: Dict[str, List[Dict[str, Any]]] = {}
        print(f"[WEEKLY_AGENDA] DEBUG: Starting closed deals query for quarter={target_quarter}, vendors_count={len(vendor_list)}")
        try:
            closed_deals_query = f"""
            SELECT 
                Vendedor,
                Oportunidade,
                Conta,
                Gross,
                Net,
                Forecast,
                Fiscal_Q,
                Data_Fechamento
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            WHERE Fiscal_Q = @quarter
                AND Vendedor IN UNNEST(@vendors)
            ORDER BY Vendedor, Gross DESC
            LIMIT 1000
            """
            
            closed_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                    bigquery.ArrayQueryParameter("vendors", "STRING", vendor_list)
                ]
            )
            
            closed_result = client.query(closed_deals_query, job_config=closed_job_config).result()
            closed_rows = list(closed_result)
            print(f"[WEEKLY_AGENDA] DEBUG: Closed deals query returned {len(closed_rows)} rows")
            for row in closed_rows:
                vendedor = row["Vendedor"]
                if vendedor not in closed_deals_by_vendor:
                    closed_deals_by_vendor[vendedor] = []
                
                closed_deals_by_vendor[vendedor].append({
                    "oportunidade": row["Oportunidade"],
                    "conta": row["Conta"],
                    "gross": float(row["Gross"]) if row["Gross"] is not None else 0.0,
                    "net": float(row["Net"]) if row["Net"] is not None else 0.0,
                    "forecast": row.get("Forecast"),
                    "fiscal_q": row.get("Fiscal_Q"),
                    "data_fechamento": str(row["Data_Fechamento"])[:10] if row.get("Data_Fechamento") else None
                })
            
            print(f"[WEEKLY_AGENDA] INFO: Loaded closed deals drill-down for {len(closed_deals_by_vendor)} vendors")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: closed deals query failed: {str(e)}")
            closed_deals_by_vendor = {}

        # Query 3: Pulso Semanal (atividades + qualidade), filtrado por Data_de_criacao
        pulse_by_vendor: Dict[str, Dict[str, Any]] = {}
        try:
            pulse_query = f"""
            WITH
                date_params AS (
                    SELECT
                        @start_date AS start_date,
                        @end_date AS end_date
                ),
                vendor_map AS (
                    SELECT
                        vendor,
                        vend_norm,
                        SPLIT(vend_norm, ' ') AS vend_parts,
                        SPLIT(vend_norm, ' ')[OFFSET(0)] AS vend_first,
                        SPLIT(vend_norm, ' ')[OFFSET(ARRAY_LENGTH(SPLIT(vend_norm, ' ')) - 1)] AS vend_last
                    FROM (
                        SELECT
                            v AS vendor,
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    NORMALIZE_AND_CASEFOLD(TRIM(v), NFD),
                                    r'\\pM',
                                    ''
                                ),
                                r'\\s+',
                                ' '
                            ) AS vend_norm
                        FROM UNNEST(@vendors) v
                    )
                    WHERE vend_norm IS NOT NULL AND vend_norm != ''
                ),
                base AS (
                    SELECT
                        Atribuido AS Vendedor,
                        vm.vend_norm AS VendedorKey,
                        COALESCE(
                            SAFE_CAST(Data_de_criacao AS DATE),
                            SAFE_CAST(Data AS DATE)
                        ) AS CreatedDate,
                        EmpresaConta AS EmpresaConta,
                        Tipo_de_Actividad AS TipoAtividade,
                        Comentarios_completos AS ComentariosCompletos,
                        Comentarios AS Comentarios,
                        Assunto AS Assunto,
                        Oportunidade AS Oportunidade,
                        Contato AS Contato,
                        Local AS Local,
                        Status AS Status
                    FROM `{PROJECT_ID}.{DATASET_ID}.atividades`
                    JOIN vendor_map vm
                        ON (
                            REGEXP_REPLACE(
                                REGEXP_REPLACE(
                                    NORMALIZE_AND_CASEFOLD(TRIM(Atribuido), NFD),
                                    r'\\pM',
                                    ''
                                ),
                                r'\\s+',
                                ' '
                            ) = vm.vend_norm
                            OR (
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        NORMALIZE_AND_CASEFOLD(TRIM(Atribuido), NFD),
                                        r'\\pM',
                                        ''
                                    ),
                                    r'\\s+',
                                    ' '
                                ) LIKE CONCAT('%', vm.vend_first, '%')
                                AND REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        NORMALIZE_AND_CASEFOLD(TRIM(Atribuido), NFD),
                                        r'\\pM',
                                        ''
                                    ),
                                    r'\\s+',
                                    ' '
                                ) LIKE CONCAT('%', vm.vend_last, '%')
                            )
                        )
                    WHERE COALESCE(
                        SAFE_CAST(Data_de_criacao AS DATE),
                        SAFE_CAST(Data AS DATE)
                    ) BETWEEN (SELECT start_date FROM date_params) AND (SELECT end_date FROM date_params)
                ),
                cleaned AS (
                    SELECT
                        *,
                        LOWER(TRIM(REGEXP_REPLACE(COALESCE(ComentariosCompletos, Comentarios, ''), r'[\\s\\.\\-\\_\\!\\?\\,\\;\\:]+', ' '))) AS comentario_clean
                    FROM base
                ),
                agg AS (
                    SELECT
                        VendedorKey,
                        COUNT(*) AS atividades_semana,
                        COUNTIF(
                            REGEXP_CONTAINS(LOWER(COALESCE(TipoAtividade, '')), r'(reun|video|meeting|reuni)')
                        ) AS reunioes_semana,
                        COUNTIF(
                            LENGTH(TRIM(COALESCE(ComentariosCompletos, Comentarios, ''))) < 30
                            OR comentario_clean IN ('ok','feito','agendado','agendada','done','follow up','followup')
                        ) AS registros_pobres
                    FROM cleaned
                    GROUP BY VendedorKey
                ),
                details AS (
                    SELECT
                        VendedorKey,
                        ARRAY_AGG(
                            STRUCT(
                                CreatedDate AS data,
                                TipoAtividade AS tipo,
                                EmpresaConta AS cliente,
                                Assunto AS assunto,
                                LEFT(TRIM(COALESCE(ComentariosCompletos, Comentarios, '')), 120) AS resumo,
                                IF(
                                    LENGTH(TRIM(COALESCE(ComentariosCompletos, Comentarios, ''))) < 30
                                    OR LOWER(TRIM(REGEXP_REPLACE(COALESCE(ComentariosCompletos, Comentarios, ''), r'[\\s\\.\\-\\_\\!\\?\\,\\;\\:]+', ' '))) IN ('ok','feito','agendado','agendada','done','follow up','followup'),
                                    'ruim',
                                    'boa'
                                ) AS qualidade
                            )
                            ORDER BY CreatedDate DESC
                            LIMIT 12
                        ) AS drill_down
                    FROM cleaned
                    GROUP BY VendedorKey
                ),
                last_acts AS (
                    SELECT
                        VendedorKey,
                        ARRAY_AGG(
                            STRUCT(
                                CreatedDate AS data_criacao,
                                TipoAtividade AS tipo,
                                Status AS status,
                                EmpresaConta AS cliente,
                                Oportunidade AS oportunidade,
                                Contato AS contato,
                                Local AS local,
                                Assunto AS assunto,
                                LEFT(TRIM(COALESCE(ComentariosCompletos, Comentarios, '')), 1200) AS comentarios
                            )
                            ORDER BY CreatedDate DESC
                            LIMIT 15
                        ) AS last_activities
                    FROM cleaned
                    GROUP BY VendedorKey
                )
            SELECT
                a.VendedorKey,
                a.atividades_semana,
                a.reunioes_semana,
                a.registros_pobres,
                d.drill_down AS drill_down,
                la.last_activities AS last_activities
            FROM agg a
            LEFT JOIN details d USING (VendedorKey)
            LEFT JOIN last_acts la USING (VendedorKey)
            """

            pulse_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ArrayQueryParameter("vendors", "STRING", vendor_list),
                    bigquery.ScalarQueryParameter("start_date", "DATE", parsed_start.isoformat()),
                    bigquery.ScalarQueryParameter("end_date", "DATE", parsed_end.isoformat()),
                ]
            )

            pulse_results = client.query(pulse_query, job_config=pulse_job_config).result()
            for row in pulse_results:
                pulse_by_vendor[row["VendedorKey"]] = dict(row)
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: weekly pulse query failed: {str(e)}")
            pulse_by_vendor = {}
        
        # Group deals by seller and enrich
        sellers_data = {}

        rag_remaining = max_rag_deals if include_rag else 0
        
        for deal in all_deals:
            # Align risk/category using the opportunity content (not the simplistic view scoring)
            aligned = compute_aligned_risk(deal)

            # Insight de quarter: quarter do fechamento previsto (Data_Prevista)
            deal["Fechamento_Fiscal_Q"] = fiscal_quarter_from_date(deal.get("Data_Prevista"))

            # Preserve raw values for debugging
            deal["Risco_Score_View"] = deal.get("Risco_Score")
            deal["Categoria_Pauta_View"] = deal.get("Categoria_Pauta")
            deal["Risk_Tags_View"] = deal.get("Risk_Tags")

            deal["Risco_Score"] = aligned["Risco_Score"]
            deal["Categoria_Pauta"] = aligned["Categoria_Pauta"]
            deal["Risk_Tags"] = aligned["Risk_Tags"]
            deal["risk_reasons"] = aligned["risk_reasons"]

            # Campos amigáveis pro front (sem underscore) e prontos para UI
            deal.update(_build_ui_fields(deal))

            vendedor = deal.get("Vendedor", "Unknown")
            
            if vendedor not in sellers_data:
                # Initialize seller entry
                metrics = seller_metrics.get(vendedor, {})
                
                # Calculate additional metrics from deals
                seller_deals_preview = [d for d in all_deals if d.get("Vendedor") == vendedor]
                
                avg_cycle = round(
                    sum(_safe_int(d.get("Dias_Funil")) for d in seller_deals_preview) / len(seller_deals_preview)
                ) if seller_deals_preview else 0
                
                sellers_data[vendedor] = {
                    "vendedor": vendedor,
                    "performance": {
                        "nota_higiene": metrics.get("Nota_Higiene", "N/A"),
                        "pipeline_podre_pct": round(metrics.get("Percent_Pipeline_Podre", 0), 1),
                        "deals_zumbi": metrics.get("Deals_Zumbi", 0),
                        "pipeline_net_k": round(metrics.get("Pipeline_Net", 0) / 1000, 0),
                        "closed_net_k": round(metrics.get("Closed_Net", 0) / 1000, 0),
                        "win_rate": metrics.get("Win_Rate"),
                        "total_forecast_k": round(metrics.get("Total_Forecast", 0) / 1000, 0),
                        "pipeline_deals": metrics.get("Pipeline_Deals", 0),
                        # NEW: Additional metrics
                        "closed_deals": metrics.get("Closed_Deals", 0),
                        "lost_deals": metrics.get("Lost_Deals", 0),
                        "ciclo_medio_dias": avg_cycle,
                        "pipeline_gross_k": round(metrics.get("Pipeline_Gross", 0) / 1000, 0),
                        "closed_gross_k": round(metrics.get("Closed_Gross", 0) / 1000, 0),
                    },
                    "feedback": generate_seller_feedback(metrics),
                    "pulse": {
                        "periodo": {
                            "inicio": parsed_start.isoformat() if parsed_start else None,
                            "fim": parsed_end.isoformat() if parsed_end else None,
                        },
                        "atividades_periodo": 0,
                        "reunioes_periodo": 0,
                        "trend": "flat",
                        "qualidade_registros": {
                            "pobres": 0,
                            "total": 0,
                            "score": "N/A",
                        },
                        "activities": [],
                    },
                    "deals": [],
                    "lost_deals_detail": lost_deals_by_vendor.get(vendedor, []),
                    "closed_deals_detail": closed_deals_by_vendor.get(vendedor, []),
                    "summary": {
                        "total_deals": 0,
                        "zumbis": 0,
                        "criticos": 0,
                        "alta_prioridade": 0,
                        "monitorar": 0,
                        "total_gross_k": 0,
                        "total_net_k": 0,
                        "avg_confianca": 0
                    }
                }
            
            # Enrich deal with sabatina and RAG
            sabatina = get_sabatina_questions(deal)
            
            similar_deals = []
            if include_rag and rag_remaining > 0 and deal.get("Categoria_Pauta") in {"ZUMBI", "CRITICO", "ALTA_PRIORIDADE"}:
                deal_search_text = f"""
                Oportunidade: {deal.get('Oportunidade', '')}
                Conta: {deal.get('Conta', '')}
                Produtos: {deal.get('Produtos', '')}
                Perfil: {deal.get('Perfil_Cliente', '')}
                Gross: {deal.get('Gross', 0)}
                Categoria: {deal.get('Categoria_Pauta', '')}
                Riscos: {deal.get('Risk_Tags', '')}
                Risco Principal: {deal.get('Risco_Principal', '')}
                Flags: {deal.get('Flags_de_Risco', '')}
                """
                similar_deals = search_similar_deals_rag(deal_search_text, top_k=3)
                rag_remaining -= 1
            
            enriched_deal = {
                **deal,
                "sabatina_questions": sabatina,
                "similar_deals": similar_deals
            }
            
            sellers_data[vendedor]["deals"].append(enriched_deal)
            
            # Update seller summary
            sellers_data[vendedor]["summary"]["total_deals"] += 1
            categoria = deal.get("Categoria_Pauta", "")
            if categoria == "ZUMBI":
                sellers_data[vendedor]["summary"]["zumbis"] += 1
            elif categoria == "CRITICO":
                sellers_data[vendedor]["summary"]["criticos"] += 1
            elif categoria == "ALTA_PRIORIDADE":
                sellers_data[vendedor]["summary"]["alta_prioridade"] += 1
            else:
                sellers_data[vendedor]["summary"]["monitorar"] += 1
            
            sellers_data[vendedor]["summary"]["total_gross_k"] += (deal.get("Gross", 0) or 0) / 1000
            sellers_data[vendedor]["summary"]["total_net_k"] += (deal.get("Net", 0) or 0) / 1000
            sellers_data[vendedor]["summary"]["avg_confianca"] += deal.get("Confianca", 0) or 0
        
        # Finalize averages
        for seller_data in sellers_data.values():
            total = seller_data["summary"]["total_deals"]
            if total > 0:
                seller_data["summary"]["avg_confianca"] = round(
                    seller_data["summary"]["avg_confianca"] / total, 1
                )
            seller_data["summary"]["total_gross_k"] = round(seller_data["summary"]["total_gross_k"], 0)
            seller_data["summary"]["total_net_k"] = round(seller_data["summary"]["total_net_k"], 0)

            # Attach pulse from activities query
            vendor_name = seller_data.get("vendedor")
            pulse_row = pulse_by_vendor.get(_normalize_vendor(vendor_name), {})
            atividades = _safe_int(pulse_row.get("atividades_semana"))
            reunioes = _safe_int(pulse_row.get("reunioes_semana"))
            registros_pobres = _safe_int(pulse_row.get("registros_pobres"))

            total_registros = max(atividades, 0)
            poor_ratio = (registros_pobres / total_registros) if total_registros else 0.0
            if total_registros == 0:
                quality_score = "N/A"
            elif poor_ratio <= 0.10:
                quality_score = "A"
            elif poor_ratio <= 0.25:
                quality_score = "B"
            elif poor_ratio <= 0.40:
                quality_score = "C"
            else:
                quality_score = "D"

            drill = pulse_row.get("drill_down") or []
            if isinstance(drill, list):
                drill = [dict(a) for a in drill]
            drill_out = []
            for a in drill:
                d = _coerce_to_date(a.get("data"))
                drill_out.append({
                    "data": d.strftime("%d/%m") if d else (str(a.get("data") or "")[:10]),
                    "tipo": a.get("tipo"),
                    "cliente": a.get("cliente"),
                    "resumo": a.get("resumo"),
                    "qualidade": a.get("qualidade"),
                })

            last_activities = pulse_row.get("last_activities") or []
            if isinstance(last_activities, list):
                last_activities = [dict(a) for a in last_activities]

            # Precompute IA summaries for long activity comments (bounded per response)
            summary_budget = _ACTIVITY_SUMMARY_MAX_PER_RESPONSE
            summary_by_raw: Dict[str, str] = {}
            
            print(f"[WEEKLY_AGENDA] IA Summary check: budget={summary_budget}, GEMINI_API_KEY={'SET' if GEMINI_API_KEY else 'NOT SET'}, activities={len(last_activities)}")
            
            if summary_budget > 0 and GEMINI_API_KEY:
                print(f"[WEEKLY_AGENDA] Processing activity summaries for {vendor_name} (budget: {summary_budget})")
                seen_texts: List[str] = []
                seen_set = set()
                for a in last_activities:
                    raw = (a.get("comentarios") or "")
                    raw = str(raw).strip()
                    if len(raw) <= 300:
                        continue
                    if raw in seen_set:
                        continue
                    seen_set.add(raw)
                    seen_texts.append(raw)
                
                print(f"[WEEKLY_AGENDA] Found {len(seen_texts)} unique activities with >300 chars for {vendor_name}")
                
                for raw in seen_texts[:summary_budget]:
                    s = _summarize_activity_text(raw)
                    if s:
                        summary_by_raw[raw] = s
                        print(f"[WEEKLY_AGENDA] Generated summary for text ({len(raw)} chars): {s[:60]}...")
                    else:
                        print(f"[WEEKLY_AGENDA] Failed to generate summary for text ({len(raw)} chars)")
            else:
                if not GEMINI_API_KEY:
                    print(f"[WEEKLY_AGENDA] Skipping IA summaries for {vendor_name}: GEMINI_API_KEY not configured")
                elif summary_budget <= 0:
                    print(f"[WEEKLY_AGENDA] Skipping IA summaries for {vendor_name}: budget={summary_budget}")


            last_out = []
            for a in last_activities:
                d = _coerce_to_date(a.get("data_criacao"))
                comentarios = a.get("comentarios")
                raw_text = str(comentarios or "").strip()
                resumo_ia = summary_by_raw.get(raw_text) if raw_text and len(raw_text) > 300 else None
                last_out.append({
                    "data_criacao": d.isoformat() if d else (str(a.get("data_criacao") or "")[:10]),
                    "tipo": a.get("tipo"),
                    "status": a.get("status"),
                    "cliente": a.get("cliente"),
                    "oportunidade": a.get("oportunidade"),
                    "contato": a.get("contato"),
                    "local": a.get("local"),
                    "assunto": a.get("assunto"),
                    "comentarios": comentarios,
                    "resumo_ia": resumo_ia,
                })

            META_ATIVIDADES = 20
            META_REUNIOES = 5

            seller_data["pulse"] = {
                "atividades_semana": atividades,
                "meta_atividades": META_ATIVIDADES,
                "reunioes_semana": reunioes,
                "meta_reunioes": META_REUNIOES,
                "qualidade_registros": {
                    "pobres": registros_pobres,
                    "total": total_registros,
                    "score": quality_score,
                },
                "drill_down": drill_out,
                "last_activities": last_out,
                "periodo": {
                    "inicio": parsed_start.isoformat() if parsed_start else None,
                    "fim": parsed_end.isoformat() if parsed_end else None,
                },
            }

            # Sort deals using aligned category + aligned risk score
            category_order = {"ZUMBI": 1, "CRITICO": 2, "ALTA_PRIORIDADE": 3, "MONITORAR": 4}
            seller_data["deals"].sort(
                key=lambda d: (
                    category_order.get(d.get("Categoria_Pauta"), 99),
                    -(d.get("Risco_Score") or 0),
                    -(d.get("Gross") or 0),
                )
            )
        
        # Convert to list and sort by forecast
        sellers_list = sorted(
            sellers_data.values(),
            key=lambda x: x["performance"]["total_forecast_k"],
            reverse=True
        )
        
        # Overall summary
        overall_summary = {
            "quarter": target_quarter,
            "total_sellers": len(sellers_list),
            "total_deals": sum(s["summary"]["total_deals"] for s in sellers_list),
            "total_zumbis": sum(s["summary"]["zumbis"] for s in sellers_list),
            "total_criticos": sum(s["summary"]["criticos"] for s in sellers_list),
            "total_alta_prioridade": sum(s["summary"]["alta_prioridade"] for s in sellers_list),
            "total_monitorar": sum(s["summary"]["monitorar"] for s in sellers_list),
            "total_gross_k": round(sum(s["summary"]["total_gross_k"] for s in sellers_list), 0),
            "total_net_k": round(sum(s["summary"]["total_net_k"] for s in sellers_list), 0)
        }
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "quarter": target_quarter,
            "summary": overall_summary,
            "sellers": sellers_list,
            "config": {
                "include_rag": include_rag,
                "seller_filter": seller if seller else "ALL",
                "quarter_filter": target_quarter
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar pauta semanal: {str(e)}")
# Force rebuild Wed Feb 11 21:28:24 UTC 2026
