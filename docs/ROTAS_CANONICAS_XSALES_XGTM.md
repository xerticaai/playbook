# Rotas Canonicas: x-sales vs x-gtm

Data: 2026-03-10
Status: Ativo

## Principio

Os dominios `x-sales` e `x-gtm` sao separados por design e nao devem fazer redirect cruzado automatico no hosting.

- `x-sales`: SPA nova (React)
- `x-gtm`: portal legado

## Dominio Canonico por Produto

1. Produto Sales novo
- Dominio canonico: `https://x-sales.web.app`
- Rota canonica: `/sales`

2. Modulos novos (mesma SPA)
- `/executivo`
- `/marketing`
- `/automacao`
- `/admin`

3. Portal legado
- Dominio canonico: `https://x-gtm.web.app`
- Mantem suas rotas e comportamento proprio

## Aliases aceitos (somente no x-sales)

Para compatibilidade de links antigos no mesmo dominio:

- `/vendedores` -> `/sales`
- `/seller` -> `/sales`
- `/dashboard` -> `/executivo`

## Regras de governanca de rota

1. Nao criar redirect cross-domain em `x-gtm` para `x-sales` no `firebase.json`.
2. Links para modulo novo devem apontar diretamente para `x-sales` quando originados fora da SPA nova.
3. Dentro da SPA nova, usar apenas as rotas canonicas acima.
4. Aliases devem existir apenas para backward compatibility e sempre redirecionar para a rota canonica.
