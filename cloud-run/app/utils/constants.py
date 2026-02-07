"""
Constants para Sales Intelligence Platform
Centraliza configurações de projeto, datasets, tabelas e endpoints
"""

# ========================================
# BIGQUERY CONFIGURATION
# ========================================

PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"
LOCATION = "us-central1"

# Table names
TABLE_PIPELINE = "pipeline"
TABLE_CLOSED_WON = "closed_deals_won"
TABLE_CLOSED_LOST = "closed_deals_lost"
TABLE_SALES_SPECIALIST = "sales_specialist"

# Full table references
FULL_TABLE_PIPELINE = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_PIPELINE}"
FULL_TABLE_CLOSED_WON = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_CLOSED_WON}"
FULL_TABLE_CLOSED_LOST = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_CLOSED_LOST}"
FULL_TABLE_SALES_SPECIALIST = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_SALES_SPECIALIST}"

# ========================================
# BQML MODEL NAMES
# ========================================

# V2 Models (Current)
MODEL_WIN_LOSS = "ml_win_loss_model"
MODEL_CLASSIFICADOR_PERDA = "ml_classificador_perda_v2"
MODEL_RISCO_ABANDONO = "ml_risco_abandono_v2"
MODEL_PROXIMA_ACAO = "ml_proxima_acao_v2"
MODEL_PRIORIDADE_DEAL = "ml_prioridade_deal_v2"
MODEL_PREVISAO_CICLO = "ml_previsao_ciclo_v2"
MODEL_PERFORMANCE_VENDEDOR = "ml_performance_vendedor_v2"

# Full model references
FULL_MODEL_WIN_LOSS = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_WIN_LOSS}"
FULL_MODEL_CLASSIFICADOR_PERDA = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_CLASSIFICADOR_PERDA}"
FULL_MODEL_RISCO_ABANDONO = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_RISCO_ABANDONO}"
FULL_MODEL_PROXIMA_ACAO = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_PROXIMA_ACAO}"
FULL_MODEL_PRIORIDADE_DEAL = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_PRIORIDADE_DEAL}"
FULL_MODEL_PREVISAO_CICLO = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_PREVISAO_CICLO}"
FULL_MODEL_PERFORMANCE_VENDEDOR = f"{PROJECT_ID}.{DATASET_ID}.{MODEL_PERFORMANCE_VENDEDOR}"

# ========================================
# SCHEMA DEFINITIONS
# ========================================

# Pipeline critical columns
PIPELINE_COLUMNS = [
    "Run_ID", "Oportunidade", "Conta", "Perfil", "Produtos", "Vendedor",
    "Gross", "Net", "Fase_Atual", "Forecast_SF", "Fiscal_Q", "Data_Prevista",
    "Ciclo_dias", "Dias_Funil", "Atividades", "Atividades_Peso", "Mix_Atividades",
    "Idle_Dias", "Qualidade_Engajamento", "Forecast_IA", "Confianca",
    "Motivo_Confianca", "MEDDIC_Score", "MEDDIC_Gaps", "MEDDIC_Evidencias",
    "BANT_Score", "BANT_Gaps", "BANT_Evidencias", "Justificativa_IA",
    "Regras_Aplicadas", "Incoerencia_Detectada", "Perguntas_de_Auditoria_IA",
    "Flags_de_Risco", "Gaps_Identificados", "Cod_Acao", "Acao_Sugerida",
    "Risco_Principal", "Total_Mudancas", "Mudancas_Criticas",
    "Mudancas_Close_Date", "Mudancas_Stage", "Mudancas_Valor",
    "Anomalias_Detectadas", "Velocity_Predicao", "Velocity_Detalhes",
    "Territorio_Correto", "Vendedor_Designado", "EstadoCidade_Detectado",
    "Fonte_Deteccao", "Calendario_Faturacao", "Valor_Reconhecido_Q1",
    "Valor_Reconhecido_Q2", "Valor_Reconhecido_Q3", "Valor_Reconhecido_Q4",
    "Ultima_Atualizacao", "data_carga"
]

