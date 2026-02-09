"""
Performance Endpoint - Índice de Performance do Vendedor (IPV)

OBJETIVO:
Gerar um ranking (0–100) por vendedor usando:
IPV = Resultado (40%) + Eficiência (35%) + Comportamento (25%)

FONTES (BigQuery):
1. closed_deals_won: wins por vendedor -> ganhos, net, ciclo_win, atividades, fator sucesso
2. closed_deals_lost: losses por vendedor -> perdas, ciclo_loss, atividades, causas, evitáveis
3. pipeline: deals ativos -> ticket médio (AVG Gross), excluindo Closed Won/Lost

FILTROS:
- year + quarter: filtra Fiscal_Q (FY{yy}-Q{q}) em won/lost
- year apenas: filtra Fiscal_Q LIKE 'FY{yy}-%' em won/lost
- seller: filtra Vendedor = X ou IN (X,Y,Z) em todas as tabelas
- pipeline: atualmente só filtra por seller (não aplica Fiscal_Q)

CÁLCULOS POR VENDEDOR:
1. Eficiência (0-100): 0.6*win_rate + 0.4*eficiencia_ciclo
2. Comportamento (0-100): 0.6*ativ_score + 0.4*qualidade_processo
3. Resultado (0-100): 0.25*deals_norm + 0.75*net_norm (normalizado relativo)
4. IPV Final: 0.40*resultado + 0.35*eficiencia + 0.25*comportamento

SAÍDA:
- ranking: ordenado desc por IPV com rank, scores, winRate, net
- scorecard: métricas detalhadas (ganhos/perdas, ciclos, tickets, gross/net)
- comportamento: diagnóstico (atividades win/loss, top causa perda, top fator sucesso)
"""
from fastapi import APIRouter, Query, HTTPException
from google.cloud import bigquery
from typing import Optional, Dict, Any, List
import os
from datetime import datetime

router = APIRouter()

# Configuration
PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"

def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)

def build_fiscal_filter(year: Optional[str], quarter: Optional[str]) -> str:
    """
    Constrói filtro Fiscal_Q para tabelas won/lost.
    
    Exemplos:
    - year=2026, quarter=1 -> Fiscal_Q = 'FY26-Q1'
    - year=2026, quarter=None -> Fiscal_Q LIKE 'FY26-%'
    - year=None -> '1=1' (sem filtro)
    """
    if year and quarter:
        # FY26-Q1, FY26-Q2, etc
        fiscal_q = f"FY{year[-2:]}-Q{quarter}"
        return f"Fiscal_Q = '{fiscal_q}'"
    elif year:
        # Todos os quarters do ano
        return f"Fiscal_Q LIKE 'FY{year[-2:]}-%'"
    return "1=1"  # Sem filtro

def build_seller_filter(seller: Optional[str]) -> str:
    """
    Constrói filtro de vendedor(es). Aceita vendedor único ou lista CSV.
    
    Exemplos:
    - seller='Carlos Moll' -> Vendedor = 'Carlos Moll'
    - seller='Carlos Moll, Gabriel Leick' -> Vendedor IN ('Carlos Moll', 'Gabriel Leick')
    - seller=None -> '1=1' (sem filtro)
    """
    if not seller:
        return "1=1"
    
    sellers = [s.strip() for s in seller.split(',')]
    if len(sellers) == 1:
        return f"Vendedor = '{sellers[0]}'"
    else:
        sellers_quoted = "', '".join(sellers)
        return f"Vendedor IN ('{sellers_quoted}')"

