#!/usr/bin/env python3
"""
compare_sheets_vs_bigquery.py
Compara diagnóstico extraído do Google Sheets com dados do BigQuery
"""

import json
import sys
from google.cloud import bigquery
from datetime import datetime, timedelta
from typing import Dict, Any
from tabulate import tabulate

# ========================================
# CONFIGURAÇÃO
# ========================================

PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"

TABLES = {
    "pipeline": f"{PROJECT_ID}.{DATASET_ID}.pipeline",
    "won": f"{PROJECT_ID}.{DATASET_ID}.closed_deals_won",
    "lost": f"{PROJECT_ID}.{DATASET_ID}.closed_deals_lost",
    "sales_specialist": f"{PROJECT_ID}.{DATASET_ID}.sales_specialist"
}

# ========================================
# BIGQUERY DIAGNOSTIC
# ========================================

def extract_bigquery_diagnostic(client: bigquery.Client) -> Dict[str, Any]:
    """Extrai diagnóstico do BigQuery"""
    print("🔍 Extraindo diagnóstico do BigQuery...")
    
    diagnostic = {
        "timestamp": datetime.now().isoformat(),
        "source": "BigQuery",
        "tables": {
            "pipeline": extract_bq_pipeline(client),
            "won": extract_bq_won(client),
            "lost": extract_bq_lost(client),
            "sales_specialist": extract_bq_sales_specialist(client)
        },
        "summary": {}
    }
    
    # Calcular totais
    diagnostic["summary"] = {
        "total_records": sum(t["total_records"] for t in diagnostic["tables"].values()),
        "total_gross": sum(t.get("total_gross", 0) for t in diagnostic["tables"].values()),
        "total_net": sum(t.get("total_net", 0) for t in diagnostic["tables"].values()),
        "unique_opportunities": sum(t.get("unique_opportunities", 0) for t in diagnostic["tables"].values())
    }
    
    return diagnostic

