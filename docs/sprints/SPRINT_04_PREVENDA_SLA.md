# Sprint 04 — Pré-venda no Pipeline + KPI de SLA

## Objetivo
Incluir a dimensão de pré-venda no pipeline aberto e medir SLA de conclusão de tarefas.

## Escopo
1. Exibir Pré-venda atribuído na visão de pipeline.
2. Criar KPI de SLA (% no prazo, médio de conclusão, fora do SLA).
3. Habilitar filtro e drill-down por pré-venda.
4. Evidenciar oportunidades estagnadas com contexto de pré-venda.

## Regra base sugerida (ajustável)
- Estagnação: >90 dias na mesma fase e última atividade >30 dias.

## Critérios de aceite
- Campo de pré-venda visível e consistente no pipeline.
- KPI SLA calculado com regra explícita.
- Drill-down de fora do SLA funcional.

## Dependências
- Timestamps confiáveis de criação/conclusão de tarefas.
- Owner de pré-venda em base de pipeline.

## Riscos
- Dados incompletos de tarefas.

## Mitigação
- Exibir cobertura de dados e fallback transparente.
