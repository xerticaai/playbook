# Plano de Implantação UI/UX — Visão Executiva (Pré-Implementação)

## Objetivo
Reduzir a densidade visual da Visão Executiva e aumentar a velocidade de leitura de insights, priorizando decisões rápidas em até 30–60 segundos.

## Escopo
Este documento define **o plano antes de codar**:
1. Estratégia de UX anti-densidade (Sprint 0)
2. Roadmap de implementação por sprints
3. Critérios de aceite por sprint
4. Riscos e mitigação

## Princípios de UX (guidelines obrigatórias)
1. **Hierarchy First**: o usuário deve identificar o principal insight sem rolar a tela.
2. **Progressive Disclosure**: resumo primeiro, detalhes sob clique/expansão.
3. **Signal over Noise**: remover blocos redundantes e microtextos repetitivos.
4. **Net First**: valor Net é a métrica primária em visões executivas.
5. **Actionability**: cada alerta precisa permitir drill-down acionável.
6. **Consistency**: padrões únicos de cor, tipografia e estado interativo.

## Problemas de UX identificados (estado atual)
1. Excesso de cards concorrendo visualmente no mesmo nível.
2. Muito texto explicativo simultâneo e pouco foco no “insight principal”.
3. Tema escuro com alto peso em vários blocos (sensação de interface densa).
4. Top 5 e alguns indicadores ainda orientados a Gross em vez de Net.
5. Alertas de risco não totalmente orientados a ação (clique + lista exata).

## Arquitetura de Informação alvo (Visão Executiva)
### Camada 1 — Resumo Imediato (sem scroll)
- 4–6 KPIs essenciais
- Estado semântico (bom / atenção / crítico)
- 1 insight principal + 1 ação recomendada

### Camada 2 — Diagnóstico
- Riscos principais clicáveis
- Top oportunidades (já com Net)
- Comparação Meta vs Budget

### Camada 3 — Exploração
- Drill-down por cards e alertas
- Tabela detalhada por oportunidade
- Exportação e filtros avançados

## Roadmap de Sprints
- **Sprint 0**: Planejamento UX anti-densidade e baseline visual
- **Sprint 1**: Net em destaque + Top 5 orientado a Net + limpeza visual inicial
- **Sprint 2**: Meta vs Budget + gráficos executivos
- **Sprint 3**: Flags de risco clicáveis (drill-down)
- **Sprint 4**: Pré-venda no pipeline + SLA da equipe
- **Sprint 5**: Modo Noturno/Claro

## Definição de pronto (global)
Uma sprint é considerada pronta quando:
1. Critérios funcionais da sprint estiverem entregues.
2. Comportamento visual responsivo estiver consistente.
3. Não houver regressões críticas de filtros e drill-down.
4. Métricas-chave de leitura rápida estiverem preservadas (insight em até 60s).

## Métricas de sucesso UX
- Tempo para identificar “estado do quarter” < 60s
- Cliques para chegar a lista de oportunidades em risco ≤ 2
- Redução de blocos textuais simultâneos na primeira dobra
- Percepção de clareza superior em revisão de stakeholders

## Dependências
- Dados consistentes de pipeline/won/lost/atividades/meta
- Campos de pré-venda e datas para SLA
- Base de meta/budget disponível para agregações

## Riscos e mitigação
1. **Risco**: simplificação excessiva remover contexto
   - **Mitigação**: usar camadas com expansão (resumo → detalhe)
2. **Risco**: inconsistência de dados para novos gráficos
   - **Mitigação**: validar contratos de dados antes da UI
3. **Risco**: aumento de escopo em UX
   - **Mitigação**: bloquear itens fora da sprint atual

## Ordem de execução (obrigatória)
1. Aprovar este plano + Sprint 0
2. Aprovar documentação de cada sprint
3. Só então iniciar implementação técnica