def extract_bq_pipeline(client: bigquery.Client) -> Dict[str, Any]:
    """Extrai diagnóstico de Pipeline do BigQuery"""
    query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(Gross), 2) as total_gross,
        ROUND(SUM(Net), 2) as total_net,
        ROUND(AVG(Gross), 2) as avg_gross,
        ROUND(AVG(Net), 2) as avg_net,
        COUNTIF(Fiscal_Q IS NOT NULL AND LENGTH(Fiscal_Q) > 0) as with_fiscal_q,
        COUNTIF(Forecast_IA IS NOT NULL) as with_forecast_ia,
        COUNTIF(MEDDIC_Score IS NOT NULL) as with_meddic,
        COUNTIF(BANT_Score IS NOT NULL) as with_bant,
        COUNTIF(Atividades IS NOT NULL) as with_atividades
    FROM `{TABLES['pipeline']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    result = list(client.query(query).result())[0]
    
    # Fiscal Q distribution
    fiscal_q_query = f"""
    SELECT Fiscal_Q, COUNT(*) as count 
    FROM `{TABLES['pipeline']}` 
    WHERE Fiscal_Q IS NOT NULL 
        AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    GROUP BY Fiscal_Q 
    ORDER BY count DESC
    """
    fiscal_q_dist = {row['Fiscal_Q']: row['count'] for row in client.query(fiscal_q_query).result()}
    
    # Samples
    sample_query = f"""
    SELECT Oportunidade, Gross, Net, Fiscal_Q, Forecast_IA, Vendedor
    FROM `{TABLES['pipeline']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    LIMIT 3
    """
    samples = [dict(row) for row in client.query(sample_query).result()]
    
    total = result['total_records']
    
    return {
        "table_name": TABLES['pipeline'],
        "total_records": total,
        "unique_opportunities": result['unique_opportunities'],
        "unique_vendors": result['unique_vendors'],
        "total_gross": float(result['total_gross'] or 0),
        "total_net": float(result['total_net'] or 0),
        "avg_gross": float(result['avg_gross'] or 0),
        "avg_net": float(result['avg_net'] or 0),
        "fiscal_q_coverage": round((result['with_fiscal_q'] / total * 100), 1) if total > 0 else 0,
        "fiscal_q_distribution": fiscal_q_dist,
        "forecast_ia_coverage": round((result['with_forecast_ia'] / total * 100), 1) if total > 0 else 0,
        "meddic_coverage": round((result['with_meddic'] / total * 100), 1) if total > 0 else 0,
        "bant_coverage": round((result['with_bant'] / total * 100), 1) if total > 0 else 0,
        "atividades_coverage": round((result['with_atividades'] / total * 100), 1) if total > 0 else 0,
        "sample_records": samples
    }

def extract_bq_won(client: bigquery.Client) -> Dict[str, Any]:
    """Extrai diagnóstico de Won do BigQuery"""
    query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(Gross), 2) as total_gross,
        ROUND(SUM(Net), 2) as total_net,
        ROUND(AVG(Gross), 2) as avg_gross,
        COUNTIF(Fiscal_Q IS NOT NULL AND LENGTH(Fiscal_Q) > 0) as with_fiscal_q,
        COUNTIF(Portfolio IS NOT NULL AND LENGTH(Portfolio) > 0) as with_portfolio,
        COUNTIF(Segmento IS NOT NULL AND LENGTH(Segmento) > 0) as with_segmento,
        COUNTIF(Familia_Produto IS NOT NULL AND LENGTH(Familia_Produto) > 0) as with_familia,
        COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as with_resumo,
        COUNTIF(Causa_Raiz IS NOT NULL AND LENGTH(Causa_Raiz) > 0) as with_causa_raiz,
        COUNTIF(Fatores_Sucesso IS NOT NULL AND LENGTH(Fatores_Sucesso) > 0) as with_fatores,
        COUNTIF(Tipo_Resultado IS NOT NULL AND LENGTH(Tipo_Resultado) > 0) as with_tipo_resultado,
        COUNTIF(Qualidade_Engajamento IS NOT NULL AND LENGTH(Qualidade_Engajamento) > 0) as with_qualidade_eng,
        COUNTIF(Gestao_Oportunidade IS NOT NULL AND LENGTH(Gestao_Oportunidade) > 0) as with_gestao_opp
    FROM `{TABLES['won']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    result = list(client.query(query).result())[0]
    total = result['total_records']
    
    # Fiscal Q distribution
    fiscal_q_query = f"""
    SELECT Fiscal_Q, COUNT(*) as count 
    FROM `{TABLES['won']}` 
    WHERE Fiscal_Q IS NOT NULL 
        AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    GROUP BY Fiscal_Q 
    ORDER BY count DESC
    """
    fiscal_q_dist = {row['Fiscal_Q']: row['count'] for row in client.query(fiscal_q_query).result()}
    
    # Samples
    sample_query = f"""
    SELECT Oportunidade, Gross, Net, Fiscal_Q, Portfolio, Segmento, Tipo_Resultado, Vendedor
    FROM `{TABLES['won']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    LIMIT 3
    """
    samples = [dict(row) for row in client.query(sample_query).result()]
    
    return {
        "table_name": TABLES['won'],
        "total_records": total,
        "unique_opportunities": result['unique_opportunities'],
        "unique_vendors": result['unique_vendors'],
        "total_gross": float(result['total_gross'] or 0),
        "total_net": float(result['total_net'] or 0),
        "avg_gross": float(result['avg_gross'] or 0),
        "fiscal_q_coverage": round((result['with_fiscal_q'] / total * 100), 1) if total > 0 else 0,
        "fiscal_q_distribution": fiscal_q_dist,
        "portfolio_coverage": round((result['with_portfolio'] / total * 100), 1) if total > 0 else 0,
        "segmento_coverage": round((result['with_segmento'] / total * 100), 1) if total > 0 else 0,
        "familia_coverage": round((result['with_familia'] / total * 100), 1) if total > 0 else 0,
        "resumo_coverage": round((result['with_resumo'] / total * 100), 1) if total > 0 else 0,
        "causa_raiz_coverage": round((result['with_causa_raiz'] / total * 100), 1) if total > 0 else 0,
        "fatores_sucesso_coverage": round((result['with_fatores'] / total * 100), 1) if total > 0 else 0,
        "tipo_resultado_coverage": round((result['with_tipo_resultado'] / total * 100), 1) if total > 0 else 0,
        "qualidade_eng_coverage": round((result['with_qualidade_eng'] / total * 100), 1) if total > 0 else 0,
        "gestao_opp_coverage": round((result['with_gestao_opp'] / total * 100), 1) if total > 0 else 0,
        "sample_records": samples
    }

def extract_bq_lost(client: bigquery.Client) -> Dict[str, Any]:
    """Extrai diagnóstico de Lost do BigQuery"""
    query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(Gross), 2) as total_gross,
        ROUND(SUM(Net), 2) as total_net,
        ROUND(AVG(Gross), 2) as avg_gross,
        COUNTIF(Fiscal_Q IS NOT NULL AND LENGTH(Fiscal_Q) > 0) as with_fiscal_q,
        COUNTIF(Portfolio IS NOT NULL AND LENGTH(Portfolio) > 0) as with_portfolio,
        COUNTIF(Segmento IS NOT NULL AND LENGTH(Segmento) > 0) as with_segmento,
        COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as with_resumo,
        COUNTIF(Causa_Raiz IS NOT NULL AND LENGTH(Causa_Raiz) > 0) as with_causa_raiz,
        COUNTIF(Causas_Secundarias IS NOT NULL AND LENGTH(Causas_Secundarias) > 0) as with_causas_sec,
        COUNTIF(Evitavel IS NOT NULL AND LENGTH(Evitavel) > 0) as with_evitavel,
        COUNTIF(Sinais_Alerta IS NOT NULL AND LENGTH(Sinais_Alerta) > 0) as with_sinais,
        COUNTIF(Momento_Critico IS NOT NULL AND LENGTH(Momento_Critico) > 0) as with_momento,
        COUNTIF(Evitavel = 'Sim') as evitavel_sim,
        COUNTIF(Evitavel = 'Não') as evitavel_nao,
        COUNTIF(Evitavel = 'Talvez') as evitavel_talvez
    FROM `{TABLES['lost']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    result = list(client.query(query).result())[0]
    total = result['total_records']
    
    # Fiscal Q distribution
    fiscal_q_query = f"""
    SELECT Fiscal_Q, COUNT(*) as count 
    FROM `{TABLES['lost']}` 
    WHERE Fiscal_Q IS NOT NULL 
        AND data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    GROUP BY Fiscal_Q 
    ORDER BY count DESC
    """
    fiscal_q_dist = {row['Fiscal_Q']: row['count'] for row in client.query(fiscal_q_query).result()}
    
    return {
        "table_name": TABLES['lost'],
        "total_records": total,
        "unique_opportunities": result['unique_opportunities'],
        "unique_vendors": result['unique_vendors'],
        "total_gross": float(result['total_gross'] or 0),
        "total_net": float(result['total_net'] or 0),
        "avg_gross": float(result['avg_gross'] or 0),
        "fiscal_q_coverage": round((result['with_fiscal_q'] / total * 100), 1) if total > 0 else 0,
        "fiscal_q_distribution": fiscal_q_dist,
        "portfolio_coverage": round((result['with_portfolio'] / total * 100), 1) if total > 0 else 0,
        "segmento_coverage": round((result['with_segmento'] / total * 100), 1) if total > 0 else 0,
        "resumo_coverage": round((result['with_resumo'] / total * 100), 1) if total > 0 else 0,
        "causa_raiz_coverage": round((result['with_causa_raiz'] / total * 100), 1) if total > 0 else 0,
        "causas_secundarias_coverage": round((result['with_causas_sec'] / total * 100), 1) if total > 0 else 0,
        "evitavel_coverage": round((result['with_evitavel'] / total * 100), 1) if total > 0 else 0,
        "sinais_alerta_coverage": round((result['with_sinais'] / total * 100), 1) if total > 0 else 0,
        "momento_critico_coverage": round((result['with_momento'] / total * 100), 1) if total > 0 else 0,
        "evitavel_distribution": {
            "SIM": result['evitavel_sim'],
            "NAO": result['evitavel_nao'],
            "TALVEZ": result['evitavel_talvez']
        }
    }

def extract_bq_sales_specialist(client: bigquery.Client) -> Dict[str, Any]:
    """Extrai diagnóstico de Sales Specialist do BigQuery"""
    query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Opportunity_Name) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(Booking_Total_Gross), 2) as total_gross,
        ROUND(SUM(Booking_Total_Net), 2) as total_net,
        ROUND(AVG(Booking_Total_Gross), 2) as avg_gross
    FROM `{TABLES['sales_specialist']}`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    result = list(client.query(query).result())[0]
    
    return {
        "table_name": TABLES['sales_specialist'],
        "total_records": result['total_records'],
        "unique_opportunities": result['unique_opportunities'],
        "unique_vendors": result['unique_vendors'],
        "total_gross": float(result['total_gross'] or 0),
        "total_net": float(result['total_net'] or 0),
        "avg_gross": float(result['avg_gross'] or 0)
    }

