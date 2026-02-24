# Análise Cross-Schema: Dimensões Compartilhadas entre Tabelas
**Projeto:** `operaciones-br` · **Dataset:** `sales_intelligence` + `mart_l10`  
**Data:** 2026-02-24 · **Status:** Estudo / pré-decisão de arquitetura de dims

> **Escopo ampliado:** cobre todos os schemas ativos (ERP faturamento × CRM pipeline/closed),
> com inventário de inconsistências reais medidas no BQ e impacto por arquivo no código atual.

---

## 1. Tabelas analisadas

| Tabela | Tipo | Colunas | Fonte |
|---|---|---|---|
| `faturamento_semanal` | ERP / Faturamento | 40 | Planilha Q1 2026 via AppScript |
| `faturamento_2025` | ERP / Faturamento | 51 | Planilha FATURAMENTO_2025 |
| `faturamento_2026` | ERP / Faturamento | 61 | Planilha FATURAMENTO_2026 |
| `pipeline` | CRM / Deals ativos | ~77 | Salesforce via IA |
| `closed_deals_won` | CRM / Ganhos | ~58 | Salesforce via IA |
| `closed_deals_lost` | CRM / Perdidos | ~61 | Salesforce via IA |

---

## 2. Mapa de colunas equivalentes (por conceito)

### 2.1 Identificação do deal / oportunidade

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Nome do deal | `oportunidade` | `oportunidade` | `oportunidade` | `Oportunidade` | `Oportunidade` | `Oportunidade` |
| ID Salesforce | `id_oportunidade` | ❌ | `id_oportunidade` | ❌ (implícito) | ❌ | ❌ |
| Billing ID (NS) | `billing_id` | ❌ | `billing_id` | ❌ | ❌ | ❌ |
| Folio Salesforce NS | ❌ | `folio_salesforce_ns` | `folio_salesforce_ns` | ❌ | ❌ | ❌ |

**Observações reais (amostra de 15 linhas cruzadas):**
- `oportunidade` = `Oportunidade` em texto exato → **JOIN direto funciona**.
- Mesmo deal aparece em múltiplas linhas de faturamento (ex: `#M25 RGDS-123784` → 2 linhas fat para 1 deal CRM, cada linha com `cliente` diferente).
- `id_oportunidade` em fat_semanal contém o SF ID de 15 chars (ex: `006Rh00000Jna4D`) — presente apenas em fat_semanal e fat_2026, ausente em fat_2025.

---

### 2.2 Cliente / Conta

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Nome do cliente | `cliente` | `cliente` | `cliente` | `Conta` | `Conta` | `Conta` |
| Domínio | `dominio` | `dominio` | `dominio` | ❌ | ❌ | ❌ |
| Cidade billing | ❌ | ❌ | ❌ | `Cidade_de_cobranca` | `Cidade_de_cobranca` | `Cidade_de_cobranca` |
| Estado billing | ❌ | ❌ | ❌ | `Estado_Provincia_de_cobranca` | `Estado_Provincia_de_cobranca` | `Estado_Provincia_de_cobranca` |

**Divergência confirmada em amostras reais:**

| fat `cliente` | crm `Conta` | mesmo deal |
|---|---|---|
| `APOSTA GANHA LOTERIAS` | `APOSTA GANHA LOTERIAS LTDA` | ✅ |
| `MINISTERIO DA JUSTICA E SEGURANCA PUBLICA - PRF` | (não encontrado exato) | ⚠️ |
| `MINISTERIO PÚBLICO DO ESTADO DO RIO GRANDE DO SUL - MPRS` | `Ministério Público do Estado do Rio Grande do Sul` | ✅ via oportunidade |
| `SERVICO DE APOIO AS MICRO E PEQUENAS EMPRESAS SANTA CATARINA - SC` | `SEBRAE SC` | ✅ via oportunidade |
| `WESTWING COMERCIO VAREJISTA S.A.` / `WESTWING COMERCIO VAREJISTA SA` | `Westwing` | ✅ via oportunidade |

