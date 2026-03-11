# Plano V2 — Camada de Vendedores com RLS Logico por Cargo (sem quebrar o atual)

Data: 2026-03-10
Status: Proposta de modelagem SQL + API (compativel com producao atual)
Premissa: manter 100% dos endpoints atuais e adicionar camada nova por feature flag / versao.

## 1. Validacao do schema real (BigQuery)

Tabelas confirmadas no dataset operaciones-br.sales_intelligence:

- pipeline
  - campos usados nesta proposta: Vendedor, Sales_Specialist_Envolvido, Net, Gross, Fiscal_Q, Velocity_Predicao, Risco_Principal, Perguntas_de_Auditoria_IA, Status_Governanca_SS, Elegibilidade_SS, Idle_Dias, Mudancas_Close_Date, Forecast_IA, Oportunidade, Conta, Data_Prevista, Fase_Atual, Atividades
- faturamento_2026
  - campos usados: net_revenue, comercial, tipo_oportunidade_line, produto, familia, oportunidade, cliente, fecha_factura, segmento, portafolio
- meta_bdm
  - campos usados: Tipo_de_meta, Sales_Specialist, BDM, Mes_Ano, Net_gerado, Net_faturado, Periodo_Fiscal
- atividades
  - tabela disponivel para drilldown de atividade (nao obrigatoria no calculo de KPI da regra solicitada)

## 2. Regra central de governanca (sem hardcode de nomes)

## 2.1 Nao usar nome hardcoded em SQL/API
A identidade de filtro vem do Portal Admin (Firestore xsales users), nao de lista fixa no codigo.

## 2.2 Campos de governanca sugeridos no usuario (Admin)
Adicionar no registro de usuario (sem remover os atuais):

- cargo
  - valores completos de cargo (exemplo: BDM, CS, Sales Specialist, Sales Ops, Diretoria)
- persona_dados
  - enum tecnico: BDM_CS | SS | ADMIN
- principal_owner
  - nome canonico para filtro owner (coluna pipeline.Vendedor e faturamento_2026.comercial)
- principal_ss
  - nome canonico para filtro especialista (coluna pipeline.Sales_Specialist_Envolvido e meta_bdm.Sales_Specialist)
- rls_scope
  - OWNER | SS | ALL

Observacao:
- manter hubs/cargo atuais para UX e navegacao.
- sellerCanonical atual pode virar alias de principal_owner para retrocompatibilidade.

## 2.2.1 Adequacao explicita do Portal Admin (Visao Sales)

Para deixar claro: sim, a governanca da visualizacao da Visao Sales deve nascer no Admin.

Campos novos no modal de usuario (Admin):
- persona_dados (BDM_CS | SS | ADMIN)
- principal_owner (obrigatorio quando persona_dados = BDM_CS)
- principal_ss (obrigatorio quando persona_dados = SS)
- rls_scope (OWNER | SS | ALL)

Regras de validacao no save:
- se persona_dados = BDM_CS e principal_owner vazio: bloquear salvamento
- se persona_dados = SS e principal_ss vazio: bloquear salvamento
- se persona_dados = ADMIN: permitir principals vazios e forcar rls_scope = ALL

Comportamento sem hardcode:
- nenhuma regra por nome fixo de pessoa no codigo
- filtro sempre baseado nos campos governados no cadastro do usuario
- alteracao de vinculo (owner/ss) feita somente no Admin, com efeito imediato na API

## 2.3 Resolucao de escopo no backend
No login/session:

1. Buscar usuario por email no endpoint xsales.
2. Derivar escopo:
   - persona_dados=BDM_CS => filtro OWNER usando principal_owner
   - persona_dados=SS => filtro SS usando principal_ss
   - persona_dados=ADMIN => sem filtro de pessoa (visao global)
3. Aplicar filtro no SQL da API sempre no backend (nunca confiar no frontend para RLS).

## 3. Modelagem de views SQL (novas, sem tocar nas atuais)

Dataset alvo: operaciones-br.mart_l10
Prefixo recomendado: v2_ (convivencia com views atuais)