# ========================================
# COMPARISON
# ========================================

def compare_diagnostics(sheets_data: Dict, bq_data: Dict) -> Dict[str, Any]:
    """Compara diagnósticos do Sheets com BigQuery"""
    print("\n📊 Comparando diagnósticos...")
    
    comparison = {
        "timestamp": datetime.now().isoformat(),
        "tables": {}
    }
    
    for table in ["pipeline", "won", "lost", "sales_specialist"]:
        sheets_table = sheets_data["sheets"].get(table, {})
        bq_table = bq_data["tables"].get(table, {})
        
        if not sheets_table or not bq_table:
            continue
        
        comparison["tables"][table] = {
            "sheets": {
                "records": sheets_table.get("total_records", 0),
                "gross": sheets_table.get("total_gross", 0),
                "net": sheets_table.get("total_net", 0),
                "fiscal_q_coverage": sheets_table.get("fiscal_q_coverage", 0)
            },
            "bigquery": {
                "records": bq_table.get("total_records", 0),
                "gross": bq_table.get("total_gross", 0),
                "net": bq_table.get("total_net", 0),
                "fiscal_q_coverage": bq_table.get("fiscal_q_coverage", 0)
            },
            "diff": {
                "records": bq_table.get("total_records", 0) - sheets_table.get("total_records", 0),
                "gross": round(bq_table.get("total_gross", 0) - sheets_table.get("total_gross", 0), 2),
                "net": round(bq_table.get("total_net", 0) - sheets_table.get("total_net", 0), 2),
                "fiscal_q_coverage": round(bq_table.get("fiscal_q_coverage", 0) - sheets_table.get("fiscal_q_coverage", 0), 1)
            },
            "match": {
                "records": abs(bq_table.get("total_records", 0) - sheets_table.get("total_records", 0)) < 10,
                "gross": abs(bq_table.get("total_gross", 0) - sheets_table.get("total_gross", 0)) < 1000,
                "net": abs(bq_table.get("total_net", 0) - sheets_table.get("total_net", 0)) < 1000
            }
        }
    
    # Summary comparison
    comparison["summary"] = {
        "sheets_total_records": sheets_data["summary"]["total_records"],
        "bq_total_records": bq_data["summary"]["total_records"],
        "diff_records": bq_data["summary"]["total_records"] - sheets_data["summary"]["total_records"],
        "sheets_total_gross": sheets_data["summary"]["total_gross"],
        "bq_total_gross": bq_data["summary"]["total_gross"],
        "diff_gross": round(bq_data["summary"]["total_gross"] - sheets_data["summary"]["total_gross"], 2)
    }
    
    return comparison

