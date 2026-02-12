-- ==========================================================================
-- VIEW 6: Próxima Ação Recomendada (RULE-BASED)
-- ==========================================================================
-- Objetivo: sugerir próxima ação com base em prioridade/risco/urgência.
-- Saída consumida pelo dashboard/API:
--   - VIEW: sales_intelligence.pipeline_proxima_acao
-- ============================================================================

CREATE OR REPLACE VIEW `sales_intelligence.pipeline_proxima_acao` AS
WITH base AS (
  SELECT
    pd.opportunity,
    pd.Vendedor,
    SAFE_CAST(pd.Gross AS FLOAT64) AS Gross,
    pd.priority_score,
    pd.priority_level,
    pd.prob_abandono,
    pd.nivel_risco,

    SAFE_CAST(p.Atividades AS INT64) AS Atividades,
    SAFE_CAST(p.Dias_Funil AS INT64) AS Dias_Funil,
    p.Data_Prevista,

    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', CAST(p.Data_Prevista AS STRING)),
      SAFE.PARSE_DATE('%d-%m-%Y', CAST(p.Data_Prevista AS STRING))
    ) AS data_prevista_date

  FROM `sales_intelligence.pipeline_prioridade_deals` pd
  LEFT JOIN `sales_intelligence.pipeline` p
    ON pd.opportunity = p.Oportunidade
),
pr AS (
  SELECT
    base.*,
    DATE_DIFF(base.data_prevista_date, CURRENT_DATE(), DAY) AS dias_ate_close
  FROM base
)
SELECT
  opportunity,
  Gross,
  Vendedor,

  CASE
    WHEN COALESCE(Atividades, 0) < 2 AND COALESCE(Dias_Funil, 0) > 30 AND COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'REATIVAR_URGENTE'
    WHEN dias_ate_close < 0
      THEN 'REPLANEJAR_CLOSE'
    WHEN dias_ate_close <= 7 AND dias_ate_close >= 0 AND COALESCE(nivel_risco, 'BAIXO') IN ('ALTO', 'MÉDIO')
      THEN 'FECHAR_URGENTE'
    WHEN COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'PREVENIR_PERDA'
    WHEN Gross > 100000 AND priority_level IN ('CRÍTICO', 'ALTO')
      THEN 'PRIORIZAR_RECURSOS'
    WHEN COALESCE(Atividades, 0) < 5 AND COALESCE(nivel_risco, 'BAIXO') IN ('ALTO', 'MÉDIO')
      THEN 'AUMENTAR_FREQUENCIA'
    ELSE 'MANTER_RITMO'
  END AS categoria_acao,

  CASE
    WHEN COALESCE(Atividades, 0) < 2 AND COALESCE(Dias_Funil, 0) > 30 AND COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'ALTA'
    WHEN dias_ate_close < 0
      OR (dias_ate_close <= 7 AND COALESCE(nivel_risco, 'BAIXO') IN ('ALTO', 'MÉDIO'))
      OR COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'ALTA'
    WHEN COALESCE(nivel_risco, 'BAIXO') = 'MÉDIO' OR COALESCE(Atividades, 0) < 5
      THEN 'MÉDIA'
    ELSE 'BAIXA'
  END AS urgencia,

  CASE
    WHEN COALESCE(Atividades, 0) < 2 AND COALESCE(Dias_Funil, 0) > 30 AND COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN CONCAT('REATIVAR: deal parado há ', CAST(COALESCE(Dias_Funil, 0) AS STRING), ' dias com ', CAST(COALESCE(Atividades, 0) AS STRING), ' atividades')
    WHEN dias_ate_close < 0
      THEN CONCAT('REPLANEJAR: close passou há ', CAST(ABS(dias_ate_close) AS STRING), ' dias')
    WHEN dias_ate_close <= 7 AND COALESCE(nivel_risco, 'BAIXO') IN ('ALTO', 'MÉDIO')
      THEN CONCAT('FECHAR AGORA: ', CAST(dias_ate_close AS STRING), ' dias restantes, risco ', COALESCE(nivel_risco, 'BAIXO'))
    WHEN COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'PREVENIR PERDA: envolver gestor e revisar plano'
    WHEN Gross > 100000 AND priority_level IN ('CRÍTICO', 'ALTO')
      THEN CONCAT('PRIORIZAR: deal valioso $', CAST(ROUND(Gross, 0) AS STRING))
    WHEN COALESCE(Atividades, 0) < 5
      THEN CONCAT('AUMENTAR FREQUÊNCIA: apenas ', CAST(COALESCE(Atividades, 0) AS STRING), ' atividades')
    ELSE 'MANTER RITMO: continuar follow-up'
  END AS acao_recomendada,

  CASE
    WHEN COALESCE(Atividades, 0) < 2 AND COALESCE(Dias_Funil, 0) > 30
      THEN 'Ligar hoje → Validar interesse → Re-qualificar → Definir próximos passos'
    WHEN dias_ate_close < 0
      THEN 'Call urgente → Entender atraso → Atualizar CRM → Revisar forecast'
    WHEN dias_ate_close <= 7
      THEN 'Confirmar proposta → Remover bloqueadores → Agendar assinatura'
    WHEN COALESCE(nivel_risco, 'BAIXO') = 'ALTO'
      THEN 'Discovery call → Identificar objeções → Ajustar proposta → Envolver decisor'
    WHEN Gross > 100000
      THEN 'Escalar manager → Alocar SE → Demo custom → Business case'
    WHEN COALESCE(Atividades, 0) < 5
      THEN 'Calls semanais → Enviar conteúdo → Propor workshop → Criar urgência'
    ELSE 'Follow-up regular → Atualizar CRM → Revisar próximos passos'
  END AS detalhes_execucao

FROM pr
ORDER BY
  CASE urgencia WHEN 'ALTA' THEN 1 WHEN 'MÉDIA' THEN 2 ELSE 3 END,
  priority_score DESC;
