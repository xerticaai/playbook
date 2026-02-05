"""
MAPEAMENTO DE COLUNAS - FONTE ÚNICA DA VERDADE
================================================

Este arquivo define o mapeamento COMPLETO de todas as colunas:
- Planilhas Base (português) → Schema Normalizado
- Abas de Análise (português) → Schema Normalizado
- BigQuery (normalizado) → Schema Padronizado Python

REGRAS:
1. Todos os nomes de colunas aqui são LOWERCASE com underscores
2. Sem caracteres especiais (%, ., (), emojis)
3. Tipos padronizados (confidence_percent, cycle_days, etc.)
4. Um único nome para cada conceito (não "Gross" e "Preço total")

ÚLTIMA ATUALIZAÇÃO: 2026-02-05 (Refatoração completa)
"""

# ============================================================================
# MAPEAMENTO: PIPELINE ABERTO (Planilha Base)
# ============================================================================
PIPELINE_BASE_COLUMNS = {
    # Identificação
    'Nome da conta': 'account_name',
    'Nome da oportunidade': 'opportunity_name',
    'Proprietário da oportunidade': 'owner_name',
    
    # Datas
    'Data de criação': 'created_date',
    'Data de fechamento': 'close_date',
    'Data da última mudança de fase': 'last_stage_change_date',
    'Data da última atividade': 'last_activity_date',
    'Data do último compromisso': 'last_event_date',
    'Conta: Última atividade': 'account_last_activity',
    'Data da próxima atividade': 'next_activity_date',
    'Dias inativos': 'idle_days',
    
    # Pipeline Info
    'Proceso': 'process_type',
    'Nome do produto': 'product_name',
    'Preço total (convertido)': 'gross_value',
    'Margen Total $': 'net_value',
    'Margen de Lista %': 'list_margin_percent',
    'Portafolio': 'portfolio',
    'Fase': 'stage',
    'Duração da fase': 'stage_duration',
    'Probabilidade (%)': 'probability_percent',
    
    # Categorização
    'Origem do lead': 'lead_source',
    'Origem da campanha principal': 'primary_campaign_source',
    'DR': 'dr',
    'Família de produtos': 'product_family',
    'Forecast': 'forecast_category',
    'Subsegmento de mercado': 'market_subsegment',
    'Subsidiaria': 'subsidiary',
    'Tipo De Oportunidad': 'opportunity_type',
    'Descrição': 'description',
    'Descripción': 'description_es',
    'Tipo incentivo en google': 'google_incentive_type',
    'Período fiscal': 'fiscal_period',
    'Portafolio Xertica.Ai': 'xertica_portfolio',
    'Segmento Consolidado': 'consolidated_segment',
    
    # Atividades
    'Atividades dos últimos 7 dias': 'activities_7d',
    'Atividades dos últimos 30 dias': 'activities_30d',
    
    # Localização
    'Endereço de cobrança Linha 1': 'billing_address',
    'Cidade de cobrança': 'billing_city',
    'Estado/Província de cobrança': 'billing_state',
    'País de cobrança': 'billing_country',
    
    # Outros
    'Top deal': 'top_deal',
    'Owner Preventa': 'presales_owner',
    'Preventa': 'presales_assigned',
    'Preventa principal': 'presales_lead',
    '#PreventasAbiertos': 'open_presales_count',
    'Categoria SDR': 'sdr_category',
    'Próxima etapa': 'next_step',
    'Fecha ultimo cambio Next Step': 'next_step_last_change',
    'Calculadora Horas': 'hours_calculator',
    'Calculadora ROI': 'roi_calculator',
    'Calendario facturación': 'billing_calendar',
    'Fecha de facturación': 'billing_date',
    '¿Aplica Marketplace?': 'marketplace_applicable',
    'Quantidade': 'quantity'
}

