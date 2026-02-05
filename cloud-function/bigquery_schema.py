"""
BIGQUERY SCHEMA MAPPING - De-Para Real
========================================

Schemas reais consultados do BigQuery em 2026-02-05.

REGRAS DO BIGQUERY:
- Remove acentos: ç→c, á→a, é→e, í→i, ó→o, ú→u
- Mantém PascalCase com underscores
- NÃO converte para lowercase

TABLES:
- operaciones-br.sales_intelligence.pipeline (55 colunas)
- operaciones-br.sales_intelligence.closed_deals (45 colunas)
"""

# ===========================================================================
# BIGQUERY PIPELINE SCHEMA (55 colunas)
# ===========================================================================
BQ_PIPELINE_SCHEMA = {
    # Identificação
    'Run_ID': 'run_id',
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Perfil': 'customer_profile',
    'Produtos': 'products',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross_value',
    'Net': 'net_value',
    
    # Pipeline Info
    'Fase_Atual': 'current_stage',
    'Forecast_SF': 'forecast_sf',
    'Fiscal_Q': 'fiscal_quarter',
    'Data_Prevista': 'expected_close_date',
    'Ciclo_dias': 'cycle_days',
    'Dias_Funil': 'days_in_pipeline',
    
    # Atividades
    'Atividades': 'activities_total',
    'Atividades_Peso': 'activities_weighted',
    'Mix_Atividades': 'activities_mix',
    'Idle_Dias': 'idle_days',
    'Qualidade_Engajamento': 'engagement_quality',
    
    # IA / Forecast
    'Forecast_IA': 'forecast_ai',
    'Confiana': 'confidence_percent',  # ⚠️ SEM Ç!
    'Motivo_Confiana': 'confidence_reason',
    'Justificativa_IA': 'ai_justification',
    'Regras_Aplicadas': 'applied_rules',
    'Incoerncia_Detectada': 'detected_inconsistency',
    'Perguntas_de_Auditoria_IA': 'audit_questions',
    
    # Scores
    'MEDDIC_Score': 'meddic_score',
    'MEDDIC_Gaps': 'meddic_gaps',
    'MEDDIC_Evidncias': 'meddic_evidence',
    'BANT_Score': 'bant_score',
    'BANT_Gaps': 'bant_gaps',
    'BANT_Evidncias': 'bant_evidence',
    
    # Risco & Ação
    'Flags_de_Risco': 'risk_flags',  # ⚠️ Para word clouds!
    'Gaps_Identificados': 'identified_gaps',
    'Cd_Ao': 'action_code',  # ⚠️ Para word clouds!
    'Ao_Sugerida': 'suggested_action',
    'Risco_Principal': 'primary_risk',
    
    # Change Tracking
    'Total_Mudanas': 'total_changes',
    'Mudanas_Crticas': 'critical_changes',
    'Mudanas_Close_Date': 'close_date_changes',
    'Mudanas_Stage': 'stage_changes',
    'Mudanas_Valor': 'value_changes',
    'Anomalias_Detectadas': 'detected_anomalies',
    
    # Velocity
    'Velocity_Predio': 'velocity_prediction',
    'Velocity_Detalhes': 'velocity_details',
    
    # Território
    'Territrio_Correto': 'correct_territory',
    'Vendedor_Designado': 'designated_seller',
    'EstadoCidade_Detectado': 'detected_location',
    'Fonte_Deteco': 'detection_source',
    
    # Faturação
    'Calendrio_Faturao': 'billing_calendar',
    'Valor_Reconhecido_Q1': 'recognized_q1',
    'Valor_Reconhecido_Q2': 'recognized_q2',
    'Valor_Reconhecido_Q3': 'recognized_q3',
    'Valor_Reconhecido_Q4': 'recognized_q4',
    
    # Metadata
    'ltima_Atualizao': 'last_updated',
    'data_carga': 'load_timestamp'
}

