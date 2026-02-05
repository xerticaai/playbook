#!/usr/bin/env python3
"""
Sales Intelligence - Initial Data Loader
Carrega os CSVs iniciais para o BigQuery (Pipeline, Ganhas, Perdidas)
"""

import pandas as pd
from google.cloud import bigquery
from datetime import datetime
import sys

# ========== CONFIGURAÇÃO ==========
PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"
LOCATION = "us-central1"

# Mapeamento de colunas CSV -> BigQuery (mantém nomes em português no CSV)
COLUMN_MAPPING_PIPELINE = {
    'Run ID': 'run_id',
    'Oportunidade': 'oportunidade',
    'Conta': 'conta',
    'Perfil': 'perfil',
    'Produtos': 'produtos',
    'Vendedor': 'vendedor',
    'Gross': 'gross',
    'Net': 'net',
    'Fase Atual': 'fase_atual',
    'Forecast SF': 'forecast_sf',
    'Fiscal Q': 'fiscal_q',
    'Data Prevista': 'data_prevista',
    'Ciclo (dias)': 'ciclo_dias',
    'Dias Funil': 'dias_funil',
    'Atividades': 'atividades',
    'Atividades (Peso)': 'atividades_peso',
    'Mix Atividades': 'mix_atividades',
    'Idle (Dias)': 'idle_dias',
    'Qualidade Engajamento': 'qualidade_engajamento',
    'Forecast IA': 'forecast_ia',
    'Confiança (%)': 'confianca_pct',
    'Motivo Confiança': 'motivo_confianca',
    'MEDDIC Score': 'meddic_score',
    'MEDDIC Gaps': 'meddic_gaps',
    'MEDDIC Evidências': 'meddic_evidencias',
    'BANT Score': 'bant_score',
    'BANT Gaps': 'bant_gaps',
    'BANT Evidências': 'bant_evidencias',
    'Justificativa IA': 'justificativa_ia',
    'Regras Aplicadas': 'regras_aplicadas',
    'Incoerência Detectada': 'incoerencia_detectada',
    'Perguntas de Auditoria IA': 'perguntas_auditoria_ia',
    'Flags de Risco': 'flags_risco',
    'Gaps Identificados': 'gaps_identificados',
    'Cód Ação': 'cod_acao',
    'Ação Sugerida': 'acao_sugerida',
    'Risco Principal': 'risco_principal',
    '# Total Mudanças': 'total_mudancas',
    '# Mudanças Críticas': 'mudancas_criticas',
    'Mudanças Close Date': 'mudancas_close_date',
    'Mudanças Stage': 'mudancas_stage',
    'Mudanças Valor': 'mudancas_valor',
    '🚨 Anomalias Detectadas': 'anomalias_detectadas',
    'Velocity Predição': 'velocity_predicao',
    'Velocity Detalhes': 'velocity_detalhes',
    'Território Correto?': 'territorio_correto',
    'Vendedor Designado': 'vendedor_designado',
    'Estado/Cidade Detectado': 'estado_cidade_detectado',
    'Fonte Detecção': 'fonte_deteccao',
    'Calendário Faturação': 'calendario_faturacao',
    'Valor Reconhecido Q1': 'valor_reconhecido_q1',
    'Valor Reconhecido Q2': 'valor_reconhecido_q2',
    'Valor Reconhecido Q3': 'valor_reconhecido_q3',
    'Valor Reconhecido Q4': 'valor_reconhecido_q4',
    '🕐 Última Atualização': 'ultima_atualizacao',
}

def clean_date(date_str):
    """Converte string de data para formato DATE do BigQuery"""
    if pd.isna(date_str) or date_str == '':
        return None
    try:
        # Tenta formato DD/MM/YYYY
        return pd.to_datetime(date_str, format='%d/%m/%Y').date()
    except:
        try:
            # Tenta parse automático
            return pd.to_datetime(date_str).date()
        except:
            return None

