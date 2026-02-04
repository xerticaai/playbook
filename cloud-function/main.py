"""
🚀 XERTICA.AI - SALES INTELLIGENCE ENGINE
Cloud Function: Análise Completa de Pipeline & Forecast

Autor: Copilot (Claude Sonnet 4.5)
Data: 04 de Fevereiro de 2026
Versão: 1.0

ARQUITETURA:
- Recebe dados brutos do Google Sheets via Apps Script
- Processa com Pandas (análise pesada)
- Retorna JSON estruturado para dashboard
- Suporta filtros dinâmicos (quarter, vendedor, produto, etc.)
"""

import functions_framework
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from typing import Dict, List, Any
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==============================================================================
# FUNÇÕES AUXILIARES - BUSCA DE COLUNAS
# ==============================================================================

def find_column(df: pd.DataFrame, possible_names: List[str]) -> str:
    """
    Busca uma coluna no DataFrame usando múltiplos nomes possíveis
    
    Args:
        df: DataFrame
        possible_names: Lista de nomes possíveis (ordenados por prioridade)
        
    Returns:
        Nome da coluna encontrada ou None
    """
    for name in possible_names:
        if name in df.columns:
            return name
    return None


def get_column_value_safe(row: pd.Series, possible_names: List[str], default=None):
    """
    Busca valor em uma Series usando múltiplos nomes possíveis
    
    Args:
        row: Series (linha do DataFrame)
        possible_names: Lista de nomes possíveis
        default: Valor padrão
        
    Returns:
        Valor encontrado ou default
    """
    for name in possible_names:
        if name in row.index and pd.notna(row[name]):
            return row[name]
    return default


# ==============================================================================
# FUNÇÕES AUXILIARES - LIMPEZA E PADRONIZAÇÃO
# ==============================================================================

def clean_money(value):
    """Converte valores monetários para float"""
    if pd.isna(value) or value == '':
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove R$, $, espaços, pontos de milhar
    cleaned = str(value).replace('R$', '').replace('$', '').replace(' ', '')
    cleaned = cleaned.replace('.', '').replace(',', '.')
    try:
        return float(cleaned)
    except:
        return 0.0


def clean_percentage(value):
    """Converte percentuais para float (0-100)"""
    if pd.isna(value) or value == '':
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace('%', '').strip()
    try:
        return float(cleaned)
    except:
        return 0.0


def normalize_text(text):
    """Normaliza texto (upper, sem acentos, trim)"""
    if pd.isna(text):
        return ''
    import unicodedata
    text = str(text).upper().strip()
    # Remove acentos
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join([c for c in nfkd if not unicodedata.combining(c)])


def calculate_fiscal_quarter(date_str):
    """Calcula Fiscal Quarter (FY26-Q1, etc.)"""
    try:
        # Tenta múltiplos formatos
        for fmt in ['%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y']:
            try:
                dt = datetime.strptime(str(date_str), fmt)
                break
            except:
                continue
        else:
            return 'N/A'
        
        month = dt.month
        year = dt.year
        
        # Q1: Jan-Mar, Q2: Abr-Jun, Q3: Jul-Set, Q4: Out-Dez
        if 1 <= month <= 3:
            q = 1
        elif 4 <= month <= 6:
            q = 2
        elif 7 <= month <= 9:
            q = 3
        else:
            q = 4
        
        return f"FY{str(year)[-2:]}-Q{q}"
    except:
        return 'N/A'


# ==============================================================================
# FASE 1: PREPARAÇÃO DE DADOS
# ==============================================================================