## 3.1 KPI BDM/CS — Net Faturado Incremental

View: operaciones-br.mart_l10.v2_bdmcs_net_faturado_qtr

Regra:
- fonte faturamento_2026
- soma net_revenue
- incluir apenas tipo_oportunidade_line in ('Nova','Adicional')
- excluir linhas com produto/familia contendo rebate, incentivo, intercompanhia

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_bdmcs_net_faturado_qtr AS
WITH base AS (
  SELECT
    LOWER(TRIM(comercial)) AS owner_key,
    oportunidade,
    cliente,
    SAFE_CAST(net_revenue AS NUMERIC) AS net_revenue,
    tipo_oportunidade_line,
    LOWER(CONCAT(COALESCE(produto,''), ' ', COALESCE(familia,''))) AS prod_fam_text,
    COALESCE(
      SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
      SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
    ) AS dt_fatura,
    FORMAT('FY%s-Q%s',
      SUBSTR(CAST(EXTRACT(YEAR FROM COALESCE(
        SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
        SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
      )) AS STRING), 3),
      CAST(EXTRACT(QUARTER FROM COALESCE(
        SAFE.PARSE_DATE('%Y-%m-%d', CAST(fecha_factura AS STRING)),
        SAFE.PARSE_DATE('%d/%m/%Y', CAST(fecha_factura AS STRING))
      )) AS STRING)
    ) AS fiscal_q
  FROM operaciones-br.sales_intelligence.faturamento_2026
)
SELECT
  owner_key,
  fiscal_q,
  ROUND(SUM(net_revenue), 2) AS net_faturado_incremental
FROM base
WHERE dt_fatura IS NOT NULL
  AND tipo_oportunidade_line IN ('Nova', 'Adicional')
  AND NOT REGEXP_CONTAINS(prod_fam_text, r'(rebate|incentiv|intercompanhia)')
GROUP BY 1, 2;

## 3.2 KPI SS — Net Gerado Elegivel

View: operaciones-br.mart_l10.v2_ss_net_gerado_qtr

Regra:
- fonte pipeline
- soma Net
- contabilizar somente Elegibilidade_SS='ELEGIVEL'
- NAO_ELEGIVEL = zero

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_ss_net_gerado_qtr AS
SELECT
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Fiscal_Q AS fiscal_q,
  ROUND(SUM(CASE WHEN UPPER(TRIM(Elegibilidade_SS)) = 'ELEGIVEL' THEN COALESCE(Net,0) ELSE 0 END), 2) AS net_gerado_elegivel,
  COUNT(DISTINCT CASE WHEN UPPER(TRIM(Elegibilidade_SS)) = 'ELEGIVEL' THEN Oportunidade END) AS opps_elegiveis
FROM operaciones-br.sales_intelligence.pipeline
GROUP BY 1, 2;

## 3.3 Metas vs Realizado BDM/CS

View: operaciones-br.mart_l10.v2_bdmcs_meta_vs_realizado

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_bdmcs_meta_vs_realizado AS
WITH meta AS (
  SELECT
    LOWER(TRIM(BDM)) AS owner_key,
    Periodo_Fiscal AS fiscal_q,
    ROUND(SUM(COALESCE(Net_faturado,0)),2) AS meta_net_faturado
  FROM operaciones-br.sales_intelligence.meta_bdm
  GROUP BY 1,2
), real AS (
  SELECT owner_key, fiscal_q, net_faturado_incremental
  FROM operaciones-br.mart_l10.v2_bdmcs_net_faturado_qtr
)
SELECT
  COALESCE(m.owner_key, r.owner_key) AS owner_key,
  COALESCE(m.fiscal_q, r.fiscal_q) AS fiscal_q,
  COALESCE(m.meta_net_faturado,0) AS meta_net_faturado,
  COALESCE(r.net_faturado_incremental,0) AS net_faturado_incremental,
  ROUND(SAFE_DIVIDE(COALESCE(r.net_faturado_incremental,0), NULLIF(COALESCE(m.meta_net_faturado,0),0))*100,1) AS attainment_pct,
  ROUND(COALESCE(m.meta_net_faturado,0)-COALESCE(r.net_faturado_incremental,0),2) AS gap_net
