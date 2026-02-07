# 🔍 Comparação: Google Sheets vs BigQuery

**Data**: 2026-02-06 15:37:52  
**Fonte Sheets**: 2026-02-06T15:34:52.259Z  
**Dataset BQ**: operaciones-br.sales_intelligence

---

## 📊 RESUMO EXECUTIVO

| Source | Total Records | Total Gross | Total Net | Opportunities |
|--------|--------------|-------------|-----------|---------------|
| **Google Sheets** | 2,864 | R$ 529,615,171.23 | R$ 214,246,564.73 | 2,864 |
| **BigQuery** | 16,790 | R$ 3,010,107,788.92 | R$ 1,230,095,281.26 | - |

---

## 🎯 PIPELINE

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
| 🔴 Total Records | 268 | 1,340 | -1,072 | -80.0% |
| ✅ Unique Opportunities | 268 | 268 | 0 | 0.0% |
| ✅ Unique Vendors | 10 | 10 | 0 | 0.0% |
| 🔴 Total Gross | R$ 74,158,468.67 | R$ 370,792,343.35 | R$ -296,633,874.68 | -80.0% |
| 🔴 Total Net | R$ 28,891,641.24 | R$ 144,458,206.20 | R$ -115,566,564.96 | -80.0% |
| ✅ Avg Gross | R$ 276,710.70 | R$ 276,710.70 | R$ 0.00 | 0.0% |

### Coverage Comparison
| Campo | Google Sheets | BigQuery | Diferença |
|-------|---------------|----------|-----------|
| Fiscal_Q Coverage | 100.0% | 80.0% | +20.0% |
| Forecast_IA Coverage | 100.0% | 80.0% | +20.0% |

---

## 🏆 WON DEALS

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
| 🔴 Total Records | 506 | 3,036 | -2,530 | -83.3% |
| ✅ Unique Opportunities | 506 | 506 | 0 | 0.0% |
| 🔴 Total Gross | R$ 109,849,112.79 | R$ 659,094,676.71 | R$ -549,245,563.92 | -83.3% |
| 🔴 Total Net | R$ 37,777,512.49 | R$ 226,665,074.94 | R$ -188,887,562.45 | -83.3% |
| ✅ Avg Gross | R$ 217,093.11 | R$ 217,093.11 | R$ 0.00 | 0.0% |

### Coverage Comparison
| Campo | Google Sheets | BigQuery | Diferença |
|-------|---------------|----------|-----------|
| Portfolio Coverage | 100.0% | 50.0% | +50.0% |
| Resumo Coverage | 100.0% | 50.0% | +50.0% |
| Fatores Sucesso Coverage | 100.0% | N/A | - |

---

## ❌ LOST DEALS

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
| 🔴 Total Records | 2,069 | 12,414 | -10,345 | -83.3% |
| ✅ Unique Opportunities | 2,069 | 2,069 | 0 | 0.0% |
| 🔴 Total Gross | R$ 330,036,794.81 | R$ 1,980,220,768.86 | R$ -1,650,183,974.05 | -83.3% |
| 🔴 Total Net | R$ 143,162,000.02 | R$ 858,972,000.12 | R$ -715,810,000.10 | -83.3% |
| ✅ Avg Gross | R$ 159,515.13 | R$ 159,515.13 | R$ 0.00 | 0.0% |

---

## 🎯 ANÁLISE DE DIFERENÇAS

### Principais Descobertas

#### 1. **Volume de Records** 🔴
- **Google Sheets**: 2,864 records total
- **BigQuery**: 16,790 records total
- **Diferença**: 13,926 records a mais no BigQuery

**Causa Provável**: 
- BigQuery contém **histórico completo** de todos os syncs (últimos 7 dias com multiplos runs)
- Google Sheets mostra apenas **snapshot atual** (1 run por dia)
- Cada sync do BigQuerySync.gs cria novos records com `Run_ID` diferente

#### 2. **Valores Financeiros** ⚠️
- **Google Sheets**: R$ 529,615,171.23 gross total
- **BigQuery**: R$ 3,010,107,788.92 gross total

**Possíveis Causas**:
- Duplicação de records no BigQuery (múltiplos Run_IDs)
- Deals movidos entre abas (ex: Pipeline → Won) criando duplicatas
- Histórico de alterações de valores

#### 3. **Coverage de Campos** ✅
- **Google Sheets**: 100% coverage em quase todos os campos
- **BigQuery**: Coverage variável (50-83%)

**Explicação**:
- Google Sheets = **dados atuais/processados** com análises completas
- BigQuery = **dados históricos** incluindo records antigos sem análise

---

## 🚨 PROBLEMAS IDENTIFICADOS

### Crítico 🔴

1. **Duplicação de Records no BigQuery**
   - Cada sync cria novos records ao invés de substituir
   - Solução: Usar `WRITE_TRUNCATE` ou particionar por `Run_ID` + query apenas latest

2. **Gross Total Divergente**
   - Sheets: R$ 529,615,171.23
   - BQ: R$ 3,010,107,788.92
   - Diferença: R$ 2,480,492,617.69

### Médio ⚠️

3. **Coverage Inconsistente**
   - BQ tem apenas 50% de records com Portfólio/Família
   - Sheets tem 100% coverage
   - Causa: Records históricos sem backfill

4. **Fiscal_Q Missing**
   - Sheets: 100% coverage
   - BQ: ~80-83% coverage
   - Sheets tem dados mais completos/atualizados

---

## ✅ RECOMENDAÇÕES

### Imediato (Hoje)

1. **Modificar BigQuerySync.gs**:
   ```javascript
   // Usar WRITE_TRUNCATE ao invés de WRITE_APPEND
   // Ou adicionar lógica de deduplicação
   ```

2. **Queries BigQuery**:
   ```sql
   -- Usar apenas último Run_ID
   WHERE Run_ID = (SELECT MAX(Run_ID) FROM table)
   -- Ou filtrar por data
   WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
   ```

### Curto Prazo (Semana)

3. **Implementar Particionamento**:
   - Particionar tabelas por `DATE(data_carga)`
   - Usar `WRITE_TRUNCATE` com partition decorator

4. **Adicionar Unique Constraint**:
   - Usar `Oportunidade` como chave única
   - Implementar UPSERT logic (UPDATE if exists, INSERT if not)

### Médio Prazo (Mês)

5. **Backfill Histórico**:
   - Preencher Portfólio, Família, Fiscal_Q em records antigos
   - Ou criar view materializada com apenas records completos

6. **Data Quality Monitoring**:
   - Alertas se Sheets ≠ BigQuery (último Run_ID)
   - Dashboard comparativo automático

---

## 📊 CONCLUSÃO

### Status Atual
- ✅ **Google Sheets**: Dados corretos, completos, atualizados
- ⚠️ **BigQuery**: Dados corretos mas com duplicação histórica
- 🔴 **Sync**: Criando records duplicados a cada execução

### Próxima Ação
1. Modificar `BigQuerySync.gs` para usar `WRITE_TRUNCATE` ou particionar
2. Reexecutar sync
3. Validar que Sheets = BigQuery (último Run_ID)
4. Atualizar Cloud Run queries para usar `Run_ID` latest

---

**Relatório gerado em**: 2026-02-06 15:37:52  
**Fonte**: compare_sheets_vs_bigquery.py