def print_comparison_report(comparison: Dict, sheets_data: Dict, bq_data: Dict):
    """Imprime relatório de comparação formatado"""
    print("\n" + "="*80)
    print("🔬 RELATÓRIO DE COMPARAÇÃO: Google Sheets vs BigQuery")
    print("="*80)
    
    # Summary Table
    summary_data = [
        ["Total Records", comparison["summary"]["sheets_total_records"], 
         comparison["summary"]["bq_total_records"], comparison["summary"]["diff_records"]],
        ["Total Gross", f"${comparison['summary']['sheets_total_gross']:,.2f}", 
         f"${comparison['summary']['bq_total_gross']:,.2f}", f"${comparison['summary']['diff_gross']:,.2f}"]
    ]
    
    print("\n📊 RESUMO GERAL")
    print(tabulate(summary_data, headers=["Métrica", "Sheets", "BigQuery", "Diferença"], tablefmt="grid"))
    
    # Detailed comparison per table
    for table in ["pipeline", "won", "lost", "sales_specialist"]:
        if table not in comparison["tables"]:
            continue
        
        table_comp = comparison["tables"][table]
        
        print(f"\n📁 {table.upper()}")
        
        table_data = [
            ["Records", table_comp["sheets"]["records"], table_comp["bigquery"]["records"], 
             table_comp["diff"]["records"], "✅" if table_comp["match"]["records"] else "❌"],
            ["Gross Total", f"${table_comp['sheets']['gross']:,.2f}", 
             f"${table_comp['bigquery']['gross']:,.2f}", 
             f"${table_comp['diff']['gross']:,.2f}", "✅" if table_comp["match"]["gross"] else "❌"],
            ["Net Total", f"${table_comp['sheets']['net']:,.2f}", 
             f"${table_comp['bigquery']['net']:,.2f}", 
             f"${table_comp['diff']['net']:,.2f}", "✅" if table_comp["match"]["net"] else "❌"],
            ["Fiscal Q Coverage", f"{table_comp['sheets']['fiscal_q_coverage']}%", 
             f"{table_comp['bigquery']['fiscal_q_coverage']}%", 
             f"{table_comp['diff']['fiscal_q_coverage']}%", ""]
        ]
        
        print(tabulate(table_data, headers=["Métrica", "Sheets", "BigQuery", "Diferença", "Match"], tablefmt="grid"))
    
    # Coverage comparison for Won/Lost
    print("\n🔍 COVERAGE DETALHADO - WON")
    won_coverage_data = []
    if "won" in sheets_data["sheets"] and "won" in bq_data["tables"]:
        won_sheets = sheets_data["sheets"]["won"]
        won_bq = bq_data["tables"]["won"]
        
        fields = ["portfolio_coverage", "segmento_coverage", "familia_coverage", "resumo_coverage", 
                  "causa_raiz_coverage", "fatores_sucesso_coverage", "tipo_resultado_coverage",
                  "qualidade_eng_coverage", "gestao_opp_coverage"]
        
        for field in fields:
            field_name = field.replace("_coverage", "").replace("_", " ").title()
            sheets_val = won_sheets.get(field, 0)
            bq_val = won_bq.get(field, 0)
            diff = bq_val - sheets_val
            won_coverage_data.append([field_name, f"{sheets_val}%", f"{bq_val}%", f"{diff:+.1f}%"])
        
        print(tabulate(won_coverage_data, headers=["Campo", "Sheets", "BigQuery", "Δ"], tablefmt="grid"))
    
    print("\n🔍 COVERAGE DETALHADO - LOST")
    lost_coverage_data = []
    if "lost" in sheets_data["sheets"] and "lost" in bq_data["tables"]:
        lost_sheets = sheets_data["sheets"]["lost"]
        lost_bq = bq_data["tables"]["lost"]
        
        fields = ["portfolio_coverage", "resumo_coverage", "causa_raiz_coverage", 
                  "causas_secundarias_coverage", "evitavel_coverage", "sinais_alerta_coverage", 
                  "momento_critico_coverage"]
        
        for field in fields:
            field_name = field.replace("_coverage", "").replace("_", " ").title()
            sheets_val = lost_sheets.get(field, 0)
            bq_val = lost_bq.get(field, 0)
            diff = bq_val - sheets_val
            lost_coverage_data.append([field_name, f"{sheets_val}%", f"{bq_val}%", f"{diff:+.1f}%"])
        
        print(tabulate(lost_coverage_data, headers=["Campo", "Sheets", "BigQuery", "Δ"], tablefmt="grid"))
    
    print("\n" + "="*80)
    
    # Determine overall status
    all_match = all(
        table_comp["match"]["records"] and table_comp["match"]["gross"]
        for table_comp in comparison["tables"].values()
    )
    
    if all_match:
        print("✅ STATUS: Dados CONSISTENTES entre Sheets e BigQuery")
    else:
        print("⚠️ STATUS: Diferenças detectadas - revisar sincronização")
    
    print("="*80 + "\n")