**Conclusão:** `cliente` ≠ `Conta` em texto direto — normalização jurídica diferente. O único join seguro é via `oportunidade` como chave, não via nome do cliente.

---

### 2.3 Vendedor / Responsável comercial

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Vendedor comercial | `comercial` | `comercial` | `comercial` | `Vendedor` | `Vendedor` | `Vendedor` |
| País do responsável | `pais_comercial` | `pais_comercial` | `pais_comercial` | ❌ | ❌ | ❌ |
| CE / Pré-venda | ❌ | ❌ | ❌ | `Owner_Preventa` | `Owner_Preventa` | `Owner_Preventa` |

**Match exato (16/18 valores nomeados em fat_semanal → 100% match no CRM).**  
Casos especiais:
- `Xertica` (139 linhas, 58% do total): bucket genérico ERP — sem vendedor atribuído. JOIN via `oportunidade` recupera o `Vendedor` real do CRM.
- `#N/A` (1 linha): erro de planilha.

---

### 2.4 Portfolio / Produto

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Portfolio | `portafolio` | `portafolio` | `portafolio` | `Portfolio` | `Portfolio` | `Portfolio` |
| Portfolio FDM | ❌ | ❌ | ❌ | `Portfolio_FDM` | `Portfolio_FDM` | `Portfolio_FDM` |
| Produto/SKU | `produto` | `produto` | `produto` | `Produtos` | `Produtos` | `Produtos` |
| Família produto | `familia` | `familia` | `familia` | ❌ | `Familia_Produto` | `Familia_Produto` |
| Tipo produto | `tipo_produto` | `tipo_produto` | `tipo_produto` | `Tipo_Oportunidade` | `Tipo_Oportunidade` | `Tipo_Oportunidade` |

**Divergência crítica em `portafolio` — valores INCOMPATÍVEIS entre ERP e CRM:**

| fat `portafolio` | crm `Portfolio` | interpretação |
|---|---|---|
| `WT` | `1.0` | Workspace Traditional |
| `GCP` | `1.0` ou `2.0` | GCP Cloud |
| `X2.0 MSP` | `1.0` | Xertica 2.0 MSP |
| `WT` | `1.0` | — |

O ERP usa labels de produto (`WT`, `GCP`, `X2.0 MSP`) enquanto o CRM usa versões de portfólio (`1.0`, `2.0`, `3.0`). **São vocabulários diferentes para o mesmo conceito** — precisam de uma `dim_portfolio` para mapear.

**`Produtos` no CRM é texto livre concatenado** (ex: `"Acelerador Avançado | GCP Consumo | PS GCP Infra"`), enquanto `produto` no ERP é o SKU individual por linha de faturamento. Não são diretamente comparáveis.

---

### 2.5 Segmento de mercado

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Segmento | `segmento` | `segmento` | `segmento` | `Segmento_consolidado` | `Segmento` / `Segmento_consolidado` | `Segmento` / `Segmento_consolidado` |
| Sub-segmento | ❌ | ❌ | ❌ | `Subsegmento_de_mercado` | `Subsegmento_de_mercado` | `Subsegmento_de_mercado` |
| Vertical IA | ❌ | ❌ | ❌ | `Vertical_IA` | `Vertical_IA` | `Vertical_IA` |

**Divergência parcial — vocabulários similares mas não idênticos:**

| fat `segmento` | crm `Segmento_consolidado` | equivalente? |
|---|---|---|
| `Gobierno` | `Gobierno` | ✅ idêntico |
| `Enterprise` | `Enterprise` | ✅ idêntico |
| `Inside` | `SB` | ⚠️ Inside Sales = Small Business? |
| `Field` | `Corporate` / outros | ⚠️ não claro |
| `Educativo` | `Educativo` | ✅ idêntico |

**Ação necessária:** mapear `Inside` → `SB` e validar `Field` vs demais valores do CRM.

---