def prepare_pipeline_data(raw_data: List[Dict]) -> pd.DataFrame:
    """
    Prepara dados do pipeline aberto
    
    Args:
        raw_data: Lista de dicionários com dados brutos
        
    Returns:
        DataFrame limpo e padronizado
    """
    logger.info(f"[PREPARE_PIPELINE] Recebido: {len(raw_data)} registros")
    
    if len(raw_data) == 0:
        logger.warning("[PREPARE_PIPELINE] Lista vazia recebida!")
        return pd.DataFrame()
    
    # Log primeira linha para debug
    logger.info(f"[PREPARE_PIPELINE] Amostra do primeiro registro: {list(raw_data[0].keys())[:10]}")
    
    df = pd.DataFrame(raw_data)
    
    logger.info(f"[PREPARE_PIPELINE] DataFrame criado: {len(df)} linhas x {len(df.columns)} colunas")
    logger.info(f"[PREPARE_PIPELINE] Colunas disponíveis: {list(df.columns)[:15]}")
    
    # Mapeamento de colunas (busca flexível)
    column_map = {
        'opportunity_name': find_column(df, ['Oportunidade', 'Nome da oportunidade', 'Opportunity Name']),
        'account_name': find_column(df, ['Conta', 'Nome da conta', 'Account Name']),
        'seller_name': find_column(df, ['Vendedor', 'Proprietário da oportunidade', 'Owner']),
        'gross': find_column(df, ['Gross', 'Preço total (convertido)', 'Total Price']),
        'net': find_column(df, ['Net', 'Margen Total $', 'Margin']),
        'fiscal_quarter': find_column(df, ['Fiscal Q', 'Período fiscal', 'Quarter']),
        'close_date': find_column(df, ['Data Prevista', 'Data de fechamento', 'Close Date']),
        'confidence_pct': find_column(df, ['Confiança (%)', 'Confidence', 'Probability']),
        'activities': find_column(df, ['Atividades', '# Atividades', 'Activities']),
        'days_in_pipeline': find_column(df, ['Dias Funil', 'Age', 'Days']),
        'idle_days': find_column(df, ['Idle (Dias)', 'Dias inativos', 'Idle']),
        'forecast': find_column(df, ['Forecast IA', 'Forecast SF', 'Forecast']),
        'stage': find_column(df, ['Fase Atual', 'Fase', 'Stage'])
    }
    
    logger.info(f"Colunas mapeadas: {column_map}")
    
    # Criar DataFrame com colunas padronizadas
    standardized_df = pd.DataFrame()
    
    mapped_count = 0
    for standard_name, original_col in column_map.items():
        if original_col and original_col in df.columns:
            standardized_df[standard_name] = df[original_col]
            mapped_count += 1
    
    logger.info(f"[PREPARE_PIPELINE] Colunas mapeadas com sucesso: {mapped_count}/{len(column_map)}")
    logger.info(f"[PREPARE_PIPELINE] Colunas no DataFrame padronizado: {list(standardized_df.columns)}")
    
    # Limpar valores monetários
    for col in ['gross', 'net']:
        if col in standardized_df.columns:
            standardized_df[col] = standardized_df[col].apply(clean_money)
    
    # Limpar percentuais
    for col in ['confidence_pct']:
        if col in standardized_df.columns:
            standardized_df[col] = standardized_df[col].apply(clean_percentage)
    
    # Normalizar texto
    for col in ['seller_name', 'account_name', 'forecast']:
        if col in standardized_df.columns:
            standardized_df[f'{col}_norm'] = standardized_df[col].apply(normalize_text)
    
    # Campos numéricos
    for col in ['activities', 'days_in_pipeline', 'idle_days']:
        if col in standardized_df.columns:
            standardized_df[col] = pd.to_numeric(standardized_df[col], errors='coerce').fillna(0)
    
    # Renomear confidence_pct para confidence (padronizar)
    if 'confidence_pct' in standardized_df.columns:
        standardized_df['confidence'] = standardized_df['confidence_pct']
    
    logger.info(f"[PREPARE_PIPELINE] ✅ CONCLUÍDO: {len(standardized_df)} deals processados")
    if len(standardized_df) > 0:
        logger.info(f"[PREPARE_PIPELINE] Amostra gross: {standardized_df['gross'].head(3).tolist() if 'gross' in standardized_df.columns else 'N/A'}")
    return standardized_df


