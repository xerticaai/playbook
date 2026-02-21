# Sprint 03 — Flags de Risco Clicáveis com Drill-down

## Objetivo
Transformar alertas de risco em pontos de entrada acionáveis para listas exatas de oportunidades.

## Escopo
1. Tornar flags de risco clicáveis.
2. Abrir drill-down com oportunidades que compõem cada flag.
3. Exibir regra de cálculo e filtros herdados no painel.
4. Permitir exportação da lista.

## Alertas prioritários
- Confiança baixa
- Data prevista vencida
- Necessidade de engajar champion
- Idle elevado

## Critérios de aceite
- Clique em flag abre lista correta e reproduzível.
- Regra e base da métrica ficam visíveis ao usuário.
- Exportação mantém os mesmos itens do drill-down.

## Riscos
- Divergência entre contagem do card e lista detalhada.

## Mitigação
- Reuso da mesma função de filtragem para card/lista/export.
