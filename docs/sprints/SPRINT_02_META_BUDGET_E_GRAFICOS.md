# Sprint 02 — Meta vs Budget + Visualizações Executivas

## Objetivo
Adicionar leitura de performance contra meta/budget com gráficos claros e orientados a decisão.

## Escopo
1. Card principal de atingimento (Meta vs Realizado).
2. Visual de tendência temporal (mensal/quarter).
3. Visual de gap por vendedor ou segmento.
4. Estado semântico (acima meta / na meta / abaixo meta).

## Componentes previstos
- KPI de atingimento (%)
- Barra de progresso com meta
- Gráfico de linha para evolução
- Gráfico de barras para gap

## Critérios de aceite
- Métrica de atingimento calculada e coerente.
- Gráficos legíveis em desktop sem poluição visual.
- Estados de alerta acionáveis para análise posterior.
- Alinhamento com filtros globais ativos.

## Dependências
- Dados de meta e budget consistentes no período filtrado.

## Riscos
- Falta de padronização de metas por recorte.
- Sobrecarga visual por excesso de gráfico.

## Mitigação
- Limitar a 2–3 gráficos na camada executiva.
- Detalhes avançados via drill-down.
