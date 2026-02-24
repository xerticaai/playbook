# schema_constants.py
# Fonte única de verdade para nomes de colunas das tabelas BigQuery.
# DATASET: operaciones-br.sales_intelligence
#
# USO: from schema_constants import PIPELINE, CLOSED_WON, CLOSED_LOST
# Exemplo: f"SELECT {PIPELINE.OPORTUNIDADE}, {PIPELINE.CONFIANCA} FROM ..."
#
# IMPORTANTE: qualquer alteração de nome de coluna no BQ deve ser refletida aqui.

class _Pipeline:
    """Tabela: pipeline — deals ativos/em andamento"""
    TABLE = "pipeline"

    # Identificação
    OPORTUNIDADE       = "Oportunidade"
    CONTA              = "Conta"
    VENDEDOR           = "Vendedor"
    OWNER_PREVENTA     = "Owner_Preventa"

    # Estágio e datas
    FASE_ATUAL         = "Fase_Atual"
    DATA_PREVISTA      = "Data_Prevista"
    DATA_CRIACAO       = "Data_de_criacao"
    FISCAL_Q           = "Fiscal_Q"

    # Valores
    GROSS              = "Gross"
    NET                = "Net"

    # Qualificação e scoring
    CONFIANCA          = "Confianca"        # INT64, 0-100
    FORECAST_SF        = "Forecast_SF"
    FORECAST_IA        = "Forecast_IA"
    MEDDIC_SCORE       = "MEDDIC_Score"     # STRING, percentual 0-100
    MEDDIC_GAPS        = "MEDDIC_Gaps"
    MEDDIC_EVIDENCIAS  = "MEDDIC_Evidencias"
    BANT_SCORE         = "BANT_Score"       # STRING
    BANT_GAPS          = "BANT_Gaps"
    BANT_EVIDENCIAS    = "BANT_Evidencias"
    RISCO_PRINCIPAL    = "Risco_Principal"
    GAPS_IDENTIFICADOS = "Gaps_Identificados"
    REGRAS_APLICADAS   = "Regras_Aplicadas"

    # Atividade e engajamento
    ATIVIDADES         = "Atividades"       # INT64
    IDLE_DIAS          = "Idle_Dias"        # INT64
    CICLO_DIAS         = "Ciclo_dias"       # STRING (dias como texto)
    QUALIDADE_ENGAJAMENTO = "Qualidade_Engajamento"

    # IA / Inteligência
    JUSTIFICATIVA_IA   = "Justificativa_IA"
    MOTIVO_CONFIANCA   = "Motivo_Confianca"
    ACAO_SUGERIDA      = "Acao_Sugerida"
    PERGUNTAS_AUDITORIA = "Perguntas_de_Auditoria_IA"
    INCOERENCIA_DETECTADA = "Incoerencia_Detectada"

    # Dimensões
    VERTICAL_IA        = "Vertical_IA"
    SUB_VERTICAL_IA    = "Sub_vertical_IA"
    SUB_SUB_VERTICAL_IA = "Sub_sub_vertical_IA"
    SEGMENTO_CONSOLIDADO = "Segmento_consolidado"
    SUBSEGMENTO_MERCADO = "Subsegmento_de_mercado"
    PORTFOLIO_FDM      = "Portfolio_FDM"
    PORTFOLIO          = "Portfolio"
    CIDADE_COBRANCA    = "Cidade_de_cobranca"
    ESTADO_COBRANCA    = "Estado_Provincia_de_cobranca"
    TIPO_OPORTUNIDADE  = "Tipo_Oportunidade"
    PROCESSO           = "Processo"
    PROCESSO_IA        = "Processo_IA"
    PERFIL             = "Perfil"
    PRODUTOS           = "Produtos"


