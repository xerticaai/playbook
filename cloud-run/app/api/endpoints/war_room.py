"""
War Room Endpoint - Executive Weekly Presentation
Provides seller metrics, top deals, and AI-generated insights for weekly meetings.
"""
from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import google.generativeai as genai
import os
from datetime import datetime

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyBwgc9nHAtgUiabpGJDwrMBd3dJTBE5ee4")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "models/gemini-pro-latest")

genai.configure(api_key=GEMINI_API_KEY)


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


def generate_war_room_insights(
    metrics: List[Dict[str, Any]], 
    top_deals: List[Dict[str, Any]],
    quarter_summary: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate AI insights for war room presentation using Gemini.
    """
    if not metrics:
        return {
            "attention_points": ["Sem dados disponíveis para análise."],
            "wins": ["Sem dados disponíveis."],
            "actions": ["Aguardar dados."]
        }
    
    # Build context
    context = f"""
You are a sales operations assistant analyzing WEEKLY WAR ROOM data.

QUARTER SUMMARY:
- Total Closed (Quarter-to-Date): R$ {quarter_summary.get('total_closed_k', 0)}K
- Total Pipeline: R$ {quarter_summary.get('total_pipeline_k', 0)}K
- Total Forecast (Closed + Pipeline): R$ {quarter_summary.get('total_forecast_k', 0)}K
- Average Pipeline Health (Confiança): {quarter_summary.get('avg_confianca', 0)}%
- Total Zombie Deals: {quarter_summary.get('total_zumbis', 0)} (R$ {quarter_summary.get('zumbis_gross_k', 0)}K)

TOP 5 SELLERS BY FORECAST:
{chr(10).join([f"- {m.get('Vendedor')}: R$ {m.get('Forecast_Total_Net_K', 0)}K forecast, {m.get('Deals_Zumbis', 0)} zombies ({m.get('Pct_Pipeline_Podre', 0):.1f}% podre), Grade {m.get('Nota_Higiene', 'N/A')}" for m in metrics[:5]])}

TOP DEALS AT RISK (ZUMBIS):
{chr(10).join([f"- {d.get('Oportunidade')} ({d.get('Vendedor')}): R$ {d.get('Gross', 0)/1000:.0f}K, {d.get('Dias_Funil', 0)} dias no funil" for d in top_deals[:5]])}

TASK:
Generate insights in Portuguese (BR) with **specific numbers from the data above**.

Format your response EXACTLY as:

PONTOS_DE_ATENCAO:
- [3 critical issues with specific numbers]

VITORIAS:
- [2 positive highlights with numbers]

ACOES_RECOMENDADAS:
- [3 specific actionable recommendations with numbers]

Rules:
- Use ONLY facts from the context above
- Include specific numbers (R$, %, quantities)
- Be direct and concise
- Focus on actionable insights
"""
    
    try:
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(context)
        text = response.text if response else ""
    except Exception as e:
        print(f"Gemini API error: {e}")
        text = ""
    
    # Parse response
    attention_points = []
    wins = []
    actions = []
    
    if text:
        # Split by sections
        parts = text.split("VITORIAS:")
        if len(parts) > 1:
            attention_section = parts[0].replace("PONTOS_DE_ATENCAO:", "").strip()
            attention_points = [line.strip("- ").strip() for line in attention_section.split("\n") if line.strip() and line.strip() != "-"]
            
            wins_and_actions = parts[1].split("ACOES_RECOMENDADAS:")
            wins_section = wins_and_actions[0].strip()
            wins = [line.strip("- ").strip() for line in wins_section.split("\n") if line.strip() and line.strip() != "-"]
            
            if len(wins_and_actions) > 1:
                actions_section = wins_and_actions[1].strip()
                actions = [line.strip("- ").strip() for line in actions_section.split("\n") if line.strip() and line.strip() != "-"]
    
    # Fallback if parsing failed
    if not attention_points:
        attention_points = [
            f"Pipeline total de R$ {quarter_summary.get('total_pipeline_k', 0)}K com confiança média de {quarter_summary.get('avg_confianca', 0):.1f}%",
            f"{quarter_summary.get('total_zumbis', 0)} deals zumbis travando R$ {quarter_summary.get('zumbis_gross_k', 0)}K",
            f"Forecast total de R$ {quarter_summary.get('total_forecast_k', 0)}K para o quarter"
        ]
    
    if not wins:
        wins = [
            f"R$ {quarter_summary.get('total_closed_k', 0)}K já fechados no quarter até agora",
            "Pipeline ativo mantido pelos top performers"
        ]
    
    if not actions:
        actions = [
            "Revisar deals zumbis e decidir: reativar ou descartar",
            "Aumentar atividades nos deals de alta prioridade",
            f"Focar nos top {min(3, len(metrics))} vendedores para manter momentum"
        ]
    
    return {
        "attention_points": attention_points[:3],
        "wins": wins[:2],
        "actions": actions[:3],
        "raw_text": text
    }


@router.get("/war-room")
async def get_war_room(
    top_sellers: int = Query(10, ge=1, le=50, description="Número de vendedores para incluir"),
    top_deals: int = Query(20, ge=1, le=100, description="Número de deals críticos para incluir"),
    include_ai_insights: bool = Query(True, description="Gerar insights com IA (Gemini)")
):
    """
    Get complete War Room presentation data:
    - Seller metrics (pipeline health, forecast, grades)
    - Top critical deals (ZUMBI, CRITICO)
    - AI-generated executive insights
    
    **Returns:**
    - `quarter_summary`: Aggregated metrics for current quarter
    - `seller_metrics`: Per-seller performance data
    - `top_deals_at_risk`: Prioritized deal list for discussion
    - `ai_insights`: AI-generated attention points, wins, and actions
    """
    try:
        client = get_bq_client()
        
        # 1. Get seller metrics from war_room_metrics VIEW
        metrics_query = f"""
        SELECT *
        FROM `{PROJECT_ID}.{DATASET_ID}.war_room_metrics`
        ORDER BY Forecast_Total_Net_K DESC
        LIMIT {top_sellers}
        """
        
        metrics_results = client.query(metrics_query).result()
        seller_metrics = [dict(row) for row in metrics_results]
        
        # 2. Get top deals at risk from pauta_semanal_enriquecida
        deals_query = f"""
        SELECT 
          Oportunidade,
          Vendedor,
          Conta,
          Produtos,
          Gross,
          Net,
          Fiscal_Q,
          Confianca,
          Dias_Funil,
          Atividades,
          Categoria_Pauta,
          Risco_Score,
          Risk_Tags,
          Proxima_Acao_Pipeline,
          Status_Especialista
        FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
        WHERE Categoria_Pauta IN ('ZUMBI', 'CRITICO')
        ORDER BY 
          CASE Categoria_Pauta
            WHEN 'ZUMBI' THEN 1
            WHEN 'CRITICO' THEN 2
          END,
          Risco_Score DESC,
          Gross DESC
        LIMIT {top_deals}
        """
        
        deals_results = client.query(deals_query).result()
        top_deals_at_risk = [dict(row) for row in deals_results]
        
        # 3. Calculate quarter summary
        quarter_summary = {
            "total_sellers": len(seller_metrics),
            "total_closed_k": sum(m.get("Closed_Net_K_Q", 0) for m in seller_metrics),
            "total_pipeline_k": sum(m.get("Pipeline_Net_K", 0) for m in seller_metrics),
            "total_forecast_k": sum(m.get("Forecast_Total_Net_K", 0) for m in seller_metrics),
            "avg_confianca": round(
                sum(m.get("Avg_Confianca", 0) for m in seller_metrics) / len(seller_metrics)
                if seller_metrics else 0, 1
            ),
            "total_zumbis": sum(m.get("Deals_Zumbis", 0) for m in seller_metrics),
            "zumbis_gross_k": sum(m.get("Zumbis_Gross_K", 0) for m in seller_metrics),
            "avg_pipeline_podre": round(
                sum(m.get("Pct_Pipeline_Podre", 0) for m in seller_metrics) / len(seller_metrics)
                if seller_metrics else 0, 1
            ),
            "deals_at_risk_count": len(top_deals_at_risk),
            "deals_at_risk_gross_k": round(
                sum(d.get("Gross", 0) for d in top_deals_at_risk) / 1000, 0
            )
        }
        
        # 4. Generate AI insights
        ai_insights = {}
        if include_ai_insights:
            ai_insights = generate_war_room_insights(seller_metrics, top_deals_at_risk, quarter_summary)
        
        # 5. Grade distribution
        grade_distribution = {}
        for m in seller_metrics:
            grade = m.get("Nota_Higiene", "N/A")
            grade_distribution[grade] = grade_distribution.get(grade, 0) + 1
        
        return {
            "success": True,
            "timestamp": datetime.utcnow().isoformat(),
            "quarter_summary": quarter_summary,
            "grade_distribution": grade_distribution,
            "seller_metrics": seller_metrics,
            "top_deals_at_risk": top_deals_at_risk,
            "ai_insights": ai_insights,
            "config": {
                "top_sellers": top_sellers,
                "top_deals": top_deals,
                "ai_enabled": include_ai_insights
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar War Room: {str(e)}")