### 2.6 Datas e período fiscal

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Data do fato | `fecha_factura` (STRING) | `fecha_factura` (STRING) | `fecha_factura` (STRING) | `Data_Prevista` (DATE) | `Data_Fechamento` (DATE) | `Data_Fechamento` (DATE) |
| Quarter fiscal | ❌ (derivável) | ❌ (derivável) | ❌ (derivável) | `Fiscal_Q` (`FY26-Q1`) | `Fiscal_Q` | `Fiscal_Q` |
| Mês | `mes` (INTEGER) | `mes` (INTEGER) | `mes` (INTEGER) | ❌ | ❌ | ❌ |

**Observações:**
- `fecha_factura` nas tabelas ERP está como STRING em dois formatos: `YYYY-MM-DD` e `DD/MM/YYYY` — conversão já implementada na view `v_faturamento_semanal_consolidado`.
- `Fiscal_Q` no CRM usa formato `FY26-Q1` — campo ausente no ERP, mas derivável com `DATE_TRUNC` + lógica fiscal.

---

### 2.7 Financeiro

| Conceito | fat_semanal | fat_2025 | fat_2026 | pipeline | closed_won | closed_lost |
|---|---|---|---|---|---|---|
| Receita bruta | `valor_fatura_usd_comercial` | `valor_fatura_usd_comercial` | `valor_fatura_usd_comercial` | `Gross` | `Gross` | `Gross` |
| Receita líquida | `net_revenue` | `net_revenue` | `net_revenue` | `Net` | `Net` | `Net` |
| Receita moeda local | `valor_fatura_moeda_local_sem_iva` | idem | idem | ❌ | ❌ | ❌ |
| Incentivos Google | `incentivos_google` | ❌ | `incentivos_google` | ❌ | ❌ | ❌ |
| Câmbio diário | `tipo_cambio_diario` | `tipo_cambio_diario` | `tipo_cambio_diario` | ❌ | ❌ | ❌ |
| Câmbio pactado | `tipo_cambio_pactado` | ❌ | `tipo_cambio_pactado` | ❌ | ❌ | ❌ |
| Margem % | `margem_percentual_final` | `margem_percentual_final` + `percentual_margem` | idem | ❌ | ❌ | ❌ |
| Desconto Xertica | `desconto_xertica` | idem | idem | ❌ | ❌ | ❌ |
| Custo % | ❌ | `custo_percentual` | `custo_percentual` | ❌ | ❌ | ❌ |
| P&L receita | ❌ | ❌ | `pnl_receita` / `receita_usd` | ❌ | ❌ | ❌ |

**Nota:** `Gross` no CRM = deal value (valor do contrato), `valor_fatura_usd_comercial` no ERP = valor efetivamente faturado por linha. São conceitos relacionados mas não iguais — um deal pode gerar múltiplas faturas.

---

### 2.8 Colunas exclusivas por tabela (sem equivalente)

| Tabela | Colunas sem par em outras tabelas |
|---|---|
| fat_semanal / fat_2026 | `billing_id`, `id_oportunidade`, `incentivos_google`, `tipo_cambio_pactado` |
| fat_2025 / fat_2026 | `folio_salesforce_ns`, `custo_moeda_local`, `backlog_comissao`, `net_comissoes`, `percentual_margem_net_comissoes`, `generales_budget` |
| fat_2026 (exclusivo) | `pnl_receita`, `pnl_custo`, `receita_usd`, `custo_usd`, `net_real`, `revenue_revision` |
| pipeline (exclusivo) | `Confianca`, `Forecast_IA`, `Forecast_SF`, `MEDDIC_Score`, `BANT_Score`, `Acao_Sugerida`, `Idle_Dias`, `Velocity_*`, `Valor_Reconhecido_Q*` |
| closed_won/lost | `Ciclo_dias`, `Causa_Raiz`, `Fatores_Sucesso`, `Licoes_Aprendidas`, `Ativ_7d`, `Ativ_30d` |
| closed_lost (exclusivo) | `Evitavel`, `Causas_Secundarias`, `Momento_Critico`, `Sinais_Alerta` |

---

## 3. Chaves de join identificadas