def clean_timestamp(ts_str):
    """Converte string de timestamp para formato TIMESTAMP do BigQuery"""
    if pd.isna(ts_str) or ts_str == '':
        return None
    try:
        return pd.to_datetime(ts_str)
    except:
        return None

def load_pipeline_data(csv_path: str, client: bigquery.Client):
    """Carrega dados do pipeline para o BigQuery"""
    print(f"\n📊 Carregando pipeline de: {csv_path}")
    
    # Ler CSV
    df = pd.read_csv(csv_path)
    print(f"   Linhas lidas: {len(df)}")
    
    # Renomear colunas
    df = df.rename(columns=COLUMN_MAPPING_PIPELINE)
    
    # Limpar e converter tipos
    if 'data_prevista' in df.columns:
        df['data_prevista'] = df['data_prevista'].apply(clean_date)
    
    if 'ultima_atualizacao' in df.columns:
        df['ultima_atualizacao'] = df['ultima_atualizacao'].apply(clean_timestamp)
    
    # Adicionar coluna de carga
    df['data_carga'] = datetime.utcnow()
    
    # Truncar strings muito longas para evitar erros
    string_columns = df.select_dtypes(include=['object']).columns
    for col in string_columns:
        df[col] = df[col].astype(str).str[:10000]  # Limitar a 10K chars
    
    # Carregar para BigQuery
    table_id = f"{PROJECT_ID}.{DATASET_ID}.pipeline"
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE",  # Substitui dados existentes
        schema_update_options=[
            bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION
        ]
    )
    
    job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
    job.result()  # Aguarda conclusão
    
    print(f"   ✅ {len(df)} linhas carregadas em {table_id}")

def load_closed_data(csv_path: str, outcome: str, client: bigquery.Client):
    """Carrega dados de deals fechados (ganhos ou perdidos) para o BigQuery"""
    print(f"\n📊 Carregando {outcome} de: {csv_path}")
    
    # Ler CSV
    df = pd.read_csv(csv_path)
    print(f"   Linhas lidas: {len(df)}")
    
    # Mapear colunas relevantes (subset do pipeline)
    column_subset = {
        'Run ID': 'run_id',
        'Oportunidade': 'oportunidade',
        'Conta': 'conta',
        'Perfil': 'perfil',
        'Produtos': 'produtos',
        'Vendedor': 'vendedor',
        'Gross': 'gross',
        'Net': 'net',
        'Fiscal Q': 'fiscal_q',
        'Ciclo (dias)': 'ciclo_dias',
        'Atividades': 'atividades',
        'Atividades (Peso)': 'atividades_peso',
        'Mix Atividades': 'mix_atividades',
        'MEDDIC Score': 'meddic_score',
        'MEDDIC Gaps': 'meddic_gaps',
        'BANT Score': 'bant_score',
        'BANT Gaps': 'bant_gaps',
        '🕐 Última Atualização': 'ultima_atualizacao',
    }
    
    # Adicionar colunas específicas de deals fechados se existirem
    if 'Data de Fechamento' in df.columns:
        column_subset['Data de Fechamento'] = 'data_fechamento'
    if 'Causa Raiz' in df.columns:
        column_subset['Causa Raiz'] = 'causa_raiz'
    if '📝 Resumo Análise' in df.columns:
        column_subset['📝 Resumo Análise'] = 'resumo_analise'
    if '💡 Lições Aprendidas' in df.columns:
        column_subset['💡 Lições Aprendidas'] = 'licoes_aprendidas'
    if 'Competidor' in df.columns:
        column_subset['Competidor'] = 'competidor'
    
    # Renomear apenas colunas que existem
    existing_columns = {k: v for k, v in column_subset.items() if k in df.columns}
    df = df.rename(columns=existing_columns)
    
    # Adicionar coluna de outcome
    df['outcome'] = outcome
    
    # Limpar e converter tipos
    if 'data_fechamento' in df.columns:
        df['data_fechamento'] = df['data_fechamento'].apply(clean_date)
    
    if 'ultima_atualizacao' in df.columns:
        df['ultima_atualizacao'] = df['ultima_atualizacao'].apply(clean_timestamp)
    
    # Adicionar coluna de carga
    df['data_carga'] = datetime.utcnow()
    
    # Truncar strings muito longas
    string_columns = df.select_dtypes(include=['object']).columns
    for col in string_columns:
        df[col] = df[col].astype(str).str[:10000]
    
    # Selecionar apenas colunas do schema
    schema_columns = [
        'run_id', 'oportunidade', 'conta', 'perfil', 'produtos', 'vendedor',
        'gross', 'net', 'outcome', 'fiscal_q', 'data_fechamento', 'ciclo_dias',
        'atividades', 'atividades_peso', 'mix_atividades', 'causa_raiz',
        'resumo_analise', 'licoes_aprendidas', 'competidor', 'meddic_score',
        'meddic_gaps', 'bant_score', 'bant_gaps', 'ultima_atualizacao', 'data_carga'
    ]
    df = df[[col for col in schema_columns if col in df.columns]]
    
    # Carregar para BigQuery
    table_id = f"{PROJECT_ID}.{DATASET_ID}.closed_deals"
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_APPEND",  # Adiciona aos dados existentes
        schema_update_options=[
            bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION
        ]
    )
    
    job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
    job.result()
    
    print(f"   ✅ {len(df)} linhas carregadas em {table_id}")