# ========================================
# MAIN
# ========================================

def main():
    """Função principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Compara Google Sheets com BigQuery")
    parser.add_argument("--sheets-json", help="Path para JSON do diagnóstico do Sheets", required=False)
    parser.add_argument("--output", help="Path para salvar comparação em JSON", default="comparison.json")
    
    args = parser.parse_args()
    
    # Extrair diagnóstico do BigQuery
    client = bigquery.Client(project=PROJECT_ID)
    bq_diagnostic = extract_bigquery_diagnostic(client)
    
    # Carregar diagnóstico do Sheets ou criar vazio
    if args.sheets_json:
        with open(args.sheets_json, 'r') as f:
            sheets_diagnostic = json.load(f)
        print(f"✅ Diagnóstico do Sheets carregado de: {args.sheets_json}")
    else:
        print("⚠️ Nenhum JSON do Sheets fornecido. Use --sheets-json")
        print("   Execute primeiro DiagnosticExtractor.gs no Google Sheets")
        print("   e baixe o JSON gerado.")
        
        # Salvar apenas diagnóstico BQ
        with open("bigquery_diagnostic.json", 'w') as f:
            json.dump(bq_diagnostic, f, indent=2)
        print(f"✅ Diagnóstico do BigQuery salvo em: bigquery_diagnostic.json")
        return
    
    # Comparar
    comparison = compare_diagnostics(sheets_diagnostic, bq_diagnostic)
    
    # Salvar comparação
    with open(args.output, 'w') as f:
        json.dump({
            "sheets": sheets_diagnostic,
            "bigquery": bq_diagnostic,
            "comparison": comparison
        }, f, indent=2)
    
    print(f"\n✅ Comparação completa salva em: {args.output}")
    
    # Imprimir relatório
    print_comparison_report(comparison, sheets_diagnostic, bq_diagnostic)

if __name__ == "__main__":
    main()
