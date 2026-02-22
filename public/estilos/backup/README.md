# Backup de Estilos

Este diretório guarda snapshots do CSS principal antes de refactors visuais amplos.

## Snapshot atual

- `estilos-principais.pre-refactor-2026-02-22.css`
  - Origem: `public/estilos/estilos-principais.css`
  - Motivo: base congelada antes da camada de refatoração visual `estilos-refactor-v4.css`

## Estratégia adotada

- O HTML e os dados do dashboard permanecem intactos.
- A nova camada visual é aplicada por override em arquivo separado.
- O rollback é simples: remover o include de `estilos-refactor-v4.css` em `public/index.html`.
