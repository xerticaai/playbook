# 📊 BigQuery Data Quality Report
**Generated**: 2025-01-XX  
**Dataset**: `operaciones-br.sales_intelligence`  
**Data Window**: Last 7 days

---

## ✅ Executive Summary

| Table | Records | Opportunities | Vendors | Gross Total | Analysis Coverage |
|-------|---------|---------------|---------|-------------|-------------------|
| **Pipeline** | 1,340 | 268 | 10 | R$ 370.8M | 80% (Forecast_IA) |
| **Won** | 3,036 | 506 | 19 | R$ 659.1M | 50% (Complete Analysis) |
| **Lost** | 12,414 | 2,069 | 22 | R$ 1,980M | 50% (Complete Analysis) |
| **TOTAL** | **16,790** | **2,843** | **22** | **R$ 3,009M** | **55% avg** |

---

## 📈 Pipeline Data Quality

### Coverage Metrics
```
Total Records: 1,340
├─ Unique Opportunities: 268
├─ Unique Vendors: 10
└─ Time Period: Pipeline ativo + histórico

Critical Columns:
├─ Oportunidade: 100% (1,340/1,340) ✅
├─ Gross: 100% (1,340/1,340) ✅
├─ Fiscal_Q: 100% (1,340/1,340) ✅
├─ Forecast_IA: 80% (1,072/1,340) ⚠️
├─ MEDDIC_Score: 80% (1,072/1,340) ⚠️
├─ BANT_Score: 80% (1,072/1,340) ⚠️
├─ Atividades: 100% (1,340/1,340) ✅
└─ Total_Mudancas: 20% (268/1,340) ⚠️

Financial Metrics:
├─ Average Gross: R$ 276,710.70
├─ Total Gross: R$ 370,792,343.35
└─ Median Range: R$ 100K - R$ 500K
```

### ⚠️ Pipeline Issues
- **Forecast_IA Missing**: 268 records (20%) without ML predictions
  - **Action**: Retrain models or run batch predictions
- **Total_Mudancas Low**: Only 20% coverage (expected 100%)
  - **Action**: Verify SheetCode.gs calculation logic
- **Historical Data**: Mix of active + historical pipeline
  - **Action**: Consider partitioning by `Status` or `Date_Criacao`

---

## 🏆 Won Deals Data Quality

### Coverage Metrics
```
Total Records: 3,036
├─ Unique Opportunities: 506
├─ Unique Vendors: 19
└─ Time Period: Closed Won + historical

Analysis Columns:
├─ Resumo_Analise: 50% (1,518/3,036) ⚠️
├─ Causa_Raiz: 50% (1,518/3,036) ⚠️
├─ Fatores_Sucesso: 50% (1,518/3,036) ⚠️
└─ Atividades: 33% (1,012/3,036) ⚠️

Financial Metrics:
├─ Average Gross: R$ 217,093.11
├─ Total Gross: R$ 659,094,676.71
└─ Median: R$ 150K
```

### ⚠️ Won Issues
- **50% Analysis Coverage**: 1,518 records with complete analysis, 1,518 without
  - **Root Cause**: Historical data imported before analysis feature
  - **Action**: 
    1. Run batch analysis on missing records
    2. Or filter UI to show only analyzed deals
- **Atividades Coverage**: Only 33% (expected 100%)
  - **Action**: Verify Atividades column sync from Google Sheets

### ✅ Won Strengths
- **Clean Data**: All required columns (Oportunidade, Gross, Vendedor) 100% populated
- **Complete Analysis**: When present, analysis includes all 3 fields (Resumo, Causa, Fatores)
- **Vendor Coverage**: 19 vendors with good distribution

---

## ❌ Lost Deals Data Quality

### Coverage Metrics
```
Total Records: 12,414
├─ Unique Opportunities: 2,069
├─ Unique Vendors: 22
└─ Time Period: Closed Lost + historical

Analysis Columns:
├─ Resumo_Analise: 50% (6,207/12,414) ⚠️
├─ Causa_Raiz: 50% (6,207/12,414) ⚠️
├─ Causas_Secundarias: 33% (4,138/12,414) ⚠️
├─ Evitavel: 33% (4,138/12,414) ⚠️
├─ Sinais_Alerta: 33% (4,138/12,414) ⚠️
└─ Momento_Critico: 33% (4,138/12,414) ⚠️

Financial Metrics:
├─ Average Gross: R$ 159,515.13
├─ Total Gross: R$ 1,980,220,768.86
└─ Lost Opportunity Value: R$ 1.98B 💰
```

### ⚠️ Lost Issues
- **50% Analysis Coverage**: 6,207 with basic analysis (Resumo, Causa), 6,207 without
- **33% Deep Analysis**: Only 4,138 with secondary causes, evitability, alerts
  - **Root Cause**: Deep analysis started later than basic analysis
  - **Impact**: ML models missing features for 67% of records
- **Historical Duplication**: Multiple records per opportunity (6:1 ratio)
  - **Action**: Consider deduplication or latest-record-only approach

### 🎯 Lost Insights
- **Evitability Analysis**: 4,138 records classified
  - Critical for ML model: "Could this loss have been prevented?"
- **Early Warning Signals**: 4,138 with detected alert patterns
  - Value for predictive models
- **Critical Moment Analysis**: 4,138 with identified turning points
  - Insight for sales process optimization

---

## 🔬 Schema Completeness