FROM meta m
FULL JOIN real r USING(owner_key, fiscal_q);

## 3.4 Metas vs Realizado SS

View: operaciones-br.mart_l10.v2_ss_meta_vs_realizado

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_ss_meta_vs_realizado AS
WITH meta AS (
  SELECT
    LOWER(TRIM(Sales_Specialist)) AS ss_key,
    Periodo_Fiscal AS fiscal_q,
    ROUND(SUM(COALESCE(Net_gerado,0)),2) AS meta_net_gerado
  FROM operaciones-br.sales_intelligence.meta_bdm
  GROUP BY 1,2
), real AS (
  SELECT ss_key, fiscal_q, net_gerado_elegivel
  FROM operaciones-br.mart_l10.v2_ss_net_gerado_qtr
)
SELECT
  COALESCE(m.ss_key, r.ss_key) AS ss_key,
  COALESCE(m.fiscal_q, r.fiscal_q) AS fiscal_q,
  COALESCE(m.meta_net_gerado,0) AS meta_net_gerado,
  COALESCE(r.net_gerado_elegivel,0) AS net_gerado_elegivel,
  ROUND(SAFE_DIVIDE(COALESCE(r.net_gerado_elegivel,0), NULLIF(COALESCE(m.meta_net_gerado,0),0))*100,1) AS attainment_pct,
  ROUND(COALESCE(m.meta_net_gerado,0)-COALESCE(r.net_gerado_elegivel,0),2) AS gap_net
FROM meta m
FULL JOIN real r USING(ss_key, fiscal_q);

## 3.5 Fila de acoes BDM/CS

View: operaciones-br.mart_l10.v2_bdmcs_daily_actions

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_bdmcs_daily_actions AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Oportunidade,
  Conta,
  Fiscal_Q,
  Fase_Atual,
  Data_Prevista,
  Gross,
  Net,
  Velocity_Predicao,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Status_Governanca_SS,
  CASE UPPER(TRIM(COALESCE(Velocity_Predicao,'')))
    WHEN 'ESTAGNADO' THEN 1
    WHEN 'DESACELERANDO' THEN 2
    ELSE 3
  END AS action_sort_rank
FROM operaciones-br.sales_intelligence.pipeline;

## 3.6 Hand-off BDM/CS

View: operaciones-br.mart_l10.v2_bdmcs_handoff_status

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_bdmcs_handoff_status AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Oportunidade,
  Conta,
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Data_Prevista,
  Net,
  Gross
FROM operaciones-br.sales_intelligence.pipeline
WHERE NULLIF(TRIM(Sales_Specialist_Envolvido),'') IS NOT NULL;

## 3.7 Fila SS (closer)

View: operaciones-br.mart_l10.v2_ss_closing_queue

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_ss_closing_queue AS
SELECT
  LOWER(TRIM(Sales_Specialist_Envolvido)) AS ss_key,
  Oportunidade,
  Conta,
  Fiscal_Q,
  Fase_Atual,
  Data_Prevista,
  Net,
  Gross,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Velocity_Predicao,
  Risco_Principal,
  Perguntas_de_Auditoria_IA
FROM operaciones-br.sales_intelligence.pipeline
WHERE NULLIF(TRIM(Sales_Specialist_Envolvido),'') IS NOT NULL
  AND UPPER(TRIM(COALESCE(Elegibilidade_SS,''))) = 'ELEGIVEL';

## 3.8 Admin — monitor de governanca

View: operaciones-br.mart_l10.v2_admin_governance_monitor

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_admin_governance_monitor AS
SELECT
  Fiscal_Q,
  Vendedor,
  Sales_Specialist_Envolvido,
  Oportunidade,
  Conta,
  Elegibilidade_SS,
  Status_Governanca_SS,
  Risco_Principal,
  Perguntas_de_Auditoria_IA,
  Net,
  Gross,
  Data_Prevista