# ============================================================================
# MAPEAMENTO: HISTORICO GANHOS (Planilha Base)
# ============================================================================
GANHAS_BASE_COLUMNS = {
    # Identificação
    'Nome da conta': 'account_name',
    'Nome da oportunidade': 'opportunity_name',
    'Proprietário da oportunidade': 'owner_name',
    
    # Datas
    'Data de fechamento': 'close_date',
    'Data de criação': 'created_date',
    'Data da última mudança de fase': 'last_stage_change_date',
    'Fecha de activación': 'activation_date',
    'Fecha de facturación': 'billing_date',
    'Fecha Inicio Contrato': 'contract_start_date',
    'Fecha Fin Contrato': 'contract_end_date',
    
    # Valores Financeiros
    'Preço total (convertido)': 'gross_value',
    'Margen Total $ (convertido)': 'net_value',
    'Margen de Lista %': 'list_margin_percent',
    'Margen %': 'margin_percent',
    'Margen Total %': 'total_margin_percent',
    'Descuento Fabricante %': 'manufacturer_discount_percent',
    'Descuento Xertica %': 'xertica_discount_percent',
    'Monto no anulado': 'non_cancelled_amount',
    'Quantidade': 'quantity',
    'Plazo Producto (Meses)': 'product_term_months',
    
    # Produto e Classificação
    'Proceso': 'process_type',
    'Família de produtos': 'product_family',
    'Nome do produto': 'product_name',
    'Produto ativo': 'product_active',
    'Productos con vigencia activa': 'active_products',
    'Estado de activação de produtos': 'product_activation_status',
    'Tipo De Oportunidad': 'opportunity_type',
    'Portafolio': 'portfolio',
    'Portafolio Xertica.Ai': 'xertica_portfolio',
    
    # Origem e Segmentação
    'Origem do lead': 'lead_source',
    'Origem da campanha principal': 'primary_campaign_source',
    'DR': 'dr',
    'Segmento Consolidado': 'consolidated_segment',
    'Período fiscal': 'fiscal_period',
    'Ano fiscal': 'fiscal_year',
    'Categoria SDR': 'sdr_category',
    
    # Localização
    'Cidade de cobrança': 'billing_city',
    'Estado/Província de cobrança': 'billing_state',
    
    # Conta
    'Nombre Dominio': 'domain_name',
    'Consola': 'console',
    'Razão Social': 'legal_name',
    
    # Outros
    'Descrição': 'description',
    'Descripción': 'description_es',
    'Calculadora Horas': 'hours_calculator',
    'Calculadora ROI': 'roi_calculator',
    'Próxima etapa': 'next_step',
    'Fecha ultimo cambio Next Step': 'next_step_last_change',
    'Data da próxima atividade': 'next_activity_date',
    'Top deal': 'top_deal',
    'Owner Preventa': 'presales_owner',
    'GCP Billing ID': 'gcp_billing_id',
    'Calendario facturación': 'billing_calendar'
}

# ============================================================================
# MAPEAMENTO: HISTORICO PERDIDAS (Planilha Base)
# ============================================================================
PERDIDAS_BASE_COLUMNS = {
    # Motivo da Perda
    'Razón de pérdida': 'loss_reason',
    'Descripción de la pérdida': 'loss_description',
    'Motivo descalificación': 'disqualification_reason',
    'Perdida por Competencia': 'lost_to_competition',
    
    # Identificação
    'Nome da conta': 'account_name',
    'Nome da oportunidade': 'opportunity_name',
    'Proprietário da oportunidade': 'owner_name',
    
    # Datas
    'Data de criação': 'created_date',
    'Data de fechamento': 'close_date',
    'Data da última mudança de fase': 'last_stage_change_date',
    'Data do último compromisso': 'last_event_date',
    'Fecha de aplazamiento': 'postponement_date',
    'Período fiscal': 'fiscal_period',
    
    # Pipeline Info
    'Fase': 'stage',
    'Duração da fase': 'stage_duration',
    'Preço total (convertido)': 'gross_value',
    'Margen Total $ (convertido)': 'net_value',
    'Probabilidade (%)': 'probability_percent',
    'Forecast': 'forecast_category',
    
    # Produto e Tipo
    'Nome do produto': 'product_name',
    'Família de produtos': 'product_family',
    'Tipo De Oportunidad': 'opportunity_type',
    'Portafolio Xertica.Ai': 'xertica_portfolio',
    
    # Descrição e Contexto
    'Descrição': 'description',
    'Descripción': 'description_es',
    'Oportunidad Generada': 'opportunity_generated',
    
    # Origem e Segmentação
    'Origem da campanha principal': 'primary_campaign_source',
    'Tipo incentivo en google': 'google_incentive_type',
    'DR': 'dr',
    'Subsegmento de mercado': 'market_subsegment',
    'Setor': 'sector',
    
    # Contatos
    'Contacto Negociación': 'negotiation_contact',
    'Contato principal': 'primary_contact',
    'Contato: Cargo': 'contact_title',
    'Contato: Email': 'contact_email',
    'Contato: Telefone': 'contact_phone',
    'Telefone': 'phone',
    
    # Outros
    'Subsidiaria': 'subsidiary',
    'Top deal': 'top_deal',
    'Categoria SDR': 'sdr_category'
}

