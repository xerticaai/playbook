# 🔬 Diagnóstico Comparativo: Google Sheets vs BigQuery

Ferramentas para extrair estatísticas diagnósticas do Google Sheets e comparar com BigQuery.

---

## 📋 Arquivos

1. **DiagnosticExtractor.gs** - Google Apps Script para extrair diagnóstico do Sheets
2. **compare_sheets_vs_bigquery.py** - Python script para comparar Sheets com BigQuery
3. **README_DIAGNOSTIC_COMPARISON.md** - Este arquivo

---

## 🚀 Como Usar

### Passo 1: Extrair Diagnóstico do Google Sheets

1. **Abrir Google Sheets** com suas abas:
   - 🎯 Análise Forecast IA
   - 📈 Análise Ganhas
   - 📉 Análise Perdidas
   - Análise Sales Specialist

2. **Abrir Apps Script**:
   - Menu: `Extensões` → `Apps Script`
   - Colar código de `DiagnosticExtractor.gs`
   - Salvar (Ctrl+S)

3. **Executar Extração**:
   - Método 1: Via Menu (após recarregar Sheet)
     - Menu customizado: `🔬 Diagnóstico` → `📊 Extrair Diagnóstico Completo`
     - Resultado aparece em nova aba `📊 Diagnóstico`
   
   - Método 2: Via Script Editor
     - Executar função: `exportDiagnosticToSheet()`
     - Ou `saveDiagnosticToDrive()` para salvar JSON no Drive

4. **Baixar JSON**:
   - Se usou `saveDiagnosticToDrive()`: Baixar do Google Drive
   - Se usou `exportDiagnosticToSheet()`: Copiar JSON da aba `📊 Diagnóstico`
   - Salvar como: `sheets_diagnostic.json`

### Passo 2: Comparar com BigQuery

```bash
cd /workspaces/playbook/bigquery

# Instalar dependências
pip install google-cloud-bigquery tabulate

# Rodar comparação (com JSON do Sheets)
python compare_sheets_vs_bigquery.py --sheets-json sheets_diagnostic.json --output comparison.json

# Ou apenas extrair do BigQuery (sem Sheets)
python compare_sheets_vs_bigquery.py
```

### Passo 3: Analisar Resultados

O script gera:
1. **comparison.json** - Comparação completa em JSON
2. **Relatório no terminal** - Tabelas formatadas com diferenças

---

## 📊 Estrutura do Diagnóstico

### Google Sheets JSON
```json
{
  "timestamp": "2026-02-06T10:30:00Z",
  "source": "Google Sheets",
  "sheets": {
    "pipeline": {
      "total_records": 268,
      "unique_opportunities": 268,
      "unique_vendors": 10,
      "total_gross": 370792.34,
      "total_net": 165432.12,
      "avg_gross": 1383.19,
      "fiscal_q_coverage": 100.0,
      "forecast_ia_coverage": 95.2,
      "meddic_coverage": 87.3,
      "fiscal_q_distribution": {
        "FY26-Q1": 80,
        "FY26-Q2": 120,
        "FY26-Q3": 50,
        "FY26-Q4": 18
      },
      "sample_records": [...]
    },
    "won": { ... },
    "lost": { ... },
    "salesSpecialist": { ... }
  },
  "summary": {
    "total_records": 3000,
    "total_gross": 3000000.00,
    "total_net": 2500000.00,
    "unique_opportunities": 2800
  }
}
```

### Comparação Output
```json
{
  "timestamp": "2026-02-06T10:35:00Z",
  "tables": {
    "pipeline": {
      "sheets": {
        "records": 268,
        "gross": 370792.34,
        "net": 165432.12,
        "fiscal_q_coverage": 100.0
      },
      "bigquery": {
        "records": 1340,
        "gross": 370792.34,
        "net": 165432.12,
        "fiscal_q_coverage": 80.0
      },
      "diff": {
        "records": 1072,
        "gross": 0.0,
        "net": 0.0,
        "fiscal_q_coverage": -20.0
      },
      "match": {
        "records": false,
        "gross": true,
        "net": true
      }
    }
  }
}
```

---

## 📈 Relatório de Exemplo

```
================================================================================
🔬 RELATÓRIO DE COMPARAÇÃO: Google Sheets vs BigQuery
================================================================================

📊 RESUMO GERAL
+----------------+---------------+---------------+------------+
| Métrica        | Sheets        | BigQuery      | Diferença  |
+================+===============+===============+============+
| Total Records  | 2,843         | 16,790        | +13,947    |
| Total Gross    | $3,009,000.00 | $3,009,000.00 | $0.00      |
+----------------+---------------+---------------+------------+

📁 PIPELINE
+-------------------+--------------+--------------+------------+-------+
| Métrica           | Sheets       | BigQuery     | Diferença  | Match |
+===================+==============+==============+============+=======+
| Records           | 268          | 1,340        | +1,072     | ❌     |
| Gross Total       | $370,792.34  | $370,792.34  | $0.00      | ✅     |
| Net Total         | $165,432.12  | $165,432.12  | $0.00      | ✅     |
| Fiscal Q Coverage | 100.0%       | 80.0%        | -20.0%     |       |
+-------------------+--------------+--------------+------------+-------+

📁 WON
+-------------------+--------------+--------------+------------+-------+
| Métrica           | Sheets       | BigQuery     | Diferença  | Match |
+===================+==============+==============+============+=======+
| Records           | 506          | 3,036        | +2,530     | ❌     |
| Gross Total       | $659,094.68  | $659,094.68  | $0.00      | ✅     |
| Net Total         | $485,234.12  | $485,234.12  | $0.00      | ✅     |
| Fiscal Q Coverage | 100.0%       | 83.3%        | -16.7%     |       |
+-------------------+--------------+--------------+------------+-------+

🔍 COVERAGE DETALHADO - WON
+-----------------------+---------+-----------+--------+
| Campo                 | Sheets  | BigQuery  | Δ      |
+=======================+=========+===========+========+
| Portfolio             | 100.0%  | 50.0%     | -50.0% |
| Segmento              | 100.0%  | 100.0%    | +0.0%  |
| Familia               | 100.0%  | 50.0%     | -50.0% |
| Resumo                | 100.0%  | 50.0%     | -50.0% |
| Causa Raiz            | 100.0%  | 50.0%     | -50.0% |
| Fatores Sucesso       | 100.0%  | 50.0%     | -50.0% |
| Tipo Resultado        | 100.0%  | 83.3%     | -16.7% |
| Qualidade Engajamento | 100.0%  | 83.3%     | -16.7% |
| Gestao Oportunidade   | 100.0%  | 50.0%     | -50.0% |
+-----------------------+---------+-----------+--------+

================================================================================
⚠️ STATUS: Diferenças detectadas - revisar sincronização
================================================================================
```

