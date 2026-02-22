from typing import Any, Dict, List

import google.generativeai as genai

from .stats import summarize_deals_stats


def generate_ai_insights(
    query_text: str,
    deals: List[Dict[str, Any]],
    stats: Dict[str, Any],
    *,
    gemini_api_key: str | None,
    gemini_model: str,
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

    def build_rule_based() -> Dict[str, Any]:
        wins_lines: List[str] = []
        losses_lines: List[str] = []
        recommendations: List[str] = []

        if wins_stats.get("total", 0):
            wins_lines.append(
                f"- {wins_stats.get('total', 0)} deals ganhos no recorte, com ciclo médio de {wins_stats.get('avg_cycle_days', 0)} dias."
            )
        else:
            wins_lines.append("- Sem deals ganhos no filtro atual.")

        if losses_stats.get("total", 0):
            losses_lines.append(
                f"- {losses_stats.get('total', 0)} deals perdidos no recorte, com ciclo médio de {losses_stats.get('avg_cycle_days', 0)} dias."
            )
        else:
            losses_lines.append("- Sem deals perdidos no filtro atual.")

        pipeline_total = (pipeline_stats or {}).get("total", 0)
        idle_avg = (pipeline_stats or {}).get("avg_idle_days", 0)

        if pipeline_total:
            recommendations.append(
                f"Priorizar deals com idle acima de {idle_avg} dias para reduzir estagnação do pipeline."
            )

        if wins_stats.get("avg_cycle_days") and losses_stats.get("avg_cycle_days"):
            if float(losses_stats.get("avg_cycle_days") or 0) > float(wins_stats.get("avg_cycle_days") or 0):
                recommendations.append("Criar checkpoint de qualificação no meio do ciclo para evitar perdas tardias.")

        recommendations.append("Usar os 5 casos mais similares como referência de plano de ação antes da próxima reunião.")

        return {
            "status": "rule_based",
            "wins": "\n".join(wins_lines),
            "losses": "\n".join(losses_lines),
            "recommendations": recommendations[:3],
            "full": "",
        }

    if not gemini_api_key:
        return build_rule_based()

    genai.configure(api_key=gemini_api_key)

    prompt = f"""
Voce e um assistente de inteligencia comercial. Use SOMENTE os fatos abaixo.

Consulta: {query_text}
Total de deals: {stats.get('total')}
Por source: {stats.get('by_source')}

FATOS VITORIAS (source=won):
Total: {wins_stats.get('total')}
Ciclo medio (dias): {wins_stats.get('avg_cycle_days')}

FATOS PERDAS (source=lost):
Total: {losses_stats.get('total')}
Ciclo medio (dias): {losses_stats.get('avg_cycle_days')}

FATOS PIPELINE:
Total: {pipeline_stats.get('total')}
Idle medio (dias): {pipeline_stats.get('avg_idle_days')}

Instrucoes:
1. Gere 3-4 bullets para VITORIAS usando apenas FATOS VITORIAS.
2. Gere 3-4 bullets para PERDAS usando apenas FATOS PERDAS.
3. Gere 3 recomendacoes acionaveis considerando o funil completo.
4. Use numeros concretos dos fatos, priorizando idle medio e ciclo medio. Nao use valores financeiros.
5. Se nao houver dados em VITORIAS ou PERDAS, responda "Sem deals ganhos no filtro atual" ou "Sem deals perdidos no filtro atual".
6. Nao cite nomes de vendedores, contas ou clientes.
7. Nao use markdown, emojis ou asteriscos.
8. Responda em portugues.

Formato exato:
VITORIAS:
- ...
PERDAS:
- ...
RECOMENDACOES:
- ...
"""

    try:
        model = genai.GenerativeModel(gemini_model)
        response = model.generate_content(prompt)
        text = response.text if response else ""
    except Exception:
        text = ""

    def clean_section(text_block: str) -> str:
        if not text_block:
            return ""
        cleaned: List[str] = []
        for raw_line in text_block.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if all(ch in "*-_" for ch in line):
                continue
            if not line.startswith(("- ", "• ")):
                line = f"- {line}"
            cleaned.append(line)
        return "\n".join(cleaned)

    wins = ""
    losses = ""
    recommendations: List[str] = []

    if text:
        parts = text.split("PERDAS:")
        wins = parts[0].replace("VITORIAS:", "").strip() if parts else ""

        if len(parts) > 1:
            losses_part = parts[1]
            rec_split = losses_part.split("RECOMENDACOES:")
            losses = rec_split[0].strip()
            if len(rec_split) > 1:
                recommendations = [item.strip("- ") for item in rec_split[1].split("\n") if item.strip()]

    if not wins_deals:
        wins = "- Sem deals ganhos no filtro atual."
    else:
        wins = clean_section(wins)

    if not losses_deals:
        losses = "- Sem deals perdidos no filtro atual."
    else:
        losses = clean_section(losses)

    recommendations = [
        item
        for item in (clean_section("\n".join(recommendations)).splitlines())
        if item.strip()
    ]

    parsed = {
        "status": "rag",
        "wins": wins or "Sem insights de vitorias.",
        "losses": losses or "Sem insights de perdas.",
        "recommendations": recommendations,
        "full": text,
    }

    if not parsed["wins"] or not parsed["losses"]:
        return build_rule_based()

    return parsed
