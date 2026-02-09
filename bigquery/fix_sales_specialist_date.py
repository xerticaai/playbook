#!/usr/bin/env python3
"""
Script para corrigir o campo closed_date na tabela sales_specialist.
O campo está sempre NULL, mas deveria conter as datas da planilha.
"""

import sys
sys.path.insert(0, '/workspaces/playbook/bigquery')

from google.cloud import bigquery
from google.oauth2 import service_account
import os

PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"

def fix_sales_specialist_dates():
    """
    Verifica e corrige o campo closed_date na tabela sales_specialist.
    """
    client = bigquery.Client(project=PROJECT_ID)
    
    # 1. Verificar estrutura atual
    print("\n1. Verificando estrutura atual da tabela...")
    query = f"""
    SELECT 
      column_name,
      data_type
    FROM `{PROJECT_ID}.{DATASET_ID}.INFORMATION_SCHEMA.COLUMNS`
    WHERE table_name = 'sales_specialist'
    ORDER BY ordinal_position
    """
    
    schema_df = client.query(query).to_dataframe()
    print(f"\n✓ Colunas encontradas: {len(schema_df)}")
    print(schema_df[['column_name', 'data_type']].to_string(index=False))
    
    # 2. Verificar dados atuais
    print("\n2. Verificando dados atuais...")
    query = f"""
    SELECT 
      COUNT(*) as total_records,
      COUNTIF(closed_date IS NOT NULL) as with_date,
      COUNTIF(Billing_Quarter IS NOT NULL) as with_billing_quarter
    FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
    """
    
    stats = client.query(query).to_dataframe()
    print("\n✓ Estatísticas:")
    print(stats.to_string(index=False))
    
    # 3. Verificar sample de dados
    print("\n3. Sample de dados (primeiros 3 registros)...")
    query = f"""
    SELECT 
      opportunity_name,
      vendedor,
      closed_date,
      booking_total_gross,
      Status
    FROM `{PROJECT_ID}.{DATASET_ID}.sales_specialist`
    LIMIT 3
    """
    
    sample = client.query(query).to_dataframe()
    print("\n✓ Sample:")
    print(sample.to_string(index=False))
    
    print("\n" + "="*80)
    print("DIAGNÓSTICO:")
    print("="*80)
    
    if stats['with_date'].values[0] == 0:
        print("❌ PROBLEMA: Campo closed_date está sempre NULL")
        print("✓ SOLUÇÃO: A planilha 'Análise Sales Specialist' precisa ser re-sincronizada")
        print("           com a coluna 'Closed Date' corretamente mapeada.")
        print("\nPara corrigir:")
        print("1. Abrir o Google Sheets com os dados")
        print("2. Verificar se a coluna 'Closed Date' existe e tem dados")
        print("3. Executar o sync do Apps Script: BigQuerySync > syncAllToBigQuery()")
    else:
        print(f"✓ OK: Campo closed_date tem {stats['with_date'].values[0]} registros preenchidos")

if __name__ == "__main__":
    fix_sales_specialist_dates()
