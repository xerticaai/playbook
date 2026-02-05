"""
Sales Intelligence Engine - BigQuery Version (COMPLETA)
Cloud Function com TODAS as análises do sistema
"""

import functions_framework
import pandas as pd
import numpy as np
from google.cloud import bigquery
from datetime import datetime, timedelta
import json
import re

# Importa column mapping central e metrics calculators
try:
    from column_mapping import (
        get_column_mapping,
        normalize_column_name,
        normalize_for_bigquery,
        normalize_for_calculations,
        validate_dataframe_columns
    )
    COLUMN_MAPPING_AVAILABLE = True
except ImportError:
    print("⚠️ column_mapping.py não encontrado, usando fallback")
    COLUMN_MAPPING_AVAILABLE = False

try:
    from bigquery_schema import (
        BQ_PIPELINE_SCHEMA,
        BQ_CLOSED_DEALS_SCHEMA,
        WORD_CLOUD_MAPPINGS,
        find_column_in_dataframe
    )
    BQ_SCHEMA_AVAILABLE = True
except ImportError:
    print("⚠️ bigquery_schema.py não encontrado")
    BQ_SCHEMA_AVAILABLE = False

try:
    from metrics_calculators import (
        calculate_confidence_stats,
        generate_word_clouds,
        calculate_closed_quarter,
        calculate_conversion_rate,
        load_sales_specialist_by_quarter
    )
    METRICS_CALCULATORS_AVAILABLE = True
except ImportError:
    print("⚠️ metrics_calculators.py não encontrado")
    METRICS_CALCULATORS_AVAILABLE = False

# ========== CONFIGURAÇÃO ==========
PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"
LOCATION = "us-central1"

bq_client = None


def build_cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '3600'
    }

def get_bigquery_client():
    """Retorna cliente BigQuery (singleton)"""
    global bq_client
    if bq_client is None:
        bq_client = bigquery.Client(project=PROJECT_ID, location=LOCATION)
    return bq_client


# ============================================================================
# TASK 1.2: SMART STANDARDIZE - FONTE ÚNICA DA VERDADE (NOVA VERSÃO)
# ============================================================================

def smart_standardize_dataframe(df, source_type='analise_pipeline', verbose=False):
    """
    Normaliza QUALQUER DataFrame para schema padrão Python/Pandas
    
    ⚠️ IMPORTANTE: Esta função é APENAS para cálculos internos (dashboard metrics).
       NÃO use para salvar no BigQuery! BigQuery deve manter schema original
       (confianca_pct, gross, net) para compatibilidade com ML models!
    
    OBJETIVO: Eliminar confusão de nomes de colunas entre camadas
    
    FUNÇÕES:
    1. Renomeia colunas usando column_mapping.py
    2. Converte tipos de dados (str → numeric, dates)
    3. Cria campos calculados (_num, _percent)
    4. Garante colunas obrigatórias existem (fillna)
    5. Remove colunas duplicadas/inválidas
    
    Args:
        df (pd.DataFrame): DataFrame original (BigQuery ou Apps Script)
        source_type (str): Tipo de fonte:
            - 'pipeline_base': Planilha Pipeline Aberto
            - 'ganhas_base': Planilha Historico Ganhos
            - 'perdidas_base': Planilha Historico Perdidas
            - 'analise_pipeline': Aba 🎯 Análise Forecast IA
            - 'analise_ganhas': Aba 📈 Análise Ganhas
            - 'analise_perdidas': Aba 📉 Análise Perdidas
            - 'sales_specialist': Aba Sales Specialist
        verbose (bool): Se True, imprime debug
    
    Returns:
        pd.DataFrame: DataFrame padronizado com nomes consistentes
    
    Raises:
        ValueError: Se source_type inválido ou DataFrame vazio
    """
    if df is None or df.empty:
        raise ValueError(f"DataFrame vazio para source_type={source_type}")
    
    if verbose:
        print(f"\n🔧 [STANDARDIZE] Processando {source_type}")
        print(f"   📊 Colunas originais: {len(df.columns)}")
        print(f"   📈 Linhas: {len(df)}")
    
    # Cria cópia para não modificar original
    df = df.copy()
    
    # ========== PASSO 1: RENOMEAR COLUNAS ==========
    if COLUMN_MAPPING_AVAILABLE:
        mapping = get_column_mapping(source_type)
        if mapping:
            # Renomeia apenas colunas que existem no mapping
            rename_dict = {k: v for k, v in mapping.items() if k in df.columns}
            df = df.rename(columns=rename_dict)
            if verbose:
                print(f"   ✅ Renomeadas: {len(rename_dict)} colunas")
        else:
            if verbose:
                print(f"   ⚠️ Sem mapping para {source_type}")
    else:
        if verbose:
            print("   ⚠️ Column mapping não disponível, mantendo nomes originais")
    
    # ========== PASSO 2: PADRONIZAR NOMES DE COLUNAS COMUNS ==========
    # Garante nomes padrão para campos críticos (caso mapping falhe)
    common_renames = {
        # Valores financeiros
        'Gross': 'gross_value',
        'Net': 'net_value',
        'Preço total (convertido)': 'gross_value',
        'Margen Total $': 'net_value',
        'Margen Total $ (convertido)': 'net_value',
        
        # Confiança (CRÍTICO para bugs dos 50%)
        'Confiança (%)': 'confidence_percent',
        'Probabilidade (%)': 'probability_percent',
        'Confiana': 'confidence_percent',  # BigQuery sem til
        
        # Ciclo
        'Ciclo (dias)': 'cycle_days',
        'Ciclo': 'cycle_days',
        
        # Identificação
        'Oportunidade': 'opportunity_name',
        'Nome da oportunidade': 'opportunity_name',
        'Opportunity': 'opportunity_name',
        'Conta': 'account_name',
        'Nome da conta': 'account_name',
        'Account Name': 'account_name',
        'Vendedor': 'seller_name',
        'Proprietário da oportunidade': 'owner_name',
        
        # Quarter
        'Fiscal Q': 'fiscal_quarter',
        'Período fiscal': 'fiscal_period',
        
        # Datas
        'Data Prevista': 'expected_close_date',
        'Data de fechamento': 'close_date',
        'Data Fechamento': 'close_date',
        'Data de criação': 'created_date',
        'Data_Fechamento': 'close_date',
        'Data_Criao': 'created_date',
        
        # Fase
        'Fase Atual': 'current_stage',
        'Fase': 'stage',
        'Stage': 'stage',
        
        # Atividades
        'Atividades': 'activities_total',
        '# Atividades': 'activities_total',
        'Ativ. 7d': 'activities_7d',
        'Ativ. 30d': 'activities_30d',
        'Idle (Dias)': 'idle_days',
        'Dias inativos': 'idle_days',
        'Dias Funil': 'days_in_pipeline',
        
        # Análise IA
        'Forecast IA': 'forecast_ai',
        'Cód Ação': 'action_code',
        'Flags de Risco': 'risk_flags',
        '🏷️ Labels': 'labels',
        'Tipo Resultado': 'result_type',
        '🎯 Causa Raiz': 'root_cause',
        '✨ Fatores Sucesso': 'success_factors',
        '⚠️ Causas Secundárias': 'secondary_causes'
    }
    
    # Aplica renames adicionais (só se coluna existir)
    for old_name, new_name in common_renames.items():
        if old_name in df.columns and new_name not in df.columns:
            df = df.rename(columns={old_name: new_name})
    
    if verbose:
        print(f"   ✅ Padronização adicional aplicada")
    
    # ========== PASSO 3: CONVERTER TIPOS DE DADOS ==========
    
    # Converte valores financeiros para numeric
    for col in ['gross_value', 'net_value', 'booking_gross', 'booking_net']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            # Cria versão _num para compatibilidade
            df[f'{col}_num'] = df[col]
    
    # Converte confidence/probability para numeric (NUNCA deixar string!)
    for col in ['confidence_percent', 'probability_percent']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
            # Normaliza para 0-100 se vier como 0-1
            if df[col].max() <= 1.0 and df[col].max() > 0:
                df[col] = df[col] * 100
    
    # Converte cycle_days para numeric
    if 'cycle_days' in df.columns:
        df['cycle_days'] = pd.to_numeric(df['cycle_days'], errors='coerce').fillna(0)
        df['cycle_days_num'] = df['cycle_days']
    
    # Converte atividades para numeric
    for col in ['activities_total', 'activities_7d', 'activities_30d', 'idle_days', 'days_in_pipeline']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # Converte scores para numeric
    for col in ['meddic_score', 'bant_score']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # Converte datas
    date_columns = [
        'close_date', 'expected_close_date', 'created_date',
        'last_stage_change_date', 'last_activity_date'
    ]
    for col in date_columns:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')
    
    if verbose:
        print(f"   ✅ Tipos convertidos")
    
    # ========== PASSO 4: CRIAR CAMPOS CALCULADOS ==========
    
    # Gross_num e Net_num (aliases para compatibilidade)
    if 'gross_value' in df.columns and 'Gross_num' not in df.columns:
        df['Gross_num'] = df['gross_value']
    if 'net_value' in df.columns and 'Net_num' not in df.columns:
        df['Net_num'] = df['net_value']
    
    # Confidence como decimal (0-1) para cálculos
    if 'confidence_percent' in df.columns:
        df['confidence_decimal'] = df['confidence_percent'] / 100.0
    
    # Margem percentual
    if 'gross_value' in df.columns and 'net_value' in df.columns:
        df['margin_percent'] = np.where(
            df['gross_value'] > 0,
            (df['net_value'] / df['gross_value']) * 100,
            0
        )
    
    if verbose:
        print(f"   ✅ Campos calculados criados")
    
    # ========== PASSO 5: GARANTIR COLUNAS OBRIGATÓRIAS ==========
    
    required_columns = {
        'analise_pipeline': [
            'opportunity_name', 'gross_value', 'net_value', 'confidence_percent',
            'fiscal_quarter', 'seller_name', 'cycle_days'
        ],
        'analise_ganhas': [
            'opportunity_name', 'gross_value', 'net_value', 'fiscal_quarter',
            'seller_name', 'cycle_days', 'close_date'
        ],
        'analise_perdidas': [
            'opportunity_name', 'gross_value', 'net_value', 'fiscal_quarter',
            'seller_name', 'cycle_days', 'close_date'
        ],
        'sales_specialist': [
            'opportunity_name', 'booking_gross', 'booking_net', 'status'
        ]
    }
    
    if source_type in required_columns:
        for col in required_columns[source_type]:
            if col not in df.columns:
                # Cria coluna vazia do tipo apropriado
                if 'date' in col:
                    df[col] = pd.NaT
                elif any(x in col for x in ['value', 'gross', 'net', 'percent', 'days', 'score']):
                    df[col] = 0
                else:
                    df[col] = ''
                if verbose:
                    print(f"   ⚠️ Coluna obrigatória criada: {col}")
    
    # ========== PASSO 6: LIMPEZA FINAL ==========
    
    # Remove colunas completamente vazias
    df = df.dropna(axis=1, how='all')
    
    # Remove duplicatas de colunas (caso existam)
    df = df.loc[:, ~df.columns.duplicated()]
    
    if verbose:
        print(f"   ✅ Limpeza final concluída")
        print(f"   📊 Colunas finais: {len(df.columns)}")
        print(f"   🎯 Colunas principais: {[c for c in df.columns if any(x in c for x in ['gross', 'net', 'confidence', 'cycle', 'fiscal'])]}")
    
    return df


