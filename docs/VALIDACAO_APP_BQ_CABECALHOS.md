# Validação Técnica — BQ x Cabeçalhos App

- Tabelas BQ validadas: closed_deals_lost, closed_deals_won, pipeline
- Total campos dicionário: 186
- App Sales Brasil (revalidado): S=63 | N=123
- Mudanças aplicadas em app_sales_brasil_sn: 34

## Divergências alteradas (top 100)

| item | campo_sql | antes | depois | evidencia |
|---:|---|:---:|:---:|---|
| 99 | perfil | N | S | BQ|APP_HEADERS |
| 105 | forecast_sf | N | S | BQ|APP_HEADERS |
| 110 | dias_funil | N | S | BQ|APP_HEADERS |
| 112 | atividades_peso | N | S | BQ|APP_HEADERS |
| 113 | mix_atividades | N | S | BQ|APP_HEADERS |
| 114 | idle_dias | N | S | BQ|APP_HEADERS |
| 116 | forecast_ia | N | S | BQ|APP_HEADERS |
| 118 | motivo_confianca | N | S | BQ|APP_HEADERS |
| 119 | meddic_score | N | S | BQ|APP_HEADERS |
| 120 | meddic_gaps | N | S | BQ|APP_HEADERS |
| 121 | meddic_evidencias | N | S | BQ|APP_HEADERS |
| 122 | bant_score | N | S | BQ|APP_HEADERS |
| 123 | bant_gaps | N | S | BQ|APP_HEADERS |
| 124 | bant_evidencias | N | S | BQ|APP_HEADERS |
| 126 | regras_aplicadas | N | S | BQ|APP_HEADERS |
| 127 | incoerencia_detectada | N | S | BQ|APP_HEADERS |
| 128 | perguntas_de_auditoria_ia | N | S | BQ|APP_HEADERS |
| 129 | flags_de_risco | N | S | BQ|APP_HEADERS |
| 130 | gaps_identificados | N | S | BQ|APP_HEADERS |
| 131 | cod_acao | N | S | BQ|APP_HEADERS |
| 132 | acao_sugerida | N | S | BQ|APP_HEADERS |
| 133 | risco_principal | N | S | BQ|APP_HEADERS |
| 139 | anomalias_detectadas | N | S | BQ|APP_HEADERS |
| 140 | velocity_predicao | N | S | BQ|APP_HEADERS |
| 141 | velocity_detalhes | N | S | BQ|APP_HEADERS |
| 142 | territorio_correto | N | S | BQ|APP_HEADERS |
| 143 | vendedor_designado | N | S | BQ|APP_HEADERS |
| 144 | estado_cidade_detectado | N | S | BQ|APP_HEADERS |
| 145 | fonte_deteccao | N | S | BQ|APP_HEADERS |
| 146 | calendario_faturacao | N | S | BQ|APP_HEADERS |
| 147 | valor_reconhecido_q1 | N | S | BQ|APP_HEADERS |
| 148 | valor_reconhecido_q2 | N | S | BQ|APP_HEADERS |
| 149 | valor_reconhecido_q3 | N | S | BQ|APP_HEADERS |
| 150 | valor_reconhecido_q4 | N | S | BQ|APP_HEADERS |