# Closed deals critical columns
CLOSED_DEALS_COLUMNS = [
    "Run_ID", "Oportunidade", "Conta", "Perfil_Cliente", "Vendedor",
    "Gross", "Net", "Portfolio", "Segmento", "Familia_Produto", "Status",
    "Fiscal_Q", "Data_Fechamento", "Ciclo_dias", "Produtos",
    "Resumo_Analise", "Causa_Raiz", "Tipo_Resultado",
    "Qualidade_Engajamento", "Gestao_Oportunidade", "Licoes_Aprendidas",
    "Atividades", "Ativ_7d", "Ativ_30d", "Distribuicao_Tipos",
    "Periodo_Pico", "Cadencia_Media_dias", "Total_Mudancas",
    "Mudancas_Criticas", "Mudancas_Close_Date", "Mudancas_Stage",
    "Mudancas_Valor", "Campos_Alterados", "Padrao_Mudancas",
    "Freq_Mudancas", "Editores", "Labels", "Ultima_Atualizacao",
    "outcome", "data_carga"
]

# Additional columns for closed_deals_won
CLOSED_WON_EXTRA_COLUMNS = ["Fatores_Sucesso"]

# Additional columns for closed_deals_lost
CLOSED_LOST_EXTRA_COLUMNS = [
    "Causas_Secundarias", "Evitavel", "Sinais_Alerta", "Momento_Critico"
]

# ========================================
# API ENDPOINTS & FILTERS
# ========================================

# Fiscal quarters
FISCAL_QUARTERS = [
    "FY24-Q1", "FY24-Q2", "FY24-Q3", "FY24-Q4",
    "FY25-Q1", "FY25-Q2", "FY25-Q3", "FY25-Q4",
    "FY26-Q1", "FY26-Q2", "FY26-Q3", "FY26-Q4",
    "FY27-Q1", "FY27-Q2", "FY27-Q3", "FY27-Q4"
]

# Forecast categories
FORECAST_CATEGORIES = [
    "Commit", "Best Case", "Pipeline", "Omitted"
]

# Deal stages
DEAL_STAGES = [
    "Prospecting", "Qualification", "Proposal", "Negotiation",
    "Aprobación de Deal Desk", "Closed Won", "Closed Lost"
]

# ========================================
# ML CONFIGURATION
# ========================================

# Feature columns for ML models
ML_FEATURE_COLUMNS = [
    "Gross", "Net", "Ciclo_dias", "Dias_Funil", "Atividades",
    "Atividades_Peso", "Total_Mudancas", "Mudancas_Criticas",
    "Mudancas_Close_Date", "Mudancas_Valor"
]

# Target columns
ML_TARGET_OUTCOME = "outcome"  # WON/LOST
ML_TARGET_FORECAST = "Forecast_IA"  # Commit/Best Case/Pipeline
ML_TARGET_RISK = "Risco_Principal"
ML_TARGET_ACTION = "Acao_Sugerida"

# Model evaluation thresholds
ML_MIN_ACCURACY = 0.70
ML_MIN_PRECISION = 0.65
ML_MIN_RECALL = 0.60

# ========================================
# DATA QUALITY THRESHOLDS
# ========================================

# Minimum data coverage percentages
MIN_COVERAGE_PIPELINE = {
    "Grossminimum": 0.95,  # 95% dos deals devem ter Gross
    "Fiscal_Q": 0.90,  # 90% devem ter Fiscal_Q
    "Forecast_IA": 0.80,  # 80% devem ter Forecast_IA
    "MEDDIC_Score": 0.70,  # 70% devem ter MEDDIC
    "Atividades": 0.95,   # 95% devem ter Atividades
}

MIN_COVERAGE_CLOSED = {
    "Resumo_Analise": 0.50,  # 50% devem ter análise
    "Causa_Raiz": 0.50,
    "Atividades": 0.80,
    "Total_Mudancas": 0.60,
}

# ========================================
# LOGGING & MONITORING
# ========================================

LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Performance thresholds (milliseconds)
MAX_QUERY_TIME_MS = 5000
MAX_ENDPOINT_TIME_MS = 3000

# ========================================
# CACHE CONFIGURATION
# ========================================

CACHE_TTL_SECONDS = 300  # 5 minutes
CACHE_MAX_SIZE = 1000
ENABLE_CACHE = True

# ========================================
# CORS & SECURITY
# ========================================

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8080",
    "https://xerticaai.github.io"
]

ALLOWED_METHODS = ["GET", "POST", "OPTIONS"]
ALLOWED_HEADERS = ["Content-Type", "Authorization"]