def validate_smart_standardized_dataframe(df, source_type, strict=False):
    """
    Valida se DataFrame está corretamente padronizado
    
    Returns:
        dict: {'valid': bool, 'missing_cols': list, 'warnings': list}
    """
    result = {
        'valid': True,
        'missing_cols': [],
        'warnings': []
    }
    
    # Verifica colunas críticas por tipo
    critical_cols = {
        'analise_pipeline': ['opportunity_name', 'gross_value', 'confidence_percent', 'fiscal_quarter'],
        'analise_ganhas': ['opportunity_name', 'gross_value', 'fiscal_quarter', 'close_date'],
        'analise_perdidas': ['opportunity_name', 'gross_value', 'fiscal_quarter', 'close_date']
    }
    
    if source_type in critical_cols:
        for col in critical_cols[source_type]:
            if col not in df.columns:
                result['missing_cols'].append(col)
                result['valid'] = False
    
    # Verifica tipos de dados
    if 'confidence_percent' in df.columns:
        if df['confidence_percent'].dtype not in [np.float64, np.int64]:
            result['warnings'].append("confidence_percent não é numeric")
    
    if 'gross_value' in df.columns:
        if df['gross_value'].dtype not in [np.float64, np.int64]:
            result['warnings'].append("gross_value não é numeric")
    
    return result

# ========== SCHEMAS BIGQUERY ==========

# Schema completo da tabela PIPELINE (54 colunas)
PIPELINE_SCHEMA = {
    'text_columns': [
        'Opportunity', 'Vendedor', 'Email_Vendedor', 'Tipo', 'Segmento',
        'Perfil_Cliente', 'Fiscal_Q', 'Stage', 'Motivo_Perda',
        'Produto', 'Famlia_Produto', 'Categoria', 'Portflio', 'Cliente',
        'Proprietrio', 'Pas', 'Estado', 'Cidade', 'Setor', 'Concorrente',
        'Email_Cliente', 'Telefone_Cliente', 'ltima_Atividade', 'ltimo_Contato',
        'Campaign_Source', 'Observaes', 'Tags', 'Status_Integrao'
    ],
    'numeric_columns': {
        'Gross': 'float',
        'Net': 'float',
        'Confiana': 'int',
        'Ciclo': 'int',
        'Atividades': 'int',
        'Desconto': 'float',
        'Idade_Lead': 'int',
        'Qtd_Produtos': 'int',
        'Qtd_Decises': 'int',
        'Qtd_Reunies': 'int',
        'Qtd_Emails': 'int',
        'Qtd_Mudanas_Stage': 'int',
        'Tempo_Prospeco': 'int',
        'Tempo_Qualificao': 'int',
        'Tempo_Proposta': 'int',
        'Tempo_Negociao': 'int'
    },
    'date_columns': [
        'Data_Criao', 'Data_Fechamento', 'ltima_Modificao',
        'Data_Prxima_Ao', 'Data_ltimo_Contato'
    ],
    'boolean_columns': [
        'Cliente_Existente', 'Mudanas_Crticas', 'Upsellfrom_Existente'
    ],
    'calculated_columns': {
        'Gross_num': lambda df: pd.to_numeric(df.get('Gross', 0), errors='coerce').fillna(0),
        'Net_num': lambda df: pd.to_numeric(df.get('Net', 0), errors='coerce').fillna(0),
        'Confiana_num': lambda df: pd.to_numeric(df.get('Confiana', 0), errors='coerce').fillna(0),
        'Ciclo_num': lambda df: pd.to_numeric(df.get('Ciclo', 0), errors='coerce').fillna(0),
        'Desconto_perc': lambda df: pd.to_numeric(df.get('Desconto', 0), errors='coerce').fillna(0),
        'Atividades_num': lambda df: pd.to_numeric(df.get('Atividades', 0), errors='coerce').fillna(0)
    }
}

# Schema completo da tabela CLOSED_DEALS (42 colunas)
CLOSED_DEALS_SCHEMA = {
    'text_columns': [
        'Opportunity', 'Vendedor', 'Email_Vendedor', 'outcome', 'Motivo_Perda',
        'Tipo', 'Segmento', 'Perfil_Cliente', 'Fiscal_Q', 'Stage',
        'Produto', 'Famlia_Produto', 'Categoria', 'Portflio', 'Cliente',
        'Pas', 'Estado', 'Cidade', 'Setor', 'Concorrente',
        'ltima_Atividade', 'Campaign_Source', 'Tags'
    ],
    'numeric_columns': {
        'Gross': 'float',
        'Net': 'float',
        'Confiana': 'int',
        'Ciclo': 'int',
        'Atividades': 'int',
        'Desconto': 'float',
        'Idade_Lead': 'int',
        'Qtd_Produtos': 'int',
        'Qtd_Reunies': 'int',
        'Qtd_Emails': 'int',
        'Qtd_Mudanas_Stage': 'int',
        'Tempo_Total_Ciclo': 'int'
    },
    'date_columns': [
        'Data_Criao', 'Data_Fechamento', 'ltima_Modificao'
    ],
    'boolean_columns': [
        'Cliente_Existente', 'Mudanas_Crticas'
    ],
    'calculated_columns': {
        'Gross_num': lambda df: pd.to_numeric(df.get('Gross', 0), errors='coerce').fillna(0),
        'Net_num': lambda df: pd.to_numeric(df.get('Net', 0), errors='coerce').fillna(0),
        'Confiana_num': lambda df: pd.to_numeric(df.get('Confiana', 0), errors='coerce').fillna(0),
        'Ciclo_num': lambda df: pd.to_numeric(df.get('Ciclo', 0), errors='coerce').fillna(0),
        'Atividades_num': lambda df: pd.to_numeric(df.get('Atividades', 0), errors='coerce').fillna(0)
    }
}

# Schema da tabela ML_PREDICTIONS (11 colunas)
ML_PREDICTIONS_SCHEMA = {
    'text_columns': [
        'opportunity', 'seller', 'predicted_outcome', 'risk_category'
    ],
    'numeric_columns': {
        'gross_value': 'float',
        'win_probability': 'float',
        'confidence_level': 'int'
    },
    'date_columns': [
        'prediction_timestamp'
    ],
    'calculated_columns': {}
}

def standardize_dataframe(df: pd.DataFrame, schema: dict, table_name: str) -> pd.DataFrame:
    """
    Padroniza um DataFrame conforme schema definido
    
    Args:
        df: DataFrame do BigQuery
        schema: Dicionário com definição do schema
        table_name: Nome da tabela (para logs)
    
    Returns:
        DataFrame padronizado com todas as colunas e tipos corretos
    """
    if df.empty:
        print(f"⚠️  DataFrame vazio para {table_name}")
        return df
    
    df_std = df.copy()
    
    # 1. GARANTIR COLUNAS DE TEXTO
    for col in schema.get('text_columns', []):
        if col not in df_std.columns:
            df_std[col] = 'Unknown'
            print(f"➕ Adicionada coluna {col} em {table_name}")
        else:
            df_std[col] = df_std[col].fillna('Unknown').astype(str)
    
    # 2. GARANTIR E CONVERTER COLUNAS NUMÉRICAS
    for col, dtype in schema.get('numeric_columns', {}).items():
        if col not in df_std.columns:
            df_std[col] = 0
            print(f"➕ Adicionada coluna numérica {col} em {table_name}")
        else:
            if dtype == 'float':
                df_std[col] = pd.to_numeric(df_std[col], errors='coerce').fillna(0.0)
            elif dtype == 'int':
                df_std[col] = pd.to_numeric(df_std[col], errors='coerce').fillna(0).astype(int)
    
    # 3. GARANTIR COLUNAS DE DATA
    for col in schema.get('date_columns', []):
        if col not in df_std.columns:
            df_std[col] = pd.NaT
            print(f"➕ Adicionada coluna de data {col} em {table_name}")
        else:
            df_std[col] = pd.to_datetime(df_std[col], errors='coerce')
    
    # 4. GARANTIR COLUNAS BOOLEANAS
    for col in schema.get('boolean_columns', []):
        if col not in df_std.columns:
            df_std[col] = False
            print(f"➕ Adicionada coluna booleana {col} em {table_name}")
        else:
            df_std[col] = df_std[col].fillna(False).astype(bool)
    
    # 5. CRIAR COLUNAS CALCULADAS
    for col_name, calc_func in schema.get('calculated_columns', {}).items():
        try:
            df_std[col_name] = calc_func(df_std)
            print(f"✅ Calculada coluna {col_name} em {table_name}")
        except Exception as e:
            df_std[col_name] = 0
            print(f"⚠️  Erro ao calcular {col_name} em {table_name}: {e}")
    
    print(f"✅ Schema de {table_name} padronizado: {len(df_std)} linhas, {len(df_std.columns)} colunas")
    
    return df_std

