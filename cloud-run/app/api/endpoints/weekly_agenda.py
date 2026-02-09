"""
Weekly Agenda (Pauta Semanal) Endpoint - Enhanced for 1-on-1 Meetings
Provides enriched weekly agenda with seller performance feedback and deal insights.
Shows ONLY current quarter deals, grouped by seller.
"""
from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import os
from datetime import datetime

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"


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


def get_sabatina_questions(deal: Dict[str, Any]) -> List[str]:
    """
    Generate coaching questions for 1-on-1 review meetings.
    Focus on understanding blockers and next actions.
    """
    questions = []
    
    risk_tags = deal.get("Risk_Tags", "")
    categoria = deal.get("Categoria_Pauta", "")
    dias_funil = deal.get("Dias_Funil", 0)
    gross = deal.get("Gross", 0)
    confianca = deal.get("Confianca", 0)
    conta = deal.get("Conta", "o cliente")
    
    # Always ask: last interaction
    questions.append(f"📅 Quando foi a última interação com {conta}?")
    
    # ZUMBI deals - focus on reactivation or disqualification
    if categoria == "ZUMBI":
        questions.append(f"⚠️ Este deal está há {dias_funil} dias no funil. Qual o bloqueio principal?")
        questions.append("🔄 Plano de ação: reativar ou desqualificar?")
        questions.append("💬 Quando foi o último contato efetivo com stakeholder?")
    
    # CRITICO - focus on closing
    elif categoria == "CRITICO":
        questions.append(f"✅ Confiança de {confianca}%. Quais os próximos passos para fechar?")
        questions.append("🎯 Quem é o decision maker? Próxima reunião agendada?")
        questions.append("📝 Há algum bloqueio técnico, comercial ou jurídico?")
    
    # ALTA_PRIORIDADE - focus on advancement
    elif categoria == "ALTA_PRIORIDADE":
        questions.append("🚀 O que precisa acontecer para esse deal avançar para stage seguinte?")
        questions.append("💰 Budget aprovado? Quem aprova?")
    
    # Specific risk flags
    if "SEM_ATIVIDADE" in risk_tags:
        questions.append("❌ Nenhuma atividade registrada. Cliente ainda está engajado?")
    
    if "TERRITORIO_ERRADO" in risk_tags:
        questions.append("🗺️ Deal em território incorreto. Quando será transferido?")
    
    if "DESALINHADO" in risk_tags:
        questions.append("⚠️ Desalinhamento entre Sales Specialist e Salesforce. Qual a divergência?")
    
    if "SEM_ORCAMENTO" in risk_tags:
        questions.append("💵 Cliente sem budget aprovado. Como viabilizar?")
    
    # High-value deals need extra attention
    if gross and gross > 500000:
        questions.append(f"💎 Deal de R$ {gross:,.0f}. Qual o timeline de decisão do cliente?")
    
    # Always end with next step
    questions.append("📋 Qual a próxima ação concreta e quando será executada?")
    
    return questions


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
        message = f"🌟 Excelente performance! Nota {nota}, pipeline limpo e win rate de {win_rate or 0:.0f}%."
    elif nota in ["B", "C"] and zumbis <= 2:
        status = "good"
        message = f"✅ Boa performance, nota {nota}. Continue o bom trabalho."
    elif nota in ["D", "F"] or zumbis > 5 or pipeline_podre > 35:
        status = "critical"
        message = f"⚠️ CRÍTICO: Nota {nota}, {zumbis} deals zumbis, {pipeline_podre:.1f}% pipeline podre."
    else:
        status = "needs_improvement"
        message = f"🟡 Performance precisa melhorar. Nota {nota}, {zumbis} deals zumbis."
    
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
    include_rag: bool = Query(True, description="Incluir busca RAG de deals similares"),
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
        
        # Build seller filter for WHERE clause
        seller_filter = ""
        if seller:
            sellers = [s.strip() for s in seller.split(',') if s.strip()]
            if len(sellers) == 1:
                seller_filter = f"AND Vendedor = '{sellers[0]}'"
            elif len(sellers) > 1:
                sellers_quoted = "', '".join(sellers)
                seller_filter = f"AND Vendedor IN ('{sellers_quoted}')"
        
        # Query 1: Get ALL deals from selected quarter (not just critical ones)
        deals_query = f"""
        SELECT *
        FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
        WHERE Fiscal_Q = '{target_quarter}'
          {seller_filter}
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
        
        deals_results = client.query(deals_query).result()
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
        vendors_quoted = "', '".join(vendor_list)
        
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
          WHERE Fiscal_Q = '{target_quarter}'
            AND Vendedor IN ('{vendors_quoted}')
          GROUP BY Vendedor
        ),
        closed_vendedor AS (
          SELECT 
            Vendedor,
            ROUND(SUM(Gross), 2) as Closed_Gross,
            ROUND(SUM(Net), 2) as Closed_Net,
            COUNT(*) as Closed_Deals
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
          WHERE Fiscal_Q = '{target_quarter}'
            AND Vendedor IN ('{vendors_quoted}')
          GROUP BY Vendedor
        ),
        lost_vendedor AS (
          SELECT 
            Vendedor,
            COUNT(*) as Lost_Deals
          FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
          WHERE Fiscal_Q = '{target_quarter}'
            AND Vendedor IN ('{vendors_quoted}')
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
        
        try:
            print(f"[WEEKLY_AGENDA] Executing metrics query for {len(vendor_list)} vendors: {vendor_list[:3]}...")
            metrics_results = client.query(metrics_query).result()
            seller_metrics = {row["Vendedor"]: dict(row) for row in metrics_results}
            print(f"[WEEKLY_AGENDA] Got metrics for {len(seller_metrics)} vendors")
            if seller_metrics:
                sample_vendor = list(seller_metrics.keys())[0]
                print(f"[WEEKLY_AGENDA] Sample metrics for {sample_vendor}: {seller_metrics[sample_vendor]}")
        except Exception as e:
            print(f"[WEEKLY_AGENDA] ERROR in metrics query: {str(e)}")
            print(f"[WEEKLY_AGENDA] Query was: {metrics_query[:500]}...")
            seller_metrics = {}  # Continue with empty metrics
        
        # Group deals by seller and enrich
        sellers_data = {}
        
        for deal in all_deals:
            vendedor = deal.get("Vendedor", "Unknown")
            
            if vendedor not in sellers_data:
                # Initialize seller entry
                metrics = seller_metrics.get(vendedor, {})
                
                # Calculate additional metrics from deals
                seller_deals_preview = [d for d in all_deals if d.get("Vendedor") == vendedor]
                
                # Convert Dias_Funil to int (comes as STRING from BigQuery)
                def safe_int(val):
                    try:
                        return int(val) if val else 0
                    except (ValueError, TypeError):
                        return 0
                
                avg_cycle = round(
                    sum(safe_int(d.get("Dias_Funil")) for d in seller_deals_preview) / len(seller_deals_preview)
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
                    "deals": [],
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
            if include_rag:
                deal_search_text = f"""
                Oportunidade: {deal.get('Oportunidade', '')}
                Conta: {deal.get('Conta', '')}
                Produtos: {deal.get('Produtos', '')}
                Perfil: {deal.get('Perfil_Cliente', '')}
                Gross: {deal.get('Gross', 0)}
                Categoria: {deal.get('Categoria_Pauta', '')}
                Riscos: {deal.get('Risk_Tags', '')}
                """
                similar_deals = search_similar_deals_rag(deal_search_text, top_k=3)
            
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