def main():
    """Função principal"""
    print("=" * 60)
    print("  Sales Intelligence - Initial Data Loader")
    print("=" * 60)
    
    # Inicializar cliente BigQuery
    print(f"\n🔧 Conectando ao BigQuery...")
    print(f"   Project: {PROJECT_ID}")
    print(f"   Dataset: {DATASET_ID}")
    
    client = bigquery.Client(project=PROJECT_ID, location=LOCATION)
    
    try:
        # Carregar Pipeline
        load_pipeline_data(
            "../Forecast 2026 - Base  - 🎯 Análise Forecast IA (1).csv",
            client
        )
        
        # Limpar tabela closed_deals antes de carregar (primeira vez)
        print(f"\n🗑️  Limpando tabela closed_deals...")
        query = f"DELETE FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals` WHERE TRUE"
        client.query(query).result()
        print("   ✅ Tabela limpa")
        
        # Carregar Ganhas
        load_closed_data(
            "../Forecast 2026 - Base  - 📈 Análise Ganhas.csv",
            "WON",
            client
        )
        
        # Carregar Perdidas
        load_closed_data(
            "../Forecast 2026 - Base  - 📉 Análise Perdidas.csv",
            "LOST",
            client
        )
        
        # Verificar resultado
        print("\n" + "=" * 60)
        print("  ✅ Carga Completa!")
        print("=" * 60)
        
        print("\n📊 Verificando dados carregados...")
        
        # Query de verificação
        query = f"""
        SELECT 
            'pipeline' as tabela,
            COUNT(*) as total_linhas,
            MAX(data_carga) as ultima_carga
        FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
        
        UNION ALL
        
        SELECT 
            'closed_deals' as tabela,
            COUNT(*) as total_linhas,
            MAX(data_carga) as ultima_carga
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals`
        
        UNION ALL
        
        SELECT 
            CONCAT('closed_deals (', outcome, ')') as tabela,
            COUNT(*) as total_linhas,
            MAX(data_carga) as ultima_carga
        FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals`
        GROUP BY outcome
        """
        
        results = client.query(query).result()
        print("\nTabela               | Total Linhas | Última Carga")
        print("-" * 60)
        for row in results:
            print(f"{row.tabela:20} | {row.total_linhas:12} | {row.ultima_carga}")
        
        print("\n✅ Dados prontos para análise no BigQuery!")
        print("\nPróximos passos:")
        print("1. Modifique o Apps Script para carregar dados via BigQuery API")
        print("2. Atualize a Cloud Function para consultar o BigQuery")
        print("3. Crie modelos de ML com BigQuery ML")
        
    except Exception as e:
        print(f"\n❌ Erro durante a carga: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