# ===========================================================================
# BIGQUERY CLOSED_DEALS SCHEMA (45 colunas)
# ===========================================================================
BQ_CLOSED_DEALS_SCHEMA = {
    # Identificação
    'Run_ID': 'run_id',
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Perfil_Cliente': 'customer_profile',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross_value',
    'Net': 'net_value',
    
    # Classificação
    'Portflio': 'portfolio',  # ⚠️ SEM ACENTO em ó!
    'Segmento': 'segment',
    'Famlia_Produto': 'product_family',  # ⚠️ SEM ACENTO em í!
    'Status': 'status',
    'Produtos': 'products',
    
    # Temporal
    'Fiscal_Q': 'fiscal_quarter',
    'Data_Fechamento': 'close_date',  # ⚠️ Para Task 2.4!
    'Ciclo_dias': 'cycle_days',
    
    # Análise IA
    'Resumo_Anlise': 'analysis_summary',
    'Causa_Raiz': 'root_cause',
    'Fatores_Sucesso': 'success_factors',
    'Tipo_Resultado': 'result_type',  # ⚠️ Para word clouds!
    'Qualidade_Engajamento': 'engagement_quality',
    'Gesto_Oportunidade': 'opportunity_management',
    'Lies_Aprendidas': 'lessons_learned',
    'Causas_Secundrias': 'secondary_causes',
    'Evitvel': 'avoidable',
    'Sinais_Alerta': 'warning_signs',
    'Momento_Crtico': 'critical_moment',
    
    # Atividades
    'Atividades': 'activities_total',
    'Ativ_7d': 'activities_7d',
    'Ativ_30d': 'activities_30d',
    'Distribuio_Tipos': 'activity_distribution',
    'Perodo_Pico': 'peak_period',
    'Cadncia_Mdia_dias': 'avg_cadence_days',
    
    # Change Tracking
    'Total_Mudanas': 'total_changes',
    'Mudanas_Crticas': 'critical_changes',
    'Mudanas_Close_Date': 'close_date_changes',
    'Mudanas_Stage': 'stage_changes',
    'Mudanas_Valor': 'value_changes',
    'Campos_Alterados': 'most_changed_fields',
    'Padro_Mudanas': 'change_pattern',
    'Freq_Mudanas': 'change_frequency',
    'Editores': 'editors',
    
    # Labels
    'Labels': 'labels',  # ⚠️ Para word clouds!
    
    # Metadata
    'ltima_Atualizao': 'last_updated',
    'outcome': 'outcome',  # WON/LOST
    'data_carga': 'load_timestamp'
}

# ===========================================================================
# SALES SPECIALIST SCHEMA (15 colunas) - CSV ONLY
# ===========================================================================
# ⚠️ Este schema é APENAS para CSV export (não existe tabela BigQuery)
# Usado para análise de forecast/billing por Sales Specialist

SALES_SPECIALIST_SCHEMA = {
    # Identificação
    'Account Name': 'account_name',
    'Perfil': 'customer_profile',  # New / Base Instalada
    'Opportunity Name': 'opportunity_name',
    
    # Faturamento
    'Meses Fat.': 'billing_months',  # 1, 2, anual
    'GTM 2026': 'gtm_2026',  # Go-to-Market segment
    
    # Valores - Booking Total
    'Booking Total ($)Gross': 'booking_total_gross',
    'Booking Total ($) Net': 'booking_total_net',
    
    # Status (2 colunas diferentes!)
    'Status': 'opportunity_status',  # Col 8: Aberta / Ganha
    'Vendedor': 'seller_name',       # Col 9: Nome do vendedor
    'Status.1': 'forecast_status',   # Col 10: Commit / Upside
    
    # Valores - Billing Quarter (faturamento no quarter)
    'Billing Quarter ($)': 'billing_quarter_gross',
    'Billing Quarter ($).1': 'billing_quarter_net',  # Coluna duplicada no CSV
    
    # Fechamento
    'Closed Date': 'close_date',
    
    # Colunas auxiliares
    'Unnamed: 5': 'aux_col_1',
    'Unnamed: 13': 'aux_col_2'
}

# ===========================================================================
# HELPER FUNCTIONS
# ===========================================================================

def get_bigquery_column_mapping(table_name):
    """
    Retorna mapeamento BigQuery → Normalized para uma tabela específica.
    
    Args:
        table_name: 'pipeline', 'closed_deals', ou 'sales_specialist'
    
    Returns:
        Dict com mapeamento
    """
    if table_name == 'pipeline':
        return BQ_PIPELINE_SCHEMA
    elif table_name in ['closed_deals', 'ganhas', 'perdidas']:
        return BQ_CLOSED_DEALS_SCHEMA
    elif table_name == 'sales_specialist':
        return SALES_SPECIALIST_SCHEMA
    else:
        return {}


