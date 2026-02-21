#!/usr/bin/env python3
"""
Carrega dados dos CSVs exportados do Google Sheets para o BigQuery
"""

import sys
import os
from google.cloud import bigquery
from google.api_core import exceptions
import pandas as pd
from datetime import datetime

PROJECT_ID = 'operaciones-br'
DATASET_ID = 'sales_intelligence'

def load_csv_to_bigquery(csv_path, table_id, outcome=None):
    """
    Carrega CSV para o BigQuery
    
    Args:
        csv_path: Caminho do arquivo CSV
        table_id: ID da tabela (ex: 'pipeline')
        outcome: 'WON' ou 'LOST' para closed_deals (opcional)
    """
    print(f"📂 Lendo {csv_path}...")
    
    # Ler CSV
    try:
        df = pd.read_csv(csv_path, encoding='utf-8')
    except:
        try:
            df = pd.read_csv(csv_path, encoding='latin-1')
        except Exception as e:
            print(f"❌ Erro ao ler CSV: {e}")
            return False
    
    print(f"   • {len(df)} linhas encontradas")
    
    if len(df) == 0:
        print("⚠️ CSV vazio, pulando...")
        return True
    
    # Normalizar nomes de colunas (BigQuery não aceita caracteres especiais)
    import re
    
    normalized_cols = []
    for col in df.columns:
        # Remover emojis e caracteres especiais
        col_clean = re.sub(r'[^\w\s_-]', '', col, flags=re.ASCII)
        # Normalizar espaços e caracteres
        col_clean = col_clean.strip().replace(' ', '_').replace('-', '_')
        # Remover underscores repetidos
        col_clean = re.sub(r'_+', '_', col_clean)
        # Remover underscores no início/fim
        col_clean = col_clean.strip('_')
        # Garantir que não está vazio
        if not col_clean:
            col_clean = f'column_{len(normalized_cols)}'
        normalized_cols.append(col_clean)
    
    df.columns = normalized_cols
    
    print(f"   • Colunas normalizadas: {len(df.columns)}")
    
    # Adicionar metadata
    df['data_carga'] = datetime.now().isoformat()
    
    if outcome:
        df['outcome'] = outcome
        print(f"   • Outcome: {outcome}")
    
    # Limpar dados
    # Converter datas para string ISO
    for col in df.columns:
        if df[col].dtype == 'datetime64[ns]':
            df[col] = df[col].dt.strftime('%Y-%m-%dT%H:%M:%S')
        # Substituir NaN por None
        elif df[col].dtype == 'object':
            df[col] = df[col].where(pd.notna(df[col]), None)
    
    # Conectar ao BigQuery
    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.{table_id}"
    
    # Configurar job
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
        source_format=bigquery.SourceFormat.CSV
    )
    
    # Salvar temporariamente como CSV
    temp_csv = f"/tmp/{table_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    df.to_csv(temp_csv, index=False)
    
    print(f"📤 Carregando para {table_ref}...")
    
    try:
        with open(temp_csv, 'rb') as f:
            job = client.load_table_from_file(f, table_ref, job_config=job_config)
        
        # Aguardar conclusão
        job.result()
        
        # Limpar arquivo temporário
        os.remove(temp_csv)
        
        print(f"✅ {len(df)} linhas carregadas com sucesso")
        return True
        
    except Exception as e:
        print(f"❌ Erro ao carregar: {e}")
        if os.path.exists(temp_csv):
            os.remove(temp_csv)
        return False

def main():
    print("=" * 60)
    print("  Carregando dados dos CSVs para BigQuery")
    print("=" * 60)
    print()
    
    # Caminhos dos CSVs
    base_path = "/workspaces/playbook"
    
    csvs = {
        'pipeline': f"{base_path}/Forecast 2026 - Base  - 🎯 Análise Forecast IA (1).csv",
        'won': f"{base_path}/Forecast 2026 - Base  - 📈 Análise Ganhas.csv",
        'lost': f"{base_path}/Forecast 2026 - Base  - 📉 Análise Perdidas.csv"
    }
    
    # Verificar se arquivos existem
    for name, path in csvs.items():
        if not os.path.exists(path):
            print(f"⚠️ Arquivo não encontrado: {path}")
            return False
    
    success = True
    
    # Carregar pipeline
    print("\n[1/2] Carregando Pipeline...")
    if not load_csv_to_bigquery(csvs['pipeline'], 'pipeline'):
        success = False
    
    # Carregar closed deals (combinar WON + LOST)
    print("\n[2/2] Carregando Closed Deals...")
    
    # Carregar WON
    print("\n  → Carregando WON...")
    df_won = pd.read_csv(csvs['won'])
    
    # Carregar LOST
    print("  → Carregando LOST...")
    df_lost = pd.read_csv(csvs['lost'])
    
    # Normalizar colunas
    import re
    def normalize_columns(df):
        normalized_cols = []
        for col in df.columns:
            col_clean = re.sub(r'[^\w\s_-]', '', col, flags=re.ASCII)
            col_clean = col_clean.strip().replace(' ', '_').replace('-', '_')
            col_clean = re.sub(r'_+', '_', col_clean)
            col_clean = col_clean.strip('_')
            if not col_clean:
                col_clean = f'column_{len(normalized_cols)}'
            normalized_cols.append(col_clean)
        df.columns = normalized_cols
        return df
    
    df_won = normalize_columns(df_won)
    df_lost = normalize_columns(df_lost)
    
    df_won['outcome'] = 'WON'
    df_lost['outcome'] = 'LOST'
    
    # Combinar
    df_closed = pd.concat([df_won, df_lost], ignore_index=True)
    df_closed['data_carga'] = datetime.now().isoformat()
    
    print(f"\n  → Total: {len(df_won)} WON + {len(df_lost)} LOST = {len(df_closed)} deals")
    
    # Salvar temporariamente
    temp_csv = f"/tmp/closed_deals_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    df_closed.to_csv(temp_csv, index=False)
    
    # Carregar
    client = bigquery.Client(project=PROJECT_ID)
    table_ref = f"{PROJECT_ID}.{DATASET_ID}.closed_deals"
    
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
        source_format=bigquery.SourceFormat.CSV
    )
    
    print(f"📤 Carregando para {table_ref}...")
    
    try:
        with open(temp_csv, 'rb') as f:
            job = client.load_table_from_file(f, table_ref, job_config=job_config)
        job.result()
        os.remove(temp_csv)
        print(f"✅ {len(df_closed)} linhas carregadas com sucesso")
    except Exception as e:
        print(f"❌ Erro ao carregar: {e}")
        if os.path.exists(temp_csv):
            os.remove(temp_csv)
        success = False
    
    print()
    print("=" * 60)
    if success:
        print("  ✅ Carga Completa!")
    else:
        print("  ⚠️ Carga concluída com erros")
    print("=" * 60)
    
    return success

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
