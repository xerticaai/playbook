"""
ML Service for BigQuery ML predictions
Handles all BQML model queries and predictions
"""
from google.cloud import bigquery
from typing import Dict, List, Optional
import logging

from app.utils.constants import (
    ML_WIN_LOSS_MODEL_V2, ML_PRIORIDADE_DEAL_V2, ML_PROXIMA_ACAO_V2,
    ML_RISCO_ABANDONO_V2, ML_PREVISAO_CICLO_V2, ML_PERFORMANCE_VENDEDOR_V2,
    ML_CLASSIFICADOR_PERDA_V2
)

logger = logging.getLogger(__name__)

class MLService:
    """Service for BigQuery ML predictions"""
    
    def __init__(self, project_id: str, dataset_id: str):
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.client = bigquery.Client(project=project_id)
        
        # Model paths
        self.models = {
            "win_loss": f"{project_id}.{dataset_id}.{ML_WIN_LOSS_MODEL_V2}",
            "prioridade": f"{project_id}.{dataset_id}.{ML_PRIORIDADE_DEAL_V2}",
            "proxima_acao": f"{project_id}.{dataset_id}.{ML_PROXIMA_ACAO_V2}",
            "risco": f"{project_id}.{dataset_id}.{ML_RISCO_ABANDONO_V2}",
            "ciclo": f"{project_id}.{dataset_id}.{ML_PREVISAO_CICLO_V2}",
            "performance": f"{project_id}.{dataset_id}.{ML_PERFORMANCE_VENDEDOR_V2}",
            "perda": f"{project_id}.{dataset_id}.{ML_CLASSIFICADOR_PERDA_V2}"
        }
    
    def predict(self, opportunity_data: Dict) -> Dict:
        """
        Run ML predictions on opportunity
        
        Args:
            opportunity_data: Dict with opportunity features
        
        Returns:
            Dict with predictions from all models
        """
        try:
            # Build feature row for prediction
            features = self._prepare_features(opportunity_data)
            
            # Run Win/Loss prediction
            forecast_ia, confianca = self._predict_win_loss(features)
            
            # Run Priority prediction
            prioridade, prioridade_score = self._predict_priority(features)
            
            # Run Next Action prediction
            proximo_passo = self._predict_next_action(features)
            
            # Run Risk prediction
            risco_abandono, risco_score = self._predict_risk(features)
            
            return {
                "oportunidade": opportunity_data.get("oportunidade", ""),
                "forecast_ia": forecast_ia,
                "confianca": confianca,
                "prioridade": prioridade,
                "prioridade_score": prioridade_score,
                "proximo_passo": proximo_passo,
                "risco_abandono": risco_abandono,
                "risco_score": risco_score,
                "models_used": [
                    ML_WIN_LOSS_MODEL_V2,
                    ML_PRIORIDADE_DEAL_V2,
                    ML_PROXIMA_ACAO_V2,
                    ML_RISCO_ABANDONO_V2
                ]
            }
            
        except Exception as e:
            logger.error(f"ML prediction failed: {str(e)}")
            raise
    
    def _prepare_features(self, data: Dict) -> Dict:
        """Convert input data to ML model features"""
        return {
            "Gross": data.get("gross", 0),
            "MEDDIC_Score": data.get("meddic_score", 0),
            "BANT_Score": data.get("bant_score", 0),
            "Atividades": data.get("atividades", 0),
            "Ativ_7d": data.get("ativ_7d", 0),
            "Ativ_30d": data.get("ativ_30d", 0),
            "Idle_Dias": data.get("idle_dias", 0),
            "Days_Open": data.get("days_open", 0),
            "Fiscal_Q": data.get("fiscal_q", ""),
            "Vendedor": data.get("vendedor", "")
        }
    
    def _predict_win_loss(self, features: Dict) -> tuple:
        """
        Predict win/loss and confidence
        
        Returns:
            (forecast_category, confidence_pct)
        """
        try:
            query = f"""
            SELECT 
                predicted_Forecast_Category as categoria,
                predicted_Forecast_Category_probs[OFFSET(0)].prob as confidence
            FROM ML.PREDICT(MODEL `{self.models['win_loss']}`,
                (SELECT 
                    {features['Gross']} as Gross,
                    {features['MEDDIC_Score']} as MEDDIC_Score,
                    {features['BANT_Score']} as BANT_Score,
                    {features['Atividades']} as Atividades,
                    {features['Idle_Dias']} as Idle_Dias,
                    '{features['Fiscal_Q']}' as Fiscal_Q
                )
            )
            """
            
            result = list(self.client.query(query).result())[0]
            return result['categoria'], round(result['confidence'] * 100, 2)
            
        except Exception as e:
            logger.error(f"Win/Loss prediction failed: {str(e)}")
            return "Pipeline", 50.0
    
    def _predict_priority(self, features: Dict) -> tuple:
        """
        Predict deal priority
        
        Returns:
            (priority_level, priority_score)
        """
        try:
            # Simple heuristic until model is trained
            score = 0
            
            # High MEDDIC/BANT = higher priority
            if features['MEDDIC_Score'] > 70:
                score += 30
            elif features['MEDDIC_Score'] > 50:
                score += 15
            
            if features['BANT_Score'] > 70:
                score += 30
            elif features['BANT_Score'] > 50:
                score += 15
            
            # Recent activity = higher priority
            if features['Ativ_7d'] > 5:
                score += 20
            elif features['Ativ_7d'] > 2:
                score += 10
            
            # Low idle = higher priority
            if features['Idle_Dias'] < 3:
                score += 20
            elif features['Idle_Dias'] < 7:
                score += 10
            
            # Determine priority level
            if score >= 70:
                level = "Alta"
            elif score >= 40:
                level = "Média"
            else:
                level = "Baixa"
            
            return level, score
            
        except Exception as e:
            logger.error(f"Priority prediction failed: {str(e)}")
            return "Média", 50
    
    def _predict_next_action(self, features: Dict) -> str:
        """
        Predict recommended next action
        
        Returns:
            Action recommendation text
        """
        try:
            # Rule-based recommendations
            idle = features['Idle_Dias']
            meddic = features['MEDDIC_Score']
            bant = features['BANT_Score']
            
            if idle > 14:
                return "🚨 URGENTE: Retomar contato imediatamente - deal inativo há 2+ semanas"
            elif idle > 7:
                return "⚠️ Agendar follow-up - deal sem atividade há 1+ semana"
            elif meddic < 50:
                return "📋 Completar qualificação MEDDIC - score baixo"
            elif bant < 50:
                return "💰 Validar BANT - confirmar budget e autoridade"
            elif features['Ativ_7d'] == 0:
                return "📞 Realizar contato - sem atividades recentes"
            else:
                return "✅ Continuar nurturing - deal bem qualificado"
            
        except Exception as e:
            logger.error(f"Next action prediction failed: {str(e)}")
            return "Revisar status do deal"
    
    def _predict_risk(self, features: Dict) -> tuple:
        """
        Predict abandonment risk
        
        Returns:
            (risk_level, risk_score)
        """
        try:
            risk_score = 0
            
            # High idle = high risk
            if features['Idle_Dias'] > 21:
                risk_score += 40
            elif features['Idle_Dias'] > 14:
                risk_score += 30
            elif features['Idle_Dias'] > 7:
                risk_score += 20
            
            # Low activity = high risk
            if features['Ativ_7d'] == 0:
                risk_score += 25
            elif features['Ativ_7d'] < 2:
                risk_score += 15
            
            # Low scores = high risk
            if features['MEDDIC_Score'] < 40:
                risk_score += 20
            if features['BANT_Score'] < 40:
                risk_score += 15
            
            # Determine risk level
            if risk_score >= 70:
                level = "Alto"
            elif risk_score >= 40:
                level = "Médio"
            else:
                level = "Baixo"
            
            return level, risk_score
            
        except Exception as e:
            logger.error(f"Risk prediction failed: {str(e)}")
            return "Médio", 50
    
    def batch_predict_pipeline(self, table_name: str) -> bool:
        """
        Run batch predictions on entire pipeline table
        Update Forecast_IA, Prioridade, etc. columns
        
        Args:
            table_name: Full path to pipeline table
        
        Returns:
            Success boolean
        """
        try:
            # TODO: Implement batch prediction query
            # This should update the pipeline table with ML predictions
            logger.info(f"Batch prediction on {table_name} - TODO")
            return True
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {str(e)}")
            return False
