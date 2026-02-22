# Vistoria Geral de UX/UI — 2026-02-22

## Resumo executivo
- A base visual está consistente e premium após o refactor por camadas.
- O topo de filtros foi ajustado para um padrão mais compacto (cápsula + ação de ajustes em ícone), alinhado à referência.
- A principal dívida agora é estrutural/acessibilidade (muito inline style e handlers inline), que limita manutenção e evolução de UX.
- Execução em progresso: P0 concluído e P1 avançando (wrappers + selects/inputs do bloco de filtros migrados para classes CSS).
- Drilldown reconstruído para modelo unificado: gráficos + mapa de palavras passam a abrir o mesmo shell executivo (lista/detalhe/toolbar/chips), com UX e interação consistentes.
- Novo avanço P1: abas executivas e markup do drilldown legados migrados de inline para classes, reduzindo mais dívida visual sem alterar regras de negócio.
- Ajuste crítico de UX aplicado: drilldown com detalhe fixo visível (mesmo com listas longas), variação de cor por origem, bloco explícito de riscos da oportunidade, painel mais amplo e cabeçalho principal mais condensado (toggle de tema movido para sidebar).

## Evidências rápidas (index.html)
- `style="..."`: **385** ocorrências
- `onclick="..."`: **60** ocorrências
- `<button>`: **47** ocorrências
- `aria-label`: **6** ocorrências
- `<select>`: **17** ocorrências

## Melhorias avançadas recomendadas (priorizadas)

### P0 — Alto impacto / baixo risco
1. **Acessibilidade de controles críticos**
   - Adicionar `aria-label` em botões apenas-ícone (tema, atualizar, mostrar filtros, fechar painéis).
   - Adicionar estado de foco visível consistente para botões, tabs, selects e chips.
   - Garantir contraste mínimo AA para texto secundário em modo claro.

2. **Modelo de estado de filtros mais legível**
   - Exibir resumo persistente: período + modo (`GROSS/NET`) + contagem de filtros ativos.
   - Padronizar semântica visual de “ativo” em pills e tabs (cor + peso + borda).

3. **Performance perceptiva em carregamento**
   - Skeletons em KPI cards e tabelas nos primeiros 500–1200ms de fetch.
   - Placeholder para gráfico/drilldown com transição curta para reduzir flicker.

### P1 — Médio impacto / risco controlado
4. **Redução progressiva de inline styles**
   - Migrar primeiro o bloco `#filters-container` para classes utilitárias internas.
   - Manter o mesmo HTML/JS funcional, trocando gradualmente atributos inline por classes em camadas.

5. **Consistência de densidade visual por breakpoint**
   - Consolidar escala tipográfica por viewport (desktop/tablet/mobile/small-mobile).
   - Padronizar alturas mínimas (`30/34/36`) para botões e chips.

6. **Tabela e leitura analítica**
   - Melhorar scannability: zebra discreto + hover mais semântico + cabeçalho sticky em tabelas longas.
   - Priorizar colunas-chave visualmente (ex.: valor, confiança, fase).

### P2 — Alto valor estratégico
7. **Sistema de tokens semânticos de estado**
   - Expandir tokens para `success/warning/danger/info` em superfícies, badges e alertas.
   - Criar escala de opacidade única para dark/light e reduzir variações ad-hoc.

8. **Motion system unificado**
   - Definir durações/curvas para transições (`fast/normal/slow`) e aplicar somente em interações significativas.
   - Respeitar `prefers-reduced-motion`.

9. **UX operacional para drilldowns**
   - Aumentar previsibilidade de contexto (breadcrumb de origem + filtros herdados no topo do modal).
   - Ações primárias fixas no rodapé do painel em mobile.

## Próxima execução sugerida (sprint curto)
1. Sprint 1 (1–2 dias): acessibilidade P0 + resumo de filtros ativos.
2. Sprint 2 (2–3 dias): migração parcial de inline styles no topo/filtros.
3. Sprint 3 (2 dias): skeletons + ajustes de tabela/drilldown.

## Critérios de aceite
- Nenhuma regressão funcional de filtros/abas/drilldown.
- Navegação por teclado funcional nos principais fluxos.
- Contraste AA validado nos componentes críticos em dark/light.
- Melhoria perceptível da leitura dos filtros no topo e do estado ativo.