# ========== QUERIES BIGQUERY ==========

def get_pipeline_data(filters: dict) -> pd.DataFrame:
    """Busca pipeline do BigQuery com schema padronizado"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
    WHERE Gross IS NOT NULL
    """
    
    if filters.get('quarter'):
        query += f" AND Fiscal_Q = '{filters['quarter']}'"
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('minValue'):
        query += f" AND SAFE_CAST(Gross AS FLOAT64) >= {filters['minValue']}"
    
    df = client.query(query).to_dataframe()
    return standardize_dataframe(df, PIPELINE_SCHEMA, 'pipeline')

def get_closed_data(filters: dict) -> pd.DataFrame:
    """Busca closed deals do BigQuery com schema padronizado (tabelas separadas won/lost)"""
    client = get_bigquery_client()
    
    # UNION ALL com CAST para compatibilizar tipos entre as tabelas
    # Selecionamos apenas colunas essenciais compartilhadas
    query = f"""
    WITH won_data AS (
      SELECT
        Run_ID,
        Oportunidade,
        Conta,
        Perfil_Cliente,
        Vendedor,
        Gross,
        Net,
        Portfolio,
        Segmento,
        Familia_Produto,
        Status,
        Fiscal_Q,
        Data_Fechamento,
        CAST(Ciclo_dias AS STRING) as Ciclo_dias,
        Produtos,
        Resumo_Analise,
        Causa_Raiz,
        CAST(Atividades AS INT64) as Atividades,
        CAST(Ativ_7d AS INT64) as Ativ_7d,
        CAST(Ativ_30d AS INT64) as Ativ_30d,
        Distribuicao_Tipos,
        Periodo_Pico,
        CAST(Cadencia_Media_dias AS STRING) as Cadencia_Media_dias,
        CAST(Total_Mudancas AS INT64) as Total_Mudancas,
        CAST(Mudancas_Criticas AS INT64) as Mudancas_Criticas,
        CAST(Mudancas_Close_Date AS INT64) as Mudancas_Close_Date,
        CAST(Mudancas_Stage AS INT64) as Mudancas_Stage,
        CAST(Mudancas_Valor AS INT64) as Mudancas_Valor,
        CAST(Campos_Alterados AS STRING) as Campos_Alterados,
        Padrao_Mudancas,
        CAST(Freq_Mudancas AS STRING) as Freq_Mudancas,
        CAST(Editores AS INT64) as Editores,
        Labels,
        CAST(Ultima_Atualizacao AS STRING) as Ultima_Atualizacao,
        'WON' as outcome
      FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
    ),
    lost_data AS (
      SELECT
        Run_ID,
        Oportunidade,
        Conta,
        Perfil_Cliente,
        Vendedor,
        Gross,
        Net,
        Portfolio,
        Segmento,
        Familia_Produto,
        Status,
        Fiscal_Q,
        Data_Fechamento,
        CAST(Ciclo_dias AS STRING) as Ciclo_dias,
        Produtos,
        Resumo_Analise,
        Causa_Raiz,
        CAST(Atividades AS INT64) as Atividades,
        CAST(Ativ_7d AS INT64) as Ativ_7d,
        CAST(Ativ_30d AS INT64) as Ativ_30d,
        Distribuicao_Tipos,
        Periodo_Pico,
        CAST(Cadencia_Media_dias AS STRING) as Cadencia_Media_dias,
        CAST(Total_Mudancas AS INT64) as Total_Mudancas,
        CAST(Mudancas_Criticas AS INT64) as Mudancas_Criticas,
        CAST(Mudancas_Close_Date AS INT64) as Mudancas_Close_Date,
        CAST(Mudancas_Stage AS INT64) as Mudancas_Stage,
        CAST(Mudancas_Valor AS INT64) as Mudancas_Valor,
        CAST(Campos_Alterados AS STRING) as Campos_Alterados,
        Padrao_Mudancas,
        CAST(Freq_Mudancas AS STRING) as Freq_Mudancas,
        CAST(Editores AS INT64) as Editores,
        Labels,
        CAST(Ultima_Atualizacao AS STRING) as Ultima_Atualizacao,
        'LOST' as outcome
      FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
    )
    SELECT * FROM won_data
    UNION ALL
    SELECT * FROM lost_data
    """
    
    # Aplicar filtros
    conditions = []
    if filters.get('quarter'):
        conditions.append(f"Fiscal_Q = '{filters['quarter']}'")
    if filters.get('seller'):
        conditions.append(f"Vendedor = '{filters['seller']}'")
    
    if conditions:
        query = f"SELECT * FROM ({query}) WHERE {' AND '.join(conditions)}"
    
    df = client.query(query).to_dataframe()
    return standardize_dataframe(df, CLOSED_DEALS_SCHEMA, 'closed_deals')

def get_ml_predictions(filters: dict) -> pd.DataFrame:
    """Busca predições do modelo ML do BigQuery (win/loss classifier)"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        seller,
        gross_value,
        win_probability,
        risk_category,
        predicted_outcome,
        prediction_timestamp
    FROM `{PROJECT_ID}.{DATASET_ID}.ml_predictions`
    WHERE 1=1
    """
    
    if filters.get('quarter'):
        query += f" AND fiscal_quarter = '{filters['quarter']}'"
    if filters.get('minWinProb'):
        query += f" AND win_probability >= {filters['minWinProb']}"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Erro ao buscar ML predictions: {e}")
        return pd.DataFrame()

def get_sales_specialist_data(filters: dict) -> pd.DataFrame:
    """Busca dados do Sales Specialist do BigQuery com filtro por quarter"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        account_name,
        perfil,
        opportunity_name,
        meses_fat,
        gtm_2026,
        booking_total_gross,
        booking_total_net,
        opportunity_status,
        vendedor,
        forecast_status,
        billing_quarter_gross,
        billing_quarter_net,
        closed_date,
        fiscal_quarter
    FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
    WHERE billing_quarter_gross > 0
    """
    
    # Filtro por quarter (baseado em fiscal_quarter calculado no BigQuerySync)
    if filters.get('quarter'):
        query += f" AND fiscal_quarter = '{filters['quarter']}'"
    if filters.get('seller'):
        query += f" AND vendedor = '{filters['seller']}'"
    
    try:
        df = client.query(query).to_dataframe()
        print(f"📋 Sales Specialist: {len(df)} deals retornados do BigQuery")
        return df
    except Exception as e:
        print(f"⚠️  Erro ao buscar Sales Specialist: {e}")
        return pd.DataFrame()

# ========== NOVOS ENDPOINTS ML (6 MODELOS) ==========

def get_previsao_ciclo(filters: dict) -> pd.DataFrame:
    """Busca predições de ciclo de vendas do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        Gross_Value,
        Vendedor,
        Segmento,
        Fase_Atual,
        Fiscal_Quarter,
        dias_previstos,
        velocidade_prevista,
        MEDDIC_Score,
        BANT_Score,
        Atividades_Peso
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_previsao_ciclo`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('quarter'):
        query += f" AND Fiscal_Quarter = '{filters['quarter']}'"
    if filters.get('minValue'):
        query += f" AND Gross_Value >= {filters['minValue']}"
    
    query += " ORDER BY dias_previstos DESC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Previsão Ciclo table not found: {e}")
        return pd.DataFrame()

def get_classificador_perda(filters: dict) -> pd.DataFrame:
    """Busca classificação de causas de perda do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        Gross_Value,
        Vendedor,
        Segmento,
        Fase_Atual,
        Fiscal_Quarter,
        causa_prevista,
        confianca_predicao,
        prob_preco,
        prob_timing,
        prob_concorrente,
        prob_budget,
        prob_fit,
        acao_preventiva,
        MEDDIC_Score,
        BANT_Score
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_classificador_perda`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('quarter'):
        query += f" AND Fiscal_Quarter = '{filters['quarter']}'"
    if filters.get('causa'):
        query += f" AND causa_prevista = '{filters['causa']}'"
    
    query += " ORDER BY confianca_predicao DESC, Gross_Value DESC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Classificador Perda table not found: {e}")
        return pd.DataFrame()

def get_risco_abandono(filters: dict) -> pd.DataFrame:
    """Busca predições de risco de abandono do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        Gross_Value,
        Vendedor,
        Segmento,
        Fase_Atual,
        Fiscal_Quarter,
        nivel_risco,
        prob_abandono,
        fatores_risco,
        acao_recomendada,
        Idle_Dias,
        MEDDIC_Score,
        BANT_Score,
        Red_Flags,
        Yellow_Flags
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_risco_abandono`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('quarter'):
        query += f" AND Fiscal_Quarter = '{filters['quarter']}'"
    if filters.get('riskLevel'):
        query += f" AND nivel_risco = '{filters['riskLevel']}'"
    
    query += " ORDER BY prob_abandono DESC, Gross_Value DESC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Risco Abandono table not found: {e}")
        return pd.DataFrame()