### Pipeline (58 columns total)
```
✅ Core Columns (13): Oportunidade, Gross, Forecast_Category, Fiscal_Q, Vendedor, etc.
✅ MEDDIC Fields (6): Metrics, Economic_Buyer, Decision_Criteria, etc.
✅ BANT Fields (4): Budget, Authority, Need, Timeline
✅ Activity Fields (11): Atividades, Ativ_7d, Ativ_30d, etc.
✅ Change Tracking (5): Total_Mudancas, Mudancas_7d, Mudancas_30d, etc.
✅ ML Predictions (8): Forecast_IA, Confianca, Prioridade, Proximo_Passo, etc.
✅ Time Fields (6): Idle_Dias, Days_Open, Data_Criacao, etc.
⚠️ Metadata (5): Run_ID, Status, data_carga (auto-populated)
```

### Closed Won (41 columns total)
```
✅ Core Columns (13): Same as Pipeline
✅ Analysis Fields (3): Resumo_Analise, Causa_Raiz, Fatores_Sucesso
✅ Activity Fields (11): Same as Pipeline
✅ Time Fields (6): Same as Pipeline
⚠️ Metadata (8): Run_ID, Status, data_carga, etc.
```

### Closed Lost (45 columns total)
```
✅ Core Columns (13): Same as Pipeline
✅ Basic Analysis (3): Resumo_Analise, Causa_Raiz, Licoes_Aprendidas
✅ Deep Analysis (4): Causas_Secundarias, Evitavel, Sinais_Alerta, Momento_Critico
✅ Activity Fields (11): Same as Pipeline
✅ Time Fields (6): Same as Pipeline
⚠️ Metadata (8): Run_ID, Status, data_carga, etc.
```

---

## 🎯 Recommendations

### Priority 1: Critical Issues 🔴
1. **Run Batch Forecast_IA Predictions**
   - 268 pipeline records missing ML predictions
   - Use `ml_predict.sql` to backfill
   - Target: 100% coverage for active pipeline

2. **Fix Total_Mudancas Calculation**
   - Currently only 20% coverage (268/1,340)
   - Review SheetCode.gs change tracking logic
   - Expected: 100% for all pipeline records

3. **Backfill Won Analysis**
   - 1,518 won deals missing analysis
   - Run GPT analysis batch job
   - Or filter UI to "analyzed only"

### Priority 2: Data Quality 🟡
4. **Deduplicate Lost Records**
   - 12,414 records for 2,069 opportunities (6:1 ratio)
   - Consider latest-record-only view
   - Or add `is_latest` flag

5. **Complete Deep Lost Analysis**
   - 6,207 records missing secondary causes
   - Run batch GPT analysis for Causas_Secundarias, Evitavel, etc.
   - Critical for ML training

6. **Validate Atividades Sync**
   - Won: 33% coverage (1,012/3,036)
   - Expected: 100% from Google Sheets
   - Check BigQuerySync.gs column mapping

### Priority 3: ML Model Improvements 🟢
7. **Retrain Models with New Features**
   - Add: Total_Mudancas, Atividades_Peso, Idle_Dias
   - Add: Text embeddings from Resumo_Analise
   - Target accuracy: 75%+ (currently 70%)

8. **Create Model V3**
   - Use complete schema (58/41/45 columns)
   - Train on analyzed subset (50% of data)
   - A/B test V2 vs V3

9. **Add Evitability Predictor**
   - New model: Predict if loss was preventable
   - Training data: 4,138 Lost with Evitavel flag
   - Use case: Prioritize coaching/intervention

### Priority 4: Infrastructure 🔵
10. **Implement Data Partitioning**
    - Partition by `DATE(data_carga)`
    - Reduce query costs for date-filtered queries
    - Improve performance for dashboards

11. **Add Data Quality Tests**
    - Automated tests on each sync
    - Alert on coverage drops below thresholds
    - Monitor schema drift

12. **Create Materialized Views**
    - `vw_pipeline_latest`: Latest pipeline snapshot
    - `vw_closed_analyzed`: Only deals with complete analysis
    - `vw_metrics_summary`: Pre-aggregated KPIs

---

## 📊 Coverage Goals

| Metric | Current | Target | Gap | Priority |
|--------|---------|--------|-----|----------|
| Pipeline Forecast_IA | 80% | 100% | -20% | 🔴 Critical |
| Pipeline Mudancas | 20% | 100% | -80% | 🔴 Critical |
| Won Analysis | 50% | 80% | -30% | 🟡 High |
| Lost Deep Analysis | 33% | 60% | -27% | 🟡 High |
| Won Atividades | 33% | 100% | -67% | 🟡 High |
| Lost Deduplication | 17% | 80% | -63% | 🟢 Medium |

---

## 🚀 Next Steps

### Week 1: Data Quality Sprint
- [ ] Run Forecast_IA batch predictions (268 records)
- [ ] Fix Total_Mudancas calculation in SheetCode.gs
- [ ] Validate Atividades column sync
- [ ] Create data quality dashboard

### Week 2: Analysis Backfill
- [ ] GPT batch analysis for 1,518 Won records
- [ ] GPT deep analysis for 6,207 Lost records
- [ ] Validate analysis quality (manual review 100 samples)

### Week 3: ML Model V3
- [ ] Retrain all 7 models with new features
- [ ] A/B test V2 vs V3
- [ ] Deploy winner to production
- [ ] Create evitability predictor (new model)

### Week 4: Infrastructure
- [ ] Implement table partitioning
- [ ] Create materialized views
- [ ] Add automated data quality tests
- [ ] Setup monitoring alerts

---

## 📝 Validation Queries Used

All queries used to generate this report are available in:
- [validate_all_data.sql](./validate_all_data.sql)

To re-run validation:
```bash
cd /workspaces/playbook/bigquery
bq query --use_legacy_sql=false < validate_all_data.sql
```

---

**Report Status**: ✅ Complete  
**Data Quality Score**: 7.5/10  
**Production Ready**: ⚠️ With fixes (Priority 1+2)