# ============================================================================
# MAPEAMENTO: 🎯 ANÁLISE FORECAST IA (Aba Processada)
# ============================================================================
ANALISE_PIPELINE_COLUMNS = {
    # Identificação
    'Run ID': 'run_id',
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Perfil': 'profile',
    'Produtos': 'products',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross_value',
    'Net': 'net_value',
    
    # Pipeline Info
    'Fase Atual': 'current_stage',
    'Forecast SF': 'forecast_sf',
    'Fiscal Q': 'fiscal_quarter',
    'Data Prevista': 'expected_close_date',
    'Ciclo (dias)': 'cycle_days',
    'Dias Funil': 'days_in_pipeline',
    
    # Atividades
    'Atividades': 'activities_total',
    'Atividades (Peso)': 'activities_weighted',
    'Mix Atividades': 'activities_mix',
    'Idle (Dias)': 'idle_days',
    'Qualidade Engajamento': 'engagement_quality',
    
    # Análise IA
    'Forecast IA': 'forecast_ai',
    'Confiança (%)': 'confidence_percent',
    'Motivo Confiança': 'confidence_reason',
    'Justificativa IA': 'ai_justification',
    'Regras Aplicadas': 'applied_rules',
    'Incoerência Detectada': 'detected_inconsistency',
    'Perguntas de Auditoria IA': 'audit_questions',
    
    # Scores
    'MEDDIC Score': 'meddic_score',
    'MEDDIC Gaps': 'meddic_gaps',
    'MEDDIC Evidências': 'meddic_evidence',
    'BANT Score': 'bant_score',
    'BANT Gaps': 'bant_gaps',
    'BANT Evidências': 'bant_evidence',
    
    # Risco e Ação
    'Flags de Risco': 'risk_flags',
    'Gaps Identificados': 'identified_gaps',
    'Cód Ação': 'action_code',
    'Ação Sugerida': 'suggested_action',
    'Risco Principal': 'primary_risk',
    
    # Change Tracking
    '# Total Mudanças': 'total_changes',
    '# Mudanças Críticas': 'critical_changes',
    'Mudanças Close Date': 'close_date_changes',
    'Mudanças Stage': 'stage_changes',
    'Mudanças Valor': 'value_changes',
    '🚨 Anomalias Detectadas': 'detected_anomalies',
    
    # Velocity
    'Velocity Predição': 'velocity_prediction',
    'Velocity Detalhes': 'velocity_details',
    
    # Território
    'Território Correto?': 'correct_territory',
    'Vendedor Designado': 'designated_seller',
    'Estado/Cidade Detectado': 'detected_location',
    'Fonte Detecção': 'detection_source',
    
    # Faturação
    'Calendário Faturação': 'billing_calendar',
    'Valor Reconhecido Q1': 'recognized_q1',
    'Valor Reconhecido Q2': 'recognized_q2',
    'Valor Reconhecido Q3': 'recognized_q3',
    'Valor Reconhecido Q4': 'recognized_q4',
    
    # Metadata
    '🕐 Última Atualização': 'last_updated'
}