def prepare_closed_data(wins_data: List[Dict], losses_data: List[Dict]) -> pd.DataFrame:
    """
    Prepara dados de deals fechados (ganhos + perdas)
    
    Args:
        wins_data: Lista de deals ganhos
        losses_data: Lista de deals perdidos
        
    Returns:
        DataFrame unificado de deals fechados
    """
    logger.info(f"[PREPARE_CLOSED] Recebido: {len(wins_data)} wins, {len(losses_data)} losses")
    
    df_wins = pd.DataFrame(wins_data)
    df_losses = pd.DataFrame(losses_data)
    
    # ✅ SEMPRE adicionar 'Outcome', mesmo em DataFrames vazios
    df_wins['Outcome'] = 'GANHO'
    df_losses['Outcome'] = 'PERDA'
    
    if len(df_wins) > 0:
        logger.info(f"[PREPARE_CLOSED] Colunas ganhos (primeiras 10): {list(df_wins.columns)[:10]}")
    
    if len(df_losses) > 0:
        logger.info(f"[PREPARE_CLOSED] Colunas perdas (primeiras 10): {list(df_losses.columns)[:10]}")
    
    # Unificar colunas - buscar comuns (incluindo 'Outcome' que SEMPRE existe agora)
    common_cols = list(set(df_wins.columns) & set(df_losses.columns))
    logger.info(f"[PREPARE_CLOSED] Colunas comuns encontradas: {len(common_cols)} (deve incluir 'Outcome')")
    
    # Validar que 'Outcome' está presente
    if 'Outcome' not in common_cols:
        logger.error("[PREPARE_CLOSED] ❌ ERRO: 'Outcome' não encontrado em colunas comuns!")
        logger.error(f"[PREPARE_CLOSED] df_wins.columns: {list(df_wins.columns)}")
        logger.error(f"[PREPARE_CLOSED] df_losses.columns: {list(df_losses.columns)}")
        raise ValueError("'Outcome' column missing in DataFrames")
    
    df_closed = pd.concat([df_wins[common_cols], df_losses[common_cols]], ignore_index=True)
    
    # Mapeamento de colunas
    column_map = {
        'opportunity_name': find_column(df_closed, ['Oportunidade', 'Nome da oportunidade']),
        'account_name': find_column(df_closed, ['Conta', 'Nome da conta']),
        'seller_name': find_column(df_closed, ['Vendedor', 'Proprietário da oportunidade']),
        'gross': find_column(df_closed, ['Gross', 'Preço total (convertido)']),
        'net': find_column(df_closed, ['Net', 'Margen Total $']),
        'fiscal_quarter': find_column(df_closed, ['Fiscal Q', 'Período fiscal']),
        'close_date': find_column(df_closed, ['Data Fechamento', 'Data de fechamento']),
        'cycle_days': find_column(df_closed, ['Ciclo (dias)', 'Cycle']),
        'activities': find_column(df_closed, ['# Atividades', 'Atividades'])
    }
    
    # Criar DataFrame padronizado
    standardized_df = pd.DataFrame()
    standardized_df['Outcome'] = df_closed['Outcome']
    
    for standard_name, original_col in column_map.items():
        if original_col and original_col in df_closed.columns:
            standardized_df[standard_name] = df_closed[original_col]
    
    # Limpar valores monetários
    for col in ['gross', 'net']:
        if col in standardized_df.columns:
            standardized_df[col] = standardized_df[col].apply(clean_money)
    
    # ✅ Converter colunas numéricas para int/float
    if 'cycle_days' in standardized_df.columns:
        standardized_df['cycle_days'] = pd.to_numeric(standardized_df['cycle_days'], errors='coerce').fillna(0).astype(int)
    
    if 'activities' in standardized_df.columns:
        standardized_df['activities'] = pd.to_numeric(standardized_df['activities'], errors='coerce').fillna(0).astype(int)
    
    # Normalizar texto
    if 'seller_name' in standardized_df.columns:
        standardized_df['seller_name_norm'] = standardized_df['seller_name'].apply(normalize_text)
    
    logger.info(f"[PREPARE_CLOSED] ✅ CONCLUÍDO: {len(standardized_df)} total deals preparados")
    if len(standardized_df) > 0:
        ganhos = (standardized_df['Outcome'] == 'GANHO').sum()
        perdas = (standardized_df['Outcome'] == 'PERDA').sum()
        logger.info(f"[PREPARE_CLOSED] Distribuição: {ganhos} ganhos + {perdas} perdas")
    return standardized_df