def get_bigquery_column_name(normalized_name, table_name):
    """
    Reverso: Normalized → BigQuery name.
    
    Args:
        normalized_name: Nome normalizado (ex: 'confidence_percent')
        table_name: 'pipeline' ou 'closed_deals'
    
    Returns:
        Nome BigQuery (ex: 'Confiana')
    """
    mapping = get_bigquery_column_mapping(table_name)
    reverse = {v: k for k, v in mapping.items()}
    return reverse.get(normalized_name, normalized_name)


def find_column_in_dataframe(df, possible_names):
    """
    Busca coluna em DataFrame usando múltiplos nomes possíveis.
    Útil porque dados podem vir de BigQuery (Confiana) ou CSV (Confiança %).
    
    Args:
        df: pandas DataFrame
        possible_names: Lista de nomes possíveis
    
    Returns:
        Nome da coluna encontrada ou None
    """
    if df is None or len(df) == 0:
        return None
    
    for name in possible_names:
        if name in df.columns:
            return name
    
    return None


# ===========================================================================
# CRITICAL MAPPINGS FOR WORD CLOUDS
# ===========================================================================

WORD_CLOUD_MAPPINGS = {
    # Pipeline
    'risk_flags': [
        'Flags_de_Risco',      # BigQuery
        'Flags de Risco',      # CSV original
        'risk_flags',          # Normalized
        'flags_risco'          # Variation
    ],
    'action_code': [
        'Cd_Ao',               # BigQuery (sem acento!)
        'Cód Ação',            # CSV original
        'action_code',         # Normalized
        'cod_acao'             # Variation
    ],
    
    # Closed Deals (Ganhas + Perdidas)
    'result_type': [
        'Tipo_Resultado',      # BigQuery
        'Tipo Resultado',      # CSV original
        'result_type',         # Normalized
        'tipo_resultado'       # Variation
    ],
    'labels': [
        'Labels',              # BigQuery (sem emoji!)
        '🏷️ Labels',         # CSV original com emoji
        'labels',              # Normalized
        'win_labels',          # Variation
        'loss_labels'          # Variation
    ]
}

# ===========================================================================
# TEST
# ===========================================================================

if __name__ == '__main__':
    print('\n✅ BigQuery Schema Mapping carregado')
    print(f'📊 Pipeline: {len(BQ_PIPELINE_SCHEMA)} colunas')
    print(f'📊 Closed Deals: {len(BQ_CLOSED_DEALS_SCHEMA)} colunas')
    
    print('\n🔍 Mapeamentos Críticos:')
    print(f'   • Confiança: BigQuery = "Confiana" (sem ç)')
    print(f'   • Flags Risco: BigQuery = "Flags_de_Risco"')
    print(f'   • Cód Ação: BigQuery = "Cd_Ao" (sem acento)')
    print(f'   • Tipo Resultado: BigQuery = "Tipo_Resultado"')
    print(f'   • Labels: BigQuery = "Labels" (sem emoji)')
    
    print('\n🧪 Teste de busca:')
    import pandas as pd
    
    # Simula DataFrame BigQuery
    df_bq = pd.DataFrame({
        'Confiana': [90, 70],           # BigQuery name
        'Flags_de_Risco': ['A', 'B'],
        'Cd_Ao': ['ACT-1', 'ACT-2']
    })
    
    conf_col = find_column_in_dataframe(df_bq, ['Confiana', 'Confiança (%)', 'confidence_percent'])
    print(f'   Confiança encontrada: "{conf_col}" ✅')
    
    flags_col = find_column_in_dataframe(df_bq, WORD_CLOUD_MAPPINGS['risk_flags'])
    print(f'   Risk Flags encontrada: "{flags_col}" ✅')
    
    action_col = find_column_in_dataframe(df_bq, WORD_CLOUD_MAPPINGS['action_code'])
    print(f'   Action Code encontrada: "{action_col}" ✅')