FROM operaciones-br.sales_intelligence.pipeline
WHERE REGEXP_CONTAINS(UPPER(COALESCE(Status_Governanca_SS,'')), r'(ERRO|ALERTA)');

## 3.9 Admin — monitor slippage e zumbis

View: operaciones-br.mart_l10.v2_admin_slippage_zumbis

SQL:

CREATE OR REPLACE VIEW operaciones-br.mart_l10.v2_admin_slippage_zumbis AS
SELECT
  LOWER(TRIM(Vendedor)) AS owner_key,
  Fiscal_Q,
  COUNT(*) AS total_opps,
  SUM(CASE WHEN COALESCE(Mudancas_Close_Date,0) >= 2 THEN 1 ELSE 0 END) AS opps_slippage,
  SUM(CASE WHEN COALESCE(Idle_Dias,0) >= 14 THEN 1 ELSE 0 END) AS opps_idle_14,
  SUM(CASE WHEN COALESCE(Idle_Dias,0) >= 30 THEN 1 ELSE 0 END) AS opps_zumbi,
  SUM(CASE WHEN UPPER(COALESCE(Forecast_IA,'')) IN ('PIPELINE','BEST CASE') AND COALESCE(Idle_Dias,0) >= 14 THEN 1 ELSE 0 END) AS risco_forecast_desalinhado,
  ROUND(SUM(COALESCE(Net,0)),2) AS net_pipeline
FROM operaciones-br.sales_intelligence.pipeline
GROUP BY 1,2;

## 4. Endpoints API (novos, sem alterar os atuais)

Base path sugerido: /api/v2/portal

## 4.1 Componente comum
- GET /api/v2/portal/me/context
  - retorna cargo, persona_dados, rls_scope e principals normalizados

## 4.2 Front BDM/CS
- GET /api/v2/portal/bdmcs/kpi-faturamento
  - fonte: v2_bdmcs_meta_vs_realizado
  - filtro backend: owner_key = principal_owner
- GET /api/v2/portal/bdmcs/fila-acoes
  - fonte: v2_bdmcs_daily_actions
  - filtro backend: owner_key = principal_owner
  - ordenacao default: action_sort_rank, Data_Prevista asc, Net desc
- GET /api/v2/portal/bdmcs/handoff-status
  - fonte: v2_bdmcs_handoff_status
  - filtro backend: owner_key = principal_owner

## 4.3 Front SS
- GET /api/v2/portal/ss/kpi-net-gerado
  - fonte: v2_ss_meta_vs_realizado
  - filtro backend: ss_key = principal_ss
- GET /api/v2/portal/ss/fila-fechamento
  - fonte: v2_ss_closing_queue
  - filtro backend: ss_key = principal_ss

## 4.4 Front Admin
- GET /api/v2/portal/admin/governance-monitor
  - fonte: v2_admin_governance_monitor
- GET /api/v2/portal/admin/slippage-zumbis
  - fonte: v2_admin_slippage_zumbis

## 5. Compatibilidade e rollout sem risco

1. Nao remover/alterar endpoints atuais.
2. Criar views v2 em paralelo.
3. Criar endpoints /api/v2/portal em paralelo.
4. Ativar por feature flag no frontend (por perfil).
5. Validar KPI v2 versus KPI atual com 2 semanas de sombra.
6. So depois promover v2 como default.

## 6. Checklist de execucao

- Criar campos de governanca no usuario admin (persona_dados, principal_owner, principal_ss, rls_scope)
- Script de migracao para popular principal_owner com sellerCanonical atual
- Criar 9 views v2 no mart_l10
- Criar endpoints /api/v2/portal/* com filtro forcado no backend
- Implementar testes:
  - BDM/CS nao ve dados de outro owner
  - SS so ve deals elegiveis e vinculados a ele
  - Admin ve total
- Rodar reconciliacao de metrica:
  - Net Faturado Incremental (v2) vs quarter-summary atual
  - Net Gerado Elegivel (v2) vs pipeline com hard gate
