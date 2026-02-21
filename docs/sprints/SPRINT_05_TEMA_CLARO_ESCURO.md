# Sprint 05 — Tema Claro/Escuro (Dark/Light Mode)

## Objetivo
Implementar alternância de tema sem regressão visual e com persistência de preferência.

## Escopo
1. Botão de toggle de tema (claro/escuro).
2. Persistência em localStorage.
3. Tokenização de cores para evitar hardcode por componente.
4. Ajuste de contraste em cards, filtros, tooltips e gráficos.

## Critérios de aceite
- Troca de tema instantânea e estável.
- Preferência mantida ao recarregar.
- Legibilidade validada em ambas as variações.
- Sem quebra de hierarquia visual.

## Riscos
- Componentes com estilos inline inconsistentes.
- Gráficos com paletas inadequadas no modo claro.

## Mitigação
- Priorizar tokens CSS e revisar componentes críticos.
- Definir paletas semânticas por tema.