---

## 🔍 Interpretação dos Resultados

### ✅ Match Perfeito
- **Gross/Net iguais**: Valores financeiros corretos ✅
- **Diferença < $1,000**: Tolerância aceitável
- **Diferença < 10 records**: Tolerância aceitável (timing de sync)

### ⚠️ Diferenças Esperadas

1. **Mais records no BigQuery que no Sheets**:
   - **Normal**: BigQuery tem histórico completo, Sheets mostra snapshot atual
   - **Exemplo**: Sheets 268 pipeline, BQ 1,340 (inclui histórico)

2. **Coverage menor no BigQuery**:
   - **Normal**: 50% de registros históricos sem análises recentes
   - **Exemplo**: Portfolio 100% Sheets vs 50% BQ (análises não backfilled)

3. **Fiscal_Q coverage menor no BQ**:
   - **Normal**: Records muito antigos sem Fiscal_Q definido
   - **Ação**: Backfill automático via script

### ❌ Diferenças Problemáticas

1. **Gross/Net diferentes**:
   - **Problema**: Sincronização falhou ou valores errados
   - **Ação**: Re-sync imediato

2. **0 registros no BigQuery**:
   - **Problema**: Sync não executou ou tabela não existe
   - **Ação**: Verificar logs de BigQuerySync.gs

3. **Mais records no Sheets que no BQ**:
   - **Problema**: Último sync falhou parcialmente
   - **Ação**: Forçar novo sync completo

---

## 🛠️ Troubleshooting

### Erro: "Sheet not found"
```
Solução: Verificar nomes das abas no DiagnosticExtractor.gs
- Linha 10: '🎯 Análise Forecast IA'
- Linha 150: '📈 Análise Ganhas'
- Linha 250: '📉 Análise Perdidas'
- Linha 350: 'Análise Sales Specialist'
```

### Erro: BigQuery permission denied
```bash
# Autenticar
gcloud auth application-default login

# Ou definir service account
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
```

### JSON não gerado no Sheets
```
1. Apps Script Editor → Ver → Execuções
2. Verificar erros na última execução
3. Dar permissões: "Autorizar" quando solicitado
4. Re-executar função
```

---

## 📝 Campos Comparados

### Pipeline
- Records, Gross, Net
- Fiscal_Q, Forecast_IA, MEDDIC, BANT
- Atividades, Vendedores únicos

### Won Deals
- Records, Gross, Net
- Fiscal_Q, Portfólio, Segmento, Família
- Análises: Resumo, Causa Raiz, Fatores Sucesso
- Tipo Resultado, Qualidade Engajamento, Gestão Oportunidade

### Lost Deals
- Records, Gross, Net
- Fiscal_Q, Portfólio, Segmento
- Análises: Resumo, Causa Raiz, Causas Secundárias
- Evitável (Sim/Não/Talvez), Sinais Alerta, Momento Crítico

### Sales Specialist
- Records, Gross, Net
- Opportunities, Vendedores

---

## 🎯 Uso Recomendado

### Daily Check
```bash
# Rodar toda manhã após sync noturno
python compare_sheets_vs_bigquery.py --sheets-json latest_sheets.json
```

### Before Production Deploy
```bash
# Validar dados antes de deploy do Cloud Run
python compare_sheets_vs_bigquery.py --sheets-json sheets_diagnostic.json --output pre_deploy_comparison.json

# Verificar se STATUS = "CONSISTENTES"
# Se não, corrigir antes de deploy
```

### After BigQuery Schema Changes
```bash
# Após adicionar novas colunas no BigQuery
# 1. Rodar sync no Sheets
# 2. Extrair diagnóstico
# 3. Comparar para validar novas colunas
```

---

## 📚 Recursos Adicionais

- [BigQuerySync.gs](./BigQuerySync.gs) - Script de sincronização principal
- [DATA_QUALITY_REPORT.md](./DATA_QUALITY_REPORT.md) - Relatório de qualidade de dados
- [CSV_VS_BIGQUERY_COMPARISON.md](./CSV_VS_BIGQUERY_COMPARISON.md) - Comparação com CSVs

---

**Última Atualização**: 2026-02-06  
**Versão**: 1.0