# ==============================================================================
# FASE 2: ANÁLISE DE DEALS FECHADOS (HISTÓRICO)
# ==============================================================================

def analyze_closed_deals(df_closed: pd.DataFrame, filter_quarter: str = None) -> Dict:
    """
    Analisa padrões de ganhos e perdas (usa nomes padronizados)
    
    Args:
        df_closed: DataFrame de deals fechados com colunas padronizadas
        filter_quarter: Quarter para filtrar (ex: 'FY26-Q1') ou None para todos
        
    Returns:
        Dicionário com métricas e insights
    """
    # Filtrar por quarter se especificado
    if filter_quarter:
        if 'fiscal_quarter' in df_closed.columns:
            df = df_closed[df_closed['fiscal_quarter'] == filter_quarter].copy()
            logger.info(f"Filtrado para {filter_quarter}: {len(df)} deals")
        else:
            logger.warning(f"Coluna 'fiscal_quarter' não encontrada, retornando todos os {len(df_closed)} deals")
            df = df_closed.copy()
    else:
        df = df_closed.copy()
    
    if len(df) == 0:
        return {"error": "Sem dados para análise"}
    
    df_wins = df[df['Outcome'] == 'GANHO']
    df_losses = df[df['Outcome'] == 'PERDA']
    
    # Métricas gerais
    total_deals = len(df)
    total_wins = len(df_wins)
    total_losses = len(df_losses)
    
    wins_gross = df_wins['gross'].sum() if 'gross' in df_wins.columns else 0
    losses_gross = df_losses['gross'].sum() if 'gross' in df_losses.columns else 0
    total_gross = wins_gross + losses_gross
    
    win_rate_volume = total_wins / total_deals if total_deals > 0 else 0
    win_rate_value = wins_gross / total_gross if total_gross > 0 else 0
    
    # Causas de perda (manter campos originais se existirem)
    loss_causes = {}
    for col in ['Tipo Resultado', 'tipo_resultado', '🎯 Causa Raiz']:
        if col in df_losses.columns:
            loss_causes = df_losses[col].value_counts().head(10).to_dict()
            break
    
    # Perfil (Farming vs Hunting)
    profile_wins = {}
    profile_losses = {}
    for col in ['Perfil Cliente', 'Perfil', 'perfil_cliente']:
        if col in df.columns:
            profile_wins = df_wins[col].value_counts().to_dict()
            profile_losses = df_losses[col].value_counts().to_dict()
            break
    
    # Higiene de CRM (atividades)
    crm_hygiene = {}
    if 'activities' in df.columns:
        wins_zero_activity = (df_wins['activities'] == 0).sum()
        losses_zero_activity = (df_losses['activities'] == 0).sum()
        crm_hygiene = {
            'wins_pct_zero_activity': wins_zero_activity / total_wins if total_wins > 0 else 0,
            'losses_pct_zero_activity': losses_zero_activity / total_losses if total_losses > 0 else 0
        }
    
    # Ciclo médio
    avg_cycle = {}
    if 'cycle_days' in df.columns:
        wins_cycle = df_wins[df_wins['cycle_days'] > 0]['cycle_days']
        losses_cycle = df_losses[df_losses['cycle_days'] > 0]['cycle_days']
        avg_cycle = {
            'wins_avg_days': float(wins_cycle.mean()) if len(wins_cycle) > 0 else 0,
            'losses_avg_days': float(losses_cycle.mean()) if len(losses_cycle) > 0 else 0
        }
    
    return {
        "summary": {
            "total_deals": int(total_deals),
            "total_wins": int(total_wins),
            "total_losses": int(total_losses),
            "wins_gross": float(wins_gross),
            "losses_gross": float(losses_gross),
            "total_gross": float(total_gross),
            "win_rate_volume": float(win_rate_volume),
            "win_rate_value": float(win_rate_value)
        },
        "loss_causes": loss_causes,
        "profiles": {
            "wins": profile_wins,
            "losses": profile_losses
        },
        "crm_hygiene": crm_hygiene,
        "cycle_time": avg_cycle
    }


