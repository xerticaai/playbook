"""
FastAPI application for Sales Intelligence Platform
Serves BigQuery data and ML predictions via REST API
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
import logging
from datetime import datetime

# Import from our modules
from app.services.bigquery_service import BigQueryService
from app.services.ml_service import MLService
from app.models.schemas import (
    PipelineRecord, ClosedDealRecord, MetricsSummary,
    MLPredictionRequest, MLPredictionResponse
)
from app.utils.constants import (
    PROJECT_ID, DATASET_ID,
    FISCAL_QUARTERS, FORECAST_CATEGORIES,
    CORS_ORIGINS
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Sales Intelligence API",
    description="BigQuery data access and ML predictions for sales pipeline",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
bq_service = BigQueryService(project_id=PROJECT_ID, dataset_id=DATASET_ID)
ml_service = MLService(project_id=PROJECT_ID, dataset_id=DATASET_ID)

# ========================================
# HEALTH CHECK
# ========================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test BigQuery connection
        bq_healthy = bq_service.test_connection()
        
        return {
            "status": "healthy" if bq_healthy else "degraded",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "bigquery": "up" if bq_healthy else "down",
                "ml": "up"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Sales Intelligence API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# ========================================
# PIPELINE ENDPOINTS
# ========================================

@app.get("/api/v1/pipeline", response_model=List[PipelineRecord])
async def get_pipeline(
    fiscal_q: Optional[str] = Query(None, description="Filter by fiscal quarter"),
    vendedor: Optional[str] = Query(None, description="Filter by sales person"),
    forecast_category: Optional[str] = Query(None, description="Filter by forecast category"),
    min_gross: Optional[float] = Query(None, description="Minimum gross value"),
    limit: int = Query(1000, le=10000, description="Maximum records to return")
):
    """
    Get pipeline records with optional filters
    
    - **fiscal_q**: FY26-Q1, FY26-Q2, etc.
    - **vendedor**: Sales person name
    - **forecast_category**: Commit, Best Case, Pipeline, Omitted
    - **min_gross**: Minimum deal value
    - **limit**: Max records (default 1000, max 10000)
    """
    try:
        filters = {
            "fiscal_q": fiscal_q,
            "vendedor": vendedor,
            "forecast_category": forecast_category,
            "min_gross": min_gross
        }
        
        records = bq_service.get_pipeline(filters=filters, limit=limit)
        logger.info(f"Pipeline query returned {len(records)} records")
        return records
        
    except Exception as e:
        logger.error(f"Pipeline query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# CLOSED DEALS ENDPOINTS
# ========================================

@app.get("/api/v1/closed/won", response_model=List[ClosedDealRecord])
async def get_closed_won(
    fiscal_q: Optional[str] = Query(None, description="Filter by fiscal quarter"),
    vendedor: Optional[str] = Query(None, description="Filter by sales person"),
    has_analysis: Optional[bool] = Query(None, description="Filter by analysis presence"),
    limit: int = Query(1000, le=10000)
):
    """
    Get closed won deals with optional filters
    
    - **fiscal_q**: FY26-Q1, FY26-Q2, etc.
    - **vendedor**: Sales person name
    - **has_analysis**: True = only deals with complete analysis
    - **limit**: Max records (default 1000, max 10000)
    """
    try:
        filters = {
            "fiscal_q": fiscal_q,
            "vendedor": vendedor,
            "has_analysis": has_analysis
        }
        
        records = bq_service.get_closed_won(filters=filters, limit=limit)
        logger.info(f"Closed Won query returned {len(records)} records")
        return records
        
    except Exception as e:
        logger.error(f"Closed Won query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/closed/lost", response_model=List[ClosedDealRecord])
async def get_closed_lost(
    fiscal_q: Optional[str] = Query(None, description="Filter by fiscal quarter"),
    vendedor: Optional[str] = Query(None, description="Filter by sales person"),
    has_deep_analysis: Optional[bool] = Query(None, description="Filter by deep analysis"),
    evitavel: Optional[str] = Query(None, description="Filter by evitability"),
    limit: int = Query(1000, le=10000)
):
    """
    Get closed lost deals with optional filters
    
    - **fiscal_q**: FY26-Q1, FY26-Q2, etc.
    - **vendedor**: Sales person name
    - **has_deep_analysis**: True = only deals with secondary causes, alerts, etc.
    - **evitavel**: "Sim", "Não", "Talvez"
    - **limit**: Max records (default 1000, max 10000)
    """
    try:
        filters = {
            "fiscal_q": fiscal_q,
            "vendedor": vendedor,
            "has_deep_analysis": has_deep_analysis,
            "evitavel": evitavel
        }
        
        records = bq_service.get_closed_lost(filters=filters, limit=limit)
        logger.info(f"Closed Lost query returned {len(records)} records")
        return records
        
    except Exception as e:
        logger.error(f"Closed Lost query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# METRICS ENDPOINTS
# ========================================

@app.get("/api/v1/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    fiscal_q: Optional[str] = Query(None, description="Filter by fiscal quarter"),
    vendedor: Optional[str] = Query(None, description="Filter by sales person")
):
    """
    Get summary metrics across all tables
    
    Returns:
    - Pipeline count, total gross, average deal size
    - Closed Won/Lost counts and values
    - Win rate, average cycle time
    - ML coverage statistics
    """
    try:
        filters = {"fiscal_q": fiscal_q, "vendedor": vendedor}
        metrics = bq_service.get_metrics_summary(filters=filters)
        logger.info(f"Metrics summary generated")
        return metrics
        
    except Exception as e:
        logger.error(f"Metrics summary failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# ML PREDICTION ENDPOINTS
# ========================================

@app.post("/api/v1/ml/predict", response_model=MLPredictionResponse)
async def predict_ml(request: MLPredictionRequest):
    """
    Run ML predictions on pipeline opportunity
    
    Input: Opportunity details (MEDDIC, BANT, activities, etc.)
    Output: Forecasted category, confidence, priority, next actions, risk flags
    
    Uses BQML models V2:
    - ml_win_loss_model
    - ml_prioridade_deal_v2
    - ml_proxima_acao_v2
    - ml_risco_abandono_v2
    """
    try:
        prediction = ml_service.predict(request.dict())
        logger.info(f"ML prediction completed for opp {request.oportunidade}")
        return prediction
        
    except Exception as e:
        logger.error(f"ML prediction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# ANALYTICS ENDPOINTS
# ========================================

@app.get("/api/v1/analytics/top_vendors")
async def get_top_vendors(
    fiscal_q: Optional[str] = Query(None),
    metric: str = Query("gross", description="gross or count"),
    limit: int = Query(10, le=50)
):
    """
    Get top performing vendors
    
    - **fiscal_q**: Filter by quarter
    - **metric**: Rank by "gross" or "count" (opportunities)
    - **limit**: Number of vendors to return
    """
    try:
        filters = {"fiscal_q": fiscal_q, "metric": metric}
        vendors = bq_service.get_top_vendors(filters=filters, limit=limit)
        return vendors
        
    except Exception as e:
        logger.error(f"Top vendors query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/analytics/win_loss_analysis")
async def get_win_loss_analysis(
    fiscal_q: Optional[str] = Query(None),
    vendedor: Optional[str] = Query(None)
):
    """
    Win/Loss analysis with reasons
    
    Returns:
    - Won deals: Top success factors
    - Lost deals: Top loss reasons, evitability breakdown
    - Comparison metrics
    """
    try:
        filters = {"fiscal_q": fiscal_q, "vendedor": vendedor}
        analysis = bq_service.get_win_loss_analysis(filters=filters)
        return analysis
        
    except Exception as e:
        logger.error(f"Win/Loss analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# ERROR HANDLERS
# ========================================

@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Endpoint not found", "path": str(request.url)}
    )

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

# ========================================
# STARTUP/SHUTDOWN
# ========================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 Sales Intelligence API starting...")
    logger.info(f"Project: {PROJECT_ID}")
    logger.info(f"Dataset: {DATASET_ID}")
    
    # Test connections
    if bq_service.test_connection():
        logger.info("✅ BigQuery connection successful")
    else:
        logger.warning("⚠️ BigQuery connection failed")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("👋 Sales Intelligence API shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
