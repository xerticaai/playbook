"""
AI Analysis Endpoint - Análise de Vitórias/Perdas com IA
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import google.generativeai as genai
import os

router = APIRouter()

# Gemini Configuration (optional)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class DealAnalysisRequest(BaseModel):
    won_deals: List[Dict[str, Any]]
    lost_deals: List[Dict[str, Any]]
    period: str = "all"

@router.post("/ai-analysis")
async def analyze_deals_with_ai(request: DealAnalysisRequest):
    """
    Analisa deals ganhos e perdidos usando IA Gemini
    Retorna insights sobre padrões de vitória e perda
    """
    try:
        # Limitar análise para não sobrecarregar
        won_sample = request.won_deals[:10] if len(request.won_deals) > 10 else request.won_deals
        lost_sample = request.lost_deals[:10] if len(request.lost_deals) > 10 else request.lost_deals
        
        # Preparar contexto para IA
        won_summary = []
        for deal in won_sample:
            won_summary.append({
                "conta": deal.get("Conta", deal.get("account", "N/A")),
                "valor": deal.get("Gross", deal.get("gross", 0)),
                "vendedor": deal.get("Vendedor", deal.get("seller", "N/A")),
                "ciclo_dias": deal.get("ciclo_dias", deal.get("Ciclo_dias", 0)),
                "motivo": deal.get("Win_Reason", deal.get("winReason", "N/A"))
            })
        
        lost_summary = []
        for deal in lost_sample:
            lost_summary.append({
                "conta": deal.get("Conta", deal.get("account", "N/A")),
                "valor": deal.get("Gross", deal.get("gross", 0)),
                "vendedor": deal.get("Vendedor", deal.get("seller", "N/A")),
                "ciclo_dias": deal.get("ciclo_dias", deal.get("Ciclo_dias", 0)),
                "motivo": deal.get("Loss_Reason", deal.get("lossReason", "N/A"))
            })
        
        # Prompt estruturado para Gemini
        prompt = f"""
Você é um analista sênior de vendas B2B de tecnologia. Analise os dados de deals ganhos e perdidos abaixo.

**DEALS GANHOS (amostra de {len(won_sample)}):**
{won_summary}

**DEALS PERDIDOS (amostra de {len(lost_sample)}):**
{lost_summary}

**CONTEXTO ADICIONAL:**
- Total de ganhos no período: {len(request.won_deals)}
- Total de perdas no período: {len(request.lost_deals)}
- Período analisado: {request.period}

**FORNEÇA UMA ANÁLISE EXECUTIVA EM PORTUGUÊS BRASILEIRO (máximo 250 palavras) que inclua:**

1. **Padrões de Vitória**: Quais são os principais fatores que levam ao sucesso? (confiança, base instalada, relacionamento, etc)

2. **Padrões de Perda**: Quais são as principais razões das perdas? (preço, concorrência, timing, produto)

3. **Oportunidades de Melhoria**: 2-3 ações práticas que a equipe deveria tomar para melhorar win rate

4. **Destaque de Vendedor**: Se houver padrões claros, mencione vendedores específicos (sem exageros)

**FORMATO DE RESPOSTA:**
- Use HTML simples (<p>, <strong>, <br>)
- Tom profissional mas direto
- Baseie-se APENAS nos dados fornecidos
- Se dados insuficientes, seja honesto
"""
        
        # Chamar Gemini - usando modelo disponível atualmente
        model = genai.GenerativeModel('models/gemini-1.0-pro-latest')
        response = model.generate_content(prompt)
        
        if not response or not response.text:
            return {
                "success": False,
                "analysis": "<p>Não foi possível gerar análise no momento. Tente novamente.</p>"
            }
        
        return {
            "success": True,
            "analysis": response.text,
            "metadata": {
                "won_analyzed": len(won_sample),
                "lost_analyzed": len(lost_sample),
                "total_won": len(request.won_deals),
                "total_lost": len(request.lost_deals),
                "period": request.period
            }
        }
        
    except Exception as e:
        print(f"[AI ANALYSIS ERROR] {str(e)}")
        
        # Fallback: análise baseada em dados
        won_count = len(request.won_deals)
        lost_count = len(request.lost_deals)
        total = won_count + lost_count
        win_rate = (won_count / total * 100) if total > 0 else 0
        
        # Analisa razões principais
        win_reasons = {}
        loss_reasons = {}
        
        for deal in request.won_deals:
            reason = deal.get("Win_Reason", deal.get("winReason", "N/A"))
            win_reasons[reason] = win_reasons.get(reason, 0) + 1
            
        for deal in request.lost_deals:
            reason = deal.get("Loss_Reason", deal.get("lossReason", "N/A"))
            loss_reasons[reason] = loss_reasons.get(reason, 0) + 1
        
        # Razão mais comum
        top_win = max(win_reasons.items(), key=lambda x: x[1])[0] if win_reasons else "N/A"
        top_loss = max(loss_reasons.items(), key=lambda x: x[1])[0] if loss_reasons else "N/A"
        
        fallback_analysis = f"""
<div style="padding: 15px; background: rgba(0,190,255,0.05); border-left: 3px solid var(--primary-cyan);">
    <p style="margin: 0 0 10px 0;"><strong>📊 Análise Baseada em Dados - {request.period}</strong></p>
    
    <p style="margin: 5px 0;"><strong>Win Rate:</strong> {win_rate:.1f}% ({won_count}/{total} deals)</p>
    
    <p style="margin: 5px 0;"><strong>Principal Fator de Vitória:</strong> {top_win} ({win_reasons.get(top_win, 0)} ocorrências)</p>
    
    <p style="margin: 5px 0;"><strong>Principal Causa de Perda:</strong> {top_loss} ({loss_reasons.get(top_loss, 0)} ocorrências)</p>
    
    <p style="margin: 10px 0 0 0; font-size: 0.9em; color: #888;">
        <em>💡 Análise IA temporariamente indisponível - Exibindo métricas calculadas</em>
    </p>
</div>
"""
        
        return {
            "success": False,
            "analysis": fallback_analysis,
            "metadata": {
                "won_analyzed": len(request.won_deals[:10]),
                "lost_analyzed": len(request.lost_deals[:10]),
                "total_won": won_count,
                "total_lost": lost_count,
                "period": request.period,
                "win_rate": round(win_rate, 1),
                "fallback": True
            },
            "error": str(e)
        }
