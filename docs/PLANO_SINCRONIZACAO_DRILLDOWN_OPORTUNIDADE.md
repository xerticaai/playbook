# Plano de Drilldown de Revenue (Estado Atual)

## Objetivo

Manter o drilldown de Revenue **100% baseado em faturamento** e isolado de Booking, sem qualquer correlação automática com `won`, `lost` ou `pipeline`.

## Decisão Oficial

- Não usar endpoint de linkage.
- Não usar parse/fuzzy/normalização para casar oportunidades.
- Não exibir badges de match no drilldown de Revenue.
- Não misturar bases de oportunidade no painel de Revenue.

## Fonte de Dados

- Fonte única de Revenue: `mart_l10.v_faturamento_historico`.
- Endpoint principal: `GET /api/revenue/drilldown`.

## Escopo do Drilldown de Revenue

- Lista de oportunidades vindas diretamente da linha de faturamento.
- Campos financeiros e operacionais da própria planilha/fonte ERP:
  - gross/net
  - status de pagamento
  - produto, comercial, família
  - documento, contas, segmento, etapa
  - câmbio, custo, margem, desconto

## Regras de UX

- Revenue abre no shell executivo atual, mas com dados apenas de faturamento.
- Cards/ações de Revenue não podem cair no fallback de “base consolidada de oportunidades”.
- Booking segue inalterado no seu próprio fluxo.

## Critérios de Aceite

- Clique em gráfico de Revenue abre somente registros de faturamento do recorte clicado.
- Clique em Top Contas abre drilldown por cliente na mesma fonte de faturamento.
- O painel de Revenue não mostra won/lost/pipeline.
- Oportunidade exibida é exatamente a da linha de faturamento.

## Observação de Governança

Qualquer futura tentativa de reconciliação entre bases deve ser tratada como iniciativa separada, com aprovação explícita e sem alterar o fluxo padrão de Revenue.