# ==============================================================================
# FASE 3: ANÁLISE DE PIPELINE (FORECAST)
# ==============================================================================

def analyze_pipeline(df_pipeline: pd.DataFrame, filter_quarter: str = None) -> Dict:
    """
    Analisa saúde do pipeline aberto (usa nomes padronizados)
    
    Args:
        df_pipeline: DataFrame do pipeline com colunas padronizadas
        filter_quarter: Quarter para filtrar ou None
        
    Returns:
        Dicionário com métricas e riscos
    """
    # Filtrar por quarter
    if filter_quarter:
        if 'fiscal_quarter' in df_pipeline.columns:
            df = df_pipeline[df_pipeline['fiscal_quarter'] == filter_quarter].copy()
        else:
            logger.warning("Coluna 'fiscal_quarter' não encontrada no pipeline")
            df = df_pipeline.copy()
    else:
        df = df_pipeline.copy()
    
    if len(df) == 0:
        return {"error": "Sem pipeline"}
    
    total_gross = df['gross'].sum() if 'gross' in df.columns else 0
    total_deals = len(df)
    
    # Zumbis: parados >90 dias com 0 atividades
    has_activities = 'activities' in df.columns
    has_days = 'days_in_pipeline' in df.columns
    
    if has_activities and has_days:
        zumbis_mask = (df['activities'] == 0) & (df['days_in_pipeline'] >= 90)
        zumbis_count = zumbis_mask.sum()
        zumbis_gross = df[zumbis_mask]['gross'].sum() if 'gross' in df.columns else 0
    else:
        zumbis_count = 0
        zumbis_gross = 0
    
    # Distribuição de confiança
    confidence_dist = {}
    if 'confidence' in df.columns:
        commit = (df['confidence'] >= 90).sum()
        upside = ((df['confidence'] >= 50) & (df['confidence'] < 90)).sum()
        pipeline = (df['confidence'] < 50).sum()
        confidence_dist = {
            'commit': int(commit),
            'upside': int(upside),
            'pipeline': int(pipeline),
            'avg_confidence': float(df['confidence'].mean())
        }
    
    # Forecast IA vs SF (manter nomes originais se existirem)
    forecast_alignment = {}
    if 'Forecast IA' in df.columns and 'Forecast SF' in df.columns:
        aligned = (df['Forecast IA'] == df['Forecast SF']).sum()
        forecast_alignment = {
            'aligned_count': int(aligned),
            'misaligned_count': int(total_deals - aligned),
            'alignment_rate': float(aligned / total_deals) if total_deals > 0 else 0
        }
    
    # Território incorreto
    territorio_errado = 0
    for col in ['Território Correto?', 'territorio_correto']:
        if col in df.columns:
            territorio_errado = (df[col] == 'NÃO').sum()
            break
    
    return {
        "summary": {
            "total_deals": int(total_deals),
            "total_gross": float(total_gross),
            "avg_deal_size": float(total_gross / total_deals) if total_deals > 0 else 0
        },
        "health": {
            "zumbis_count": int(zumbis_count),
            "zumbis_gross": float(zumbis_gross),
            "zumbis_pct": float(zumbis_count / total_deals) if total_deals > 0 else 0,
            "territorio_errado": int(territorio_errado)
        },
        "confidence_distribution": confidence_dist,
        "forecast_alignment": forecast_alignment
    }


