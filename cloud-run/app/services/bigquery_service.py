"""
BigQuery service for data access
Handles all BigQuery queries and data retrieval
"""
from google.cloud import bigquery
from typing import List, Dict, Optional
import logging

from app.utils.constants import (
    TABLE_PIPELINE, TABLE_CLOSED_WON, TABLE_CLOSED_LOST, TABLE_SALES_SPECIALIST,
    PIPELINE_COLUMNS, CLOSED_DEALS_COLUMNS, FISCAL_QUARTERS
)

logger = logging.getLogger(__name__)

class BigQueryService:
    """Service for BigQuery data access"""
    
    def __init__(self, project_id: str, dataset_id: str):
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.client = bigquery.Client(project=project_id)
        
        # Full table paths
        self.pipeline_table = f"{project_id}.{dataset_id}.{TABLE_PIPELINE}"
        self.won_table = f"{project_id}.{dataset_id}.{TABLE_CLOSED_WON}"
        self.lost_table = f"{project_id}.{dataset_id}.{TABLE_CLOSED_LOST}"
        self.specialist_table = f"{project_id}.{dataset_id}.{TABLE_SALES_SPECIALIST}"
    
    def test_connection(self) -> bool:
        """Test BigQuery connection"""
        try:
            query = f"SELECT COUNT(*) as count FROM `{self.pipeline_table}` LIMIT 1"
            list(self.client.query(query).result())
            return True
        except Exception as e:
            logger.error(f"BigQuery connection test failed: {str(e)}")
            return False
    
    # ========================================
    # PIPELINE QUERIES
    # ========================================
    
    def get_pipeline(self, filters: Optional[Dict] = None, limit: int = 1000) -> List[Dict]:
        """
        Get pipeline records with filters
        
        Args:
            filters: {fiscal_q, vendedor, forecast_category, min_gross}
            limit: Max records to return
        
        Returns:
            List of pipeline records as dicts
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters:
            if filters.get("fiscal_q"):
                where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
            if filters.get("vendedor"):
                where_clauses.append(f"Vendedor = '{filters['vendedor']}'")
            if filters.get("forecast_category"):
                where_clauses.append(f"Forecast_Category = '{filters['forecast_category']}'")
            if filters.get("min_gross"):
                where_clauses.append(f"Gross >= {filters['min_gross']}")
        
        where_sql = " AND ".join(where_clauses)
        
        query = f"""
        SELECT *
        FROM `{self.pipeline_table}`
        WHERE {where_sql}
        ORDER BY Gross DESC
        LIMIT {limit}
        """
        
        logger.info(f"Executing pipeline query with filters: {filters}")
        results = self.client.query(query).result()
        
        records = [dict(row) for row in results]
        return records
    
    # ========================================
    # CLOSED DEALS QUERIES
    # ========================================
    
    def get_closed_won(self, filters: Optional[Dict] = None, limit: int = 1000) -> List[Dict]:
        """
        Get closed won deals with filters
        
        Args:
            filters: {fiscal_q, vendedor, has_analysis}
            limit: Max records
        
        Returns:
            List of won deal records
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters:
            if filters.get("fiscal_q"):
                where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
            if filters.get("vendedor"):
                where_clauses.append(f"Vendedor = '{filters['vendedor']}'")
            if filters.get("has_analysis") is True:
                where_clauses.append("Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0")
        
        where_sql = " AND ".join(where_clauses)
        
        query = f"""
        SELECT *, 'Won' as Deal_Type
        FROM `{self.won_table}`
        WHERE {where_sql}
        ORDER BY Gross DESC
        LIMIT {limit}
        """
        
        results = self.client.query(query).result()
        return [dict(row) for row in results]
    
    def get_closed_lost(self, filters: Optional[Dict] = None, limit: int = 1000) -> List[Dict]:
        """
        Get closed lost deals with filters
        
        Args:
            filters: {fiscal_q, vendedor, has_deep_analysis, evitavel}
            limit: Max records
        
        Returns:
            List of lost deal records
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters:
            if filters.get("fiscal_q"):
                where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
            if filters.get("vendedor"):
                where_clauses.append(f"Vendedor = '{filters['vendedor']}'")
            if filters.get("has_deep_analysis") is True:
                where_clauses.append("Causas_Secundarias IS NOT NULL AND LENGTH(Causas_Secundarias) > 0")
            if filters.get("evitavel"):
                where_clauses.append(f"Evitavel = '{filters['evitavel']}'")
        
        where_sql = " AND ".join(where_clauses)
        
        query = f"""
        SELECT *, 'Lost' as Deal_Type
        FROM `{self.lost_table}`
        WHERE {where_sql}
        ORDER BY Gross DESC
        LIMIT {limit}
        """
        
        results = self.client.query(query).result()
        return [dict(row) for row in results]
    
    # ========================================
    # METRICS QUERIES
    # ========================================
    
    def get_metrics_summary(self, filters: Optional[Dict] = None) -> Dict:
        """
        Get summary metrics across all tables
        
        Args:
            filters: {fiscal_q, vendedor}
        
        Returns:
            MetricsSummary dict
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters:
            if filters.get("fiscal_q"):
                where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
            if filters.get("vendedor"):
                where_clauses.append(f"Vendedor = '{filters['vendedor']}'")
        
        where_sql = " AND ".join(where_clauses)
        
        # Pipeline metrics
        pipeline_query = f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(Gross), 0) as gross_total,
            COALESCE(AVG(Gross), 0) as gross_avg,
            COUNTIF(Forecast_IA IS NOT NULL) as with_forecast
        FROM `{self.pipeline_table}`
        WHERE {where_sql}
        """
        
        # Won metrics
        won_query = f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(Gross), 0) as gross_total,
            COALESCE(SUM(Net), 0) as net_total,
            COALESCE(AVG(Gross), 0) as gross_avg,
            COALESCE(AVG(Net), 0) as net_avg,
            COALESCE(AVG(ciclo_dias), 0) as avg_cycle_days,
            COALESCE(AVG(atividades), 0) as avg_activities,
            COALESCE(AVG(MEDDIC_Score), 0) as avg_meddic,
            COALESCE(AVG(BANT_Score), 0) as avg_bant,
            COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as with_analysis
        FROM `{self.won_table}`
        WHERE {where_sql}
        """
        
        # Lost metrics
        lost_query = f"""
        SELECT 
            COUNT(*) as count,
            COALESCE(SUM(Gross), 0) as gross_total,
            COALESCE(SUM(Net), 0) as net_total,
            COALESCE(AVG(Gross), 0) as gross_avg,
            COALESCE(AVG(Net), 0) as net_avg,
            COALESCE(AVG(ciclo_dias), 0) as avg_cycle_days,
            COALESCE(AVG(atividades), 0) as avg_activities,
            COALESCE(AVG(MEDDIC_Score), 0) as avg_meddic,
            COALESCE(AVG(BANT_Score), 0) as avg_bant,
            COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as with_analysis,
            COUNTIF(Evitavel = 'Sim') as evitavel_count,
            ROUND(COUNTIF(Evitavel = 'Sim') / COUNT(*) * 100, 1) as evitavel_pct
        FROM `{self.lost_table}`
        WHERE {where_sql}
        """
        
        pipeline_result = list(self.client.query(pipeline_query).result())[0]
        won_result = list(self.client.query(won_query).result())[0]
        lost_result = list(self.client.query(lost_query).result())[0]
        
        # Calculate win rate and cycle comparison
        total_closed = won_result['count'] + lost_result['count']
        win_rate = (won_result['count'] / total_closed * 100) if total_closed > 0 else 0
        
        # Cycle time efficiency: ganhos vs perdas
        cycle_efficiency = 0
        if won_result['avg_cycle_days'] > 0 and lost_result['avg_cycle_days'] > 0:
            cycle_efficiency = round((1 - (won_result['avg_cycle_days'] / lost_result['avg_cycle_days'])) * 100, 1)
        
        return {
            "pipeline_count": pipeline_result['count'],
            "pipeline_gross_total": float(pipeline_result['gross_total']),
            "pipeline_gross_avg": float(pipeline_result['gross_avg']),
            "pipeline_with_forecast": pipeline_result['with_forecast'],
            
            "won_count": won_result['count'],
            "won_gross_total": float(won_result['gross_total']),
            "won_net_total": float(won_result['net_total']),
            "won_gross_avg": float(won_result['gross_avg']),
            "won_net_avg": float(won_result['net_avg']),
            "won_avg_cycle_days": round(float(won_result['avg_cycle_days']), 1),
            "won_avg_activities": round(float(won_result['avg_activities']), 1),
            "won_avg_meddic": round(float(won_result['avg_meddic']), 1),
            "won_avg_bant": round(float(won_result['avg_bant']), 1),
            "won_with_analysis": won_result['with_analysis'],
            
            "lost_count": lost_result['count'],
            "lost_gross_total": float(lost_result['gross_total']),
            "lost_net_total": float(lost_result['net_total']),
            "lost_gross_avg": float(lost_result['gross_avg']),
            "lost_net_avg": float(lost_result['net_avg']),
            "lost_avg_cycle_days": round(float(lost_result['avg_cycle_days']), 1),
            "lost_avg_activities": round(float(lost_result['avg_activities']), 1),
            "lost_avg_meddic": round(float(lost_result['avg_meddic']), 1),
            "lost_avg_bant": round(float(lost_result['avg_bant']), 1),
            "lost_with_analysis": lost_result['with_analysis'],
            "lost_evitavel_count": lost_result['evitavel_count'],
            "lost_evitavel_pct": float(lost_result['evitavel_pct']),
            
            "win_rate": round(win_rate, 2),
            "cycle_efficiency_pct": cycle_efficiency,
            "total_opportunities": pipeline_result['count'] + total_closed,
            "total_gross": float(pipeline_result['gross_total'] + won_result['gross_total'] + lost_result['gross_total']),
            "total_net": float(won_result['net_total'] + lost_result['net_total'])
        }
    
    # ========================================
    # ANALYTICS QUERIES
    # ========================================
    
    def get_top_vendors(self, filters: Optional[Dict] = None, limit: int = 10) -> List[Dict]:
        """
        Get top performing vendors
        
        Args:
            filters: {fiscal_q, metric: 'gross' or 'count'}
            limit: Number of vendors
        
        Returns:
            List of vendor metrics
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters and filters.get("fiscal_q"):
            where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
        
        where_sql = " AND ".join(where_clauses)
        
        metric = filters.get("metric", "gross") if filters else "gross"
        order_by = "gross_total DESC" if metric == "gross" else "opportunities DESC"
        
        query = f"""
        WITH pipeline_data AS (
            SELECT Vendedor, COUNT(*) as opps, SUM(Gross) as gross
            FROM `{self.pipeline_table}`
            WHERE {where_sql}
            GROUP BY Vendedor
        ),
        won_data AS (
            SELECT Vendedor, COUNT(*) as won
            FROM `{self.won_table}`
            WHERE {where_sql}
            GROUP BY Vendedor
        ),
        lost_data AS (
            SELECT Vendedor, COUNT(*) as lost
            FROM `{self.lost_table}`
            WHERE {where_sql}
            GROUP BY Vendedor
        )
        SELECT 
            p.Vendedor as vendedor,
            p.opps as opportunities,
            COALESCE(p.gross, 0) as gross_total,
            COALESCE(w.won, 0) as won_count,
            COALESCE(l.lost, 0) as lost_count,
            ROUND(COALESCE(w.won, 0) * 100.0 / NULLIF(COALESCE(w.won, 0) + COALESCE(l.lost, 0), 0), 2) as win_rate,
            ROUND(COALESCE(p.gross, 0) / NULLIF(p.opps, 0), 2) as avg_deal_size
        FROM pipeline_data p
        LEFT JOIN won_data w ON p.Vendedor = w.Vendedor
        LEFT JOIN lost_data l ON p.Vendedor = l.Vendedor
        ORDER BY {order_by}
        LIMIT {limit}
        """
        
        results = self.client.query(query).result()
        vendors = [dict(row) for row in results]
        
        # Add rank
        for i, vendor in enumerate(vendors, 1):
            vendor['rank'] = i
        
        return vendors
    
    def get_win_loss_analysis(self, filters: Optional[Dict] = None) -> Dict:
        """
        Get win/loss analysis with reasons
        
        Args:
            filters: {fiscal_q, vendedor}
        
        Returns:
            WinLossAnalysis dict
        """
        where_clauses = ["data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)"]
        
        if filters:
            if filters.get("fiscal_q"):
                where_clauses.append(f"Fiscal_Q = '{filters['fiscal_q']}'")
            if filters.get("vendedor"):
                where_clauses.append(f"Vendedor = '{filters['vendedor']}'")
        
        where_sql = " AND ".join(where_clauses)
        
        # Won analysis
        won_query = f"""
        SELECT 
            COUNT(*) as total,
            SUM(Gross) as gross,
            Fatores_Sucesso,
            COUNT(*) as count
        FROM `{self.won_table}`
        WHERE {where_sql}
            AND Fatores_Sucesso IS NOT NULL
        GROUP BY Fatores_Sucesso
        ORDER BY count DESC
        LIMIT 10
        """
        
        # Lost analysis
        lost_query = f"""
        SELECT 
            COUNT(*) as total,
            SUM(Gross) as gross,
            Causa_Raiz,
            Evitavel,
            COUNT(*) as count
        FROM `{self.lost_table}`
        WHERE {where_sql}
            AND Causa_Raiz IS NOT NULL
        GROUP BY Causa_Raiz, Evitavel
        ORDER BY count DESC
        LIMIT 10
        """
        
        won_results = list(self.client.query(won_query).result())
        lost_results = list(self.client.query(lost_query).result())
        
        # Process results
        top_success_factors = [
            {
                "factor": row['Fatores_Sucesso'],
                "count": row['count'],
                "pct": round(row['count'] * 100.0 / won_results[0]['total'], 2) if won_results else 0
            }
            for row in won_results[:5]
        ]
        
        top_loss_reasons = [
            {
                "reason": row['Causa_Raiz'],
                "count": row['count'],
                "evitavel": row['Evitavel'],
                "pct": round(row['count'] * 100.0 / lost_results[0]['total'], 2) if lost_results else 0
            }
            for row in lost_results[:5]
        ]
        
        # Evitability breakdown
        evit_query = f"""
        SELECT 
            COUNTIF(Evitavel = 'Sim') as sim,
            COUNTIF(Evitavel = 'Não') as nao,
            COUNTIF(Evitavel = 'Talvez') as talvez
        FROM `{self.lost_table}`
        WHERE {where_sql}
        """
        evit_result = list(self.client.query(evit_query).result())[0]
        
        return {
            "won_total": won_results[0]['total'] if won_results else 0,
            "won_gross": float(won_results[0]['gross']) if won_results else 0,
            "top_success_factors": top_success_factors,
            
            "lost_total": lost_results[0]['total'] if lost_results else 0,
            "lost_gross": float(lost_results[0]['gross']) if lost_results else 0,
            "top_loss_reasons": top_loss_reasons,
            
            "evitavel_sim": evit_result['sim'],
            "evitavel_nao": evit_result['nao'],
            "evitavel_talvez": evit_result['talvez'],
            
            "win_rate": round(
                won_results[0]['total'] * 100.0 / (won_results[0]['total'] + lost_results[0]['total'])
                if won_results and lost_results else 0,
                2
            )
        }
