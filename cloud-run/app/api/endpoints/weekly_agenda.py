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
from functools import lru_cache

import google.generativeai as genai
from google.cloud import firestore

try:
    import holidays as pyholidays  # type: ignore[import-not-found]
except Exception:
    pyholidays = None

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-preview-09-2025")

ACTIVITY_SUMMARY_FIRESTORE_COLLECTION = os.getenv("ACTIVITY_SUMMARY_FIRESTORE_COLLECTION", "")

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)  # type: ignore[attr-defined]
        print(f"[WEEKLY_AGENDA] Gemini configured successfully with model: {GEMINI_MODEL}")
    except Exception as e:
        # Fail-safe: keep AI disabled
        print(f"[WEEKLY_AGENDA] WARN: Gemini config failed: {str(e)}")
        GEMINI_API_KEY = None
else:
    print("[WEEKLY_AGENDA] WARN: GEMINI_API_KEY not set; activity summaries disabled")

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


def _firestore_set_summary(doc_id: str, summary: str, *, model: str, text_len: int, prompt_version: str = "v2-meddic-risks-actions") -> None:
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
                "prompt_version": prompt_version,
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


def _summarize_activity_text(text: str, *, prompt_profile: str = "bdm") -> Optional[str]:
    """Summarize a long activity description in Portuguese.

    Fail-safe: returns None if AI is disabled/unavailable.
    """
    if not GEMINI_API_KEY:
        return None
    cleaned = (text or "").strip()
    if not cleaned:
        return None

    profile = str(prompt_profile or "bdm").strip().lower()
    if profile not in {"bdm", "cs_ce"}:
        profile = "bdm"

    h = hashlib.sha256(f"{profile}|{cleaned}".encode("utf-8")).hexdigest()
    cached = _cache_get_summary(h)
    if cached:
        return cached

    # Persistent cache (optional): Firestore lookup by text hash
    persisted = _firestore_get_summary(h)
    if persisted:
        _cache_set_summary(h, persisted)
        return persisted

    # Input guardrail: prevent huge payloads to the model
    if len(cleaned) > 6000:
        cleaned = cleaned[:6000]

    if profile == "cs_ce":
        role_prompt = """Atue como um Especialista de Customer Engineering / Customer Success analisando uma reunião de ativação, adoção ou evolução de conta.
Seu objetivo é extrair sinais de valor entregue, riscos de adoção e plano de execução com próximos passos objetivos."""
    else:
        role_prompt = """Atue como um Engenheiro de Sales Ops analisando uma transcrição/anotação de CRM.
Seu objetivo é extrair inteligência comercial (MEDDIC) e ação futura."""

    prompt = f"""{role_prompt}

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
- Use PT-BR direto e executivo.
- Não use markdown complexo, apenas plain text com quebras de linha.
- Seja completo e detalhado, incluindo TODOS os pontos relevantes.
""".strip()

    try:
        model = genai.GenerativeModel(GEMINI_MODEL)  # type: ignore[attr-defined]
        res = model.generate_content(prompt)
        out = (getattr(res, "text", None) or "").strip()
        if not out:
            return None

        # Clean output: normalize line breaks
        out = out.replace("\r\n", "\n").strip()

        # Persist (optional) so we don't regenerate for the same activity text
        _firestore_set_summary(
            h,
            out,
            model=GEMINI_MODEL,
            text_len=len(cleaned),
            prompt_version=f"v3-{profile}-meddic-risks-actions",
        )
        _cache_set_summary(h, out)
        return out
    except Exception:
        return None


def _build_activity_summary_map(
    activities: List[Dict[str, Any]],
    *,
    budget: int,
    prompt_profile: str,
) -> Dict[str, str]:
    if budget <= 0 or not GEMINI_API_KEY:
        return {}

    seen_texts: List[str] = []
    seen_set = set()
    for item in activities:
        raw = str(item.get("comentarios") or "").strip()
        if len(raw) <= 300:
            continue
        if raw in seen_set:
            continue
        seen_set.add(raw)
        seen_texts.append(raw)

    summary_by_raw: Dict[str, str] = {}
    for raw in seen_texts[:budget]:
        summary = _summarize_activity_text(raw, prompt_profile=prompt_profile)
        if summary:
            summary_by_raw[raw] = summary
    return summary_by_raw


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