# ==============================================================================
# FASE 4: SCORECARD DE VENDEDORES
# ==============================================================================

def calculate_seller_scorecard(df_pipeline: pd.DataFrame, df_closed: pd.DataFrame, 
                               filter_quarter: str = None) -> List[Dict]:
    """
    Calcula scorecard de risco/performance por vendedor (usa nomes padronizados)
    
    Args:
        df_pipeline: Pipeline aberto com colunas padronizadas
        df_closed: Deals fechados com colunas padronizadas
        filter_quarter: Quarter para filtrar
        
    Returns:
        Lista de scorecards por vendedor
    """
    # Filtrar quarter
    if filter_quarter:
        if 'fiscal_quarter' in df_pipeline.columns:
            df_p = df_pipeline[df_pipeline['fiscal_quarter'] == filter_quarter].copy()
        else:
            df_p = df_pipeline.copy()
        
        if 'fiscal_quarter' in df_closed.columns:
            df_c = df_closed[df_closed['fiscal_quarter'] == filter_quarter].copy()
        else:
            df_c = df_closed.copy()
    else:
        df_p = df_pipeline.copy()
        df_c = df_closed.copy()
    
    sellers = []
    
    # Pipeline por vendedor
    if 'seller_name_norm' in df_p.columns:
        for seller in df_p['seller_name_norm'].unique():
            if pd.isna(seller) or seller == '':
                continue
            
            seller_pipeline = df_p[df_p['seller_name_norm'] == seller]
            seller_closed = df_c[df_c['seller_name_norm'] == seller] if 'seller_name_norm' in df_c.columns else pd.DataFrame()
            
            # Métricas de pipeline
            deals = len(seller_pipeline)
            gross = seller_pipeline['gross'].sum() if 'gross' in seller_pipeline.columns else 0
            
            pct_zero_activity = (seller_pipeline['activities'] == 0).mean() if 'activities' in seller_pipeline.columns else 0
            pct_idle_90 = (seller_pipeline['idle_days'] > 90).mean() if 'idle_days' in seller_pipeline.columns else 0
            
            # Território incorreto
            pct_territory_wrong = 0
            for col in ['Território Correto?', 'territorio_correto']:
                if col in seller_pipeline.columns:
                    pct_territory_wrong = (seller_pipeline[col] == 'NÃO').mean()
                    break
            
            # Métricas históricas
            if len(seller_closed) > 0:
                wins = (seller_closed['Outcome'] == 'GANHO').sum()
                losses = (seller_closed['Outcome'] == 'PERDA').sum()
                win_rate = wins / (wins + losses) if (wins + losses) > 0 else 0
            else:
                win_rate = 0
            
            # Score de risco (0-100, maior = mais risco)
            risk_score = (pct_zero_activity * 40) + (pct_idle_90 * 30) + (pct_territory_wrong * 30)
            
            sellers.append({
                "name": seller,
                "pipeline_deals": int(deals),
                "pipeline_gross": float(gross),
                "pct_zero_activity": float(pct_zero_activity),
                "pct_idle_90": float(pct_idle_90),
                "pct_territory_wrong": float(pct_territory_wrong),
                "win_rate": float(win_rate),
                "risk_score": float(risk_score)
            })
    
    # Ordenar por gross (maior primeiro)
    sellers.sort(key=lambda x: x['pipeline_gross'], reverse=True)
    
    return sellers


# ==============================================================================
# FASE 5: ALVOS DE GUERRA (TOP RISCOS)
# ==============================================================================