| Join | Chave | Confiança | Observação |
|---|---|---|---|
| fat_semanal → CRM | `oportunidade` = `Oportunidade` | 🟢 Alta | Texto exato. Recupera vendedor real para linhas `Xertica` |
| fat_semanal → CRM via SF ID | `id_oportunidade` → SF ID | 🟢 Alta | Apenas fat_semanal e fat_2026 têm essa coluna |
| fat_2025 → CRM | `folio_salesforce_ns` → ? | 🟡 Média | Precisa validar se folio = SF ID |
| fat → fat (cross-year) | `oportunidade` | 🟢 Alta | Mesmo deal pode aparecer em 2025 e 2026 |
| cliente → Conta | nome normalizado | 🔴 Baixa | Razão social diverge muito; usar via oportunidade |

---

## 4. Dims recomendadas (prioridade)

### Prioridade 1 — Resolve casos imediatos

**`dim_portfolio`** — mapeia vocabulários ERP ↔ CRM  
```sql
-- ERP: WT, GCP, X2.0 MSP, ...
-- CRM: 1.0, 2.0, 3.0, ...
CREATE TABLE mart_l10.dim_portfolio (
  fat_portafolio   STRING,  -- valor em faturamento_*
  crm_portfolio    STRING,  -- valor em pipeline/closed
  portfolio_label  STRING,  -- nome canônico (ex: "Workspace", "GCP", "Xertica 2.0")
  produto_familia  STRING   -- agrupamento de alto nível
);
```

**`dim_segmento`** — reconcilia vocabulários ERP ↔ CRM  
```sql
-- fat: Field, Inside, Gobierno, Enterprise, Educativo
-- crm: Gobierno, Corporate, SB, Enterprise, Educativo
CREATE TABLE mart_l10.dim_segmento (
  fat_segmento   STRING,
  crm_segmento   STRING,
  segmento_label STRING   -- canônico para L10
);
-- Mapeamento confirmado:
-- Inside  → SB
-- Field   → ? (validar)
-- Gobierno → Gobierno
-- Enterprise → Enterprise
-- Educativo → Educativo
```

### Prioridade 2 — Resolve o bucket "Xertica" (58% das linhas de fat)

**Expandir `dim_vendedor_manual` com join por oportunidade**  
Não precisa de dim nova — a query abaixo resolve:
```sql
-- Para linhas com comercial = 'Xertica', recuperar vendedor do CRM via oportunidade
COALESCE(
  mm.vendedor_canonico,                         -- mapa manual
  pv.vendedor_canonico,                         -- match exato comercial = Vendedor
  crm_op.Vendedor,                              -- ← NOVO: join por oportunidade
  NULLIF(TRIM(b.comercial), ''),
  'NAO_MAPEADO'
) AS vendedor_canonico
-- onde crm_op = LEFT JOIN closed_deals_won ON oportunidade = Oportunidade
--              LEFT JOIN pipeline ON oportunidade = Oportunidade
```

### Prioridade 3 — Futuro / quando necessário

**`dim_cliente`** — normalização de razão social  
Alta complexidade, baixo retorno imediato (o join via `oportunidade` já recupera `Conta` do CRM). Adiar.

**`dim_produto_sku`** — SKU ERP → família canônica  
Útil para análise de margem por linha de produto. Fazer quando a análise de produto for prioritária.

---

## 5. Inconsistências de schema entre fat_2025 / fat_2026 / fat_semanal

| Coluna | fat_semanal | fat_2025 | fat_2026 |
|---|---|---|---|
| `id_oportunidade` | ✅ | ❌ | ✅ |
| `billing_id` | ✅ | ❌ | ✅ |
| `incentivos_google` | ✅ | ❌ | ✅ |
| `tipo_cambio_pactado` | ✅ | ❌ | ✅ |
| `folio_salesforce_ns` | ❌ | ✅ | ✅ |
| `tipo_oportunidade_ns` | ❌ | ✅ | ✅ |
| `custo_*` / P&L | ❌ | parcial | ✅ completo |
| `coluna_extra` | ❌ | ✅ | ✅ |
| `q` (quarter interno) | ❌ | ✅ | ✅ |
| `processo` | ❌ | ✅ | ✅ |