@lru_cache(maxsize=8)
def _br_holidays_for_year(year: int) -> set[date]:
    if pyholidays is None:
        return set()
    try:
        br = pyholidays.BR(years=[year])
        return set(br.keys())
    except Exception:
        return set()


def _count_business_days_br(start_date: date, end_date: date) -> int:
    if start_date > end_date:
        return 0
    total = 0
    cur = start_date
    while cur <= end_date:
        is_weekday = cur.weekday() < 5
        if is_weekday and cur not in _br_holidays_for_year(cur.year):
            total += 1
        cur += timedelta(days=1)
    return total


def _scale_weekly_goal(base_weekly_goal: int, business_days: int) -> int:
    if base_weekly_goal <= 0 or business_days <= 0:
        return 0
    scaled = round((base_weekly_goal * business_days) / 5.0)
    return max(1, int(scaled))


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


def _quarter_bounds_from_label(quarter_label: Optional[str]) -> Optional[tuple[date, date]]:
    if not quarter_label:
        return None
    m = re.match(r"^FY(\d{2})-Q([1-4])$", str(quarter_label).strip().upper())
    if not m:
        return None
    year = 2000 + int(m.group(1))
    quarter_num = int(m.group(2))
    start_month = (quarter_num - 1) * 3 + 1
    start = date(year, start_month, 1)
    if quarter_num == 4:
        end = date(year, 12, 31)
    else:
        next_q_start = date(year, start_month + 3, 1)
        end = next_q_start - timedelta(days=1)
    return (start, end)


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