def get_performance_vendedor(filters: dict) -> pd.DataFrame:
    """Busca predições de performance de vendedores do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        Vendedor,
        win_rate_previsto,
        delta_performance,
        valor_previsto_venda,
        classificacao,
        acao_recomendada,
        ranking,
        deals_pipeline,
        win_rate_historico,
        avg_meddic,
        avg_bant,
        avg_cycle_won
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_performance_vendedor`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('classificacao'):
        query += f" AND classificacao = '{filters['classificacao']}'"
    
    query += " ORDER BY ranking ASC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Performance Vendedor table not found: {e}")
        return pd.DataFrame()

def get_prioridade_deals(filters: dict) -> pd.DataFrame:
    """Busca priorização de deals do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        Vendedor,
        Segmento,
        Fase_Atual,
        Gross_Value,
        Fiscal_Quarter,
        priority_score,
        priority_level,
        win_prob_pct,
        value_percentile,
        urgency_pct,
        retention_pct,
        recomendacao_foco,
        ranking_global,
        ranking_vendedor,
        dias_previstos,
        velocidade_prevista,
        risco_abandono,
        MEDDIC_Score,
        BANT_Score
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_prioridade_deals`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('quarter'):
        query += f" AND Fiscal_Quarter = '{filters['quarter']}'"
    if filters.get('priorityLevel'):
        query += f" AND priority_level = '{filters['priorityLevel']}'"
    
    query += " ORDER BY ranking_global ASC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Prioridade Deals table not found: {e}")
        return pd.DataFrame()

def get_proxima_acao(filters: dict) -> pd.DataFrame:
    """Busca recomendações de próximas ações do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
    SELECT 
        opportunity,
        Vendedor,
        Segmento,
        Fase_Atual,
        Gross_Value,
        Fiscal_Quarter,
        categoria_acao,
        acao_recomendada,
        urgencia,
        detalhes_execucao,
        ordem_prioridade,
        win_probability_pct,
        risco_perda,
        causa_provavel_perda,
        risco_abandono,
        nivel_prioridade,
        MEDDIC_Score,
        BANT_Score,
        Idle_Dias,
        Red_Flags,
        Yellow_Flags
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline_proxima_acao`
    WHERE 1=1
    """
    
    if filters.get('seller'):
        query += f" AND Vendedor = '{filters['seller']}'"
    if filters.get('quarter'):
        query += f" AND Fiscal_Quarter = '{filters['quarter']}'"
    if filters.get('urgencia'):
        query += f" AND urgencia = '{filters['urgencia']}'"
    if filters.get('categoria'):
        query += f" AND categoria_acao = '{filters['categoria']}'"
    
    query += " ORDER BY ordem_prioridade ASC, urgencia DESC, Gross_Value DESC"
    
    try:
        df = client.query(query).to_dataframe()
        return df
    except Exception as e:
        print(f"⚠️  Próxima Ação table not found: {e}")
        return pd.DataFrame()

# ========== FIM NOVOS ENDPOINTS ML ==========

def enrich_pipeline_with_ml(df_pipeline: pd.DataFrame, df_predictions: pd.DataFrame) -> pd.DataFrame:
    """Enriquece pipeline com predições ML"""
    if df_predictions.empty:
        return df_pipeline
    
    # Merge com predictions
    df_enriched = df_pipeline.merge(
        df_predictions[['opportunity', 'win_probability', 'risk_category', 'predicted_outcome']],
        left_on='Oportunidade',
        right_on='opportunity',
        how='left'
    )
    
    # Remove coluna duplicada
    if 'opportunity' in df_enriched.columns:
        df_enriched = df_enriched.drop(columns=['opportunity'])
    
    return df_enriched



# ========== ANÁLISES PIPELINE ==========

def calculate_deal_health(row) -> dict:
    """Calcula health score de um deal"""
    health = {
        'score': 100,
        'flags': [],
        'inactivity_days': 0,
        'next_action_overdue': False
    }
    
    # Inatividade (Ultimo_Edit_Dias)
    if 'Ultimo_Edit_Dias' in row and pd.notna(row['Ultimo_Edit_Dias']):
        inactivity = float(row['Ultimo_Edit_Dias'])
        health['inactivity_days'] = inactivity
        
        if inactivity > 45:
            health['score'] -= 40
            health['flags'].append('INATIVO_45D')
        elif inactivity > 30:
            health['score'] -= 20
            health['flags'].append('INATIVO_30D')
    
    # MEDDIC score
    if 'MEDDIC_Score' in row and pd.notna(row['MEDDIC_Score']):
        meddic = str(row['MEDDIC_Score']).lower()
        if 'baixo' in meddic or 'low' in meddic:
            health['score'] -= 15
            health['flags'].append('MEDDIC_BAIXO')
    
    # Net <= 0
    if 'Net' in row and pd.notna(row['Net']):
        try:
            net = float(str(row['Net']).replace('$', '').replace(',', ''))
            if net <= 0:
                health['score'] -= 30
                health['flags'].append('NET_ZERO')
        except:
            pass
    
    # Stage inicial por muito tempo (Dias Funil > 60 e Stage < 3)
    if 'Dias_Funil' in row and 'Stage' in row:
        try:
            dias = float(row['Dias_Funil'])
            stage = str(row['Stage'])
            if dias > 60 and any(x in stage for x in ['1', '2', 'Qualify', 'Discovery']):
                health['score'] -= 20
                health['flags'].append('STUCK_EARLY_STAGE')
        except:
            pass
    
    health['score'] = max(0, health['score'])
    
    if health['score'] >= 80:
        health['status'] = 'HEALTHY'
    elif health['score'] >= 60:
        health['status'] = 'WARNING'
    else:
        health['status'] = 'CRITICAL'
    
    return health

def categorize_forecast(row) -> str:
    """Categoriza deal no forecast (COMMIT/UPSIDE/PIPELINE/OMITIDO)"""
    
    # OMITIDO
    if pd.isna(row.get('Close_Date')):
        return 'OMITIDO'
    
    # Verificar close date
    try:
        close_date = pd.to_datetime(row['Close_Date'])
        hoje = datetime.now()
        dias_para_close = (close_date - hoje).days
    except:
        return 'OMITIDO'
    
    # Já passou
    if dias_para_close < 0:
        return 'OMITIDO'
    
    # Verificar probabilidade/stage
    prob = 0
    if 'Probability' in row and pd.notna(row['Probability']):
        try:
            prob = float(str(row['Probability']).replace('%', ''))
        except:
            prob = 0
    
    # COMMIT: >70% prob OU stage >= 6 OU "commit" no forecast category
    if prob >= 70:
        return 'COMMIT'
    
    if 'Stage' in row and pd.notna(row['Stage']):
        stage_str = str(row['Stage']).lower()
        if any(x in stage_str for x in ['6', '7', '8', 'negotiation', 'commit', 'contract']):
            return 'COMMIT'
    
    if 'Forecast_Category' in row and pd.notna(row['Forecast_Category']):
        fc = str(row['Forecast_Category']).lower()
        if 'commit' in fc:
            return 'COMMIT'
        elif 'upside' in fc:
            return 'UPSIDE'
    
    # UPSIDE: 30-69% prob OU stage 3-5
    if 30 <= prob < 70:
        return 'UPSIDE'
    
    if 'Stage' in row and pd.notna(row['Stage']):
        stage_str = str(row['Stage']).lower()
        if any(x in stage_str for x in ['3', '4', '5', 'proposal', 'negotiation']):
            return 'UPSIDE'
    
    # PIPELINE: resto
    return 'PIPELINE'

def analyze_pipeline_complete(df_pipeline: pd.DataFrame) -> dict:
    """Análise COMPLETA do pipeline"""
    
    if df_pipeline.empty:
        return {
            'total_deals': 0,
            'total_value': 0,
            'health_summary': {},
            'forecast_breakdown': {},
            'sellers': []
        }
    
    # Health scores
    df_pipeline['health'] = df_pipeline.apply(calculate_deal_health, axis=1)
    
    # Forecast categories
    df_pipeline['forecast_cat'] = df_pipeline.apply(categorize_forecast, axis=1)
    
    # Análise por health
    health_counts = df_pipeline['health'].apply(lambda x: x['status']).value_counts().to_dict()
    health_flags = []
    for health in df_pipeline['health']:
        health_flags.extend(health['flags'])
    
    # Análise por forecast
    forecast_breakdown = {}
    for cat in ['COMMIT', 'UPSIDE', 'PIPELINE', 'OMITIDO']:
        deals_cat = df_pipeline[df_pipeline['forecast_cat'] == cat]
        forecast_breakdown[cat] = {
            'count': len(deals_cat),
            'value': float(deals_cat['Gross_num'].sum()),
            'avg_size': float(deals_cat['Gross_num'].mean()) if len(deals_cat) > 0 else 0
        }
    
    # Top sellers
    sellers_analysis = []
    if 'Vendedor' in df_pipeline.columns:
        for seller in df_pipeline['Vendedor'].unique():
            if pd.isna(seller):
                continue
            
            seller_deals = df_pipeline[df_pipeline['Vendedor'] == seller]
            sellers_analysis.append({
                'name': str(seller),
                'total_deals': len(seller_deals),
                'total_value': float(seller_deals['Gross_num'].sum()),
                'commit_deals': len(seller_deals[seller_deals['forecast_cat'] == 'COMMIT']),
                'critical_deals': len(seller_deals[seller_deals['health'].apply(lambda x: x['status'] == 'CRITICAL')]),
                'avg_deal_size': float(seller_deals['Gross_num'].mean())
            })
    
    sellers_analysis.sort(key=lambda x: x['total_value'], reverse=True)
    
    # ========== MÉTRICAS POR ABA (Substitui l10) ==========
    
    # VISÃO EXECUTIVA: Pipeline breakdown por quarter fiscal
    pipeline_by_quarter = {}
    if 'Fiscal_Q' in df_pipeline.columns:
        for quarter in ['FY26-Q1', 'FY26-Q2', 'FY26-Q3', 'FY26-Q4']:
            q_deals = df_pipeline[df_pipeline['Fiscal_Q'] == quarter]
            pipeline_by_quarter[quarter] = {
                'gross': float(q_deals['Gross_num'].sum()),
                'net': float(q_deals['Net_num'].sum()),
                'deals_count': len(q_deals)
            }
    
    # VISÃO EXECUTIVA: Pipeline FY26 total
    df_fy26 = df_pipeline[df_pipeline['Fiscal_Q'].str.startswith('FY26', na=False)] if 'Fiscal_Q' in df_pipeline.columns else df_pipeline
    
    # VISÃO EXECUTIVA: High confidence deals (>50%)
    df_high_conf = df_pipeline[df_pipeline['Confiana_num'] > 50] if 'Confiana_num' in df_pipeline.columns else pd.DataFrame()
    
    return {
        'total_deals': len(df_pipeline),
        'total_value': float(df_pipeline['Gross_num'].sum()),
        'total_net': float(df_pipeline['Net_num'].sum()),
        'avg_deal_size': float(df_pipeline['Gross_num'].mean()),
        'health_summary': {
            'healthy': health_counts.get('HEALTHY', 0),
            'warning': health_counts.get('WARNING', 0),
            'critical': health_counts.get('CRITICAL', 0),
            'top_flags': pd.Series(health_flags).value_counts().head(5).to_dict()
        },
        'forecast_breakdown': forecast_breakdown,
        'sellers': sellers_analysis[:10],
        
        # ========== VISÃO EXECUTIVA ==========
        'executive': {
            'pipeline_all': {
                'gross': float(df_pipeline['Gross_num'].sum()),
                'net': float(df_pipeline['Net_num'].sum()),
                'deals_count': len(df_pipeline)
            },
            'pipeline_fy26': {
                'gross': float(df_fy26['Gross_num'].sum()),
                'net': float(df_fy26['Net_num'].sum()),
                'deals_count': len(df_fy26)
            },
            'pipeline_by_quarter': pipeline_by_quarter,
            'high_confidence': {
                'gross': float(df_high_conf['Gross_num'].sum()) if not df_high_conf.empty else 0,
                'net': float(df_high_conf['Net_num'].sum()) if not df_high_conf.empty else 0,
                'deals_count': len(df_high_conf)
            }
        }
    }

# ========== ANÁLISES CLOSED DEALS ==========

def analyze_cycle_time(row) -> float:
    """Calcula ciclo de vendas em dias"""
    try:
        if 'Created_Date' in row and 'Close_Date' in row:
            created = pd.to_datetime(row['Created_Date'])
            closed = pd.to_datetime(row['Close_Date'])
            return (closed - created).days
    except:
        pass
    return None

def extract_loss_reason(row) -> str:
    """Extrai motivo de perda principal"""
    if 'Loss_Reason' in row and pd.notna(row['Loss_Reason']):
        reason = str(row['Loss_Reason']).lower()
        
        # Categorias principais
        if any(x in reason for x in ['price', 'preco', 'caro', 'expensive', 'cost']):
            return 'PRICE'
        elif any(x in reason for x in ['competitor', 'concorrente', 'competition']):
            return 'COMPETITION'
        elif any(x in reason for x in ['budget', 'orcamento', 'funding']):
            return 'NO_BUDGET'
        elif any(x in reason for x in ['timing', 'time', 'delay', 'postponed', 'adiado']):
            return 'BAD_TIMING'
        elif any(x in reason for x in ['feature', 'functionality', 'product', 'funcionalidade']):
            return 'PRODUCT_FIT'
        else:
            return 'OTHER'
    
    return 'UNKNOWN'

def analyze_by_seller_and_profile(df: pd.DataFrame) -> dict:
    """
    Substitui _analyzeBySellerAndProfile() do DashboardCode.gs
    Agrega por Vendedor + Perfil de Cliente
    """
    if df.empty or 'Vendedor' not in df.columns:
        return {}
    
    # Agrupar
    result = []
    has_profile = 'Perfil' in df.columns or 'Perfil_Cliente' in df.columns
    profile_col = 'Perfil_Cliente' if 'Perfil_Cliente' in df.columns else 'Perfil'
    
    if has_profile:
        grouped = df.groupby(['Vendedor', profile_col])
    else:
        grouped = df.groupby('Vendedor')
    
    for name, group in grouped:
        if has_profile and isinstance(name, tuple):
            seller = name[0]
            profile = name[1]
        else:
            seller = name
            profile = 'N/A'
        
        total_gross = float(group['Gross_num'].sum())
        total_net = float(group['Net_num'].sum())
        avg_confidence = float(group['Confiana_num'].mean()) if 'Confiana_num' in group.columns else 0
        forecast_gross = float((group['Gross_num'] * group['Confiana_num'] / 100).sum())
        forecast_net = float((group['Net_num'] * group['Confiana_num'] / 100).sum())
        
        result.append({
            'seller': str(seller),
            'profile': str(profile),
            'count': len(group),
            'total_gross': total_gross,
            'total_net': total_net,
            'forecast_gross': forecast_gross,
            'forecast_net': forecast_net,
            'avg_confidence': avg_confidence
        })
    
    # Ordenar por forecast_gross desc
    result.sort(key=lambda x: x['forecast_gross'], reverse=True)
    return {'by_seller_profile': result}

def analyze_by_fiscal_quarter(df: pd.DataFrame) -> dict:
    """
    Substitui _analyzeByFiscalQuarter() do DashboardCode.gs
    Agrega por Quarter Fiscal
    """
    if df.empty or 'Fiscal_Q' not in df.columns:
        return {}
    
    result = []
    for quarter, group in df.groupby('Fiscal_Q'):
        if pd.isna(quarter):
            continue
            
        result.append({
            'quarter': str(quarter),
            'count': len(group),
            'total_gross': float(group['Gross_num'].sum()),
            'total_net': float(group['Net_num'].sum()),
            'forecast_gross': float((group['Gross_num'] * group['Confiana_num'] / 100).sum()),
            'forecast_net': float((group['Net_num'] * group['Confiana_num'] / 100).sum()),
            'avg_confidence': float(group['Confiana_num'].mean())
        })
    
    # Ordenar por quarter
    result.sort(key=lambda x: x['quarter'])
    return {'by_quarter': result}

def analyze_by_seller_and_quarter(df: pd.DataFrame) -> dict:
    """
    Substitui _analyzeBySellerAndQuarter() do DashboardCode.gs
    Agrega por Vendedor + Quarter (distribuição temporal)
    """
    if df.empty or 'Vendedor' not in df.columns or 'Fiscal_Q' not in df.columns:
        return {}
    
    result = []
    for (seller, quarter), group in df.groupby(['Vendedor', 'Fiscal_Q']):
        if pd.isna(seller) or pd.isna(quarter):
            continue
            
        result.append({
            'seller': str(seller),
            'quarter': str(quarter),
            'count': len(group),
            'total_gross': float(group['Gross_num'].sum())
        })
    
    return {'by_seller_quarter': result}

def analyze_by_forecast_category(df: pd.DataFrame) -> dict:
    """
    Substitui _analyzeByForecastCategory() do DashboardCode.gs
    Agrega por Categoria de Forecast (COMMIT/UPSIDE/PIPELINE/OMITIDO)
    """
    if df.empty:
        return {}
    
    # Usar coluna existente ou categorizar
    if 'Categoria_Forecast' in df.columns:
        category_col = 'Categoria_Forecast'
    elif 'Forecast_Category' in df.columns:
        category_col = 'Forecast_Category'
    else:
        # Fallback: categorizar com base em confiança
        df['category_temp'] = df['Confiana_num'].apply(lambda x: 
            'COMMIT' if x >= 70 else 'UPSIDE' if x >= 40 else 'PIPELINE' if x > 0 else 'OMITIDO'
        )
        category_col = 'category_temp'
    
    result = []
    for category, group in df.groupby(category_col):
        if pd.isna(category):
            continue
            
        result.append({
            'category': str(category),
            'count': len(group),
            'total_gross': float(group['Gross_num'].sum()),
            'forecast_gross': float((group['Gross_num'] * group['Confiana_num'] / 100).sum()),
            'avg_confidence': float(group['Confiana_num'].mean()),
            'avg_deal_size': float(group['Gross_num'].mean())
        })
    
    # Ordenar por ordem lógica
    category_order = {'COMMIT': 0, 'UPSIDE': 1, 'PIPELINE': 2, 'OMITIDO': 3}
    result.sort(key=lambda x: category_order.get(x['category'], 99))
    
    return {'by_forecast_category': result}

def get_war_targets(df: pd.DataFrame, limit: int = 10) -> dict:
    """
    Deals críticos em risco (War Targets)
    Substitui prepareWarTargetsData()
    """
    if df.empty:
        return {'war_targets': []}
    
    # Identificar deals em risco
    risk_conditions = []
    
    if 'Red_Flags' in df.columns:
        risk_conditions.append(df['Red_Flags'].notna() & (df['Red_Flags'] != ''))
    
    if 'Dias_Inatividade' in df.columns:
        risk_conditions.append(pd.to_numeric(df['Dias_Inatividade'], errors='coerce').fillna(0) > 30)
    
    if 'Net' in df.columns:
        risk_conditions.append(pd.to_numeric(df['Net'], errors='coerce').fillna(0) <= 0)
    
    # Se não há condições, retorna vazio
    if not risk_conditions:
        return {'war_targets': []}
    
    # Combinar condições com OR
    risk_mask = risk_conditions[0]
    for condition in risk_conditions[1:]:
        risk_mask = risk_mask | condition
    
    risk_deals = df[risk_mask].copy()
    
    # Top N por valor
    top_risks = risk_deals.nlargest(limit, 'Gross_num')
    
    result = []
    for _, deal in top_risks.iterrows():
        result.append({
            'oportunidade': str(deal.get('Oportunidade', '')),
            'conta': str(deal.get('Conta', '')),
            'vendedor': str(deal.get('Vendedor', '')),
            'gross': float(deal['Gross_num']),
            'stage': str(deal.get('Stage', '')),
            'red_flags': str(deal.get('Red_Flags', '')),
            'dias_inatividade': float(deal.get('Dias_Inatividade', 0)),
            'proximos_passos': str(deal.get('Proximos_Passos', ''))
        })
    
    return {'war_targets': result}


def _pick_row_value(row, *keys):
    for key in keys:
        if key in row and pd.notna(row[key]):
            return row[key]
    return None


def build_weekly_agenda(df_pipeline: pd.DataFrame, limit_per_quarter: int = 25) -> dict:
    """Builds a compact weekly agenda payload for the dashboard."""
    if df_pipeline.empty:
        return {}

    now = datetime.now()
    agenda = {}

    for _, row in df_pipeline.iterrows():
        name = _pick_row_value(row, 'Oportunidade', 'Opportunity', 'Opportunity_Name', 'opportunity_name')
        account = _pick_row_value(row, 'Conta', 'Account', 'Account_Name', 'account_name')
        owner = _pick_row_value(row, 'Vendedor', 'Owner', 'Opportunity_Owner', 'owner_name')
        stage = _pick_row_value(row, 'Stage', 'Fase', 'stage')
        fiscal_q = _pick_row_value(row, 'Fiscal_Q', 'Fiscal Q', 'fiscal_quarter', 'Fiscal_Period', 'Fiscal Period')

        gross = _pick_row_value(row, 'Gross_num', 'gross_value', 'Gross', 'Total Price (converted)') or 0
        net = _pick_row_value(row, 'Net_num', 'net_value', 'Net', 'Net Revenue') or 0

        confidence = _pick_row_value(row, 'Confiana_num', 'confidence_percent', 'Confiana', 'Confiança (%)', 'Probabilidade (%)')
        try:
            confidence = float(confidence) if confidence is not None else 0
        except Exception:
            confidence = 0
        if 0 < confidence <= 1:
            confidence = confidence * 100

        close_date = _pick_row_value(row, 'Data_Fechamento', 'Close_Date', 'close_date', 'Data de fechamento')
        days_to_close = 0
        if close_date is not None and pd.notna(close_date):
            try:
                close_dt = pd.to_datetime(close_date)
                days_to_close = int((close_dt - now).days)
            except Exception:
                days_to_close = 0

        next_activity = _pick_row_value(row, 'Data_Prxima_Ao', 'Next_Activity_Date', 'Next Activity Date', 'Data Próxima Ação')

        deal = {
            'name': str(name) if name is not None else 'Deal sem nome',
            'account': str(account) if account is not None else None,
            'owner': str(owner) if owner is not None else None,
            'stage': str(stage) if stage is not None else None,
            'fiscalQ': str(fiscal_q) if fiscal_q is not None else 'Sem Quarter',
            'val': float(gross) if gross is not None else 0,
            'net': float(net) if net is not None else 0,
            'confidence': round(confidence, 1) if confidence is not None else 0,
            'daysToClose': days_to_close,
            'nextActivity': str(next_activity) if next_activity is not None else None
        }

        quarter_key = deal['fiscalQ'] or 'Sem Quarter'
        agenda.setdefault(quarter_key, []).append(deal)

    # Sort and limit per quarter
    for quarter_key, deals in agenda.items():
        deals.sort(key=lambda d: d.get('val', 0), reverse=True)
        agenda[quarter_key] = deals[:limit_per_quarter]

    return agenda


def build_closed_agg(df_closed: pd.DataFrame, outcome: str) -> list:
    """Build aggregated closed deals (won/lost) for dashboard conversion metrics."""
    if df_closed.empty:
        return []

    if 'outcome' not in df_closed.columns:
        return []

    df = df_closed[df_closed['outcome'] == outcome].copy()
    if df.empty:
        return []

    seller_col = 'Vendedor' if 'Vendedor' in df.columns else None
    quarter_col = 'Fiscal_Q' if 'Fiscal_Q' in df.columns else None
    if not seller_col or not quarter_col:
        return []

    gross_col = 'Gross_num' if 'Gross_num' in df.columns else None
    net_col = 'Net_num' if 'Net_num' in df.columns else None
    if not gross_col or not net_col:
        return []

    grouped = (
        df.groupby([seller_col, quarter_col])[[gross_col, net_col]]
        .sum()
        .reset_index()
    )

    records = []
    for _, row in grouped.iterrows():
        records.append({
            'owner': str(row[seller_col]),
            'fiscalQ': str(row[quarter_col]),
            'gross': float(row[gross_col]),
            'net': float(row[net_col])
        })

    return records

def analyze_closed_complete(df_closed: pd.DataFrame) -> dict:
    """Análise COMPLETA de deals fechados"""
    
    if df_closed.empty:
        return {
            'total_deals': 0,
            'won': 0,
            'lost': 0,
            'win_rate': 0,
            'closed_quarter': {
                'quarter': 'N/A',
                'gross': 0,
                'net': 0,
                'deals_count': 0
            }
        }
    
    # Separar won/lost
    df_won = df_closed[df_closed['outcome'] == 'WON'].copy()
    df_lost = df_closed[df_closed['outcome'] == 'LOST'].copy()
    
    # ========== TASK 2.4: CLOSED QUARTER CALCULATOR ==========
    # Calcula fechado no quarter ATUAL (baseado na data atual)
    # Formato: FY26-Q1, FY26-Q2, etc.
    current_date = datetime.now()
    # Fiscal Year: começa em fevereiro
    # Q1: fev-abr, Q2: mai-jul, Q3: ago-out, Q4: nov-jan
    if current_date.month >= 2:
        fy = current_date.year % 100  # últimos 2 dígitos (2026 → 26)
    else:
        fy = (current_date.year - 1) % 100  # janeiro conta para FY do ano anterior
    
    # Determina quarter
    if current_date.month in [2, 3, 4]:
        quarter = 'Q1'
    elif current_date.month in [5, 6, 7]:
        quarter = 'Q2'
    elif current_date.month in [8, 9, 10]:
        quarter = 'Q3'
    else:  # 11, 12, 1
        quarter = 'Q4'
    
    current_quarter = f'FY{fy}-{quarter}'
    
    # ========== TASK 2.4: CLOSED QUARTER CALCULATOR ==========
    closed_quarter_stats = {'quarter': current_quarter, 'gross': 0, 'net': 0, 'deals_count': 0, 'avg_deal_size': 0}
    if METRICS_CALCULATORS_AVAILABLE and not df_won.empty:
        try:
            closed_quarter_stats = calculate_closed_quarter(
                df_won, 
                current_quarter,
                verbose=False
            )
        except Exception as e:
            print(f"⚠️  Erro ao calcular closed quarter: {e}")
    
    # ========== SALES SPECIALIST FORECAST (BigQuery) ==========
    # Carrega forecast de Sales Specialist do BigQuery filtrado pelo quarter atual
    forecast_specialist = {
        'enabled': False,
        'quarter': current_quarter,
        'deals_count': 0,
        'billing_gross': 0,
        'billing_net': 0,
        'commit_deals': 0,
        'commit_gross': 0,
        'commit_net': 0,
        'upside_deals': 0,
        'upside_gross': 0,
        'upside_net': 0
    }
    
    try:
        # Buscar do BigQuery filtrado por quarter
        df_specialist = get_sales_specialist_data({'quarter': current_quarter})
        
        if not df_specialist.empty:
            df_commit = df_specialist[df_specialist['forecast_status'].str.lower() == 'commit']
            df_upside = df_specialist[df_specialist['forecast_status'].str.lower() == 'upside']
            
            forecast_specialist = {
                'enabled': True,
                'quarter': current_quarter,
                'deals_count': int(len(df_specialist)),
                'billing_gross': float(df_specialist['billing_quarter_gross'].sum()),
                'billing_net': float(df_specialist['billing_quarter_net'].sum()),
                'commit_deals': int(len(df_commit)),
                'commit_gross': float(df_commit['billing_quarter_gross'].sum()),
                'commit_net': float(df_commit['billing_quarter_net'].sum()),
                'upside_deals': int(len(df_upside)),
                'upside_gross': float(df_upside['billing_quarter_gross'].sum()),
                'upside_net': float(df_upside['billing_quarter_net'].sum())
            }
            print(f"✅ Sales Specialist carregado: {forecast_specialist['deals_count']} deals, ${forecast_specialist['billing_gross']:,.2f}")
    except Exception as e:
        print(f"⚠️  Erro ao carregar Sales Specialist do BigQuery: {e}")
    
    # Combina Closed + Forecast
    combined_quarter_stats = {
        'quarter': current_quarter,
        'closed': {
            'gross': closed_quarter_stats['gross'],
            'net': closed_quarter_stats['net'],
            'deals_count': closed_quarter_stats['deals_count']
        },
        'forecast_specialist': {
            'enabled': forecast_specialist['enabled'],
            'gross': forecast_specialist['billing_gross'],
            'net': forecast_specialist['billing_net'],
            'deals_count': forecast_specialist['deals_count'],
            'commit_gross': forecast_specialist['commit_gross'],
            'commit_net': forecast_specialist['commit_net'],
            'commit_deals': forecast_specialist['commit_deals'],
            'upside_gross': forecast_specialist['upside_gross'],
            'upside_net': forecast_specialist['upside_net'],
            'upside_deals': forecast_specialist['upside_deals'],
            'by_fiscal_q': {}  # TODO: Breakdown por quarter (próxima iteração)
        },
        'total_projected': {
            'gross': closed_quarter_stats['gross'] + forecast_specialist['billing_gross'],
            'net': closed_quarter_stats['net'] + forecast_specialist['billing_net'],
            'deals_count': closed_quarter_stats['deals_count'] + forecast_specialist['deals_count']
        }
    }
    
    # Ciclo de vendas
    df_won['cycle_days'] = df_won.apply(analyze_cycle_time, axis=1)
    df_lost['cycle_days'] = df_lost.apply(analyze_cycle_time, axis=1)
    
    avg_cycle_won = df_won['cycle_days'].mean() if len(df_won) > 0 else 0
    avg_cycle_lost = df_lost['cycle_days'].mean() if len(df_lost) > 0 else 0
    
    # Motivos de perda
    df_lost['loss_reason_cat'] = df_lost.apply(extract_loss_reason, axis=1)
    loss_reasons = df_lost['loss_reason_cat'].value_counts().to_dict()
    
    # Win rate por quarter
    win_rate_by_quarter = {}
    if 'Fiscal_Q' in df_closed.columns:
        for quarter in df_closed['Fiscal_Q'].unique():
            if pd.isna(quarter):
                continue
            q_deals = df_closed[df_closed['Fiscal_Q'] == quarter]
            q_won = len(q_deals[q_deals['outcome'] == 'WON'])
            q_total = len(q_deals)
            win_rate_by_quarter[str(quarter)] = {
                'won': q_won,
                'total': q_total,
                'rate': round((q_won / q_total) * 100, 1) if q_total > 0 else 0
            }
    
    # Win rate por seller
    win_rate_by_seller = {}
    if 'Vendedor' in df_closed.columns:
        for seller in df_closed['Vendedor'].unique():
            if pd.isna(seller):
                continue
            s_deals = df_closed[df_closed['Vendedor'] == seller]
            s_won = len(s_deals[s_deals['outcome'] == 'WON'])
            s_total = len(s_deals)
            win_rate_by_seller[str(seller)] = {
                'won': s_won,
                'total': s_total,
                'rate': round((s_won / s_total) * 100, 1) if s_total > 0 else 0,
                'won_value': float(s_deals[s_deals['outcome'] == 'WON']['Gross_num'].sum())
            }
    
    return {
        'total_deals': len(df_closed),
        'won': len(df_won),
        'lost': len(df_lost),
        'win_rate': round((len(df_won) / len(df_closed)) * 100, 1) if len(df_closed) > 0 else 0,
        'total_won_value': float(df_won['Gross_num'].sum()),
        'total_lost_value': float(df_lost['Gross_num'].sum()),
        'avg_cycle_won_days': float(avg_cycle_won) if not pd.isna(avg_cycle_won) else None,
        'avg_cycle_lost_days': float(avg_cycle_lost) if not pd.isna(avg_cycle_lost) else None,
        'loss_reasons': loss_reasons,
        'win_rate_by_quarter': win_rate_by_quarter,
        'win_rate_by_seller': dict(sorted(win_rate_by_seller.items(), key=lambda x: x[1]['won_value'], reverse=True)[:10]),
        
        # TASK 2.4: Fechado no Quarter + Forecast Specialist
        'closed_quarter': combined_quarter_stats
    }

# ========== ENDPOINT PRINCIPAL ==========

@functions_framework.http
def sales_intelligence_engine(request):
    """
    Endpoint principal - Análise COMPLETA
    """
    try:
        if request.method == 'OPTIONS':
            return ('', 204, build_cors_headers())

        request_json = request.get_json(silent=True)
        
        if not request_json:
            return ({'status': 'error', 'error': 'Missing request body'}, 400, build_cors_headers())
        
        source = request_json.get('source', 'payload')
        
        if source == 'bigquery':
            filters = request_json.get('filters', {})
            
            # Buscar dados
            df_pipeline = get_pipeline_data(filters)
            df_closed = get_closed_data(filters)
            
            # ML Predictions (opcional - separado do dashboard normal)
            ml_enabled = filters.get('include_ml', False)
            df_ml_predictions = pd.DataFrame()
            if ml_enabled:
                try:
                    df_ml_predictions = get_ml_predictions(filters)
                    ml_enabled = not df_ml_predictions.empty
                except Exception as e:
                    print(f"⚠️  ML predictions não disponíveis: {e}")
                    ml_enabled = False
            
            # ═══════════════════════════════════════════════════════
            # ANÁLISES COMPLETAS (substitui DashboardCode.gs)
            # ═══════════════════════════════════════════════════════
            
            # Pipeline Analysis (SEM ML - dashboard normal)
            pipeline_analysis = analyze_pipeline_complete(df_pipeline)
            
            # Closed Deals Analysis
            closed_analysis = analyze_closed_complete(df_closed)
            
            # ========== TASK 2.5: CONVERSION RATE ==========
            # Calcula taxa de conversão (win rate)
            conversion_rate_stats = {'conversion_rate': 0, 'win_rate': 0, 'loss_rate': 0}
            if METRICS_CALCULATORS_AVAILABLE:
                try:
                    # Separa ganhas e perdidas do df_closed
                    df_ganhas_calc = df_closed[df_closed['outcome'] == 'WON'].copy()
                    df_perdidas_calc = df_closed[df_closed['outcome'] == 'LOST'].copy()
                    
                    conversion_rate_stats = calculate_conversion_rate(
                        df_pipeline,
                        df_ganhas_calc,
                        df_perdidas_calc,
                        verbose=False
                    )
                except Exception as e:
                    print(f"⚠️  Erro ao calcular conversion rate: {e}")
            
            # Agregações por dimensões (substitui funções removidas)
            seller_profile_analysis = analyze_by_seller_and_profile(df_pipeline)
            quarter_analysis = analyze_by_fiscal_quarter(df_pipeline)
            seller_quarter_analysis = analyze_by_seller_and_quarter(df_pipeline)
            forecast_category_analysis = analyze_by_forecast_category(df_pipeline)
            
            # War Targets (deals críticos)
            war_targets = get_war_targets(df_pipeline, limit=10)

            # Weekly agenda and closed aggregations for dashboard UI
            weekly_agenda = build_weekly_agenda(df_pipeline, limit_per_quarter=25)
            won_agg = build_closed_agg(df_closed, 'WON')
            lost_agg = build_closed_agg(df_closed, 'LOST')

            # Word clouds (risk flags, action labels, win/loss patterns)
            word_clouds = {}
            if METRICS_CALCULATORS_AVAILABLE:
                try:
                    df_won = df_closed[df_closed['outcome'] == 'WON'].copy()
                    df_lost = df_closed[df_closed['outcome'] == 'LOST'].copy()
                    word_clouds = generate_word_clouds(df_pipeline, df_won, df_lost, verbose=False)
                except Exception as e:
                    print(f"⚠️  Erro ao gerar word clouds: {e}")
            
            # ═══════════════════════════════════════════════════════
            # RESPOSTA CONSOLIDADA
            # ═══════════════════════════════════════════════════════
            
            response = {
                'status': 'success',
                'source': 'bigquery',
                'timestamp': datetime.now().isoformat(),
                
                # Summary
                'data_summary': {
                    'pipeline_deals': len(df_pipeline),
                    'closed_deals': len(df_closed),
                    'sellers_analyzed': len(df_pipeline['Vendedor'].unique()) if 'Vendedor' in df_pipeline.columns and not df_pipeline.empty else 0,
                    'ml_enabled': ml_enabled,
                    'predictions_count': len(df_ml_predictions) if ml_enabled else 0
                },
                
                # Core Analysis
                'pipeline_analysis': pipeline_analysis,
                'closed_analysis': closed_analysis,
                
                # TASK 2.5: Conversion Rate (Win Rate)
                'conversion_rate': conversion_rate_stats,
                
                # ML Predictions (se disponível)
                'ml_predictions': {
                    'enabled': ml_enabled,
                    'total_predicted': len(df_ml_predictions) if ml_enabled else 0,
                    'high_risk_deals': int(df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_RISK'].shape[0]) if ml_enabled else 0,
                    'medium_confidence_deals': int(df_ml_predictions[df_ml_predictions['risk_category'] == 'MEDIUM_CONFIDENCE'].shape[0]) if ml_enabled else 0,
                    'high_confidence_deals': int(df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_CONFIDENCE'].shape[0]) if ml_enabled else 0,
                    'top_risks': (
                        df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_RISK']
                        .nlargest(10, 'gross_value')
                        .to_dict(orient='records')
                    ) if ml_enabled and len(df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_RISK']) > 0 else [],
                    'top_opportunities': (
                        df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_CONFIDENCE']
                        .nlargest(10, 'gross_value')
                        .to_dict(orient='records')
                    ) if ml_enabled and len(df_ml_predictions[df_ml_predictions['risk_category'] == 'HIGH_CONFIDENCE']) > 0 else []
                } if ml_enabled else {'enabled': False},
                
                # Agregações (substitui DashboardCode.gs)
                'aggregations': {
                    'by_seller_profile': seller_profile_analysis.get('by_seller_profile', []),
                    'by_quarter': quarter_analysis.get('by_quarter', []),
                    'by_seller_quarter': seller_quarter_analysis.get('by_seller_quarter', []),
                    'by_forecast_category': forecast_category_analysis.get('by_forecast_category', []),
                    'war_targets': war_targets.get('war_targets', [])
                },

                # Dashboard helpers
                'weekly_agenda': weekly_agenda,
                'won_agg': won_agg,
                'lost_agg': lost_agg,
                'word_clouds': word_clouds,
                
                # Filtros aplicados
                'filters_applied': filters
            }
            
            return (response, 200, build_cors_headers())
        
        else:
            # Fallback: modo payload (OBSOLETO)
            return ({
                'status': 'error',
                'error': 'Payload mode is deprecated. Use source=bigquery',
                'timestamp': datetime.now().isoformat()
            }, 400, build_cors_headers())
    
    except Exception as e:
        return ({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }, 500, build_cors_headers())


# ========== NOVO ENDPOINT ML (6 MODELOS) ==========

@functions_framework.http
def ml_intelligence(request):
    """
    Endpoint ML - Retorna predições dos 6 modelos de Machine Learning
    
    Query params:
    - model: 'all' (default) ou específico ('previsao_ciclo', 'classificador_perda', etc)
    - seller: filtrar por vendedor
    - quarter: filtrar por quarter fiscal
    - Outros filtros específicos por modelo
    """
    try:
        if request.method == 'OPTIONS':
            return ('', 204, build_cors_headers())

        request_json = request.get_json(silent=True)
        
        if not request_json:
            # Suporta GET com query params
            model = request.args.get('model', 'all')
            filters = {
                'seller': request.args.get('seller'),
                'quarter': request.args.get('quarter'),
                'minValue': request.args.get('minValue'),
                'priorityLevel': request.args.get('priorityLevel'),
                'urgencia': request.args.get('urgencia'),
                'causa': request.args.get('causa'),
                'riskLevel': request.args.get('riskLevel')
            }
            # Remover Nones
            filters = {k: v for k, v in filters.items() if v is not None}
        else:
            model = request_json.get('model', 'all')
            filters = request_json.get('filters', {})
        
        response = {
            'status': 'success',
            'timestamp': datetime.now().isoformat(),
            'model': model,
            'filters_applied': filters
        }
        
        # Buscar dados conforme modelo solicitado
        if model == 'all' or model == 'previsao_ciclo':
            df_ciclo = get_previsao_ciclo(filters)
            response['previsao_ciclo'] = {
                'enabled': not df_ciclo.empty,
                'total_deals': len(df_ciclo),
                'deals': df_ciclo.to_dict(orient='records') if not df_ciclo.empty else [],
                'summary': {
                    'avg_dias_previstos': float(df_ciclo['dias_previstos'].mean()) if not df_ciclo.empty else 0,
                    'rapidos': int(df_ciclo[df_ciclo['velocidade_prevista'] == 'RÁPIDO'].shape[0]) if not df_ciclo.empty else 0,
                    'normais': int(df_ciclo[df_ciclo['velocidade_prevista'] == 'NORMAL'].shape[0]) if not df_ciclo.empty else 0,
                    'lentos': int(df_ciclo[df_ciclo['velocidade_prevista'] == 'LENTO'].shape[0]) if not df_ciclo.empty else 0,
                    'muito_lentos': int(df_ciclo[df_ciclo['velocidade_prevista'] == 'MUITO_LENTO'].shape[0]) if not df_ciclo.empty else 0
                } if not df_ciclo.empty else {}
            }
        
        if model == 'all' or model == 'classificador_perda':
            df_perda = get_classificador_perda(filters)
            response['classificador_perda'] = {
                'enabled': not df_perda.empty,
                'total_deals': len(df_perda),
                'deals': df_perda.to_dict(orient='records') if not df_perda.empty else [],
                'summary': {
                    'preco': int(df_perda[df_perda['causa_prevista'] == 'PRECO'].shape[0]) if not df_perda.empty else 0,
                    'timing': int(df_perda[df_perda['causa_prevista'] == 'TIMING'].shape[0]) if not df_perda.empty else 0,
                    'concorrente': int(df_perda[df_perda['causa_prevista'] == 'CONCORRENTE'].shape[0]) if not df_perda.empty else 0,
                    'budget': int(df_perda[df_perda['causa_prevista'] == 'BUDGET'].shape[0]) if not df_perda.empty else 0,
                    'fit': int(df_perda[df_perda['causa_prevista'] == 'FIT'].shape[0]) if not df_perda.empty else 0
                } if not df_perda.empty else {}
            }
        
        if model == 'all' or model == 'risco_abandono':
            df_risco = get_risco_abandono(filters)
            response['risco_abandono'] = {
                'enabled': not df_risco.empty,
                'total_deals': len(df_risco),
                'deals': df_risco.to_dict(orient='records') if not df_risco.empty else [],
                'summary': {
                    'alto_risco': int(df_risco[df_risco['nivel_risco'] == 'ALTO'].shape[0]) if not df_risco.empty else 0,
                    'medio_risco': int(df_risco[df_risco['nivel_risco'] == 'MÉDIO'].shape[0]) if not df_risco.empty else 0,
                    'baixo_risco': int(df_risco[df_risco['nivel_risco'] == 'BAIXO'].shape[0]) if not df_risco.empty else 0,
                    'avg_prob_abandono': float(df_risco['prob_abandono'].mean()) if not df_risco.empty else 0
                } if not df_risco.empty else {}
            }
        
        if model == 'all' or model == 'performance_vendedor':
            df_perf = get_performance_vendedor(filters)
            response['performance_vendedor'] = {
                'enabled': not df_perf.empty,
                'total_sellers': len(df_perf),
                'sellers': df_perf.to_dict(orient='records') if not df_perf.empty else [],
                'summary': {
                    'sobre_performando': int(df_perf[df_perf['classificacao'] == 'SOBRE_PERFORMANDO'].shape[0]) if not df_perf.empty else 0,
                    'performando_bem': int(df_perf[df_perf['classificacao'] == 'PERFORMANDO_BEM'].shape[0]) if not df_perf.empty else 0,
                    'na_meta': int(df_perf[df_perf['classificacao'] == 'NA_META'].shape[0]) if not df_perf.empty else 0,
                    'abaixo_meta': int(df_perf[df_perf['classificacao'] == 'ABAIXO_META'].shape[0]) if not df_perf.empty else 0,
                    'sub_performando': int(df_perf[df_perf['classificacao'] == 'SUB_PERFORMANDO'].shape[0]) if not df_perf.empty else 0,
                    'avg_win_rate': float(df_perf['win_rate_previsto'].mean()) if not df_perf.empty else 0
                } if not df_perf.empty else {}
            }
        
        if model == 'all' or model == 'prioridade_deals':
            df_prio = get_prioridade_deals(filters)
            response['prioridade_deals'] = {
                'enabled': not df_prio.empty,
                'total_deals': len(df_prio),
                'deals': df_prio.to_dict(orient='records') if not df_prio.empty else [],
                'summary': {
                    'critico': int(df_prio[df_prio['priority_level'] == 'CRÍTICO'].shape[0]) if not df_prio.empty else 0,
                    'alto': int(df_prio[df_prio['priority_level'] == 'ALTO'].shape[0]) if not df_prio.empty else 0,
                    'medio': int(df_prio[df_prio['priority_level'] == 'MÉDIO'].shape[0]) if not df_prio.empty else 0,
                    'baixo': int(df_prio[df_prio['priority_level'] == 'BAIXO'].shape[0]) if not df_prio.empty else 0,
                    'avg_priority_score': float(df_prio['priority_score'].mean()) if not df_prio.empty else 0
                } if not df_prio.empty else {}
            }
        
        if model == 'all' or model == 'proxima_acao':
            df_acao = get_proxima_acao(filters)
            response['proxima_acao'] = {
                'enabled': not df_acao.empty,
                'total_deals': len(df_acao),
                'deals': df_acao.to_dict(orient='records') if not df_acao.empty else [],
                'summary': {
                    'urgentes': int(df_acao[df_acao['urgencia'] == 'ALTA'].shape[0]) if not df_acao.empty else 0,
                    'medias': int(df_acao[df_acao['urgencia'] == 'MÉDIA'].shape[0]) if not df_acao.empty else 0,
                    'baixas': int(df_acao[df_acao['urgencia'] == 'BAIXA'].shape[0]) if not df_acao.empty else 0,
                    'top_categorias': df_acao['categoria_acao'].value_counts().head(5).to_dict() if not df_acao.empty else {}
                } if not df_acao.empty else {}
            }
        
        return (response, 200, build_cors_headers())
    
    except Exception as e:
        return ({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }, 500, build_cors_headers())
