"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

# ========================================
# PIPELINE SCHEMAS
# ========================================

class PipelineRecord(BaseModel):
    """Pipeline opportunity record"""
    Run_ID: Optional[str] = None
    Oportunidade: str
    Gross: Optional[float] = None
    Forecast_Category: Optional[str] = None
    Fiscal_Q: Optional[str] = None
    Vendedor: Optional[str] = None
    Status: Optional[str] = None
    
    # MEDDIC
    MEDDIC_Score: Optional[float] = None
    Metrics: Optional[str] = None
    Economic_Buyer: Optional[str] = None
    Decision_Criteria: Optional[str] = None
    Decision_Process: Optional[str] = None
    Identify_Pain: Optional[str] = None
    Champion: Optional[str] = None
    
    # BANT
    BANT_Score: Optional[float] = None
    Budget: Optional[str] = None
    Authority: Optional[str] = None
    Need: Optional[str] = None
    Timeline: Optional[str] = None
    
    # Activities
    Atividades: Optional[int] = None
    Ativ_7d: Optional[int] = None
    Ativ_30d: Optional[int] = None
    
    # Changes
    Total_Mudancas: Optional[int] = None
    Mudancas_7d: Optional[int] = None
    Mudancas_30d: Optional[int] = None
    
    # ML Predictions
    Forecast_IA: Optional[str] = None
    Confianca: Optional[float] = None
    Prioridade: Optional[str] = None
    Proximo_Passo: Optional[str] = None
    Risco_Abandono: Optional[str] = None
    
    # Time
    Idle_Dias: Optional[int] = None
    Days_Open: Optional[int] = None
    Data_Criacao: Optional[str] = None
    
    # Metadata
    data_carga: Optional[datetime] = None
    
    class Config:
        orm_mode = True

# ========================================
# CLOSED DEALS SCHEMAS
# ========================================

class ClosedDealRecord(BaseModel):
    """Closed deal record (Won or Lost)"""
    Run_ID: Optional[str] = None
    Oportunidade: str
    Gross: Optional[float] = None
    Fiscal_Q: Optional[str] = None
    Vendedor: Optional[str] = None
    Status: Optional[str] = None
    Deal_Type: Optional[str] = None  # "Won" or "Lost"
    
    # Analysis (Common)
    Resumo_Analise: Optional[str] = None
    Causa_Raiz: Optional[str] = None
    Licoes_Aprendidas: Optional[str] = None
    
    # Won-specific
    Fatores_Sucesso: Optional[str] = None
    
    # Lost-specific
    Causas_Secundarias: Optional[str] = None
    Evitavel: Optional[str] = None
    Sinais_Alerta: Optional[str] = None
    Momento_Critico: Optional[str] = None
    
    # Activities
    Atividades: Optional[int] = None
    Ativ_7d: Optional[int] = None
    Ativ_30d: Optional[int] = None
    
    # Time
    Idle_Dias: Optional[int] = None
    Days_Open: Optional[int] = None
    Cycle_Days: Optional[int] = None
    Data_Criacao: Optional[str] = None
    Data_Fechamento: Optional[str] = None
    
    # Metadata
    data_carga: Optional[datetime] = None
    
    class Config:
        orm_mode = True

# ========================================
# METRICS SCHEMAS
# ========================================