def identify_war_targets(df_pipeline: pd.DataFrame, top_n: int = 10, 
                        filter_quarter: str = None) -> List[Dict]:
    """
    Identifica deals de maior risco x valor (usa nomes padronizados)
    
    Args:
        df_pipeline: Pipeline aberto com colunas padronizadas
        top_n: Número de alvos a retornar
        filter_quarter: Quarter para filtrar
        
    Returns:
        Lista de alvos prioritários
    """
    if filter_quarter:
        if 'fiscal_quarter' in df_pipeline.columns:
            df = df_pipeline[df_pipeline['fiscal_quarter'] == filter_quarter].copy()
        else:
            logger.warning("Coluna 'fiscal_quarter' não encontrada no pipeline")
            df = df_pipeline.copy()
    else:
        df = df_pipeline.copy()
    
    if len(df) == 0:
        return []
    
    # Calcular risk score
    df['risk_score'] = 0
    if 'activities' in df.columns:
        df['risk_score'] += (df['activities'] == 0).astype(int)
    if 'idle_days' in df.columns:
        df['risk_score'] += (df['idle_days'] > 90).astype(int)
    # BANT Score e Fase - podem vir com nomes originais
    for col in ['BANT Score', 'bant_score']:
        if col in df.columns:
            df['risk_score'] += (df[col] == 0).astype(int)
            break
    for col in ['Fase Atual', 'fase_atual', 'stage']:
        if col in df.columns:
            df['risk_score'] += (df[col] == 'Qualificar').astype(int)
            break
    
    # Ranking = Valor * (1 + Risk) / Confiança
    df['confidence_safe'] = df['confidence'].replace(0, 1) if 'confidence' in df.columns else 1
    df['risk_rank'] = df['gross'] * (1 + df['risk_score']) / df['confidence_safe']
    
    # Top N
    top_risks = df.nlargest(top_n, 'risk_rank')
    
    targets = []
    for _, row in top_risks.iterrows():
        targets.append({
            "opportunity": row.get('opportunity_name', row.get('Oportunidade', 'N/A')),
            "account": row.get('account_name', row.get('Conta', 'N/A')),
            "seller": row.get('seller_name', row.get('Vendedor', 'N/A')),
            "gross": float(row.get('gross', 0)),
            "confidence": float(row.get('confidence', 0)),
            "risk_score": int(row.get('risk_score', 0)),
            "stage": row.get('stage', row.get('Fase Atual', 'N/A')),
            "idle_days": int(row.get('idle_days', 0)),
            "activities": int(row.get('activities', 0)),
            "recommendation": generate_recommendation(row)
        })
    
    return targets


def generate_recommendation(deal_row) -> str:
    """Gera recomendação estratégica baseada no estado do deal"""
    recommendations = []
    
    # Buscar em nomes padronizados primeiro, depois originais
    activities = deal_row.get('activities', deal_row.get('Atividades', 0))
    idle_days = deal_row.get('idle_days', deal_row.get('Idle (Dias)', 0))
    bant_score = deal_row.get('bant_score', deal_row.get('BANT Score', 0))
    confidence = deal_row.get('confidence', deal_row.get('Confiança (%)', 0))
    
    if activities == 0:
        recommendations.append("🚨 URGENTE: Zero atividades registradas")
    
    if idle_days > 90:
        recommendations.append("⏰ Deal parado há >90 dias")
    
    if bant_score == 0:
        recommendations.append("❌ BANT não qualificado")
    
    if confidence < 30:
        recommendations.append("⚠️ Confiança muito baixa (<30%)")
    
    if not recommendations:
        return "Revisar qualificação e atualizar forecast"
    
    return " | ".join(recommendations)


# ==============================================================================
# FUNÇÃO PRINCIPAL DA CLOUD FUNCTION
# ==============================================================================