@router.get("/performance")
async def get_performance(
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    seller: Optional[str] = Query(None, description="Vendedor ou múltiplos separados por vírgula")
):
    """
    Retorna o Índice de Performance do Vendedor (IPV) e métricas detalhadas.
    
    **IPV Formula (0-100):**
    - Resultado (40%): 25% deals_norm + 75% net_norm (normalizado relativo)
    - Eficiência (35%): 60% win_rate + 40% eficiencia_ciclo
    - Comportamento (25%): 60% ativ_score + 40% qualidade_processo
    
    **Filtros:**
    - year + quarter: filtra Fiscal_Q = 'FY{yy}-Q{q}' em won/lost
    - year: filtra Fiscal_Q LIKE 'FY{yy}-%' em won/lost
    - seller: filtra Vendedor (único ou CSV) em todas as tabelas
    
    **Response:**
    ```json
    {
      "success": true,
      "total_vendedores": 11,
      "ranking": [
        {
          "rank": 1,
          "vendedor": "Carlos Moll",
          "ipv": 56.9,
          "resultado": 78.4,
          "eficiencia": 43.2,
          "comportamento": 41.6,
          "winRate": 5.4,
          "grossGerado": 1056392.7,
          "netGerado": 52679.48
        }
      ],
      "scorecard": [
        {
          "vendedor": "Carlos Moll",
          "winRate": 5.4,
          "totalGanhos": 3,
          "totalPerdas": 53,
          "cicloMedioWin": 11.7,
          "cicloMedioLoss": 245.5,
          "ticketMedio": 201750,
          "grossGerado": 1056392.7,
          "netGerado": 52679.48
        }
      ],
      "comportamento": [
        {
          "vendedor": "Carlos Moll",
          "ativMediaWin": 1.3,
          "ativMediaLoss": 1.7,
          "principalCausaPerda": "Abandono do Deal",
          "principalFatorSucesso": "Relevância estratégica do produto"
        }
      ]
    }
    ```
    """
    try:
        client = get_bq_client()
        
        fiscal_filter = build_fiscal_filter(year, quarter)
        seller_filter = build_seller_filter(seller)
        
        # =================================================================
        # 1. COLETAR DADOS DE DEALS GANHOS
        # =================================================================
        won_query = f"""
        SELECT 
            Vendedor,
            COUNT(*) as total_ganhos,
            ROUND(SUM(Gross), 2) as gross_ganho,
            ROUND(SUM(Net), 2) as net_ganho,
            ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as ciclo_medio_win,
            ROUND(AVG(SAFE_CAST(Atividades AS FLOAT64)), 1) as ativ_media_win,
            -- Top motivo de ganho (usando Causa_Raiz)
            APPROX_TOP_COUNT(COALESCE(Causa_Raiz, 'Não informado'), 1)[OFFSET(0)].value as top_win_factor
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE {fiscal_filter}
          AND {seller_filter}
          AND Vendedor IS NOT NULL
        GROUP BY Vendedor
        """
        
        # =================================================================
        # 2. COLETAR DADOS DE DEALS PERDIDOS
        # =================================================================
        lost_query = f"""
        SELECT 
            Vendedor,
            COUNT(*) as total_perdas,
            ROUND(SUM(Gross), 2) as gross_perdido,
            ROUND(AVG(SAFE_CAST(Ciclo_dias AS FLOAT64)), 1) as ciclo_medio_loss,
            ROUND(AVG(SAFE_CAST(Atividades AS FLOAT64)), 1) as ativ_media_loss,
            COUNTIF(Evitavel = 'Sim') as perdas_evitaveis,
            -- Top causa de perda (usando Causa_Raiz)
            APPROX_TOP_COUNT(COALESCE(Causa_Raiz, 'Não informado'), 1)[OFFSET(0)].value as top_loss_cause
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        WHERE {fiscal_filter}
          AND {seller_filter}
          AND Vendedor IS NOT NULL
        GROUP BY Vendedor
        """
        
        # =================================================================
        # 3. COLETAR DADOS DO PIPELINE ATIVO (para ticket médio)
        # =================================================================
        pipeline_query = f"""
        SELECT 
            Vendedor,
            COUNT(*) as total_pipeline,
            ROUND(AVG(Gross), 2) as ticket_medio_pipeline
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Vendedor IS NOT NULL
          AND {seller_filter}
          AND Fase_Atual NOT IN ('Closed Won', 'Closed Lost')
        GROUP BY Vendedor
        """
        
        # Executar queries
        won_data = {row['Vendedor']: dict(row) for row in client.query(won_query).result()}
        lost_data = {row['Vendedor']: dict(row) for row in client.query(lost_query).result()}
        pipeline_data = {row['Vendedor']: dict(row) for row in client.query(pipeline_query).result()}
        
        # =================================================================
        # 4. CONSOLIDAR DADOS POR VENDEDOR
        # =================================================================
        all_sellers = set(list(won_data.keys()) + list(lost_data.keys()))
        
        seller_performance = []
        
        for vendedor in all_sellers:
            won = won_data.get(vendedor, {})
            lost = lost_data.get(vendedor, {})
            pipeline = pipeline_data.get(vendedor, {})
            
            # Métricas básicas
            total_ganhos = won.get('total_ganhos', 0) or 0
            total_perdas = lost.get('total_perdas', 0) or 0
            total_deals = total_ganhos + total_perdas
            
            gross_ganho = won.get('gross_ganho', 0) or 0
            net_ganho = won.get('net_ganho', 0) or 0
            gross_perdido = lost.get('gross_perdido', 0) or 0
            
            ciclo_win = won.get('ciclo_medio_win', 0) or 0
            ciclo_loss = lost.get('ciclo_medio_loss', 0) or 0
            
            ativ_win = won.get('ativ_media_win', 0) or 0
            ativ_loss = lost.get('ativ_media_loss', 0) or 0
            
            perdas_evitaveis = lost.get('perdas_evitaveis', 0) or 0
            
            top_win_factor = won.get('top_win_factor', 'N/A')
            top_loss_cause = lost.get('top_loss_cause', 'N/A')
            
            ticket_medio = pipeline.get('ticket_medio_pipeline', 0) or (gross_ganho / total_ganhos if total_ganhos > 0 else 0)
            
            # =============================================================
            # 5. CALCULAR IPV - ÍNDICE DE PERFORMANCE DO VENDEDOR
            # =============================================================
            
            # --- PILAR 1: RESULTADO (40%) ---
            # Fórmula após normalização: 0.25*deals_norm + 0.75*net_norm
            # deals_norm = (total_ganhos / max_total_ganhos) * 100
            # net_norm = (net_ganho / max_net_ganho) * 100
            # Será normalizado no passo 6, comparando com todos os vendedores
            resultado_raw = {
                'deals_ganhos': total_ganhos,
                'revenue': net_ganho
            }
            
            # --- PILAR 2: EFICIÊNCIA (35%) ---
            # Fórmula: 0.6*win_rate + 0.4*eficiencia_ciclo
            
            # 1. Win Rate (0-100): total_ganhos / total_deals * 100
            win_rate = (total_ganhos / total_deals * 100) if total_deals > 0 else 0
            
            # 2. Eficiência de Ciclo (0-100): quanto menor ciclo_win vs ciclo_loss, melhor
            #    - Se ciclo_win < ciclo_loss (ganha rápido, perde devagar): > 50
            #    - Se ciclo_win > ciclo_loss (ganha devagar, perde rápido): < 50
            #    - Se só tem wins: 50 (default)
            #    - Se nenhum: 0
            if ciclo_loss > 0 and ciclo_win > 0:
                reducao_ciclo = (1 - (ciclo_win / ciclo_loss)) * 100  # % de redução
                eficiencia_ciclo = max(0, min(100, 50 + reducao_ciclo))  # Clamp [0, 100]
            elif ciclo_win > 0:
                eficiencia_ciclo = 50  # Default se não tem losses
            else:
                eficiencia_ciclo = 0
            
            # Score final: ponderação 60/40
            eficiencia_score = (win_rate * 0.6) + (eficiencia_ciclo * 0.4)
            
            # --- PILAR 3: COMPORTAMENTO (25%) ---
            # Fórmula: 0.6*ativ_score + 0.4*qualidade_processo
            
            # 1. Atividades Score (0-100): normalizado assumindo 50 atividades = 100 pts
            #    ativ_score = min(100, (ativ_media_win / 50) * 100)
            ativ_score = min(100, (ativ_win / 50) * 100) if ativ_win > 0 else 0
            
            # 2. Qualidade do Processo (0-100): inverso de % perdas evitáveis
            #    - Se total_perdas > 0: 100 - (perdas_evitaveis/total_perdas)*100
            #    - Sem perdas: 100 (perfeito)
            #    Menos perdas evitáveis = melhor qualidade de qualificação
            if total_perdas > 0:
                pct_evitavel = (perdas_evitaveis / total_perdas) * 100
                qualidade_processo = 100 - pct_evitavel
            else:
                qualidade_processo = 100
            
            # Score final: ponderação 60/40
            comportamento_score = (ativ_score * 0.6) + (qualidade_processo * 0.4)
            
            # --- CÁLCULO INTERMEDIÁRIO DO IPV (falta normalizar Resultado) ---
            seller_performance.append({
                'vendedor': vendedor,
                'total_ganhos': total_ganhos,
                'total_perdas': total_perdas,
                'total_deals': total_deals,
                'gross_ganho': gross_ganho,
                'net_ganho': net_ganho,
                'gross_perdido': gross_perdido,
                'win_rate': round(win_rate, 1),
                'ciclo_medio_win': round(ciclo_win, 1),
                'ciclo_medio_loss': round(ciclo_loss, 1),
                'ticket_medio': round(ticket_medio, 2),
                'ativ_media_win': round(ativ_win, 1),
                'ativ_media_loss': round(ativ_loss, 1),
                'perdas_evitaveis': perdas_evitaveis,
                'top_win_factor': top_win_factor,
                'top_loss_cause': top_loss_cause,
                # Scores
                'resultado_raw': resultado_raw,
                'eficiencia_score': round(eficiencia_score, 1),
                'comportamento_score': round(comportamento_score, 1),
                'eficiencia_ciclo': round(eficiencia_ciclo, 1)
            })
        
        # =================================================================
        # 6. NORMALIZAR RESULTADO (comparação relativa entre vendedores)
        # =================================================================
        # Pilar Resultado é RELATIVO: comparamos cada vendedor com o melhor
        # Fórmula: 0.25*deals_norm + 0.75*revenue_norm (NET)
        #   deals_norm = (total_ganhos / max_total_ganhos) * 100
        #   revenue_norm = (net_ganho / max_net_ganho) * 100
        if len(seller_performance) > 0:
            max_deals = max(s['resultado_raw']['deals_ganhos'] for s in seller_performance)
            # Normalização ignora NET negativo (considera apenas valores positivos)
            max_revenue = max(max(0, s['resultado_raw']['revenue']) for s in seller_performance)
            
            for seller in seller_performance:
                # Normalizar deals e revenue para 0-100
                deals_norm = (seller['resultado_raw']['deals_ganhos'] / max_deals * 100) if max_deals > 0 else 0
                # revenue_norm usa max(0, revenue) para ignorar negativos
                revenue_value = max(0, seller['resultado_raw']['revenue'])
                revenue_norm = (revenue_value / max_revenue * 100) if max_revenue > 0 else 0
                
                # Ponderação: 25% quantidade + 75% valor NET (prioriza resultado financeiro)
                resultado_score = (deals_norm * 0.25) + (revenue_norm * 0.75)
                seller['resultado_score'] = round(resultado_score, 1)
                
                # =============================================================
                # CÁLCULO FINAL DO IPV (0-100)
                # =============================================================
                # IPV = 0.40*Resultado + 0.35*Eficiência + 0.25*Comportamento
                ipv = (
                    (resultado_score * 0.40) +      # 40% Resultado
                    (seller['eficiencia_score'] * 0.35) +  # 35% Eficiência
                    (seller['comportamento_score'] * 0.25)  # 25% Comportamento
                )
                
                # GATE: NET <= 0 não pode rankear alto (IPV max 20)
                if seller['net_ganho'] <= 0:
                    ipv = min(ipv, 20)
                
                seller['ipv'] = round(ipv, 1)
        
        # =================================================================
        # 7. ORDENAR POR IPV (ranking)
        # =================================================================
        seller_performance.sort(key=lambda x: x['ipv'], reverse=True)
        
        # =================================================================
        # 8. FORMATAR RESPOSTA
        # =================================================================
        
        # Ranking IPV
        ranking = []
        for idx, seller in enumerate(seller_performance):
            ranking.append({
                'rank': idx + 1,
                'vendedor': seller['vendedor'],
                'ipv': seller['ipv'],
                'resultado': seller['resultado_score'],
                'eficiencia': seller['eficiencia_score'],
                'comportamento': seller['comportamento_score'],
                'winRate': seller['win_rate'],
                'grossGerado': seller['gross_ganho'],
                'netGerado': seller['net_ganho']
            })
        
        # Scorecard Detalhado
        scorecard = []
        for seller in seller_performance:
            scorecard.append({
                'vendedor': seller['vendedor'],
                'winRate': seller['win_rate'],
                'totalGanhos': seller['total_ganhos'],
                'totalPerdas': seller['total_perdas'],
                'cicloMedioWin': seller['ciclo_medio_win'],
                'cicloMedioLoss': seller['ciclo_medio_loss'],
                'ticketMedio': seller['ticket_medio'],
                'grossGerado': seller['gross_ganho'],
                'netGerado': seller['net_ganho']
            })
        
        # Diagnóstico de Comportamento
        comportamento = []
        for seller in seller_performance:
            comportamento.append({
                'vendedor': seller['vendedor'],
                'ativMediaWin': seller['ativ_media_win'],
                'ativMediaLoss': seller['ativ_media_loss'],
                'principalCausaPerda': seller['top_loss_cause'],
                'principalFatorSucesso': seller['top_win_factor']
            })
        
        return {
            'success': True,
            'timestamp': datetime.utcnow().isoformat(),
            'filters': {
                'year': year,
                'quarter': quarter,
                'seller': seller
            },
            'total_vendedores': len(seller_performance),
            'ranking': ranking,
            'scorecard': scorecard,
            'comportamento': comportamento,
            'metadata': {
                'ipv_formula': 'IPV = Resultado (40%) + Eficiência (35%) + Comportamento (25%)',
                'resultado': '0.25*deals_norm + 0.75*net_norm (normalizado relativo aos demais)',
                'eficiencia': '0.6*win_rate + 0.4*eficiencia_ciclo',
                'comportamento': '0.6*ativ_score + 0.4*qualidade_processo',
                'sources': {
                    'won': 'closed_deals_won (ganhos, net, ciclo_win, ativ_win, fator_sucesso)',
                    'lost': 'closed_deals_lost (perdas, ciclo_loss, ativ_loss, evitaveis, causa)',
                    'pipeline': 'pipeline (ticket_medio de deals ativos)'
                },
                'filters_applied': {
                    'fiscal_q': f"FY{year[-2:]}-Q{quarter}" if year and quarter else (f"FY{year[-2:]}-%" if year else "Todos"),
                    'seller': seller if seller else "Todos"
                }
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance calculation error: {str(e)}")


@router.get("/performance/seller/{seller_name}")
async def get_seller_performance(
    seller_name: str,
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4")
):
    """
    Retorna performance detalhada de um vendedor específico.
    """
    try:
        # Reutilizar o endpoint principal com filtro de seller
        result = await get_performance(year=year, quarter=quarter, seller=seller_name)
        
        if result['total_vendedores'] == 0:
            raise HTTPException(status_code=404, detail=f"Vendedor '{seller_name}' não encontrado")
        
        # Extrair dados do vendedor
        seller_data = result['ranking'][0] if result['ranking'] else None
        
        if not seller_data:
            raise HTTPException(status_code=404, detail=f"Dados não encontrados para '{seller_name}'")
        
        return {
            'success': True,
            'vendedor': seller_name,
            'performance': seller_data,
            'scorecard': result['scorecard'][0] if result['scorecard'] else {},
            'comportamento': result['comportamento'][0] if result['comportamento'] else {},
            'filters': result['filters']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller performance error: {str(e)}")


@router.get("/seller-timeline/{seller_name}")
async def get_seller_timeline(
    seller_name: str,
    quarters: int = Query(4, description="Número de quarters passados para análise (padrão: 4)")
):
    """
    Retorna evolução temporal do IPV do vendedor nos últimos N quarters.
    
    **Response:**
    ```json
    {
      "success": true,
      "vendedor": "Carlos Moll",
      "timeline": [
        {
          "quarter": "FY25-Q2",
          "ipv": 52.3,
          "resultado": 70.1,
          "eficiencia": 40.5,
          "comportamento": 38.2,
          "netGerado": 45000,
          "winRate": 8.5
        }
      ],
      "media_time": {
        "ipv": 51.2,
        "winRate": 6.8
      }
    }
    ```
    """
    try:
        client = get_bq_client()
        
        # Buscar últimos N quarters distintos
        quarters_query = f"""
        SELECT DISTINCT Fiscal_Q
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE Fiscal_Q IS NOT NULL
        ORDER BY Fiscal_Q DESC
        LIMIT {quarters}
        """
        
        quarters_result = list(client.query(quarters_query).result())
        fiscal_quarters = [row['Fiscal_Q'] for row in quarters_result]
        
        if not fiscal_quarters:
            return {
                'success': True,
                'vendedor': seller_name,
                'timeline': [],
                'media_time': {'ipv': 0, 'winRate': 0}
            }
        
        timeline_data = []
        ipv_sum = 0
        wr_sum = 0
        
        # Para cada quarter, buscar performance
        for fiscal_q in fiscal_quarters:
            # Extrair year e quarter de FY26-Q1
            year_part = "20" + fiscal_q.split('-')[0][2:]  # FY26 -> 2026
            quarter_part = fiscal_q.split('-Q')[1]  # Q1 -> 1
            
            # Chamar endpoint existente
            result = await get_performance(year=year_part, quarter=quarter_part, seller=seller_name)
            
            if result['ranking']:
                seller_data = result['ranking'][0]
                timeline_data.append({
                    'quarter': fiscal_q,
                    'ipv': seller_data.get('ipv', 0),
                    'resultado': seller_data.get('resultado', 0),
                    'eficiencia': seller_data.get('eficiencia', 0),
                    'comportamento': seller_data.get('comportamento', 0),
                    'netGerado': seller_data.get('netGerado', 0),
                    'winRate': seller_data.get('winRate', 0)
                })
                ipv_sum += seller_data.get('ipv', 0)
                wr_sum += seller_data.get('winRate', 0)
        
        # Calcular média do time no mesmo período
        media_ipv = round(ipv_sum / len(timeline_data), 1) if timeline_data else 0
        media_wr = round(wr_sum / len(timeline_data), 1) if timeline_data else 0
        
        return {
            'success': True,
            'vendedor': seller_name,
            'timeline': timeline_data,
            'media_time': {
                'ipv': media_ipv,
                'winRate': media_wr
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller timeline error: {str(e)}")


@router.get("/seller-deals/{seller_name}")
async def get_seller_deals(
    seller_name: str,
    year: Optional[str] = Query(None, description="Ano fiscal (ex: 2026)"),
    quarter: Optional[str] = Query(None, description="Quarter 1-4"),
    top_n: int = Query(5, description="Número de top deals para retornar (padrão: 5)")
):
    """
    Retorna top deals do vendedor (ganhos, perdas e pipeline hot).
    
    **Response:**
    ```json
    {
      "success": true,
      "vendedor": "Carlos Moll",
      "top_wins": [
        {
          "nome": "Deal XYZ Corp",
          "net": 85000,
          "gross": 100000,
          "ciclo_dias": 45,
          "motivo": "Relevância estratégica"
        }
      ],
      "top_losses": [...],
      "pipeline_hot": [...]
    }
    ```
    """
    try:
        client = get_bq_client()
        
        fiscal_filter = build_fiscal_filter(year, quarter)
        
        # =================================================================
        # 1. TOP DEALS GANHOS (por NET)
        # =================================================================
        top_wins_query = f"""
        SELECT 
            Oportunidade as nome,
            ROUND(Net, 2) as net,
            ROUND(Gross, 2) as gross,
            CAST(Ciclo_dias AS INT64) as ciclo_dias,
            Causa_Raiz as motivo,
            Fiscal_Q as quarter
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
        WHERE {fiscal_filter}
          AND Vendedor = '{seller_name}'
          AND Oportunidade IS NOT NULL
        ORDER BY Net DESC
        LIMIT {top_n}
        """
        
        # =================================================================
        # 2. TOP DEALS PERDIDOS (por GROSS potencial)
        # =================================================================
        top_losses_query = f"""
        SELECT 
            Oportunidade as nome,
            ROUND(Gross, 2) as gross_potencial,
            CAST(Ciclo_dias AS INT64) as ciclo_dias,
            Causa_Raiz as motivo,
            -- Evitavel existe apenas em lost
            CAST(NULL AS STRING) as evitavel,
            Fiscal_Q as quarter
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
        WHERE {fiscal_filter}
          AND Vendedor = '{seller_name}'
          AND Oportunidade IS NOT NULL
        ORDER BY Gross DESC
        LIMIT {top_n}
        """
        
        # =================================================================
        # 3. PIPELINE HOT (NET x Confiança > threshold)
        # =================================================================
        pipeline_hot_query = f"""
        SELECT 
            Oportunidade as nome,
            ROUND(Net, 2) as net,
            ROUND(Gross, 2) as gross,
            CAST(Confianca AS INT64) as confianca,
            Fase_Atual as stage,
            ROUND(Net * (Confianca / 100), 2) as expected_value
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        WHERE Vendedor = '{seller_name}'
          AND Oportunidade IS NOT NULL
          AND Confianca >= 50
        ORDER BY expected_value DESC
        LIMIT {top_n}
        """
        
        # Executar queries em paralelo
        wins_result = list(client.query(top_wins_query).result())
        losses_result = list(client.query(top_losses_query).result())
        pipeline_result = list(client.query(pipeline_hot_query).result())
        
        # Converter para dict
        top_wins = [dict(row) for row in wins_result]
        top_losses = [dict(row) for row in losses_result]
        pipeline_hot = [dict(row) for row in pipeline_result]
        
        return {
            'success': True,
            'vendedor': seller_name,
            'top_wins': top_wins,
            'top_losses': top_losses,
            'pipeline_hot': pipeline_hot,
            'filters': {
                'year': year,
                'quarter': quarter,
                'top_n': top_n
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seller deals error: {str(e)}")