# ============================================================================
# MAPEAMENTO: 📈 ANÁLISE GANHAS (Aba Processada)
# ============================================================================
ANALISE_GANHAS_COLUMNS = {
    # Identificação
    'Run ID': 'run_id',
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Perfil Cliente': 'customer_profile',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross_value',
    'Net': 'net_value',
    
    # Classificação
    'Portfólio': 'portfolio',
    'Segmento': 'segment',
    'Família Produto': 'product_family',
    'Status': 'status',
    'Fiscal Q': 'fiscal_quarter',
    'Data Fechamento': 'close_date',
    'Ciclo (dias)': 'cycle_days',
    'Produtos': 'products',
    
    # Análise IA
    '📝 Resumo Análise': 'analysis_summary',
    '🎯 Causa Raiz': 'root_cause',
    '✨ Fatores Sucesso': 'success_factors',
    'Tipo Resultado': 'result_type',
    'Qualidade Engajamento': 'engagement_quality',
    'Gestão Oportunidade': 'opportunity_management',
    '💡 Lições Aprendidas': 'lessons_learned',
    
    # Atividades
    '# Atividades': 'activities_total',
    'Ativ. 7d': 'activities_7d',
    'Ativ. 30d': 'activities_30d',
    'Distribuição Tipos': 'activity_distribution',
    'Período Pico': 'peak_period',
    'Cadência Média (dias)': 'avg_cadence_days',
    
    # Change Tracking
    '# Total Mudanças': 'total_changes',
    '# Mudanças Críticas': 'critical_changes',
    'Mudanças Close Date': 'close_date_changes',
    'Mudanças Stage': 'stage_changes',
    'Mudanças Valor': 'value_changes',
    'Campos + Alterados': 'most_changed_fields',
    'Padrão Mudanças': 'change_pattern',
    'Freq. Mudanças': 'change_frequency',
    '# Editores': 'editor_count',
    
    # Labels
    '🏷️ Labels': 'labels',
    
    # Metadata
    '🕐 Última Atualização': 'last_updated'
}

# ============================================================================
# MAPEAMENTO: 📉 ANÁLISE PERDIDAS (Aba Processada)
# ============================================================================
ANALISE_PERDIDAS_COLUMNS = {
    # Identificação
    'Run ID': 'run_id',
    'Oportunidade': 'opportunity_name',
    'Conta': 'account_name',
    'Perfil Cliente': 'customer_profile',
    'Vendedor': 'seller_name',
    
    # Valores
    'Gross': 'gross_value',
    'Net': 'net_value',
    
    # Classificação
    'Portfólio': 'portfolio',
    'Segmento': 'segment',
    'Família Produto': 'product_family',
    'Status': 'status',
    'Fiscal Q': 'fiscal_quarter',
    'Data Fechamento': 'close_date',
    'Ciclo (dias)': 'cycle_days',
    'Produtos': 'products',
    
    # Análise IA
    '📝 Resumo Análise': 'analysis_summary',
    '🎯 Causa Raiz': 'root_cause',
    '⚠️ Causas Secundárias': 'secondary_causes',
    'Tipo Resultado': 'result_type',
    'Evitável?': 'avoidable',
    '🚨 Sinais Alerta': 'warning_signs',
    'Momento Crítico': 'critical_moment',
    '💡 Lições Aprendidas': 'lessons_learned',
    
    # Atividades
    '# Atividades': 'activities_total',
    'Ativ. 7d': 'activities_7d',
    'Ativ. 30d': 'activities_30d',
    'Distribuição Tipos': 'activity_distribution',
    'Período Pico': 'peak_period',
    'Cadência Média (dias)': 'avg_cadence_days',
    
    # Change Tracking
    '# Total Mudanças': 'total_changes',
    '# Mudanças Críticas': 'critical_changes',
    'Mudanças Close Date': 'close_date_changes',
    'Mudanças Stage': 'stage_changes',
    'Mudanças Valor': 'value_changes',
    'Campos + Alterados': 'most_changed_fields',
    'Padrão Mudanças': 'change_pattern',
    'Freq. Mudanças': 'change frequency',
    '# Editores': 'editor_count',
    
    # Labels
    '🏷️ Labels': 'labels',
    
    # Metadata
    '🕐 Última Atualização': 'last_updated'
}