**fat_semanal é um subconjunto de fat_2026** — tem as colunas de Q1 2026 mais id_oportunidade/billing_id, mas não tem as colunas de P&L e custo presentes em fat_2026. Isso faz sentido: fat_semanal é originada da aba operacional semanal, fat_2026 consolida o ano completo com mais campos de controle.

---

## 6. Próximos passos sugeridos

- [ ] Implementar join por `oportunidade` na view `v_faturamento_semanal_consolidado` para resolver bucket `Xertica`
- [ ] Criar `dim_portfolio` com 5–8 linhas (mapeamento ERP ↔ CRM confirmado)
- [ ] Criar `dim_segmento` com mapeamento `Inside` → `SB` e validar `Field`
- [ ] Adicionar coluna `fiscal_q_derivado` na view (derivar de `fecha_factura_date` para permitir comparação com CRM)
- [ ] Validar se `folio_salesforce_ns` em fat_2025 corresponde a `id_oportunidade` em fat_2026

---

## 7. Bugs de schema confirmados no BigQuery (dados reais, pipeline, 264 linhas)

Esses não são decisões de design — são inconsistências concretas que já existem nas tabelas.

### 7.1 Colunas duplicadas — mesmo dado, dois nomes

| Par duplicado | Coluna A (preenchida) | Coluna B (preenchida) | Situação |
|---|---|---|---|
| Estado geográfico | `EstadoProvincia_de_cobranca` → **264/264** | `Estado_Provincia_de_cobranca` → **264/264** | Ambas preenchidas. A `Estado_*` é o nome correto (underscore separado). A `EstadoProvincia_*` é o nome antigo. **Referências no código: 24 vs 5.** O código usa majoritariamente a mais nova. |
| Cidade detectada | `EstadoCidade_Detectado` → **264/264** | `Estado_Cidade_Detectado` → **0/264** | `Estado_Cidade_Detectado` está sempre vazia — coluna morta. `EstadoCidade_Detectado` é a ativa. |
| Confiança score | `Confianca` → **262/264** | `Confiana` (typo) → **0/264** | `Confiana` nunca teve dados — é um typo histórico que não foi removido. **13 referências no código apontam para `Confiana`** — todas são bugs silenciosos. |

### 7.2 Colunas presente em closed_won com nome diferente de closed_lost

| Conceito | closed_won | closed_lost | pipeline |
|---|---|---|---|
| Segmento | `Segmento` (coluna raw) + `Segmento_consolidado` (NULL em 100%) | `Segmento` + `Segmento_consolidado` | `Segmento_consolidado` (250/264 válidas, sem "-") |
| Cidade billing | `Cidade_de_cobranca` | `Cidade_de_cobranca` | `Cidade_de_cobranca` |
| Estado billing | `EstadoProvincia_de_cobranca` + `Estado_Provincia_de_cobranca` | idem | idem |
| Tipo oportunidade | `Tipo_Oportunidade` (presente, NULL frequente) | `Tipo_Oportunidade` | `Tipo_Oportunidade` |

**`Segmento_consolidado` em closed_won**: validação real → **505/506 válidas** (não nula como indicado na amostra inicial de 1 linha). `Segmento` raw e `Segmento_consolidado` são idênticos em closed_won (Gobierno/Gobierno, SB/SB etc.). `Subsegmento_de_mercado` cobre 506/506. COALESCE dos três garante **100% de cobertura** em closed_won e closed_lost. Nenhum bug aqui — análise de amostra única induziu a erro.

### 7.3 `Column_21` em closed_won

Coluna literal `Column_21` (valor `"-"` em 1 linha da amostra) — artefato de importação de planilha. Zero referências no código ativo. Ignorar mas não remover (BQ não permite DROP COLUMN sem recriar tabela).

### 7.4 `Ultima_Atualizacao` — tipo errado

No pipeline, `Ultima_Atualizacao` contém valor `46051` (número serial de Excel) em vez de uma data. **29 referências no código** usam esse campo assumindo que é string de data — pode causar parse silencioso.  
Em closed_won/lost o campo parece string ISO correta.

