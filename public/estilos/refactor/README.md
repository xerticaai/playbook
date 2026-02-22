# Refactor Visual v4 (Camadas)

Arquitetura progressiva de estilo aplicada por cima do legado (`estilos-principais.css`) sem alterar HTML/JS funcional.

## Ordem de carregamento

1. `00-tokens.css` — tokens semânticos e dual theme
2. `10-base.css` — base global (body/tipografia/transições)
3. `20-layout.css` — sidebar, header e containers principais
4. `30-components.css` — botões, filtros, tabs, cards, tabelas e drilldowns
5. `40-overrides.css` — neutralização de estilos inline e ajustes responsivos

## Estratégia de migração

- Legado preservado como fallback.
- Overrides concentrados no entrypoint `estilos-refactor-v4.css`.
- Sem remoção de blocos, métricas, abas, filtros ou funcionalidades existentes.
