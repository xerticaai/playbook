#!/usr/bin/env python3
"""
Enriquece closed_deals com análises de ganhas e perdidas.
Separa em 2 tabelas: closed_deals_won e closed_deals_lost.

USO:
    python3 enrich_closed_deals.py
"""

import pandas as pd
from google.cloud import bigquery
import sys

PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"

def load_csv_ganhas():
    """Carrega CSV de análise de ganhas"""
    print("📊 Carregando CSV de ganhas...")
    
    df = pd.read_csv("../Forecast 2026 - Base  - 📈 Análise Ganhas.csv", encoding='utf-8')
    
    print(f"   ✅ {len(df)} deals ganhos carregados")
    print(f"   📋 Colunas: {len(df.columns)}")
    
    # Adiciona outcome
    df['outcome'] = 'WON'
    
    return df

def load_csv_perdidas():
    """Carrega CSV de análise de perdidas"""
    print("📊 Carregando CSV de perdidas...")
    
    df = pd.read_csv("../Forecast 2026 - Base  - 📉 Análise Perdidas.csv", encoding='utf-8')
    
    print(f"   ✅ {len(df)} deals perdidos carregados")
    print(f"   📋 Colunas: {len(df.columns)}")
    
    # Adiciona outcome
    df['outcome'] = 'LOST'
    
    return df

def standardize_columns(df, outcome='WON'):
    """Padroniza nomes de colunas"""
    
    # Renomear colunas comuns
    rename_map = {
        'Run ID': 'Run_ID',
        'Perfil Cliente': 'Perfil_Cliente',
        'Fiscal Q': 'Fiscal_Q',
        'Data Fechamento': 'Data_Fechamento',
        'Ciclo (dias)': 'Ciclo_dias',
        '📝 Resumo Análise': 'Resumo_Analise',
        '🎯 Causa Raiz': 'Causa_Raiz',
        'Tipo Resultado': 'Tipo_Resultado',
        'Qualidade Engajamento': 'Qualidade_Engajamento',
        'Gestão Oportunidade': 'Gestao_Oportunidade',
        '💡 Lições Aprendidas': 'Licoes_Aprendidas',
        '# Atividades': 'Atividades',
        'Ativ. 7d': 'Ativ_7d',
        'Ativ. 30d': 'Ativ_30d',
        'Distribuição Tipos': 'Distribuicao_Tipos',
        'Período Pico': 'Periodo_Pico',
        'Cadência Média (dias)': 'Cadencia_Media_dias',
        '# Total Mudanças': 'Total_Mudancas',
        '# Mudanças Críticas': 'Mudancas_Criticas',
        'Mudanças Close Date': 'Mudancas_Close_Date',
        'Mudanças Stage': 'Mudancas_Stage',
        'Mudanças Valor': 'Mudancas_Valor',
        'Campos + Alterados': 'Campos_Alterados',
        'Padrão Mudanças': 'Padrao_Mudancas',
        'Freq. Mudanças': 'Freq_Mudancas',
        '# Editores': 'Editores',
        '🏷️ Labels': 'Labels',
        '🕐 Última Atualização': 'Ultima_Atualizacao',
        'Família Produto': 'Familia_Produto',
        'Portfólio': 'Portfolio'
    }
    
    # Renomear específicos de ganhas
    if outcome == 'WON':
        rename_map.update({
            '✨ Fatores Sucesso': 'Fatores_Sucesso'
        })
    
    # Renomear específicos de perdidas
    if outcome == 'LOST':
        rename_map.update({
            '⚠️ Causas Secundárias': 'Causas_Secundarias',
            'Evitável?': 'Evitavel',
            '🚨 Sinais Alerta': 'Sinais_Alerta',
            'Momento Crítico': 'Momento_Critico'
        })
    
    df = df.rename(columns=rename_map)
    
    return df