# ============================================================================
# MAPEAMENTO: SALES SPECIALIST (Aba Processada)
# ============================================================================
# ⚠️ Este CSV não tem tabela BigQuery - usado apenas para análise de forecast
SALES_SPECIALIST_COLUMNS = {
    # Identificação
    'Account Name': 'account_name',
    'Perfil': 'customer_profile',  # New / Base Instalada
    'Opportunity Name': 'opportunity_name',
    
    # Faturamento
    'Meses Fat.': 'billing_months',  # 1, 2, anual
    'GTM 2026': 'gtm_2026',  # Go-to-Market segment
    
    # Valores - Booking Total (valor total da oportunidade)
    'Booking Total ($)Gross': 'booking_total_gross',
    'Booking Total ($) Net': 'booking_total_net',
    
    # Status (2 colunas diferentes!)
    'Status': 'opportunity_status',  # Col 8: Aberta / Ganha
    'Vendedor': 'seller_name',       # Col 9: Nome do vendedor  
    'Status.1': 'forecast_status',   # Col 10: Commit / Upside
    
    # Valores - Billing Quarter (faturamento previsto no quarter)
    'Billing Quarter ($)': 'billing_quarter_gross',
    'Billing Quarter ($).1': 'billing_quarter_net',  # Segunda coluna (Net)
    
    # Fechamento  
    'Closed Date': 'close_date',
    
    # Colunas auxiliares
    'Unnamed: 5': 'aux_col_1',
    'Unnamed: 13': 'aux_col_2',
    
    # Análise (se existir)
    'ANÁLISE DE IA': 'ai_analysis'
}

# ============================================================================
# FUNÇÕES UTILITÁRIAS
# ============================================================================

def get_column_mapping(source_type):
    """
    Retorna o mapeamento correto baseado no tipo de fonte
    
    Args:
        source_type: 'pipeline_base', 'ganhas_base', 'perdidas_base',
                     'analise_pipeline', 'analise_ganhas', 'analise_perdidas',
                     'sales_specialist'
    
    Returns:
        dict: Mapeamento de colunas
    """
    mappings = {
        'pipeline_base': PIPELINE_BASE_COLUMNS,
        'ganhas_base': GANHAS_BASE_COLUMNS,
        'perdidas_base': PERDIDAS_BASE_COLUMNS,
        'analise_pipeline': ANALISE_PIPELINE_COLUMNS,
        'analise_ganhas': ANALISE_GANHAS_COLUMNS,
        'analise_perdidas': ANALISE_PERDIDAS_COLUMNS,
        'sales_specialist': SALES_SPECIALIST_COLUMNS
    }
    
    return mappings.get(source_type, {})


def normalize_for_bigquery(col_name):
    """
    Normaliza para schema BigQuery (COMPATÍVEL COM ML!)
    Mantém nomes como confianca_pct, gross, net (schema atual)
    
    CRITICAL: ML models treinam com esses nomes, NÃO ALTERAR!
    
    Args:
        col_name: Nome da coluna original
    Returns:
        Nome normalizado para BigQuery schema
    """
    import re
    # Remove emojis e acentos
    col_name = col_name.encode('ascii', 'ignore').decode('ascii')
    # Remove caracteres especiais exceto underscores
    col_name = re.sub(r'[^a-zA-Z0-9\s_]', '', col_name)
    # Substitui espaços múltiplos por único underscore
    col_name = re.sub(r'\s+', '_', col_name.strip())
    # Converte para lowercase
    col_name = col_name.lower()
    
    # Mapear para schema BigQuery exato (compatibilidade ML)
    # IMPORTANTE: Usa partial matching para capturar variações
    bq_schema_map = {
        'confian': 'confianca_pct',      # Confiança (%) -> confianca_pct
        'gross': 'gross',                 # Gross -> gross (mantém)
        'gross_value': 'gross',           # Gross Value -> gross
        'net': 'net',                     # Net -> net (mantém)
        'net_value': 'net',               # Net Value -> net
        'oportunidade': 'oportunidade',   # Oportunidade -> oportunidade (mantém)
        'opportunity_name': 'oportunidade',  # Opportunity Name -> oportunidade
        'account_name': 'conta',          # Account Name -> conta
        'conta': 'conta',                 # Conta -> conta (mantém)
        'owner_name': 'vendedor',         # Owner Name -> vendedor
        'vendedor': 'vendedor',           # Vendedor -> vendedor (mantém)
        'customer_profile': 'perfil',     # Customer Profile -> perfil
        'perfil': 'perfil',               # Perfil -> perfil (mantém)
        'stage': 'fase_atual',            # Stage -> fase_atual
        'fase_atual': 'fase_atual',       # Fase Atual -> fase_atual (mantém)
        'cycle_days': 'ciclo_dias',       # Cycle Days -> ciclo_dias
        'ciclo_dias': 'ciclo_dias',       # Ciclo (dias) -> ciclo_dias (mantém)
        'idle_days': 'idle_dias',         # Idle Days -> idle_dias
        'idle_dias': 'idle_dias',         # Idle (Dias) -> idle_dias (mantém)
        'activities_total': 'atividades', # Activities -> atividades
        'atividades': 'atividades',       # Atividades -> atividades (mantém)
        'activities_weighted': 'atividades_peso'  # Activities (Peso) -> atividades_peso
    }
    
    # Tentar match exato primeiro
    if col_name in bq_schema_map:
        return bq_schema_map[col_name]
    
    # Tentar match parcial (para capturar "confiana" -> "confianca_pct")
    for key, value in bq_schema_map.items():
        if key in col_name or col_name in key:
            return value
    
    return col_name


