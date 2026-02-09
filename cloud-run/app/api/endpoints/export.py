"""
Export Endpoint - Generate CSV/Excel exports for War Room and Weekly Agenda
"""
from fastapi import APIRouter, HTTPException, Query, Response
from google.cloud import bigquery
from typing import Optional
import os
import csv
import io

router = APIRouter()

PROJECT_ID = os.getenv("GCP_PROJECT", "operaciones-br")
DATASET_ID = "sales_intelligence"


def get_bq_client():
    return bigquery.Client(project=PROJECT_ID)


@router.get("/export/war-room-csv")
async def export_war_room_csv():
    """
    Export War Room metrics as CSV for easy import into Google Sheets/Excel.
    """
    try:
        client = get_bq_client()
        
        query = f"""
        SELECT 
          Vendedor,
          Total_Deals_Pipeline,
          Pipeline_Gross_K,
          Pipeline_Net_K,
          Avg_Confianca,
          Deals_Zumbis,
          Zumbis_Gross_K,
          Pct_Pipeline_Podre,
          Total_Deals_Closed_Q,
          Closed_Gross_K_Q,
          Closed_Net_K_Q,
          Forecast_Total_Net_K,
          Nota_Higiene
        FROM `{PROJECT_ID}.{DATASET_ID}.war_room_metrics`
        ORDER BY Forecast_Total_Net_K DESC
        """
        
        results = client.query(query).result()
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Vendedor', 'Deals_Pipeline', 'Pipeline_Gross_K', 'Pipeline_Net_K',
            'Confianca_Media', 'Deals_Zumbis', 'Zumbis_Gross_K', 'Pct_Podre',
            'Deals_Closed_Q', 'Closed_Gross_K_Q', 'Closed_Net_K_Q',
            'Forecast_Total_Net_K', 'Nota_Higiene'
        ])
        
        # Data rows
        for row in results:
            writer.writerow([
                row.Vendedor,
                row.Total_Deals_Pipeline,
                row.Pipeline_Gross_K,
                row.Pipeline_Net_K,
                row.Avg_Confianca,
                row.Deals_Zumbis,
                row.Zumbis_Gross_K,
                row.Pct_Pipeline_Podre,
                row.Total_Deals_Closed_Q,
                row.Closed_Gross_K_Q,
                row.Closed_Net_K_Q,
                row.Forecast_Total_Net_K,
                row.Nota_Higiene
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=war_room_metrics.csv"
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao exportar CSV: {str(e)}")


@router.get("/export/pauta-semanal-csv")
async def export_pauta_semanal_csv(
    seller: Optional[str] = Query(None, description="Filtrar por vendedor"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria")
):
    """
    Export Weekly Agenda deals as CSV.
    """
    try:
        client = get_bq_client()
        
        # Build WHERE clause
        filters = []
        if seller:
            sellers = [s.strip() for s in seller.split(',') if s.strip()]
            if len(sellers) == 1:
                filters.append(f"Vendedor = '{sellers[0]}'")
            elif len(sellers) > 1:
                sellers_quoted = "', '".join(sellers)
                filters.append(f"Vendedor IN ('{sellers_quoted}')")
        
        if categoria:
            filters.append(f"Categoria_Pauta = '{categoria}'")
        
        where_clause = "WHERE " + " AND ".join(filters) if filters else ""
        
        query = f"""
        SELECT 
          Oportunidade,
          Vendedor,
          Conta,
          Produtos,
          Gross,
          Net,
          Fiscal_Q,
          Confianca,
          Dias_Funil,
          Atividades,
          Categoria_Pauta,
          Risco_Score,
          Risk_Tags,
          Proxima_Acao_Pipeline
        FROM `{PROJECT_ID}.{DATASET_ID}.pauta_semanal_enriquecida`
        {where_clause}
        ORDER BY 
          CASE Categoria_Pauta
            WHEN 'ZUMBI' THEN 1
            WHEN 'CRITICO' THEN 2
            WHEN 'ALTA_PRIORIDADE' THEN 3
          END,
          Risco_Score DESC,
          Gross DESC
        """
        
        results = client.query(query).result()
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'Oportunidade', 'Vendedor', 'Conta', 'Produtos', 'Gross', 'Net',
            'Fiscal_Q', 'Confianca', 'Dias_Funil', 'Atividades', 'Categoria',
            'Risco_Score', 'Risk_Tags', 'Proxima_Acao'
        ])
        
        # Data rows
        for row in results:
            writer.writerow([
                row.Oportunidade,
                row.Vendedor,
                row.Conta,
                row.Produtos,
                row.Gross,
                row.Net,
                row.Fiscal_Q,
                row.Confianca,
                row.Dias_Funil,
                row.Atividades,
                row.Categoria_Pauta,
                row.Risco_Score,
                row.Risk_Tags,
                row.Proxima_Acao_Pipeline
            ])
        
        csv_content = output.getvalue()
        output.close()
        
        filename = f"pauta_semanal_{seller if seller else 'all'}.csv".replace(" ", "_")
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao exportar CSV: {str(e)}")