class _ClosedWon:
    """Tabela: closed_deals_won — deals ganhos (39 colunas, sem dimensões IA)"""
    TABLE = "closed_deals_won"

    # Identificação
    OPORTUNIDADE       = "Oportunidade"
    CONTA              = "Conta"
    VENDEDOR           = "Vendedor"

    # Datas e estágio
    DATA_FECHAMENTO    = "Data_Fechamento"
    FISCAL_Q           = "Fiscal_Q"
    STATUS             = "Status"
    TIPO_RESULTADO     = "Tipo_Resultado"

    # Valores
    GROSS              = "Gross"
    NET                = "Net"

    # Análise
    CICLO_DIAS         = "Ciclo_dias"       # STRING
    ATIVIDADES         = "Atividades"
    FATORES_SUCESSO    = "Fatores_Sucesso"
    CAUSA_RAIZ         = "Causa_Raiz"
    PRODUTOS           = "Produtos"
    PERFIL_CLIENTE     = "Perfil_Cliente"
    RESUMO_ANALISE     = "Resumo_Analise"
    LICOES_APRENDIDAS  = "Licoes_Aprendidas"

    # NOTA: closed_deals_won NÃO tem Vertical_IA, Portfolio_FDM, Segmento_consolidado etc.


class _ClosedLost:
    """Tabela: closed_deals_lost — deals perdidos (61 colunas, com dimensões IA)"""
    TABLE = "closed_deals_lost"

    # Identificação
    OPORTUNIDADE       = "Oportunidade"
    CONTA              = "Conta"
    VENDEDOR           = "Vendedor"
    OWNER_PREVENTA     = "Owner_Preventa"

    # Datas e estágio
    DATA_FECHAMENTO    = "Data_Fechamento"
    FISCAL_Q           = "Fiscal_Q"
    STATUS             = "Status"
    TIPO_RESULTADO     = "Tipo_Resultado"

    # Valores
    GROSS              = "Gross"
    NET                = "Net"

    # Análise
    CICLO_DIAS         = "Ciclo_dias"       # STRING
    ATIVIDADES         = "Atividades"
    CAUSA_RAIZ         = "Causa_Raiz"
    FATORES_SUCESSO    = "Fatores_Sucesso"
    EVITAVEL           = "Evitavel"
    RESUMO_ANALISE     = "Resumo_Analise"
    LICOES_APRENDIDAS  = "Licoes_Aprendidas"
    SINAIS_ALERTA      = "Sinais_Alerta"
    MOMENTO_CRITICO    = "Momento_Critico"

    # IA
    JUSTIFICATIVA_IA   = "Justificativa_IA"
    EVIDENCIA_CITADA_IA = "Evidencia_Citada_IA"
    AVALIACAO_PERSONAS_IA = "Avaliacao_Personas_IA"

    # Dimensões (closed_lost TEM, closed_won NÃO tem)
    VERTICAL_IA        = "Vertical_IA"
    SUB_VERTICAL_IA    = "Sub_vertical_IA"
    SUB_SUB_VERTICAL_IA = "Sub_sub_vertical_IA"
    SEGMENTO_CONSOLIDADO = "Segmento_consolidado"
    SUBSEGMENTO_MERCADO = "Subsegmento_de_mercado"
    PORTFOLIO_FDM      = "Portfolio_FDM"
    CIDADE_COBRANCA    = "Cidade_de_cobranca"
    ESTADO_COBRANCA    = "Estado_Provincia_de_cobranca"
    TIPO_OPORTUNIDADE  = "Tipo_Oportunidade"
    PROCESSO           = "Processo"
    PROCESSO_IA        = "Processo_IA"


# Instâncias públicas
PIPELINE    = _Pipeline()
CLOSED_WON  = _ClosedWon()
CLOSED_LOST = _ClosedLost()

# Mapeamento frontend → backend para parâmetros de filtro comuns
# Chave = nome do param de query param da API
# Valor = nome da coluna BQ
FILTER_PARAM_TO_COLUMN = {
    "phase":              "Fase_Atual",           # apenas pipeline
    "tipo_oportunidade":  "Tipo_Oportunidade",
    "processo":           "Processo",
    "seller":             "Vendedor",
    "owner_preventa":     "Owner_Preventa",
    "vertical_ia":        "Vertical_IA",
    "sub_vertical_ia":    "Sub_vertical_IA",
    "sub_sub_vertical_ia": "Sub_sub_vertical_IA",
    "segmento_consolidado": "Segmento_consolidado",
    "subsegmento_mercado":  "Subsegmento_de_mercado",
    "portfolio_fdm":      "Portfolio_FDM",
    "billing_city":       "Cidade_de_cobranca",
    "billing_state":      "Estado_Provincia_de_cobranca",
}