### 7.5 Portfolio: dois campos com semânticas diferentes

| Campo | pipeline | closed_won | closed_lost | Descrição |
|---|---|---|---|---|
| `Portfolio` | `1.0`, `2.0`, `3.0` (264/264) | `1.0`…`3.0` | `1.0`…`3.0` | Versão de portfolio (geração do produto) |
| `Portfolio_FDM` | `"Outros Portfólios"`, `"Services"`, `"Workspace"` (264/264) | idem | idem | Família de portfolio para FDM |

**31 referências** a `Portfolio_FDM` no código. São campos complementares, não duplicados — mas a API retorna os dois misturados nos filtros UI, gerando confusão no frontend.

---

## 8. Impacto no código existente — por arquivo

Levantamento de quantas referências ativas (excluindo `/legado/`) cada campo problemático tem:

| Campo / problema | Refs ativas | Arquivos principais | Risco atual |
|---|---|---|---|
| `Vendedor` (ERP=`comercial`) | **525** | `simple_api.py`, `performance.py`, `detalhes-vendedor.js`, `schema_constants.py`, `BigQuerySync.gs`, 12+ outros | 🟡 Baixo — os dois nomes coexistem por design, view já faz `COALESCE`. Não quebra hoje. |
| `Confiana` (typo) | **13** | `BigQuerySync.gs`, `schema_constants.py`, `schema-constants.js`, `SchemaDiagnostics.gs` | 🔴 Bug silencioso — sempre retorna NULL. Nenhum dado é lido. |
| `Portfolio_FDM` | **31** | `simple_api.py`, `filters.py`, `performance.py`, `schema_constants.py` | 🟡 Funciona, mas semântica diferente de `Portfolio`. Filtros UI podem misturar os dois. |
| `Segmento_consolidado` | **27** | `simple_api.py`, `performance.py`, `weekly_agenda.py`, `filtros.js`, `schema_constants.py` | � Cobertura 505/506 em closed_won, 2078/2091 em closed_lost. COALESCE com `Segmento` raw → 100%. Sem bug. |
| `Estado_Provincia_de_cobranca` | **24** | `simple_api.py`, `filters.py`, `weekly_agenda.py` | 🟡 Campo correto, coexiste com versão antiga `EstadoProvincia_*`. Não quebra. |
| `EstadoProvincia_de_cobranca` | **5** | `SchemaDiagnostics.gs`, `add_missing_columns.sh` | 🟡 Nome antigo ainda referenciado em scripts de setup. |
| `Ultima_Atualizacao` (serial Excel) | **29** | `BigQuerySync.gs`, `simple_api.py`, `schema_constants.py`, `agenda-semanal.js` | 🟡 Dado inválido (número ao invés de data), mas não causa crash — exibe valor estranho na UI. |
| `portafolio` (ERP) vs `Portfolio` (CRM) | **9 vs 31** | `BigQuerySync.gs`, `l10_hardening*.sql` | 🟡 Coexistem por design. Problema apenas cross-join ERP↔CRM sem dim de mapeamento. |
| `comercial` (ERP) | **27** | `BigQuerySync.gs`, `FaturamentoSync.gs`, `l10_hardening*.sql` | 🟡 Isolado nas tabelas de faturamento. View já trata. |

### Resumo de risco por camada

| Camada | Arquivos afetados | Bugs ativos | Mudança estrutural necessária? |
|---|---|---|---|
| **BigQuery schemas** | 6 tabelas | `Confiana` typo + `Segmento_consolidado` NULL closed_won + `Ultima_Atualizacao` formato | Não — views em `mart_l10` podem corrigir sem ALTER TABLE |
| **API Python** (`cloud-run/app/`) | 13 arquivos | `Segmento_consolidado` zero em closed_won silencia filtros | Não — COALESCE em query resolve |
| **AppScript** (`appscript/`) | 5 arquivos | `Confiana` typo referenciado em `schema_constants.py` e sync | Sim para o typo — 1 linha em `schema_constants.py` |
| **Frontend JS** (`public/scripts/`) | 17 arquivos | Recebe dados da API — bugs da API chegam aqui | Não — depende do fix na API |
| **SQL BigQuery** (`bigquery/`) | 6 arquivos de queries/views | `Segmento_consolidado` NULL, `portafolio` vs `Portfolio` | Não — correção via views `mart_l10` |

