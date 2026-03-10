# Status de Implantação — Mensuráveis L10 (foco na aba L10)

Data: 2026-02-27
Escopo: inventário real do que já está disponível no app/API e plano objetivo para começar a subir L10 sem mexer na visão executiva.

## 1) O que existe hoje (comprovação no código)

### Frontend
- A aba L10 é a seção `#dashboard` em `public/index.html`.
- O render usa `const l10 = DATA.executive || DATA.l10 || {}` em `public/scripts/dashboard.js`.
- Hoje `DATA.l10` vem vazio no `normalizeCloudResponse` de `public/scripts/api-dados.js`; na prática os cards L10 estão sendo alimentados por `DATA.executive` (fallback).
- Carga principal do dashboard (`loadDashboardData`) já busca:
  - `/api/metrics`
  - `/api/pipeline`
  - `/api/closed/won`
  - `/api/closed/lost`
  - `/api/sales-specialist`

### Backend
- Endpoints consolidados já ativos:
  - `/api/metrics` (pipeline + won/lost + win rate + meta_analysis)
  - `/api/revenue/weekly` (mart_l10.v_faturamento_historico)
  - `/api/attainment` (mart_l10.v_attainment)
- Dataset `mart_l10` está configurado em `cloud-run/app/simple_api.py`.

## 2) Mapeamento dos mensuráveis solicitados

## 2.1 Pronto agora (sem modelagem nova)
1. Gross Revenue Weekly/Month/Quarter ($)
   - Fonte: `/api/revenue/weekly`.
2. Net Revenue Weekly/Month/Quarter ($)
   - Fonte: `/api/revenue/weekly`.
3. Gross Revenue Attainment (%)
   - Fonte: `/api/attainment`.
4. Net Revenue Attainment (%)
   - Fonte: `/api/attainment`.
5. Booking incremental por produto (Plataforma/Serviços/Soluções)
   - Fonte base existente: `mart_l10.v_booking_incremental` (documentada em `MART_L10_DICIONARIO_DADOS.md`).
   - Observação: falta endpoint dedicado para expor agregado pronto para UI L10.

## 2.2 Pronto com query/view adicional (sem mudar modelo lógico)
1. Pipeline incremental por produto (quarter/mês)
   - Fonte base: `mart_l10.v_pipeline_aberto`.
   - Necessário: endpoint agregado por `portfolio_label` e período.
2. Oportunidades geradas New/CS ($ e QNT)
   - Fonte base: `sales_intelligence.pipeline` (`Data_de_criacao`, `Perfil`, `Gross`, `Oportunidade`).
   - Necessário: query com recorte semanal e regras Q+.
3. Atividades realizadas New/SS/CS (#)
   - Fonte base: `sales_intelligence.atividades` + mapeamento vendedor/squad (`mart_l10.v_dim_vendedor`).
   - Necessário: normalização de `Status` (`Completada`/`Completed`) e join de squad.

## 2.3 Exige definição/modelagem adicional
1. Touch contas SS (#) com regra final de elegibilidade e janela Q+3
   - Dependência: regra fechada de squad SS + lógica final de touch por conta/oportunidade.
2. Booking incremental GTM ($)
   - Dependência: regra oficial de normalização de `gtm_2026`.
3. Margem promedio booking por produto (%) com definição oficial do campo de margem
   - Dependência: definição de campo oficial (ex.: `margem_percentual_final` vs alternativa).
4. Confiabilidade média forecast Sales/CS (%) com separação inequívoca CS vs SS
   - Dependência: separação oficial de squads (hoje parte é proxy).
5. Inadimplência ($)
   - Dependência: definição oficial dos status de inadimplência em `estado_pagamento`.

## 3) Gap crítico atual do frontend L10

Hoje o painel L10 não está consumindo um objeto `DATA.l10` dedicado; ele cai em fallback de `DATA.executive`.

Impacto:
- os cards L10 não representam fielmente a matriz de mensuráveis;
- há mistura semântica entre visão executiva e L10.

Correção recomendada (fase 1):
1. Criar endpoint `/api/l10/overview` com payload dedicado para L10.
2. Popular `DATA.l10` no `normalizeCloudResponse`.
3. Renderizar cards L10 somente a partir de `DATA.l10` (sem fallback para `DATA.executive`).

## 4) Plano de subida L10 (fases)

### Fase 1 (rápida, sem modelagem nova)
- Entregar na aba L10:
  - Revenue semanal/mensal/trimestral (gross/net)
  - Attainment gross/net
  - Booking incremental por produto
  - Pipeline incremental por produto
- Técnica:
  - novo endpoint `/api/l10/overview`
  - reutilizar `mart_l10` views existentes e `/api/revenue/weekly` + `/api/attainment`

### Fase 2 (query adicional + regras de negócio fechadas)
- Oportunidades geradas New/CS ($/QNT)
- Atividades realizadas New/SS/CS (#)
- Touch contas SS (#)

### Fase 3 (dependente de definição funcional)
- Booking GTM
- Margem promedio oficial
- Confiabilidade forecast/pipeline por squad
- Inadimplência oficial

## 5) Próxima execução recomendada (imediata)

Implementar Fase 1 com mínimo risco:
1. Backend: `/api/l10/overview` agregando os quatro blocos da fase 1.
2. Frontend: fazer `loadDashboardData` buscar esse endpoint.
3. Frontend: ligar os cards atuais da aba L10 ao payload novo.
4. Não alterar navegação, tabs ou estrutura da visão executiva.