def normalize_for_calculations(col_name):
    """
    Normaliza para cálculos internos (nomes limpos em inglês)
    Usado APENAS para métricas dashboard, NÃO para ML/BigQuery
    
    Args:
        col_name: Nome da coluna original
    Returns:
        Nome normalizado em inglês para cálculos
    """
    import re
    # Remove emojis e acentos
    col_name = col_name.encode('ascii', 'ignore').decode('ascii')
    # Remove caracteres especiais exceto underscores
    col_name = re.sub(r'[^a-zA-Z0-9\s_]', '', col_name)
    # Substitui espaços múltiplos por único underscore
    col_name = re.sub(r'\s+', '_', col_name.strip())
    # Converte para lowercase
    col_name = col_name.lower()
    return col_name


# Alias para compatibilidade com código existente
normalize_column_name = normalize_for_calculations


def get_reverse_mapping(source_type):
    """
    Retorna mapeamento reverso (normalizado → original)
    Útil para debug e logs
    """
    forward = get_column_mapping(source_type)
    return {v: k for k, v in forward.items()}


# ============================================================================
# VALIDAÇÃO
# ============================================================================

def validate_dataframe_columns(df, source_type, strict=False):
    """
    Valida se o DataFrame tem as colunas esperadas
    
    Args:
        df: pandas DataFrame
        source_type: tipo de fonte
        strict: Se True, exige TODAS as colunas. Se False, apenas avisa.
    
    Returns:
        tuple: (is_valid, missing_columns, extra_columns)
    """
    expected_mapping = get_column_mapping(source_type)
    expected_original = set(expected_mapping.keys())
    actual_columns = set(df.columns)
    
    missing = expected_original - actual_columns
    extra = actual_columns - expected_original
    
    is_valid = len(missing) == 0 if strict else True
    
    return is_valid, list(missing), list(extra)


if __name__ == '__main__':
    # Teste rápido
    print("✅ Column Mapping Central carregado")
    print(f"📊 Pipeline Base: {len(PIPELINE_BASE_COLUMNS)} colunas")
    print(f"📈 Ganhas Base: {len(GANHAS_BASE_COLUMNS)} colunas")
    print(f"📉 Perdidas Base: {len(PERDIDAS_BASE_COLUMNS)} colunas")
    print(f"🎯 Análise Pipeline: {len(ANALISE_PIPELINE_COLUMNS)} colunas")
    print(f"📊 Análise Ganhas: {len(ANALISE_GANHAS_COLUMNS)} colunas")
    print(f"📉 Análise Perdidas: {len(ANALISE_PERDIDAS_COLUMNS)} colunas")
    print(f"💼 Sales Specialist: {len(SALES_SPECIALIST_COLUMNS)} colunas")
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
