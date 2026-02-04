"""
MAPEAMENTO DE COLUNAS - ABAS DE ANÁLISE → CLOUD FUNCTION
===========================================================

As abas de análise usam nomes em PORTUGUÊS.
Este arquivo mapeia os nomes das colunas para garantir compatibilidade.
"""

# ============================================================================
# MAPEAMENTO: ANÁLISE FORECAST IA (Pipeline Aberto)
# ============================================================================
PIPELINE_COLUMNS = {
    # Identificação
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross',
    'Net': 'net',
    
    # Datas e Quarter
    'Fiscal Q': 'fiscal_quarter',
    'Data Prevista': 'close_date',
    'Data Fechamento': 'close_date_alt',
    
    # Métricas de Engajamento
    'Atividades': 'activities_count',
    'Dias Funil': 'days_in_pipeline',
    'Idle (Dias)': 'idle_days',
    'Ciclo (dias)': 'cycle_days',
    
    # Scores e Forecast
    'Confiança (%)': 'confidence_pct',
    'Forecast IA': 'forecast_ai',
    'Forecast SF': 'forecast_sf',
    'MEDDIC Score': 'meddic_score',
    'BANT Score': 'bant_score',
    
    # Fase
    'Fase Atual': 'stage',
    
    # Produtos
    'Produtos': 'products',
    'Perfil': 'profile'
}

# ============================================================================
# MAPEAMENTO: ANÁLISE GANHAS (Deals Fechados - Won)
# ============================================================================
WON_COLUMNS = {
    # Identificação
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross',
    'Net': 'net',
    
    # Datas
    'Fiscal Q': 'fiscal_quarter',
    'Data Fechamento': 'close_date',
    
    # Ciclo
    'Ciclo (dias)': 'cycle_days',
    
    # Atividades
    '# Atividades': 'activities_count',
    'Ativ. 7d': 'activities_7d',
    'Ativ. 30d': 'activities_30d',
    
    # Mudanças
    '# Total Mudanças': 'total_changes',
    '# Mudanças Críticas': 'critical_changes',
    
    # Análise IA
    '📝 Resumo Análise': 'ai_summary',
    '🎯 Causa Raiz': 'root_cause',
    '✨ Fatores Sucesso': 'success_factors',
    'Tipo Resultado': 'result_type',
    
    # Segmentação
    'Portfólio': 'portfolio',
    'Segmento': 'segment',
    'Família Produto': 'product_family',
    
    # Status
    'Status': 'status'
}

# ============================================================================
# MAPEAMENTO: ANÁLISE PERDIDAS (Deals Fechados - Lost)
# ============================================================================
LOST_COLUMNS = {
    # Identificação
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross',
    'Net': 'net',
    
    # Datas
    'Fiscal Q': 'fiscal_quarter',
    'Data Fechamento': 'close_date',
    
    # Ciclo
    'Ciclo (dias)': 'cycle_days',
    
    # Atividades
    '# Atividades': 'activities_count',
    'Ativ. 7d': 'activities_7d',
    'Ativ. 30d': 'activities_30d',
    
    # Mudanças
    '# Total Mudanças': 'total_changes',
    '# Mudanças Críticas': 'critical_changes',
    
    # Análise IA
    '📝 Resumo Análise': 'ai_summary',
    '🎯 Causa Raiz': 'root_cause',
    '⚠️ Causas Secundárias': 'secondary_causes',
    'Tipo Resultado': 'result_type',
    'Evitável?': 'avoidable',
    
    # Segmentação
    'Portfólio': 'portfolio',
    'Segmento': 'segment',
    'Família Produto': 'product_family',
    
    # Status
    'Status': 'status'
}

# ============================================================================
# FUNÇÕES AUXILIARES
# ============================================================================

def get_column_value(row: dict, possible_names: list, default=None):
    """
    Busca o valor de uma coluna usando múltiplos nomes possíveis
    
    Args:
        row: Dicionário com os dados da linha
        possible_names: Lista de nomes possíveis da coluna
        default: Valor padrão se não encontrar
        
    Returns:
        Valor da coluna ou default
    """
    for name in possible_names:
        if name in row:
            return row[name]
    return default


def normalize_column_names(df):
    """
    Normaliza os nomes das colunas de um DataFrame
    Remove espaços extras, converte para lowercase, etc.
    
    Args:
        df: DataFrame pandas
        
    Returns:
        DataFrame com colunas normalizadas
    """
    import pandas as pd
    
    # Cria mapeamento de normalização
    col_mapping = {}
    for col in df.columns:
        # Remove espaços extras, mantém acentos
        normalized = ' '.join(str(col).split())
        col_mapping[col] = normalized
    
    return df.rename(columns=col_mapping)