---

## 9. Estratégia: o que NÃO mudar e o que corrigir via view

O princípio correto dado o estado atual do código:

### ✅ Não tocar (custo > benefício)
- Renomear `portafolio` → `Portfolio` nas tabelas ERP (quebraria AppScript + 27 refs no código)
- Renomear `comercial` → `Vendedor` nas tabelas ERP (mesma razão)
- Remover `EstadoProvincia_de_cobranca` (coluna antiga mas sem `DROP COLUMN` seguro no BQ)
- Remover `Confiana` (BQ não faz DROP sem recriar — não vale)

### 🔧 Corrigir via `mart_l10` views (zero impacto no código existente)
Todas as correções acontecem nas views do `mart_l10`, que o L10 e a UI executiva vão consumir:

```sql
-- Em v_faturamento_semanal_consolidado (já existe) e nas novas views:

-- 1. Portfolio canônico: mapear ERP ↔ CRM
CASE
  WHEN f.portafolio IN ('WT')          THEN 'Workspace'
  WHEN f.portafolio IN ('GCP')         THEN 'GCP'
  WHEN f.portafolio LIKE '%MSP%'       THEN 'MSP'
  ELSE COALESCE(f.portafolio, 'NAO_INFORMADO')
END AS portfolio_canonico_fat,

-- 2. Segmento canônico (validado: 100% cobertura via COALESCE)
COALESCE(
  NULLIF(TRIM(Segmento_consolidado), '-'),
  NULLIF(TRIM(Segmento), '-'),
  NULLIF(TRIM(Subsegmento_de_mercado), '-'),
  'NAO_INFORMADO'
) AS segmento_canonico,

-- 3. Confiança: sempre usar Confianca (correto), nunca Confiana (typo)
SAFE_CAST(Confianca AS INT64) AS confianca_score,

-- 4. Estado: usar COALESCE dos dois nomes duplicados
COALESCE(Estado_Provincia_de_cobranca, EstadoProvincia_de_cobranca) AS estado_billing
```

### 🆕 Criar (pequeno, valor imediato)
- `mart_l10.dim_portfolio` — 8 linhas mapeando `portafolio` ERP → `Portfolio` CRM → label canônico
- `mart_l10.dim_segmento` — 6 linhas mapeando `Inside` → `SB`, `Field` → validar

---

## 10. Próximos passos (revisado pós-validação)

### Bugs reais confirmados (executar)
- [ ] **Fix imediato:** corrigir `Confiana` (typo) → `Confianca` em `schema_constants.py` + `schema-constants.js` — 13 referências retornando NULL silenciosamente
- [ ] **View:** adicionar join por `oportunidade` em `v_faturamento_semanal_consolidado` para resolver bucket `Xertica` (139 linhas, 58%)
- [ ] **View:** adicionar `confianca_score = SAFE_CAST(Confianca AS INT64)` nas views de CRM

### Não eram bugs (descartados após validação)
- ~~`Segmento_consolidado` NULL em closed_won~~ → era amostra de 1 linha; cobertura real 505/506 ✅

### Arquitetura de dims (executar de forma mínima)
- [ ] Completar `mart_l10.dim_vendedor_manual` com squad para os 16 vendedores mapeados
- [ ] SQL inline para portfolio_canonico (sem criar tabela — CASE WHEN nos 3 valores conhecidos é suficiente)
- [ ] SQL inline para segmento_canonico via COALESCE já descrito acima

### Deixar para quando produto for prioridade
- [ ] `mart_l10.dim_portfolio` como tabela (só vale se o mapeamento crescer além de 8 linhas)
- [ ] `mart_l10.dim_segmento` como tabela (vocabulários são estáveis; CASE WHEN resolve)
- [ ] Validar `folio_salesforce_ns` em fat_2025 = `id_oportunidade` em fat_2026