@functions_framework.http
def sales_intelligence_engine(request):
    """
    HTTP Cloud Function - Motor de Inteligência de Vendas
    
    Recebe:
        POST com JSON:
        {
            "pipeline_data": [...],  # Lista de dicts
            "wins_data": [...],
            "losses_data": [...],
            "filters": {
                "quarter": "FY26-Q1",  # Opcional
                "seller": "CARLOS MOLL",  # Opcional
                "min_value": 50000  # Opcional
            }
        }
        
    Retorna:
        JSON com análise completa
    """
    # CORS headers
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }
    
    try:
        # Validar método
        if request.method != 'POST':
            return ({'error': 'Method not allowed'}, 405, headers)
        
        # 🔍 DEBUG: Verificar tamanho do request body
        try:
            raw_body = request.get_data(as_text=True)
            body_size_kb = len(raw_body) / 1024
            logger.info(f"[REQUEST] Body size: {body_size_kb:.2f} KB")
            logger.info(f"[REQUEST] Body preview (first 500 chars): {raw_body[:500]}")
        except Exception as e:
            logger.warning(f"[REQUEST] Erro ao ler raw body: {e}")
        
        # Parse request
        request_json = request.get_json(silent=True)
        if not request_json:
            logger.error("[REQUEST] ❌ Falha ao parsear JSON - request_json is None")
            return ({'error': 'No JSON payload'}, 400, headers)
        
        logger.info("Requisição recebida, iniciando processamento...")
        
        # Extrair dados (suporta ambos formatos: pipeline/won/lost E pipeline_data/wins_data/losses_data)
        pipeline_raw = request_json.get('pipeline_data', request_json.get('pipeline', []))
        wins_raw = request_json.get('wins_data', request_json.get('won', []))
        losses_raw = request_json.get('losses_data', request_json.get('lost', []))
        filters = request_json.get('filters', {})
        
        filter_quarter = filters.get('quarter')
        
        logger.info(f"Dados recebidos: Pipeline={len(pipeline_raw)}, Wins={len(wins_raw)}, Losses={len(losses_raw)}")
        logger.info(f"Filtros: {filters}")
        
        # 🔍 DEBUG: Verificar conteúdo raw antes de preparar
        if len(pipeline_raw) > 0:
            logger.info(f"[DEBUG] Primeira linha pipeline (raw): {list(pipeline_raw[0].keys())[:10]}")
            logger.info(f"[DEBUG] Tipo primeira linha: {type(pipeline_raw[0])}")
        else:
            logger.warning("[DEBUG] ⚠️ pipeline_raw está VAZIO antes de prepare_pipeline_data!")
            
        if len(wins_raw) > 0:
            logger.info(f"[DEBUG] Primeira linha wins (raw): {list(wins_raw[0].keys())[:10]}")
        else:
            logger.warning("[DEBUG] ⚠️ wins_raw está VAZIO antes de prepare_closed_data!")
            
        if len(losses_raw) > 0:
            logger.info(f"[DEBUG] Primeira linha losses (raw): {list(losses_raw[0].keys())[:10]}")
        else:
            logger.warning("[DEBUG] ⚠️ losses_raw está VAZIO antes de prepare_closed_data!")
        
        # FASE 1: Preparar dados
        df_pipeline = prepare_pipeline_data(pipeline_raw)
        df_closed = prepare_closed_data(wins_raw, losses_raw)
        
        # FASE 2: Analisar histórico
        closed_analysis = analyze_closed_deals(df_closed, filter_quarter)
        
        # FASE 3: Analisar pipeline
        pipeline_analysis = analyze_pipeline(df_pipeline, filter_quarter)
        
        # FASE 4: Scorecard vendedores
        seller_scorecard = calculate_seller_scorecard(df_pipeline, df_closed, filter_quarter)
        
        # FASE 5: Alvos de guerra
        war_targets = identify_war_targets(df_pipeline, top_n=10, filter_quarter=filter_quarter)
        
        # Montar resposta
        response = {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "filters_applied": filters,
            "data_summary": {
                "pipeline_deals": len(df_pipeline),
                "closed_deals": len(df_closed),
                "sellers_analyzed": len(seller_scorecard)
            },
            "analysis": {
                "closed_deals": closed_analysis,
                "pipeline": pipeline_analysis,
                "seller_scorecard": seller_scorecard,
                "war_targets": war_targets
            }
        }
        
        logger.info("Análise concluída com sucesso")
        return (response, 200, headers)
        
    except Exception as e:
        logger.error(f"Erro na análise: {str(e)}", exc_info=True)
        return ({
            'error': 'Internal server error',
            'message': str(e)
        }, 500, headers)
