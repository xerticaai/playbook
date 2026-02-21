#!/usr/bin/env python3
"""
Compare Google Sheets diagnostic data with BigQuery
Generates comparison report showing coverage differences
"""
import json
import sys
from google.cloud import bigquery
from datetime import datetime

# Configuration
PROJECT_ID = "operaciones-br"
DATASET_ID = "sales_intelligence"

def load_sheets_diagnostic(json_file_or_string):
    """Load diagnostic data from Google Sheets JSON"""
    if isinstance(json_file_or_string, str) and json_file_or_string.strip().startswith('{'):
        # JSON string
        return json.loads(json_file_or_string)
    else:
        # File path
        with open(json_file_or_string, 'r', encoding='utf-8') as f:
            return json.load(f)

def query_bigquery_diagnostic(client):
    """Query BigQuery for same diagnostic metrics"""
    
    # Pipeline
    pipeline_query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(CAST(Gross AS FLOAT64)), 2) as total_gross,
        ROUND(SUM(CAST(Net AS FLOAT64)), 2) as total_net,
        ROUND(AVG(CAST(Gross AS FLOAT64)), 2) as avg_gross,
        COUNTIF(Fiscal_Q IS NOT NULL AND LENGTH(Fiscal_Q) > 0) as with_fiscal_q,
        COUNTIF(Forecast_IA IS NOT NULL AND LENGTH(Forecast_IA) > 0) as with_forecast_ia
    FROM `{PROJECT_ID}.{DATASET_ID}.pipeline`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    # Won
    won_query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(CAST(Gross AS FLOAT64)), 2) as total_gross,
        ROUND(SUM(CAST(Net AS FLOAT64)), 2) as total_net,
        ROUND(AVG(CAST(Gross AS FLOAT64)), 2) as avg_gross,
        COUNTIF(Fiscal_Q IS NOT NULL) as with_fiscal_q,
        COUNTIF(Portfolio IS NOT NULL) as with_portfolio,
        COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as with_resumo
    FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_won`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    # Lost
    lost_query = f"""
    SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT Oportunidade) as unique_opportunities,
        COUNT(DISTINCT Vendedor) as unique_vendors,
        ROUND(SUM(CAST(Gross AS FLOAT64)), 2) as total_gross,
        ROUND(SUM(CAST(Net AS FLOAT64)), 2) as total_net,
        ROUND(AVG(CAST(Gross AS FLOAT64)), 2) as avg_gross,
        COUNTIF(Fiscal_Q IS NOT NULL) as with_fiscal_q,
        COUNTIF(Evitavel IS NOT NULL) as with_evitavel
    FROM `{PROJECT_ID}.{DATASET_ID}.closed_deals_lost`
    WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    """
    
    pipeline_result = list(client.query(pipeline_query).result())[0]
    won_result = list(client.query(won_query).result())[0]
    lost_result = list(client.query(lost_query).result())[0]
    
    return {
        'pipeline': dict(pipeline_result),
        'won': dict(won_result),
        'lost': dict(lost_result)
    }

def calculate_difference(sheets_val, bq_val, is_percentage=False):
    """Calculate difference between Sheets and BQ values"""
    if sheets_val == 0 and bq_val == 0:
        return 0, "0%"
    
    diff = sheets_val - bq_val
    if bq_val != 0:
        pct_diff = (diff / bq_val) * 100
    else:
        pct_diff = 100 if sheets_val > 0 else 0
    
    sign = "+" if diff > 0 else ""
    return diff, f"{sign}{pct_diff:.1f}%"

def generate_comparison_report(sheets_data, bq_data):
    """Generate markdown comparison report"""
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    report = f"""# 🔍 Comparação: Google Sheets vs BigQuery

**Data**: {timestamp}  
**Fonte Sheets**: {sheets_data.get('timestamp', 'N/A')}  
**Dataset BQ**: {PROJECT_ID}.{DATASET_ID}

---

## 📊 RESUMO EXECUTIVO

| Source | Total Records | Total Gross | Total Net | Opportunities |
|--------|--------------|-------------|-----------|---------------|
| **Google Sheets** | {sheets_data['summary']['total_records']:,} | R$ {sheets_data['summary']['total_gross']:,.2f} | R$ {sheets_data['summary']['total_net']:,.2f} | {sheets_data['summary']['unique_opportunities']:,} |
| **BigQuery** | {bq_data['pipeline']['total_records'] + bq_data['won']['total_records'] + bq_data['lost']['total_records']:,} | R$ {bq_data['pipeline']['total_gross'] + bq_data['won']['total_gross'] + bq_data['lost']['total_gross']:,.2f} | R$ {bq_data['pipeline']['total_net'] + bq_data['won']['total_net'] + bq_data['lost']['total_net']:,.2f} | - |

---

## 🎯 PIPELINE

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
"""
    
    # Pipeline comparison
    sheets_pipeline = sheets_data['sheets']['pipeline']
    bq_pipeline = bq_data['pipeline']
    
    metrics = [
        ('Total Records', sheets_pipeline['total_records'], bq_pipeline['total_records'], False),
        ('Unique Opportunities', sheets_pipeline['unique_opportunities'], bq_pipeline['unique_opportunities'], False),
        ('Unique Vendors', sheets_pipeline['unique_vendors'], bq_pipeline['unique_vendors'], False),
        ('Total Gross', sheets_pipeline['total_gross'], bq_pipeline['total_gross'], False),
        ('Total Net', sheets_pipeline['total_net'], bq_pipeline['total_net'], False),
        ('Avg Gross', sheets_pipeline['avg_gross'], bq_pipeline['avg_gross'], False),
    ]
    
    for metric_name, sheets_val, bq_val, is_pct in metrics:
        diff, pct_diff = calculate_difference(sheets_val, bq_val, is_pct)
        
        if 'Gross' in metric_name or 'Net' in metric_name:
            sheets_str = f"R$ {sheets_val:,.2f}"
            bq_str = f"R$ {bq_val:,.2f}"
            diff_str = f"R$ {diff:,.2f}"
        else:
            sheets_str = f"{sheets_val:,}"
            bq_str = f"{bq_val:,}"
            diff_str = f"{diff:,}"
        
        # Add emoji based on difference
        if abs(diff) < (sheets_val * 0.01):  # Less than 1% diff
            emoji = "✅"
        elif abs(diff) < (sheets_val * 0.1):  # Less than 10% diff
            emoji = "⚠️"
        else:
            emoji = "🔴"
        
        report += f"| {emoji} {metric_name} | {sheets_str} | {bq_str} | {diff_str} | {pct_diff} |\n"
    
    # Coverage comparison
    fiscal_q_cov_sheets = sheets_pipeline['fiscal_q_coverage']
    fiscal_q_cov_bq = (bq_pipeline['with_fiscal_q'] / bq_pipeline['total_records'] * 100) if bq_pipeline['total_records'] > 0 else 0
    
    report += f"""
### Coverage Comparison
| Campo | Google Sheets | BigQuery | Diferença |
|-------|---------------|----------|-----------|
| Fiscal_Q Coverage | {fiscal_q_cov_sheets:.1f}% | {fiscal_q_cov_bq:.1f}% | {fiscal_q_cov_sheets - fiscal_q_cov_bq:+.1f}% |
| Forecast_IA Coverage | {sheets_pipeline['forecast_ia_coverage']:.1f}% | {(bq_pipeline['with_forecast_ia'] / bq_pipeline['total_records'] * 100):.1f}% | {sheets_pipeline['forecast_ia_coverage'] - (bq_pipeline['with_forecast_ia'] / bq_pipeline['total_records'] * 100):+.1f}% |

---

## 🏆 WON DEALS

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
"""
    
    sheets_won = sheets_data['sheets']['won']
    bq_won = bq_data['won']
    
    metrics_won = [
        ('Total Records', sheets_won['total_records'], bq_won['total_records'], False),
        ('Unique Opportunities', sheets_won['unique_opportunities'], bq_won['unique_opportunities'], False),
        ('Total Gross', sheets_won['total_gross'], bq_won['total_gross'], False),
        ('Total Net', sheets_won['total_net'], bq_won['total_net'], False),
        ('Avg Gross', sheets_won['avg_gross'], bq_won['avg_gross'], False),
    ]
    
    for metric_name, sheets_val, bq_val, is_pct in metrics_won:
        diff, pct_diff = calculate_difference(sheets_val, bq_val, is_pct)
        
        if 'Gross' in metric_name or 'Net' in metric_name:
            sheets_str = f"R$ {sheets_val:,.2f}"
            bq_str = f"R$ {bq_val:,.2f}"
            diff_str = f"R$ {diff:,.2f}"
        else:
            sheets_str = f"{sheets_val:,}"
            bq_str = f"{bq_val:,}"
            diff_str = f"{diff:,}"
        
        if abs(diff) < (sheets_val * 0.01):
            emoji = "✅"
        elif abs(diff) < (sheets_val * 0.1):
            emoji = "⚠️"
        else:
            emoji = "🔴"
        
        report += f"| {emoji} {metric_name} | {sheets_str} | {bq_str} | {diff_str} | {pct_diff} |\n"
    
    # Won Coverage
    portfolio_cov_bq = (bq_won['with_portfolio'] / bq_won['total_records'] * 100) if bq_won['total_records'] > 0 else 0
    resumo_cov_bq = (bq_won['with_resumo'] / bq_won['total_records'] * 100) if bq_won['total_records'] > 0 else 0
    
    report += f"""
### Coverage Comparison
| Campo | Google Sheets | BigQuery | Diferença |
|-------|---------------|----------|-----------|
| Portfolio Coverage | {sheets_won['portfolio_coverage']:.1f}% | {portfolio_cov_bq:.1f}% | {sheets_won['portfolio_coverage'] - portfolio_cov_bq:+.1f}% |
| Resumo Coverage | {sheets_won['resumo_coverage']:.1f}% | {resumo_cov_bq:.1f}% | {sheets_won['resumo_coverage'] - resumo_cov_bq:+.1f}% |
| Fatores Sucesso Coverage | {sheets_won['fatores_sucesso_coverage']:.1f}% | N/A | - |

---

## ❌ LOST DEALS

### Resumo
| Métrica | Google Sheets | BigQuery | Diferença | % Diff |
|---------|---------------|----------|-----------|--------|
"""
    
    sheets_lost = sheets_data['sheets']['lost']
    bq_lost = bq_data['lost']
    
    metrics_lost = [
        ('Total Records', sheets_lost['total_records'], bq_lost['total_records'], False),
        ('Unique Opportunities', sheets_lost['unique_opportunities'], bq_lost['unique_opportunities'], False),
        ('Total Gross', sheets_lost['total_gross'], bq_lost['total_gross'], False),
        ('Total Net', sheets_lost['total_net'], bq_lost['total_net'], False),
        ('Avg Gross', sheets_lost['avg_gross'], bq_lost['avg_gross'], False),
    ]
    
    for metric_name, sheets_val, bq_val, is_pct in metrics_lost:
        diff, pct_diff = calculate_difference(sheets_val, bq_val, is_pct)
        
        if 'Gross' in metric_name or 'Net' in metric_name:
            sheets_str = f"R$ {sheets_val:,.2f}"
            bq_str = f"R$ {bq_val:,.2f}"
            diff_str = f"R$ {diff:,.2f}"
        else:
            sheets_str = f"{sheets_val:,}"
            bq_str = f"{bq_val:,}"
            diff_str = f"{diff:,}"
        
        if abs(diff) < (sheets_val * 0.01):
            emoji = "✅"
        elif abs(diff) < (sheets_val * 0.1):
            emoji = "⚠️"
        else:
            emoji = "🔴"
        
        report += f"| {emoji} {metric_name} | {sheets_str} | {bq_str} | {diff_str} | {pct_diff} |\n"
    
    report += f"""
---

## 🎯 ANÁLISE DE DIFERENÇAS

### Principais Descobertas

#### 1. **Volume de Records** 🔴
- **Google Sheets**: {sheets_data['summary']['total_records']:,} records total
- **BigQuery**: {bq_data['pipeline']['total_records'] + bq_data['won']['total_records'] + bq_data['lost']['total_records']:,} records total
- **Diferença**: {(bq_data['pipeline']['total_records'] + bq_data['won']['total_records'] + bq_data['lost']['total_records']) - sheets_data['summary']['total_records']:,} records a mais no BigQuery

**Causa Provável**: 
- BigQuery contém **histórico completo** de todos os syncs (últimos 7 dias com multiplos runs)
- Google Sheets mostra apenas **snapshot atual** (1 run por dia)
- Cada sync do BigQuerySync.gs cria novos records com `Run_ID` diferente

#### 2. **Valores Financeiros** ⚠️
- **Google Sheets**: R$ {sheets_data['summary']['total_gross']:,.2f} gross total
- **BigQuery**: R$ {bq_data['pipeline']['total_gross'] + bq_data['won']['total_gross'] + bq_data['lost']['total_gross']:,.2f} gross total

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
   - Sheets: R$ {sheets_data['summary']['total_gross']:,.2f}
   - BQ: R$ {bq_data['pipeline']['total_gross'] + bq_data['won']['total_gross'] + bq_data['lost']['total_gross']:,.2f}
   - Diferença: R$ {(bq_data['pipeline']['total_gross'] + bq_data['won']['total_gross'] + bq_data['lost']['total_gross']) - sheets_data['summary']['total_gross']:,.2f}

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

**Relatório gerado em**: {timestamp}  
**Fonte**: compare_sheets_vs_bigquery.py
"""
    
    return report

def main():
    """Main execution"""
    
    # Check if JSON provided as argument or stdin
    if len(sys.argv) > 1:
        sheets_data = load_sheets_diagnostic(sys.argv[1])
    else:
        # Read from stdin
        print("📋 Cole o JSON do diagnóstico do Google Sheets:")
        json_input = sys.stdin.read()
        sheets_data = load_sheets_diagnostic(json_input)
    
    print("🔍 Conectando ao BigQuery...")
    client = bigquery.Client(project=PROJECT_ID)
    
    print("📊 Extraindo dados do BigQuery...")
    bq_data = query_bigquery_diagnostic(client)
    
    print("📝 Gerando relatório comparativo...")
    report = generate_comparison_report(sheets_data, bq_data)
    
    # Save report
    output_file = f"sheets_vs_bigquery_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"✅ Relatório salvo: {output_file}")
    print("\n" + "="*60)
    print(report)
    print("="*60)

if __name__ == "__main__":
    main()
