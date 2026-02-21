# Legacy Code Archive (2026-02-05)

## Conteúdo

### 1. Dashboard Web App Antigo (legacydashboard.html + legacydashcode.gs)

**Total:** ~7,500 linhas  
**Status:** ❌ OBSOLETO - Substituído pela Cloud Function (Python)  
**Data de Migração:** 05/02/2026

**Contexto:**
- Dashboard web app original (v52.0) que rodava em Apps Script
- Migrado para Cloud Function conforme solicitação do usuário "MIL VEZES"
- Todos os cálculos agora são feitos em `cloud-function/main.py`
- Dashboard lê de `cloudAnalysis.pipeline_analysis.*` e `cloudAnalysis.closed_analysis.*`

**Por que foi removido:**
- Performance: Apps Script tem timeout de 6 minutos, Python não tem limite
- Escalabilidade: BigQuery processa >100k registros instantaneamente
- Manutenibilidade: Código Python é mais testável e modular
- Custo: Cloud Run escala automaticamente conforme demanda

**Uso do Backup:**
- Apenas para referência histórica
- Rollback de emergência (improvável)
- Documentação de lógica de negócio legada

---

### 2. Objeto L10 do Dashboard (BACKUP_L10_OBJECT.gs)

**Total:** 157 linhas  
**Status:** ❌ OBSOLETO - Deletado em 05/02/2026

**Conteúdo:**
- Indicadores L10 (Last 10 days): Net Revenue, Bookings, Pipeline
- Cálculos de aging, previsibilidade, distribuição por quarter
- Usado pelo dashboard HTML para exibir métricas executivas

**Substituído por:**
- `cloud-function/main.py` → função `calculate_executive_metrics()`
- Retorna via endpoint: `/` com `source=bigquery`
- Dashboard lê de: `cloudAnalysis.pipeline_analysis.executive.*`

---

## ⚠️ NÃO RESTAURAR ESTE CÓDIGO AO WORKSPACE ATIVO

Se precisar consultar lógica antiga:
1. Abra os arquivos nesta pasta
2. Compare com a implementação atual em Python
3. Se necessário, adapte para Python (não copie de volta para Apps Script)

---

## Arquivos Ativos (2026-02-08)

Para referência, os arquivos ATIVOS do sistema estão em:

**Apps Script:**
- `appscript/SheetCode.gs` - Motor de análise principal
- `appscript/ShareCode.gs` - Funções compartilhadas
- `appscript/MenuOpen.gs` - Interface do menu
- `appscript/BigQuerySync.gs` - Sincronização com BigQuery
- `appscript/AuditoriaBaseAnalise.gs` - Auditoria de integridade

**Cloud Function (Python):**
- `cloud-function/main.py` - API principal
- `cloud-function/bqml/` - Modelos de ML (6 modelos)

**BigQuery:**
- `bigquery/ml_*.sql` - Scripts de treinamento de modelos
- 4 tabelas: pipeline, closed_deals_won, closed_deals_lost, sales_specialist

---

**Arquivado em:** 08/02/2026  
**Por:** GitHub Copilot (Auditoria de Código)  
**Motivo:** Limpeza de código legacy não utilizado conforme auditoria
