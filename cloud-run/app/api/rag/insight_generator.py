import re
from typing import Any, Dict, List

from api.llm_client import generate_gemini_text_with_status

from .stats import summarize_deals_stats


def _to_int(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _build_data_facts(
    wins_stats: Dict[str, Any],
    losses_stats: Dict[str, Any],
    pipeline_stats: Dict[str, Any],
) -> Dict[str, float | int]:
    wins_total = _to_int(wins_stats.get("total"))
    losses_total = _to_int(losses_stats.get("total"))
    pipeline_total = _to_int(pipeline_stats.get("total"))
    wins_cycle = _to_float(wins_stats.get("avg_cycle_days"))
    losses_cycle = _to_float(losses_stats.get("avg_cycle_days"))
    idle_days = _to_float(pipeline_stats.get("avg_idle_days"))
    loss_vs_win_ratio = (losses_cycle / wins_cycle) if wins_cycle > 0 else 0.0

    return {
        "wins_total": wins_total,
        "losses_total": losses_total,
        "pipeline_total": pipeline_total,
        "wins_cycle": round(wins_cycle, 1),
        "losses_cycle": round(losses_cycle, 1),
        "idle_days": round(idle_days, 1),
        "loss_vs_win_ratio": round(loss_vs_win_ratio, 2),
    }


def _extract_section(text: str, section_name: str, next_sections: List[str]) -> str:
    if not text:
        return ""

    start_match = re.search(rf"{section_name}\s*:", text, flags=re.IGNORECASE)
    if not start_match:
        return ""

    start = start_match.end()
    end = len(text)
    for next_section in next_sections:
        next_match = re.search(rf"{next_section}\s*:", text[start:], flags=re.IGNORECASE)
        if next_match:
            end = min(end, start + next_match.start())
    return text[start:end].strip()


def _parse_bullets(block: str, max_items: int = 6) -> List[str]:
    bullets: List[str] = []
    for raw_line in (block or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[-•*\d\.)\s]+", "", line).strip()
        if line and line not in bullets:
            bullets.append(line)
        if len(bullets) >= max_items:
            break
    return bullets


def _parse_llm_sections(text: str) -> Dict[str, List[str]]:
    wins_block = _extract_section(text, "VITORIAS", ["PERDAS", "RECOMENDACOES"])
    losses_block = _extract_section(text, "PERDAS", ["RECOMENDACOES"])
    recommendations_block = _extract_section(text, "RECOMENDACOES", [])
    return {
        "wins": _parse_bullets(wins_block, max_items=6),
        "losses": _parse_bullets(losses_block, max_items=6),
        "recommendations": _parse_bullets(recommendations_block, max_items=6),
    }


def _join_bullets(items: List[str]) -> str:
    return "\n".join([f"- {item}" for item in items if item])


def _parse_recommendations(text: str) -> List[str]:
    if not text:
        return []

    block = text
    if "RECOMENDACOES:" in text:
        block = text.split("RECOMENDACOES:", 1)[1]

    recommendations: List[str] = []
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.upper().startswith("RECOMENDACOES"):
            continue
        if line.startswith(("-", "•", "*")):
            line = line.lstrip("-•* ").strip()
        if line and line not in recommendations:
            recommendations.append(line)

    return recommendations[:6]


def generate_ai_insights(
    query_text: str,
    deals: List[Dict[str, Any]],
    stats: Dict[str, Any],
    *,
    gemini_api_key: str | None,
    gemini_model: str,
    gcp_project: str | None,
    vertex_location: str | None,
    business_highlights: Dict[str, Any] | None = None,
    filters_context: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    if not deals:
        return {
            "status": "empty",
            "wins": "Sem dados suficientes para gerar insights.",
            "losses": "Sem dados suficientes para gerar insights.",
            "recommendations": [],
        }

    wins_deals = [deal for deal in deals if (deal.get("source") or "").lower() == "won"]
    losses_deals = [deal for deal in deals if (deal.get("source") or "").lower() == "lost"]

    wins_stats = stats.get("wins_stats") or summarize_deals_stats(wins_deals)
    losses_stats = stats.get("losses_stats") or summarize_deals_stats(losses_deals)
    pipeline_stats = stats.get("pipeline") or {}

    if not gemini_api_key and not gcp_project:
        return {
            "status": "llm_unavailable",
            "wins": "LLM indisponível para gerar insights de vitórias.",
            "losses": "LLM indisponível para gerar insights de perdas.",
            "recommendations": [],
            "full": "",
            "error": "No LLM credentials configured",
        }

    facts = _build_data_facts(wins_stats, losses_stats, pipeline_stats)
    highlights = business_highlights or {}
    filters_ctx = filters_context or {}

    top_wins = highlights.get("top_wins") or []
    top_losses = highlights.get("top_losses") or []
    top_pipeline = highlights.get("top_pipeline") or []
    gain_causes = highlights.get("top_gain_causes") or []
    loss_causes = highlights.get("top_loss_causes") or []

    prompt = f"""
Voce e um assistente de inteligencia comercial. Gere insights COMPLETOS e detalhados.

Consulta: {query_text}

FATOS EXECUTIVOS CONFIAVEIS:
Vitorias total: {facts.get('wins_total')}
Vitorias ciclo medio (dias): {facts.get('wins_cycle')}
Perdas total: {facts.get('losses_total')}
Perdas ciclo medio (dias): {facts.get('losses_cycle')}
Pipeline total: {facts.get('pipeline_total')}
Pipeline idle medio (dias): {facts.get('idle_days')}
Razao ciclo perda/vitoria: {facts.get('loss_vs_win_ratio')}

FILTROS APLICADOS NO PAINEL:
- year: {filters_ctx.get('year')}
- quarter: {filters_ctx.get('quarter')}
- month: {filters_ctx.get('month')}
- date_start: {filters_ctx.get('date_start')}
- date_end: {filters_ctx.get('date_end')}
- seller: {filters_ctx.get('seller')}
- phase: {filters_ctx.get('phase')}

DEALS DE MAIOR VALOR (GANHOS): {top_wins}
DEALS DE MAIOR VALOR (PERDIDOS): {top_losses}
DEALS DE MAIOR VALOR (PIPELINE): {top_pipeline}

PRINCIPAIS CAUSAS DE GANHO (TOP 5): {gain_causes}
PRINCIPAIS CAUSAS DE PERDA (TOP 5): {loss_causes}

Instrucoes:
1. Gere entre 4 e 6 bullets para VITORIAS, entre 4 e 6 bullets para PERDAS e entre 4 e 6 bullets para RECOMENDACOES.
2. Use apenas os fatos executivos acima; nao invente novos numeros.
3. Todos os bullets devem citar pelo menos um numero dos fatos (totais, ciclos, idle ou razao).
4. Para VITORIAS e PERDAS, use tambem os TOP DEALS e TOP CAUSAS para dar contexto de negocio concreto.
5. Se perdas_total = 0, explicite que o recorte do filtro nao possui perdas e trate isso como sinal de qualidade de dado/recorte.
6. Nao cite contas, vendedores ou valores financeiros.
7. Responda em portugues, com linguagem objetiva para liderança comercial.
8. Nao use markdown adicional fora dos bullets.

Formato:
VITORIAS:
- ...
- ...
PERDAS:
- ...
- ...
RECOMENDACOES:
- ...
- ...
"""

    llm_result = generate_gemini_text_with_status(
        prompt,
        model_name=gemini_model,
        api_key=gemini_api_key,
        project_id=gcp_project,
        location=vertex_location,
    )
    text = str(llm_result.get("text") or "")

    if not text or not str(text).strip():
        return {
            "status": "llm_failed",
            "wins": "LLM falhou ao gerar insights de vitórias.",
            "losses": "LLM falhou ao gerar insights de perdas.",
            "recommendations": [],
            "full": "",
            "error": llm_result.get("error") or "Empty LLM response",
            "provider": llm_result.get("provider"),
            "model": llm_result.get("model"),
            "data_basis": "executive_metrics",
        }

    sections = _parse_llm_sections(text)
    wins_bullets = sections.get("wins") or []
    losses_bullets = sections.get("losses") or []
    recommendations = sections.get("recommendations") or _parse_recommendations(text)

    parsed = {
        "status": "rag",
        "wins": _join_bullets(wins_bullets),
        "losses": _join_bullets(losses_bullets),
        "recommendations": recommendations,
        "full": text,
        "provider": llm_result.get("provider"),
        "model": llm_result.get("model"),
        "data_basis": "executive_metrics",
    }

    if not parsed["wins"] or not parsed["losses"] or not parsed["recommendations"]:
        return {
            "status": "llm_parse_failed",
            "wins": "LLM retornou formato inválido para vitórias.",
            "losses": "LLM retornou formato inválido para perdas.",
            "recommendations": [],
            "full": text,
            "error": "LLM returned incomplete sections",
            "provider": llm_result.get("provider"),
            "model": llm_result.get("model"),
            "data_basis": "executive_metrics",
        }

    return parsed