def upload_to_bigquery(df, table_name):
    """Upload DataFrame para BigQuery"""
    print(f"\n📤 Uploading para {table_name}...")
    
    client = bigquery.Client(project=PROJECT_ID)
    table_id = f"{PROJECT_ID}.{DATASET_ID}.{table_name}"
    
    # Configuração de job
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE",  # Sobrescreve
        autodetect=True,  # Auto-detecta schema
        source_format=bigquery.SourceFormat.CSV
    )
    
    # Upload
    job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
    job.result()  # Wait for completion
    
    # Verificar
    table = client.get_table(table_id)
    print(f"   ✅ {table.num_rows} linhas carregadas")
    print(f"   📊 {len(table.schema)} colunas")
    
    return table

def main():
    print("=" * 80)
    print("🔄 ENRIQUECIMENTO DE CLOSED DEALS")
    print("=" * 80)
    print()
    
    # 1. Carregar CSVs
    df_ganhas = load_csv_ganhas()
    df_perdidas = load_csv_perdidas()
    
    print()
    
    # 2. Padronizar colunas
    print("🔧 Padronizando colunas...")
    df_ganhas = standardize_columns(df_ganhas, outcome='WON')
    df_perdidas = standardize_columns(df_perdidas, outcome='LOST')
    print("   ✅ Colunas padronizadas")
    
    print()
    
    # 3. Ver sample de campos importantes
    print("📋 SAMPLE DE CAMPOS IMPORTANTES (Ganhas):")
    print(f"   - Causa_Raiz: {df_ganhas['Causa_Raiz'].iloc[0][:80]}...")
    if 'Fatores_Sucesso' in df_ganhas.columns:
        print(f"   - Fatores_Sucesso: {df_ganhas['Fatores_Sucesso'].iloc[0][:80]}...")
    print(f"   - Tipo_Resultado: {df_ganhas['Tipo_Resultado'].iloc[0]}")
    print(f"   - Qualidade_Engajamento: {df_ganhas['Qualidade_Engajamento'].iloc[0]}")
    print(f"   - Atividades: {df_ganhas['Atividades'].iloc[0]}")
    print(f"   - Ciclo_dias: {df_ganhas['Ciclo_dias'].iloc[0]}")
    
    print()
    
    print("📋 SAMPLE DE CAMPOS IMPORTANTES (Perdidas):")
    print(f"   - Causa_Raiz: {df_perdidas['Causa_Raiz'].iloc[0][:80]}...")
    if 'Causas_Secundarias' in df_perdidas.columns:
        print(f"   - Causas_Secundarias: {df_perdidas['Causas_Secundarias'].iloc[0][:80]}..." if pd.notna(df_perdidas['Causas_Secundarias'].iloc[0]) else "   - Causas_Secundarias: (empty)")
    if 'Evitavel' in df_perdidas.columns:
        print(f"   - Evitavel: {df_perdidas['Evitavel'].iloc[0]}")
    print(f"   - Tipo_Resultado: {df_perdidas['Tipo_Resultado'].iloc[0]}")
    print(f"   - Atividades: {df_perdidas['Atividades'].iloc[0]}")
    print(f"   - Ciclo_dias: {df_perdidas['Ciclo_dias'].iloc[0]}")
    
    print()
    
    # 4. Upload para BigQuery
    table_won = upload_to_bigquery(df_ganhas, "closed_deals_won")
    table_lost = upload_to_bigquery(df_perdidas, "closed_deals_lost")
    
    print()
    print("=" * 80)
    print("🎉 ENRIQUECIMENTO COMPLETO!")
    print("=" * 80)
    print()
    print("📊 RESUMO:")
    print(f"   ✅ closed_deals_won: {table_won.num_rows} deals, {len(table_won.schema)} campos")
    print(f"   ✅ closed_deals_lost: {table_lost.num_rows} deals, {len(table_lost.schema)} campos")
    print()
    print("🔗 PRÓXIMOS PASSOS:")
    print("   1. Treinar modelos ML com dados enriquecidos")
    print("   2. Atualizar BigQuerySync para salvar em tabelas separadas")
    print("   3. Criar views unificadas se necessário")
    print()
    print("📝 QUERIES DE TESTE:")
    print(f"   bq query 'SELECT Causa_Raiz, COUNT(*) FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won` GROUP BY 1 LIMIT 5'")
    print(f"   bq query 'SELECT Causa_Raiz, COUNT(*) FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost` GROUP BY 1 LIMIT 5'")
    print()

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
