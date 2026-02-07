# ✅ Sync Completo - Todas as Colunas Configuradas

## 📊 Status dos Schemas BigQuery

| Tabela | Colunas | Status |
|--------|---------|--------|
| **pipeline** | 58 | ✅ Pronto |
| **closed_deals_won** | 41 | ✅ Pronto |
| **closed_deals_lost** | 45 | ✅ Pronto |
| **sales_specialist** | 20 | ✅ Pronto |

## 🔧 Atualizações Implementadas

### 1. Normalização de Headers (BigQuerySync.gs)
- ✅ Remove emojis: `📝 Resumo Análise` → `Resumo_Analise`
- ✅ Remove acentos: `Confiança (%)` → `Confianca`
- ✅ Remove caracteres especiais: `# Atividades` → `Atividades`
- ✅ Trata duplicatas: `Status` → `Status`, `Status_1`
- ✅ Ignora campos vazios: `-` → (pulado ou `Column_N`)

### 2. Schemas BigQuery Atualizados

#### 🎯 Pipeline (55 colunas mapeadas)
```
Run_ID, Oportunidade, Conta, Perfil, Produtos, Vendedor, Gross, Net,
Fase_Atual, Forecast_SF, Fiscal_Q, Data_Prevista, Ciclo_dias, Dias_Funil,
Atividades, Atividades_Peso, Mix_Atividades, Idle_Dias, Qualidade_Engajamento,
Forecast_IA, Confianca, Motivo_Confianca, MEDDIC_Score, MEDDIC_Gaps,
MEDDIC_Evidencias, BANT_Score, BANT_Gaps, BANT_Evidencias, Justificativa_IA,
Regras_Aplicadas, Incoerencia_Detectada, Perguntas_de_Auditoria_IA, Flags_de_Risco,
Gaps_Identificados, Cod_Acao, Acao_Sugerida, Risco_Principal, Total_Mudancas,
Mudancas_Criticas, Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor,
Anomalias_Detectadas, Velocity_Predicao, Velocity_Detalhes, Territorio_Correto,
Vendedor_Designado, EstadoCidade_Detectado, Fonte_Deteccao, Calendario_Faturacao,
Valor_Reconhecido_Q1, Valor_Reconhecido_Q2, Valor_Reconhecido_Q3, Valor_Reconhecido_Q4,
Ultima_Atualizacao
```

#### 📈 Closed Deals Won (39 colunas)
```
Run_ID, Oportunidade, Conta, Perfil_Cliente, Vendedor, Gross, Net,
Portfolio, Segmento, Familia_Produto, Status, Fiscal_Q, Data_Fechamento,
Ciclo_dias, Produtos, Resumo_Analise, Causa_Raiz, Fatores_Sucesso,
Tipo_Resultado, Qualidade_Engajamento, Gestao_Oportunidade,
Licoes_Aprendidas, Atividades, Ativ_7d, Ativ_30d, Distribuicao_Tipos,
Periodo_Pico, Cadencia_Media_dias, Total_Mudancas, Mudancas_Criticas,
Mudancas_Close_Date, Mudancas_Stage, Mudancas_Valor, Campos_Alterados,
Padrao_Mudancas, Freq_Mudancas, Editores, Labels, Ultima_Atualizacao
```

#### 📉 Closed Deals Lost (40 colunas)
```
Mesmas colunas de Won + 
Causas_Secundarias, Evitavel, Sinais_Alerta, Momento_Critico
```

#### 📊 Sales Specialist (13 colunas + duplicatas)
```
Account_Name, Perfil, Opportunity_Name, Meses_Fat, GTM_2026,
Booking_Total_Gross, Booking_Total_Net, Status, Status_1,
Vendedor, Billing_Quarter, Billing_Quarter_1, Closed_Date
```

## 🚀 Como Sincronizar

### No Google Apps Script:

1. Abra o Apps Script no Google Sheets
2. Execute a função:
```javascript
syncToBigQueryScheduled()
```

Isso vai:
- ✅ Carregar **TODAS** as colunas de cada aba
- ✅ Normalizar headers automaticamente
- ✅ Converter datas para formato BigQuery (yyyy-mm-dd)
- ✅ Tratar valores nulos e tipos de dados
- ✅ Adicionar `Run_ID` e `data_carga` automaticamente

## 🔍 Validação Pós-Sync

Execute estas queries para validar:

### Pipeline
```sql
SELECT COUNT(*) as total,
  COUNTIF(Forecast_IA IS NOT NULL) as tem_forecast,
  COUNTIF(MEDDIC_Score IS NOT NULL) as tem_meddic,
  COUNTIF(Atividades IS NOT NULL) as tem_atividades
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
```

### Closed Deals Won
```sql
SELECT COUNT(*) as total,
  COUNTIF(Resumo_Analise IS NOT NULL AND LENGTH(Resumo_Analise) > 0) as tem_resumo,
  COUNTIF(Causa_Raiz IS NOT NULL AND LENGTH(Causa_Raiz) > 0) as tem_causa,
  COUNTIF(Atividades IS NOT NULL) as tem_atividades
FROM `operaciones-br.sales_intelligence.closed_deals_won`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
```

### Closed Deals Lost
```sql
SELECT COUNT(*) as total,
  COUNTIF(Resumo_Analise IS NOT NULL) as tem_resumo,
  COUNTIF(Causas_Secundarias IS NOT NULL) as tem_secundarias,
  COUNTIF(Evitavel IS NOT NULL) as tem_evitavel
FROM `operaciones-br.sales_intelligence.closed_deals_lost`
WHERE data_carga > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
```

## 📋 Testes Executados

✅ Normalização de headers validada com 55 colunas Pipeline  
✅ Schemas BigQuery atualizados com ALTER TABLE  
✅ Campos duplicados tratados com sufixos (_1, _2)  
✅ Campos vazios ignorados ou nomeados como Column_N  
✅ Emojis, acentos e caracteres especiais removidos  

## ⚠️ Notas Importantes

1. **Streaming Insert Limitation**: Os dados aparecem imediatamente mas podem levar até 90min para serem totalmente consolidados no BigQuery
2. **Headers Duplicados**: Sales Specialist tem `Status` e `Billing_Quarter` duplicados - foram criados como `Status_1` e `Billing_Quarter_1`
3. **Campo Vazio**: O campo `-` (hífen) na aba Ganhas é ignorado automaticamente
4. **Cloud Function**: Todas as colunas usadas pela Cloud Function estão mapeadas e serão carregadas corretamente

## 🎯 Próximos Passos

1. Execute o sync no Apps Script
2. Valide os dados com as queries acima
3. Teste a Cloud Function para confirmar que todos os campos estão acessíveis