def _parse_csv_names(value: Optional[str]) -> List[str]:
    if not value:
        return []
    names = [v.strip() for v in str(value).split(",") if v.strip()]
    return names


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
    start_date: Optional[str] = Query(None, description="Filtro global: data início (yyyy-mm-dd) para oportunidades (Data_Prevista) e atividades"),
    end_date: Optional[str] = Query(None, description="Filtro global: data fim (yyyy-mm-dd) para oportunidades (Data_Prevista) e atividades"),
    cs_names: Optional[str] = Query(None, description="Nomes de Customer Engineer separados por vírgula para consolidar atividades"),
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
        sellers = [s.replace("'", "\\'") for s in sellers]
        apply_seller_filter = len(sellers) > 0
        cs_names_list = _parse_csv_names(cs_names)

        # Global activity date filter (by creation date)
        parsed_start = _parse_iso_date(start_date)
        parsed_end = _parse_iso_date(end_date)
        if (start_date and not parsed_start) or (end_date and not parsed_end):
            raise HTTPException(status_code=400, detail="Parâmetros start_date/end_date inválidos. Use yyyy-mm-dd")
        if parsed_start and parsed_end and parsed_start > parsed_end:
            raise HTTPException(status_code=400, detail="start_date não pode ser maior que end_date")

        if not parsed_start and not parsed_end:
            quarter_bounds = _quarter_bounds_from_label(target_quarter)
            if quarter_bounds:
                parsed_start, parsed_end = quarter_bounds
            else:
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
        
        # Query 1: Get deals from selected quarter (date range does NOT filter opportunities)
        # Ordered by priority category, then by forecast close date (earliest first)
        deals_query = f"""
                SELECT *
                FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
                WHERE Fiscal_Q = @quarter
                    AND (
                        @apply_seller_filter = FALSE
                        OR LOWER(TRIM(Vendedor)) IN (
                            SELECT LOWER(TRIM(s)) FROM UNNEST(@sellers) s
                        )
                    )
                ORDER BY 
                    Vendedor,
                    CASE Categoria_Pauta
                        WHEN 'ZUMBI' THEN 1
                        WHEN 'CRITICO' THEN 2
                        WHEN 'ALTA_PRIORIDADE' THEN 3
                        ELSE 4
                    END,
                    SAFE_CAST(Data_Prevista AS DATE) ASC NULLS LAST,
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
        # Build vendor list from pipeline deals for metrics
        vendor_list = list(set(d.get("Vendedor") for d in all_deals if d.get("Vendedor")))
        
        # Query 2.1: Get ALL unique vendors from closed/lost tables for drill-downs
        # (vendors might have closed/lost deals without active pipeline)
        all_vendors_query = f"""
        SELECT DISTINCT Vendedor FROM (
          SELECT Vendedor FROM `{PROJECT_ID}.{DATASET_ID}.pipeline` WHERE Fiscal_Q = @quarter AND Vendedor IS NOT NULL
          UNION DISTINCT
          SELECT Vendedor FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won` WHERE Fiscal_Q = @quarter AND Vendedor IS NOT NULL
          UNION DISTINCT
          SELECT Vendedor FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost` WHERE Fiscal_Q = @quarter AND Vendedor IS NOT NULL
        )
        ORDER BY Vendedor
        """
        
        try:
            all_vendors_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter)
                ]
            )
            all_vendors_result = client.query(all_vendors_query, job_config=all_vendors_job_config).result()
            all_vendor_list = [row["Vendedor"] for row in all_vendors_result]
            print(f"[WEEKLY_AGENDA] Found {len(all_vendor_list)} total vendors across all tables for quarter {target_quarter}")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: Failed to get all vendors: {str(e)}")
            all_vendor_list = vendor_list  # Fallback to pipeline vendors
        
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
                        AND LOWER(TRIM(Vendedor)) IN (
                            SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                        )
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
                        AND LOWER(TRIM(Vendedor)) IN (
                            SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                        )
          GROUP BY Vendedor
        ),
        lost_vendedor AS (
          SELECT 
            Vendedor,
            COUNT(*) as Lost_Deals
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
                    WHERE Fiscal_Q = @quarter
                        AND LOWER(TRIM(Vendedor)) IN (
                            SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                        )
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
        print(f"[WEEKLY_AGENDA] DEBUG: Starting lost deals query for quarter={target_quarter}, total_vendors={len(all_vendor_list)}")
        try:
            lost_deals_query = f"""
            SELECT 
                Vendedor,
                Oportunidade,
                Conta,
                Gross,
                Net,
                Fiscal_Q,
                Data_Fechamento,
                Causa_Raiz as Motivo_Perda
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
            WHERE Fiscal_Q = @quarter
                AND LOWER(TRIM(Vendedor)) IN (
                    SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                )
            ORDER BY Vendedor, Gross DESC
            LIMIT 1000
            """
            
            lost_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                    bigquery.ArrayQueryParameter("vendors", "STRING", all_vendor_list),
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
        print(f"[WEEKLY_AGENDA] DEBUG: Starting closed deals query for quarter={target_quarter}, total_vendors={len(all_vendor_list)}")
        try:
            closed_deals_query = f"""
            SELECT 
                Vendedor,
                Oportunidade,
                Conta,
                Gross,
                Net,
                Fiscal_Q,
                Data_Fechamento
            FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
            WHERE Fiscal_Q = @quarter
                AND LOWER(TRIM(Vendedor)) IN (
                    SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                )
            ORDER BY Vendedor, Gross DESC
            LIMIT 1000
            """
            
            closed_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                    bigquery.ArrayQueryParameter("vendors", "STRING", all_vendor_list)
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
                    "fiscal_q": row.get("Fiscal_Q"),
                    "data_fechamento": str(row["Data_Fechamento"])[:10] if row.get("Data_Fechamento") else None
                })
            
            print(f"[WEEKLY_AGENDA] INFO: Loaded closed deals drill-down for {len(closed_deals_by_vendor)} vendors")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: closed deals query failed: {str(e)}")
            closed_deals_by_vendor = {}

        # Query 2C: New Deals (Novas Oportunidades) created in period
        # Prioridade: Data_de_criacao real da pipeline
        # Fallback: cálculo por Dias_Funil (retrocompatibilidade)
        new_deals_by_vendor: Dict[str, List[Dict[str, Any]]] = {}
        print(f"[WEEKLY_AGENDA] DEBUG: Starting new deals query for period {parsed_start} to {parsed_end}, vendors={len(all_vendor_list)}")
        try:
            pipeline_table_ref = f"{PROJECT_ID}.{DATASET_ID}.pipeline"
            pipeline_table = client.get_table(pipeline_table_ref)
            pipeline_fields = {field.name for field in pipeline_table.schema}

            created_column_candidates = [
                "Data_de_criacao",
                "Data_de_criacao_DE_ONDE_PEGAR",
                "Created_Date",
            ]
            available_created_columns = [
                col for col in created_column_candidates if col in pipeline_fields
            ]

            if available_created_columns:
                source_table_ref = pipeline_table_ref
                creation_expr_parts = []
                for col in available_created_columns:
                    creation_expr_parts.extend([
                        f"SAFE_CAST({col} AS DATE)",
                        f"SAFE.PARSE_DATE('%Y-%m-%d', CAST({col} AS STRING))",
                        f"SAFE.PARSE_DATE('%d/%m/%Y', CAST({col} AS STRING))",
                    ])
                creation_expr_parts.append(
                    "DATE_SUB(CURRENT_DATE(), INTERVAL GREATEST(COALESCE(SAFE_CAST(Dias_Funil AS INT64), 0) - 1, 0) DAY)"
                )
                creation_expr = "COALESCE(\n                        " + ",\n                        ".join(creation_expr_parts) + "\n                    )"
                print(
                    f"[WEEKLY_AGENDA] DEBUG: New deals source=pipeline, creation columns={available_created_columns}"
                )
            else:
                source_table_ref = f"{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida"
                creation_expr = """
                    COALESCE(
                        SAFE_CAST(Data_Criacao AS DATE),
                        SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Criacao AS STRING)),
                        SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Criacao AS STRING)),
                        DATE_SUB(CURRENT_DATE(), INTERVAL GREATEST(COALESCE(SAFE_CAST(Dias_Funil AS INT64), 0) - 1, 0) DAY)
                    )
                """
                print(
                    "[WEEKLY_AGENDA] DEBUG: New deals source=pauta_semanal_enriquecida (pipeline sem Data_de_criacao)"
                )

            new_deals_query = f"""
            WITH deals_with_creation AS (
                SELECT 
                    Vendedor,
                    Oportunidade,
                    Conta,
                    Gross,
                    Net,
                    Confianca,
                    Fase_Atual,
                    Fiscal_Q,
                    {creation_expr} as Data_Criacao,
                    Dias_Funil
                FROM `{source_table_ref}`
                WHERE LOWER(TRIM(Vendedor)) IN (
                    SELECT LOWER(TRIM(v)) FROM UNNEST(@vendors) v
                )
                    AND Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
            )
            SELECT 
                Vendedor,
                Oportunidade,
                Conta,
                Gross,
                Net,
                Confianca,
                Fase_Atual,
                Fiscal_Q,
                Data_Criacao,
                Dias_Funil
            FROM deals_with_creation
            WHERE Data_Criacao BETWEEN @start_date AND @end_date
            ORDER BY Vendedor, Data_Criacao DESC, Gross DESC
            LIMIT 1000
            """
            
            new_deals_job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("quarter", "STRING", target_quarter),
                    bigquery.ArrayQueryParameter("vendors", "STRING", all_vendor_list),
                    bigquery.ScalarQueryParameter("start_date", "DATE", parsed_start.isoformat()),
                    bigquery.ScalarQueryParameter("end_date", "DATE", parsed_end.isoformat()),
                ]
            )
            
            new_deals_result = client.query(new_deals_query, job_config=new_deals_job_config).result()
            new_deals_rows = list(new_deals_result)
            print(f"[WEEKLY_AGENDA] DEBUG: New deals query returned {len(new_deals_rows)} rows")
            for row in new_deals_rows:
                vendedor = row["Vendedor"]
                if vendedor not in new_deals_by_vendor:
                    new_deals_by_vendor[vendedor] = []

                created_date_obj = _coerce_to_date(row.get("Data_Criacao"))
                created_fiscal_q = fiscal_quarter_from_date(created_date_obj)
                
                new_deals_by_vendor[vendedor].append({
                    "oportunidade": row["Oportunidade"],
                    "conta": row["Conta"],
                    "gross": float(row["Gross"]) if row["Gross"] is not None else 0.0,
                    "net": float(row["Net"]) if row["Net"] is not None else 0.0,
                    "confianca": int(row["Confianca"]) if row.get("Confianca") is not None else 0,
                    "fase_atual": row.get("Fase_Atual"),
                    "fiscal_q": created_fiscal_q or row.get("Fiscal_Q"),
                    "fiscal_q_origem": row.get("Fiscal_Q"),
                    "data_criacao": str(row["Data_Criacao"])[:10] if row.get("Data_Criacao") else None,
                    "dias_funil": int(row["Dias_Funil"]) if row.get("Dias_Funil") is not None else 0
                })
            
            print(f"[WEEKLY_AGENDA] INFO: Loaded {len(new_deals_rows)} new deals for {len(new_deals_by_vendor)} vendors")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] WARN: new deals query failed: {str(e)}")
            import traceback
            print(f"[WEEKLY_AGENDA] TRACEBACK: {traceback.format_exc()}")
            new_deals_by_vendor = {}

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
                            SAFE_CAST(Data AS DATE),
                            SAFE_CAST(Data_de_criacao AS DATE),
                            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data_de_criacao AS STRING))
                        ) AS ActivityDate,
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
                        SAFE_CAST(Data AS DATE),
                        SAFE_CAST(Data_de_criacao AS DATE),
                        SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
                        SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
                        SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data AS STRING)),
                        SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data AS STRING)),
                        SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data AS STRING)),
                        SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
                        SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING)),
                        SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_de_criacao AS STRING)),
                        SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data_de_criacao AS STRING)),
                        SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data_de_criacao AS STRING))
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
                                ActivityDate AS data,
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
                            ORDER BY ActivityDate DESC
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
                                ActivityDate AS data_criacao,
                                TipoAtividade AS tipo,
                                Status AS status,
                                EmpresaConta AS cliente,
                                Oportunidade AS oportunidade,
                                Contato AS contato,
                                Local AS local,
                                Assunto AS assunto,
                                TRIM(COALESCE(ComentariosCompletos, Comentarios, '')) AS comentarios
                            )
                            ORDER BY ActivityDate DESC
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

        cs_payload: Dict[str, Any] = {
            "requested_names": cs_names_list,
            "members": [],
            "summary": {
                "total_members": len(cs_names_list),
                "total_activities": 0,
                "total_meetings": 0,
            },
        }

        if cs_names_list:
            try:
                cs_query = f"""
                WITH
                    cs_map AS (
                        SELECT
                            cs_name,
                            cs_norm,
                            SPLIT(cs_norm, ' ') AS cs_parts,
                            SPLIT(cs_norm, ' ')[OFFSET(0)] AS cs_first,
                            SPLIT(cs_norm, ' ')[OFFSET(ARRAY_LENGTH(SPLIT(cs_norm, ' ')) - 1)] AS cs_last
                        FROM (
                            SELECT
                                c AS cs_name,
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        NORMALIZE_AND_CASEFOLD(TRIM(c), NFD),
                                        r'\\pM',
                                        ''
                                    ),
                                    r'\\s+',
                                    ' '
                                ) AS cs_norm
                            FROM UNNEST(@cs_names) c
                        )
                        WHERE cs_norm IS NOT NULL AND cs_norm != ''
                    ),
                    base AS (
                        SELECT
                            Atribuido,
                            COALESCE(
                                SAFE_CAST(Data AS DATE),
                                SAFE_CAST(Data_de_criacao AS DATE),
                                SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
                                SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
                                SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data AS STRING)),
                                SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data AS STRING)),
                                SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data AS STRING)),
                                SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
                                SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING)),
                                SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_de_criacao AS STRING)),
                                SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data_de_criacao AS STRING)),
                                SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data_de_criacao AS STRING))
                            ) AS ActivityDate,
                            Tipo_de_Actividad AS TipoAtividade,
                            Status,
                            EmpresaConta,
                            Oportunidade,
                            Assunto,
                            Contato,
                            Local,
                            TRIM(COALESCE(Comentarios_completos, Comentarios, '')) AS Comentarios
                        FROM `{PROJECT_ID}.{DATASET_ID}.atividades`
                        WHERE COALESCE(
                            SAFE_CAST(Data AS DATE),
                            SAFE_CAST(Data_de_criacao AS DATE),
                            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data AS STRING)),
                            SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%m/%d/%Y', CAST(Data_de_criacao AS STRING)),
                            SAFE.PARSE_DATE('%m-%d-%Y', CAST(Data_de_criacao AS STRING))
                        ) BETWEEN @start_date AND @end_date
                    ),
                    matched AS (
                        SELECT
                            m.cs_name,
                            m.cs_norm,
                            b.*
                        FROM base b
                        JOIN cs_map m
                            ON (
                                REGEXP_REPLACE(
                                    REGEXP_REPLACE(
                                        NORMALIZE_AND_CASEFOLD(TRIM(b.Atribuido), NFD),
                                        r'\\pM',
                                        ''
                                    ),
                                    r'\\s+',
                                    ' '
                                ) = m.cs_norm
                                OR (
                                    REGEXP_REPLACE(
                                        REGEXP_REPLACE(
                                            NORMALIZE_AND_CASEFOLD(TRIM(b.Atribuido), NFD),
                                            r'\\pM',
                                            ''
                                        ),
                                        r'\\s+',
                                        ' '
                                    ) LIKE CONCAT('%', m.cs_first, '%')
                                    AND REGEXP_REPLACE(
                                        REGEXP_REPLACE(
                                            NORMALIZE_AND_CASEFOLD(TRIM(b.Atribuido), NFD),
                                            r'\\pM',
                                            ''
                                        ),
                                        r'\\s+',
                                        ' '
                                    ) LIKE CONCAT('%', m.cs_last, '%')
                                )
                            )
                    ),
                    agg AS (
                        SELECT
                            cs_name,
                            cs_norm,
                            COUNT(*) AS total_activities,
                            COUNTIF(REGEXP_CONTAINS(LOWER(COALESCE(TipoAtividade, '')), r'(reun|video|meeting|reuni)')) AS total_meetings,
                            ARRAY_AGG(DISTINCT Atribuido IGNORE NULLS LIMIT 5) AS matched_assignees,
                            ARRAY_AGG(
                                STRUCT(
                                    ActivityDate AS data_criacao,
                                    TipoAtividade AS tipo,
                                    Status AS status,
                                    EmpresaConta AS cliente,
                                    Oportunidade AS oportunidade,
                                    Contato AS contato,
                                    Local AS local,
                                    Assunto AS assunto,
                                    Comentarios AS comentarios
                                )
                                ORDER BY ActivityDate DESC
                            ) AS last_activities
                        FROM matched
                        GROUP BY cs_name, cs_norm
                    )
                SELECT
                    cs_name,
                    cs_norm,
                    total_activities,
                    total_meetings,
                    matched_assignees,
                    last_activities
                FROM agg
                ORDER BY total_activities DESC, cs_name
                """

                cs_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ArrayQueryParameter("cs_names", "STRING", cs_names_list),
                        bigquery.ScalarQueryParameter("start_date", "DATE", parsed_start.isoformat()),
                        bigquery.ScalarQueryParameter("end_date", "DATE", parsed_end.isoformat()),
                    ]
                )

                cs_results = client.query(cs_query, job_config=cs_job_config).result()
                cs_rows = [dict(r) for r in cs_results]
                cs_by_norm = {str(r.get("cs_norm") or ""): r for r in cs_rows}

                members: List[Dict[str, Any]] = []
                for requested in cs_names_list:
                    key = _normalize_vendor(requested)
                    row = cs_by_norm.get(key, {})
                    raw_activities = row.get("last_activities") or []
                    raw_activities_dict = [dict(activity) for activity in raw_activities]
                    summary_by_raw: Dict[str, str] = {}
                    activities_out = []
                    for activity_dict in raw_activities_dict:
                        activity_date = _coerce_to_date(activity_dict.get("data_criacao"))
                        raw_text = str(activity_dict.get("comentarios") or "").strip()
                        activities_out.append({
                            "data_criacao": activity_date.isoformat() if activity_date else (str(activity_dict.get("data_criacao") or "")[:10]),
                            "tipo": activity_dict.get("tipo"),
                            "status": activity_dict.get("status"),
                            "cliente": activity_dict.get("cliente"),
                            "oportunidade": activity_dict.get("oportunidade"),
                            "contato": activity_dict.get("contato"),
                            "local": activity_dict.get("local"),
                            "assunto": activity_dict.get("assunto"),
                            "comentarios": activity_dict.get("comentarios"),
                            "resumo_ia": summary_by_raw.get(raw_text) if raw_text and len(raw_text) > 300 else None,
                        })

                    members.append({
                        "requested_name": requested,
                        "display_name": str((row.get("matched_assignees") or [requested])[0]),
                        "normalized_name": key,
                        "matched_assignees": [str(n) for n in (row.get("matched_assignees") or []) if n],
                        "total_activities": int(row.get("total_activities") or 0),
                        "total_meetings": int(row.get("total_meetings") or 0),
                        "last_activities": activities_out,
                    })

                cs_payload = {
                    "requested_names": cs_names_list,
                    "members": members,
                    "summary": {
                        "total_members": len(cs_names_list),
                        "total_activities": sum(int(m.get("total_activities") or 0) for m in members),
                        "total_meetings": sum(int(m.get("total_meetings") or 0) for m in members),
                    },
                }
            except Exception as e:
                print(f"[WEEKLY_AGENDA] WARN: cs activities query failed: {str(e)}")
        
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
                    "new_deals_detail": new_deals_by_vendor.get(vendedor, []),
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
                summary_by_raw = _build_activity_summary_map(
                    last_activities,
                    budget=summary_budget,
                    prompt_profile="bdm",
                )
                print(f"[WEEKLY_AGENDA] Generated {len(summary_by_raw)} IA summaries for {vendor_name}")
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

            META_REUNIOES_SEMANAL = 8
            META_NOVAS_OPS_SEMANAL = 4

            business_days_period = _count_business_days_br(parsed_start, parsed_end)
            meta_reunioes_periodo = _scale_weekly_goal(META_REUNIOES_SEMANAL, business_days_period)
            meta_novas_ops_periodo = _scale_weekly_goal(META_NOVAS_OPS_SEMANAL, business_days_period)
            novas_ops_periodo = len(seller_data.get("new_deals_detail") or [])

            reunioes_ating_pct = (
                min(100, round((reunioes / meta_reunioes_periodo) * 100))
                if meta_reunioes_periodo > 0 else 0
            )
            novas_ops_ating_pct = (
                min(100, round((novas_ops_periodo / meta_novas_ops_periodo) * 100))
                if meta_novas_ops_periodo > 0 else 0
            )

            seller_data["pulse"] = {
                "atividades_semana": atividades,
                "meta_atividades": 20,
                "reunioes_semana": reunioes,
                "meta_reunioes": meta_reunioes_periodo,
                "meta_reunioes_semanal": META_REUNIOES_SEMANAL,
                "novas_oportunidades_periodo": novas_ops_periodo,
                "meta_novas_oportunidades": meta_novas_ops_periodo,
                "meta_novas_oportunidades_semanal": META_NOVAS_OPS_SEMANAL,
                "dias_uteis_periodo": business_days_period,
                "atingimento_reunioes_pct": reunioes_ating_pct,
                "atingimento_novas_oportunidades_pct": novas_ops_ating_pct,
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
        total_gross_k_precise = sum((_safe_float(d.get("Gross")) / 1000.0) for d in all_deals)
        total_net_k_precise = sum((_safe_float(d.get("Net")) / 1000.0) for d in all_deals)

        overall_summary = {
            "quarter": target_quarter,
            "total_sellers": len(sellers_list),
            "total_deals": sum(s["summary"]["total_deals"] for s in sellers_list),
            "total_zumbis": sum(s["summary"]["zumbis"] for s in sellers_list),
            "total_criticos": sum(s["summary"]["criticos"] for s in sellers_list),
            "total_alta_prioridade": sum(s["summary"]["alta_prioridade"] for s in sellers_list),
            "total_monitorar": sum(s["summary"]["monitorar"] for s in sellers_list),
            "total_gross_k": round(total_gross_k_precise, 0),
            "total_net_k": round(total_net_k_precise, 0)
        }
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "quarter": target_quarter,
            "summary": overall_summary,
            "customer_success": cs_payload,
            "sellers": sellers_list,
            "config": {
                "include_rag": include_rag,
                "seller_filter": seller if seller else "ALL",
                "cs_names": cs_names_list,
                "quarter_filter": target_quarter,
                "start_date": parsed_start.isoformat() if parsed_start else None,
                "end_date": parsed_end.isoformat() if parsed_end else None,
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar pauta semanal: {str(e)}")
# Force rebuild Wed Feb 11 21:28:24 UTC 2026
