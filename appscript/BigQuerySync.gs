/**
 * BigQuerySync.gs
 * Sincroniza dados das abas de análise para o BigQuery
 * Integrado com o sistema existente (SheetCode.gs + DashboardCode.gs)
 */

// ==================== CONFIGURAÇÕES ====================

const BQ_PROJECT = 'operaciones-br';
const BQ_DATASET = 'sales_intelligence';
const BQ_ENABLED = true; // Feature flag global

// ==================== SYNC PRINCIPAL ====================

/**
 * Sincroniza dados do Google Sheets para o BigQuery
 * Chamado por trigger horário ou manualmente
 */
function syncToBigQueryScheduled() {
  if (!BQ_ENABLED) {
    console.log('⏸️ BigQuery sync desativado via feature flag');
    return { success: false, reason: 'Disabled' };
  }
  
  console.log('🚀 Iniciando sync para BigQuery...');
  const startTime = Date.now();
  
  try {
    // Usar mesma função que Cloud Function usa
    const data = prepareRawDataForCloudFunction();
    
    if (!data || !data.pipeline || !data.won || !data.lost) {
      throw new Error('Dados não encontrados. Execute autoSyncPipelineExecution() primeiro.');
    }
    
    console.log(`📊 Dados preparados:`);
    console.log(`   • Pipeline: ${data.pipeline.length} deals`);
    console.log(`   • Won: ${data.won.length} deals`);
    console.log(`   • Lost: ${data.lost.length} deals`);
    
    // Carregar Sales Specialist
    const salesSpecData = prepareSalesSpecialistData();
    console.log(`   • Sales Specialist: ${salesSpecData.length} deals`);
    
    const salesSpecResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.sales_specialist`,
      salesSpecData,
      'WRITE_TRUNCATE'
    );
    
    // Carregar pipeline
    const pipelineResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.pipeline`,
      data.pipeline,
      'WRITE_TRUNCATE'
    );
    
    // Carregar closed deals SEPARADOS (ganhas e perdidas)
    // Importante: Os modelos ML v2 usam essas tabelas separadas
    const wonDeals = data.won.map(d => ({...d, outcome: 'WON'}));
    const lostDeals = data.lost.map(d => ({...d, outcome: 'LOST'}));
    
    const wonResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_won`,
      wonDeals,
      'WRITE_TRUNCATE'
    );
    
    const lostResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_lost`,
      lostDeals,
      'WRITE_TRUNCATE'
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ BigQuery sync concluído em ${duration}s`);
    console.log(`   • Sales Specialist: ${salesSpecResult.rowsInserted} linhas`);
    console.log(`   • Pipeline: ${pipelineResult.rowsInserted} linhas`);
    console.log(`   • Closed Won: ${wonResult.rowsInserted} linhas`);
    console.log(`   • Closed Lost: ${lostResult.rowsInserted} linhas`);
    
    // Salvar timestamp da última sync
    PropertiesService.getScriptProperties().setProperty(
      'BIGQUERY_LAST_SYNC',
      new Date().toISOString()
    );
    
    return {
      success: true,
      salesSpecRows: salesSpecResult.rowsInserted,
      pipelineRows: pipelineResult.rowsInserted,
      wonRows: wonResult.rowsInserted,
      lostRows: lostResult.rowsInserted,
      duration: duration
    };
    
  } catch (error) {
    console.error('❌ Erro no sync BigQuery:', error);
    console.error('Stack:', error.stack);
    
    return { 
      success: false, 
      error: error.message,
      stack: error.stack
    };
  }
}

// ==================== LOADER BIGQUERY ====================

/**
 * Carrega dados no BigQuery usando a API
 * @param {string} tableId - project.dataset.table
 * @param {Array} records - Array de objetos
 * @param {string} writeDisposition - WRITE_TRUNCATE ou WRITE_APPEND
 */
function loadToBigQuery(tableId, records, writeDisposition) {
  const [projectId, datasetId, tableName] = tableId.split('.');
  
  console.log(`📤 Carregando ${records.length} registros em ${tableName}...`);
  
  if (records.length === 0) {
    console.warn(`⚠️ Nenhum registro para carregar em ${tableName}`);
    return { rowsInserted: 0, jobId: null, status: 'SKIPPED' };
  }
  
  // Sanitizar dados (Date → ISO string, null handling)
  const sanitizedRecords = records.map(record => {
    const sanitized = {};
    Object.keys(record).forEach(key => {
      const value = record[key];
      if (value instanceof Date) {
        sanitized[key] = value.toISOString();
      } else if (value === null || value === undefined || value === '') {
        sanitized[key] = null;
      } else if (typeof value === 'number' && !isFinite(value)) {
        sanitized[key] = null; // NaN or Infinity
      } else {
        sanitized[key] = value;
      }
    });
    sanitized['data_carga'] = new Date().toISOString();
    return sanitized;
  });
  
  // Criar job de carga
  const job = {
    configuration: {
      load: {
        destinationTable: {
          projectId: projectId,
          datasetId: datasetId,
          tableId: tableName
        },
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: writeDisposition,
        autodetect: true,
        maxBadRecords: 0
      }
    }
  };
  
  // Converter para NDJSON
  const ndjson = sanitizedRecords.map(r => JSON.stringify(r)).join('\n');
  const blob = Utilities.newBlob(ndjson, 'application/json');
  
  console.log(`   • Payload size: ${(blob.getBytes().length / 1024).toFixed(2)} KB`);
  
  // Executar job
  const insertedJob = BigQuery.Jobs.insert(job, projectId, blob);
  const jobId = insertedJob.jobReference.jobId;
  
  console.log(`   • Job ID: ${jobId}`);
  
  // Aguardar conclusão com retry em caso de erro temporário
  let attempts = 0;
  const maxAttempts = 60; // 60 segundos max
  let jobStatus = null;
  
  while (attempts < maxAttempts) {
    try {
      // Aguardar 2s antes da primeira verificação (job precisa iniciar)
      if (attempts === 0) {
        Utilities.sleep(2000);
      } else {
        Utilities.sleep(1000);
      }
      
      jobStatus = BigQuery.Jobs.get(projectId, jobId);
      
      // Verificar se concluído
      if (jobStatus.status.state === 'DONE') {
        break;
      }
      
      attempts++;
      if (attempts % 10 === 0) {
        console.log(`   • Aguardando... (${attempts}s)`);
      }
      
    } catch (error) {
      // Erro temporário (job ainda não disponível)
      if (error.message.includes('Not found: Job') && attempts < 5) {
        console.log(`   • Job ainda não disponível, aguardando... (${attempts + 1}s)`);
        attempts++;
        continue;
      }
      throw error;
    }
  }
  
  if (!jobStatus) {
    throw new Error(`Timeout aguardando job ${jobId} após ${maxAttempts}s`);
  }
  
  if (jobStatus.status.errorResult) {
    throw new Error(`BigQuery job failed: ${JSON.stringify(jobStatus.status.errorResult)}`);
  }
  
  const rowsInserted = parseInt(jobStatus.statistics.load.outputRows || 0);
  console.log(`   ✅ ${rowsInserted} linhas carregadas`);
  
  return {
    rowsInserted: rowsInserted,
    jobId: jobId,
    status: jobStatus.status.state
  };
}

// ==================== PREPARAR SALES SPECIALIST ====================

/**
 * Prepara dados da aba Sales Specialist para BigQuery
 * @returns {Array} Array de objetos com dados normalizados
 */
function prepareSalesSpecialistData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Análise Sales Specialist');
  
  if (!sheet || sheet.getLastRow() <= 1) {
    console.log('⚠️ Aba Sales Specialist vazia ou não encontrada');
    return [];
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Normalizar headers
  const normalizedHeaders = headers.map(h => {
    const norm = String(h).toLowerCase().trim()
      .replace(/[áàâã]/g, 'a')
      .replace(/[éèê]/g, 'e')
      .replace(/[íì]/g, 'i')
      .replace(/[óòô]/g, 'o')
      .replace(/[úù]/g, 'u')
      .replace(/ç/g, 'c')
      .replace(/[\s\(\)\$]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return norm;
  });
  
  // Mapear colunas-chave
  const colMap = {
    account_name: normalizedHeaders.findIndex(h => h.includes('account')),
    perfil: normalizedHeaders.findIndex(h => h === 'perfil'),
    opportunity_name: normalizedHeaders.findIndex(h => h.includes('opportunity')),
    meses_fat: normalizedHeaders.findIndex(h => h.includes('meses')),
    gtm_2026: normalizedHeaders.findIndex(h => h.includes('gtm')),
    booking_total_gross: normalizedHeaders.findIndex(h => h.includes('booking') && h.includes('gross')),
    booking_total_net: normalizedHeaders.findIndex(h => h.includes('booking') && h.includes('net')),
    opportunity_status: normalizedHeaders.findIndex(h => h === 'status'),
    vendedor: normalizedHeaders.findIndex(h => h === 'vendedor'),
    forecast_status: normalizedHeaders.findIndex(h => h === 'status_1'),
    billing_quarter_gross: normalizedHeaders.findIndex(h => h.includes('billing_quarter') && !h.includes('_1')),
    billing_quarter_net: normalizedHeaders.findIndex(h => h.includes('billing_quarter') && h.includes('_1')),
    closed_date: normalizedHeaders.findIndex(h => h.includes('closed'))
  };
  
  console.log('📋 Mapeamento de colunas Sales Specialist:');
  Object.keys(colMap).forEach(key => {
    if (colMap[key] >= 0) {
      console.log(`   • ${key}: col ${colMap[key]} (${headers[colMap[key]]})`);
    }
  });
  
  const records = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Pular linhas vazias
    if (!row[colMap.account_name] || String(row[colMap.account_name]).trim() === '') {
      continue;
    }
    
    // Parse valores monetários
    const parseCurrency = (val) => {
      if (!val) return 0;
      return parseFloat(String(val).replace(/[\$,\s]/g, '')) || 0;
    };
    
    // Parse data (dd/mm/yyyy → yyyy-mm-dd)
    const parseDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) {
        return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      const str = String(val).trim();
      const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
      }
      return null;
    };
    
    // Calcular fiscal quarter baseado em closed_date
    const closedDateStr = parseDate(row[colMap.closed_date]);
    let fiscalQuarter = null;
    if (closedDateStr) {
      const date = new Date(closedDateStr);
      const month = date.getMonth() + 1; // 1-12
      const year = date.getFullYear();
      
      // Fiscal year: começa em fevereiro
      let fy = year % 100;
      if (month === 1) { // Janeiro conta para FY anterior
        fy = (year - 1) % 100;
      }
      
      // Determinar quarter
      let q;
      if (month >= 2 && month <= 4) q = 'Q1';
      else if (month >= 5 && month <= 7) q = 'Q2';
      else if (month >= 8 && month <= 10) q = 'Q3';
      else q = 'Q4'; // 11, 12, 1
      
      fiscalQuarter = `FY${fy}-${q}`;
    }
    
    const record = {
      account_name: String(row[colMap.account_name] || ''),
      perfil: colMap.perfil >= 0 ? String(row[colMap.perfil] || '') : null,
      opportunity_name: colMap.opportunity_name >= 0 ? String(row[colMap.opportunity_name] || '') : null,
      meses_fat: colMap.meses_fat >= 0 ? String(row[colMap.meses_fat] || '') : null,
      gtm_2026: colMap.gtm_2026 >= 0 ? String(row[colMap.gtm_2026] || '') : null,
      booking_total_gross: parseCurrency(row[colMap.booking_total_gross]),
      booking_total_net: parseCurrency(row[colMap.booking_total_net]),
      opportunity_status: colMap.opportunity_status >= 0 ? String(row[colMap.opportunity_status] || '') : null,
      vendedor: colMap.vendedor >= 0 ? String(row[colMap.vendedor] || '') : null,
      forecast_status: colMap.forecast_status >= 0 ? String(row[colMap.forecast_status] || '') : null,
      billing_quarter_gross: parseCurrency(row[colMap.billing_quarter_gross]),
      billing_quarter_net: parseCurrency(row[colMap.billing_quarter_net]),
      closed_date: closedDateStr,
      fiscal_quarter: fiscalQuarter
    };
    
    records.push(record);
  }
  
  console.log(`📊 Sales Specialist preparado: ${records.length} deals`);
  if (records.length > 0) {
    console.log(`   • Exemplo: ${records[0].account_name} - ${records[0].forecast_status} - $${records[0].billing_quarter_gross}`);
  }
  
  return records;
}

// ==================== FIM DO BIGQUERYSYNC ====================
// Funções de menu movidas para MenuOpen.gs para centralização