class MetricsSummary(BaseModel):
    """Summary metrics across all tables"""
    
    # Pipeline metrics
    pipeline_count: int = 0
    pipeline_gross_total: float = 0
    pipeline_gross_avg: float = 0
    pipeline_with_forecast: int = 0
    
    # Won metrics
    won_count: int = 0
    won_gross_total: float = 0
    won_net_total: float = 0
    won_gross_avg: float = 0
    won_net_avg: float = 0
    won_avg_cycle_days: float = 0
    won_avg_activities: float = 0
    won_avg_meddic: float = 0
    won_avg_bant: float = 0
    won_with_analysis: int = 0
    
    # Lost metrics
    lost_count: int = 0
    lost_gross_total: float = 0
    lost_net_total: float = 0
    lost_gross_avg: float = 0
    lost_net_avg: float = 0
    lost_avg_cycle_days: float = 0
    lost_avg_activities: float = 0
    lost_avg_meddic: float = 0
    lost_avg_bant: float = 0
    lost_with_analysis: int = 0
    lost_evitavel_count: int = 0
    lost_evitavel_pct: float = 0
    
    # Computed metrics
    win_rate: Optional[float] = None  # Won / (Won + Lost)
    cycle_efficiency_pct: Optional[float] = None  # Cycle time comparison won vs lost
    total_opportunities: int = 0
    total_gross: float = 0
    total_net: float = 0
    
    # Breakdown by Fiscal Q
    by_fiscal_q: Optional[Dict[str, Dict]] = None
    
    # Top vendors
    top_vendors: Optional[List[Dict]] = None
    
    # Timestamp
    generated_at: datetime = Field(default_factory=datetime.utcnow)

# ========================================
# ML SCHEMAS
# ========================================

class MLPredictionRequest(BaseModel):
    """Request for ML prediction"""
    oportunidade: str
    gross: Optional[float] = None
    fiscal_q: Optional[str] = None
    vendedor: Optional[str] = None
    
    # MEDDIC
    meddic_score: Optional[float] = None
    metrics: Optional[str] = None
    economic_buyer: Optional[str] = None
    decision_criteria: Optional[str] = None
    decision_process: Optional[str] = None
    identify_pain: Optional[str] = None
    champion: Optional[str] = None
    
    # BANT
    bant_score: Optional[float] = None
    budget: Optional[str] = None
    authority: Optional[str] = None
    need: Optional[str] = None
    timeline: Optional[str] = None
    
    # Activities
    atividades: Optional[int] = None
    ativ_7d: Optional[int] = None
    ativ_30d: Optional[int] = None
    
    # Time
    idle_dias: Optional[int] = None
    days_open: Optional[int] = None

class MLPredictionResponse(BaseModel):
    """Response from ML prediction"""
    oportunidade: str
    
    # Predictions
    forecast_ia: Optional[str] = None  # Commit, Best Case, Pipeline, Omitted
    confianca: Optional[float] = None  # 0-100
    
    prioridade: Optional[str] = None  # Alta, Média, Baixa
    prioridade_score: Optional[float] = None
    
    proximo_passo: Optional[str] = None  # Text recommendation
    
    risco_abandono: Optional[str] = None  # Alto, Médio, Baixo
    risco_score: Optional[float] = None
    
    # Model metadata
    models_used: List[str] = []
    prediction_date: datetime = Field(default_factory=datetime.utcnow)
    
    # Explanation
    explanation: Optional[Dict] = None  # Feature importance, reasoning

# ========================================
# ANALYTICS SCHEMAS
# ========================================

class TopVendor(BaseModel):
    """Top performing vendor"""
    vendedor: str
    opportunities: int
    gross_total: float
    won_count: int
    lost_count: int
    win_rate: float
    avg_deal_size: float
    rank: int

class WinLossAnalysis(BaseModel):
    """Win/Loss analysis"""
    
    # Won analysis
    won_total: int
    won_gross: float
    top_success_factors: List[Dict[str, any]]  # [{factor, count, pct}]
    
    # Lost analysis
    lost_total: int
    lost_gross: float
    top_loss_reasons: List[Dict[str, any]]  # [{reason, count, pct}]
    
    # Evitability
    evitavel_sim: int
    evitavel_nao: int
    evitavel_talvez: int
    
    # Comparison
    win_rate: float
    avg_won_cycle: Optional[float] = None
    avg_lost_cycle: Optional[float] = None
    
    # Top signals
    top_win_signals: Optional[List[str]] = None
    top_loss_signals: Optional[List[str]] = None

# ========================================
# ERROR SCHEMAS
# ========================================

class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
