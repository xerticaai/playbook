// ==================== FUNÇÃO PARA LER DADOS DO SHEET DINAMICAMENTE ====================
/**
 * Lê todos os dados de uma aba do Sheet e retorna um array de objetos,
 * onde cada objeto tem como chave o nome da coluna (cabeçalho).
 * @param {string} sheetName - Nome da aba
 * @returns {Array} Array de objetos com dados brutos
 */
function loadSheetData(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) {
    console.log(`⚠️ Aba "${sheetName}" vazia ou não encontrada`);
    return [];
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Normalizar headers: remover emojis, remover acentos, remover caracteres especiais, substituir espaços por underscores
  const normalizedHeaders = headers.map((h, idx) => {
    let normalized = String(h)
      .trim()
      // Remover emojis e símbolos especiais (mantém letras, números, espaços e hífens)
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, '')
      .trim()
      // Remover acentos
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Remover caracteres especiais (mantém apenas letras, números, espaços, underscores e hífens)
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      // Substituir espaços por underscores
      .replace(/\s+/g, '_')
      // Remover underscores duplicados
      .replace(/_+/g, '_')
      // Remover underscores no início e fim
      .replace(/^_+|_+$/g, '');
    
    // Se o header ficou vazio (ex: "-" ou só símbolos), usar índice da coluna
    if (!normalized) {
      normalized = `Column_${idx}`;
    }
    
    return normalized;
  });
  
  // Detectar e resolver duplicatas adicionando sufixos (_1, _2, etc)
  const headerCounts = {};
  const uniqueHeaders = normalizedHeaders.map(h => {
    if (!headerCounts[h]) {
      headerCounts[h] = 0;
      return h;
    } else {
      headerCounts[h]++;
      return `${h}_${headerCounts[h]}`;
    }
  });
  
  console.log(`📋 Headers normalizados em "${sheetName}": ${uniqueHeaders.slice(0, 15).join(', ')}...`);
  
  const result = data.slice(1).map(row => {
    const obj = {};
    uniqueHeaders.forEach((header, idx) => {
      const val = row[idx];
      
      // Detectar se o campo é de data baseado no nome
      // EXCLUSÕES: Mudancas_Close_Date é INTEGER, não DATE
      const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Date', '_Data', 'Fecha_', 'closed_date', 'created_date'];
      const excludeFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
      const isDateField = dateFields.some(pattern => header.includes(pattern)) && 
                         !excludeFields.some(pattern => header.startsWith(pattern));
      
      if (val === null || val === undefined || val === '') {
        obj[header] = null;
      } else if (val instanceof Date) {
        // CRITICAL: Só converter Date para string se for realmente um campo de data
        if (isDateField) {
          // Date object do Google Sheets → dd/mm/yyyy
          const day = String(val.getDate()).padStart(2, '0');
          const month = String(val.getMonth() + 1).padStart(2, '0');
          const year = val.getFullYear();
          obj[header] = `${day}/${month}/${year}`;
        } else {
          // Se não é campo de data, manter valor numérico (ex: Mudancas_Close_Date = 3)
          obj[header] = val.getTime ? Math.floor((val - new Date(1899, 11, 30)) / 86400000) : val;
        }
      } else if (typeof val === 'number' && isDateField && val > 1000) {
        // Número grande em campo de data: serial date do Excel/Sheets → dd/mm/yyyy
        try {
          const dateFromSerial = new Date((val - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            const day = String(dateFromSerial.getDate()).padStart(2, '0');
            const month = String(dateFromSerial.getMonth() + 1).padStart(2, '0');
            const year = dateFromSerial.getFullYear();
            obj[header] = `${day}/${month}/${year}`;
          } else {
            obj[header] = null;
          }
        } catch (e) {
          obj[header] = null;
        }
      } else if (typeof val === 'number') {
        obj[header] = val;
      } else {
        const strVal = String(val).trim();
        // Normalizar datas para dd/mm/yyyy (se já estiver, mantém; se não, converte)
        const dateMatch = strVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          obj[header] = `${day}/${month}/${year}`;
        } else {
          obj[header] = strVal;
        }
      }
    });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== null)); // Pular linhas completamente vazias
  
  // Log de exemplo do primeiro registro
  if (result.length > 0) {
    console.log(`📝 Exemplo de registro em "${sheetName}": Fiscal_Q=${result[0].Fiscal_Q}, Fase_Atual=${result[0].Fase_Atual}`);
  }
  
  return result;
}
/**
 * BigQuerySync.gs
 * Sincroniza dados das abas de análise para o BigQuery
 * Estrutura adaptada para schemas reais verificados em 2026-02-05
 * 
 * SCHEMAS REAIS (BigQuery):
 * - pipeline: 55+ colunas com PascalCase + acentos (Oportunidade, Conta, Perfil, etc)
 * - closed_deals_won/lost: Estrutura detalhada com outcome implícito
 * - sales_specialist: snake_case lowercase (data_carga, opportunity_status, etc)
 */

// ==================== CONFIGURAÇÕES ====================

const BQ_PROJECT = 'operaciones-br';
const BQ_DATASET = 'sales_intelligence';
const BQ_ENABLED = true; // Feature flag global

// MAPEAMENTO REMOVIDO: Agora todas as colunas do Sheet são exportadas dinamicamente

// ==================== SYNC PRINCIPAL ====================

/**
 * Sincroniza dados do Google Sheets para o BigQuery
 * Adapta automaticamente para os schemas reais do BQ
 */
function syncToBigQueryScheduled() {
  if (!BQ_ENABLED) {
    console.log('⏸️ BigQuery sync desativado via feature flag');
    return { success: false, reason: 'Disabled' };
  }
  
  console.log('🚀 Iniciando sync para BigQuery');
  console.log(`📍 Projeto: ${BQ_PROJECT} | Dataset: ${BQ_DATASET}`);
  
  // CRÍTICO: Aplicar locale pt_BR GLOBALMENTE antes de processar qualquer dado
  // Isso garante que datas sejam interpretadas corretamente (DD/MM em vez de MM/DD)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentLocale = ss.getSpreadsheetLocale();
  console.log(`🌍 Locale atual do spreadsheet: ${currentLocale}`);
  if (currentLocale !== 'pt_BR' && currentLocale !== 'pt-BR') {
    console.log(`🔧 Alterando locale GLOBAL para pt_BR...`);
    ss.setSpreadsheetLocale('pt_BR');
    console.log(`✅ Locale alterado para: ${ss.getSpreadsheetLocale()}`);
    
    // Limpar cache de sheets após mudar locale se a função existir
    if (typeof invalidateSheetCache_ === 'function') {
      invalidateSheetCache_();
      console.log(`🧹 Cache de sheets limpo após mudança de locale`);
    }
  } else {
    console.log(`✅ Locale já configurado como pt_BR`);
  }
  
  const startTime = Date.now();
  const runId = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('BQ_CURRENT_RUN_ID', runId);
  
  try {
    // ETAPA 1: Carregar dados brutos das abas
    const pipelineRaw = loadSheetData('🎯 Análise Forecast IA');
    const wonRaw = loadSheetData('📈 Análise Ganhas');
    const lostRaw = loadSheetData('📉 Análise Perdidas');
    
    console.log(`📊 Dados carregados do Sheet:`);
    console.log(`   • Pipeline: ${pipelineRaw.length} deals`);
    console.log(`   • Won: ${wonRaw.length} deals`);
    console.log(`   • Lost: ${lostRaw.length} deals`);
    
    if (pipelineRaw.length === 0 && wonRaw.length === 0 && lostRaw.length === 0) {
      throw new Error('Nenhum dado encontrado nas abas de análise');
    }
    
    // ETAPA 2: Filtrar deals fechados com data futura (não devem existir)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Zerar horas para comparação de data
    
    const wonFiltered = wonRaw.filter(deal => {
      const dataFechamento = deal.Data_Fechamento;
      if (!dataFechamento) return true; // Manter deals sem data
      
      // Tentar parsear data em formato dd/mm/yyyy
      const match = String(dataFechamento).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        let dia = parseInt(match[1]);
        let mes = parseInt(match[2]) - 1; // Meses começam em 0
        const ano = parseInt(match[3]);
        let data = new Date(ano, mes, dia);
        data.setHours(0, 0, 0, 0);
        
        // Se data é futura, pode estar invertida (MM/DD em vez de DD/MM)
        // Tentar inverter e verificar se fica no passado
        if (data > hoje && dia <= 12) { // Só inverter se dia <= 12 (pode ser mês)
          const dataInvertida = new Date(ano, dia - 1, mes + 1); // Inverter dia/mês
          dataInvertida.setHours(0, 0, 0, 0);
          
          if (dataInvertida <= hoje) {
            // Data invertida é válida e está no passado! Usar ela
            console.warn(`🔧 Data corrigida de ${dataFechamento} (futuro) para ${String(mes + 1).padStart(2, '0')}/${String(dia).padStart(2, '0')}/${ano} (passado)`);
            // Atualizar o deal com a data correta
            deal.Data_Fechamento = `${String(mes + 1).padStart(2, '0')}/${String(dia).padStart(2, '0')}/${ano}`;
            return true; // Manter deal com data corrigida
          } else {
            // Mesmo invertida continua futura: realmente é futura
            console.warn(`⚠️ Deal WON com data futura removido: ${dataFechamento} (Gross: ${deal.Gross})`);
            return false; // Filtrar deal com data futura
          }
        } else if (data > hoje) {
          // Data futura mas dia > 12: não pode inverter, realmente é futura
          console.warn(`⚠️ Deal WON com data futura removido: ${dataFechamento} (Gross: ${deal.Gross})`);
          return false;
        }
      }
      return true; // Manter deal
    });
    
    const lostFiltered = lostRaw.filter(deal => {
      const dataFechamento = deal.Data_Fechamento;
      if (!dataFechamento) return true; // Manter deals sem data
      
      // Tentar parsear data em formato dd/mm/yyyy
      const match = String(dataFechamento).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        let dia = parseInt(match[1]);
        let mes = parseInt(match[2]) - 1;
        const ano = parseInt(match[3]);
        let data = new Date(ano, mes, dia);
        data.setHours(0, 0, 0, 0);
        
        // Se data é futura, pode estar invertida (MM/DD em vez de DD/MM)
        // Tentar inverter e verificar se fica no passado
        if (data > hoje && dia <= 12) { // Só inverter se dia <= 12 (pode ser mês)
          const dataInvertida = new Date(ano, dia - 1, mes + 1); // Inverter dia/mês
          dataInvertida.setHours(0, 0, 0, 0);
          
          if (dataInvertida <= hoje) {
            // Data invertida é válida e está no passado! Usar ela
            console.warn(`🔧 Data corrigida de ${dataFechamento} (futuro) para ${String(mes + 1).padStart(2, '0')}/${String(dia).padStart(2, '0')}/${ano} (passado)`);
            // Atualizar o deal com a data correta
            deal.Data_Fechamento = `${String(mes + 1).padStart(2, '0')}/${String(dia).padStart(2, '0')}/${ano}`;
            return true; // Manter deal com data corrigida
          } else {
            // Mesmo invertida continua futura: realmente é futura
            console.warn(`⚠️ Deal LOST com data futura removido: ${dataFechamento} (Gross: ${deal.Gross})`);
            return false; // Filtrar deal com data futura
          }
        } else if (data > hoje) {
          // Data futura mas dia > 12: não pode inverter, realmente é futura
          console.warn(`⚠️ Deal LOST com data futura removido: ${dataFechamento} (Gross: ${deal.Gross})`);
          return false;
        }
      }
      return true; // Manter deal
    });
    
    const wonRemoved = wonRaw.length - wonFiltered.length;
    const lostRemoved = lostRaw.length - lostFiltered.length;
    
    if (wonRemoved > 0 || lostRemoved > 0) {
      console.log(`🔧 Filtrados ${wonRemoved} deals WON e ${lostRemoved} deals LOST com data futura`);
    }
    
    // ETAPA 3: Carregar para BigQuery
    console.log('📤 Sincronizando com BigQuery (WRITE_TRUNCATE para evitar duplicação)...');

    const pipelineResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.pipeline`,
      pipelineRaw,
      'WRITE_TRUNCATE'
    );

    const wonResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_won`,
      wonFiltered, // Usar dados filtrados
      'WRITE_TRUNCATE'
    );

    const lostResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_lost`,
      lostFiltered, // Usar dados filtrados
      'WRITE_TRUNCATE'
    );
    
    // ETAPA 5: Carregar Sales Specialist (se existir)
    let salesSpecResult = { rowsInserted: 0, status: 'SKIPPED' };
    try {
      const salesSpecSheet = prepareSalesSpecialistData(); // Usar função especializada
      if (salesSpecSheet.length > 0) {
        salesSpecResult = loadToBigQuery(
          `${BQ_PROJECT}.${BQ_DATASET}.sales_specialist`,
          salesSpecSheet,
          'WRITE_TRUNCATE'
        );
      }
    } catch (e) {
      console.warn('⚠️ Sales Specialist não processado:', e.message);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Sync concluído em ${duration}s`);
    console.log(`   • Pipeline: ${pipelineResult.rowsInserted} linhas`);
    console.log(`   • Closed Won: ${wonResult.rowsInserted} linhas`);
    console.log(`   • Closed Lost: ${lostResult.rowsInserted} linhas`);
    console.log(`   • Sales Specialist: ${salesSpecResult.rowsInserted} linhas`);
    
    // Salvar timestamp da última sync
    PropertiesService.getScriptProperties().setProperty(
      'BIGQUERY_LAST_SYNC',
      new Date().toISOString()
    );
    
    return {
      success: true,
      pipelineRows: pipelineResult.rowsInserted,
      wonRows: wonResult.rowsInserted,
      lostRows: lostResult.rowsInserted,
      salesSpecRows: salesSpecResult.rowsInserted,
      duration: duration
    };
    
  } catch (error) {
    console.error('❌ Erro no sync BigQuery:', error.message);
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
 * Carrega dados no BigQuery usando load jobs (WRITE_TRUNCATE) ou streaming inserts (WRITE_APPEND)
 * Load jobs suportam WRITE_TRUNCATE nativo sem problema de streaming buffer
 * @param {string} tableId - project.dataset.table
 * @param {Array} records - Array de objetos
 * @param {string} writeDisposition - WRITE_TRUNCATE ou WRITE_APPEND
 */
function loadToBigQuery(tableId, records, writeDisposition) {
  const [projectId, datasetId, tableName] = tableId.split('.');
  const runId = PropertiesService.getScriptProperties().getProperty('BQ_CURRENT_RUN_ID') || new Date().toISOString();
  
  console.log(`📤 Carregando ${records.length} registros em ${tableName} (${writeDisposition})...`);
  
  if (records.length === 0) {
    console.warn(`⚠️ Nenhum registro para carregar em ${tableName}`);
    return { rowsInserted: 0, jobId: null, status: 'SKIPPED' };
  }
  
  // ESTRATÉGIA:
  // - WRITE_TRUNCATE: usar load job (suporta truncate nativo, sem problema de streaming buffer)
  // - WRITE_APPEND: usar streaming insert (mais rápido)
  
  if (writeDisposition === 'WRITE_TRUNCATE') {
    return loadUsingJob(projectId, datasetId, tableName, records, runId);
  } else {
    return loadUsingStreamingInsert(projectId, datasetId, tableName, records, runId);
  }
}

/**
 * Carrega dados usando load job com WRITE_TRUNCATE nativo
 * Mais lento (~5-10s) mas suporta truncate sem problema de streaming buffer
 */
function loadUsingJob(projectId, datasetId, tableName, records, runId) {
  console.log(`🔄 Usando load job para ${tableName} (suporta WRITE_TRUNCATE)...`);
  
  // Sanitizar dados (Date → yyyy-mm-dd, dd/mm/yyyy → yyyy-mm-dd)
  const sanitizedRecords = records.map((record, idx) => {
    try {
      const sanitized = {};
      Object.keys(record).forEach(key => {
        const value = record[key];
        
        // Detectar se o campo deve ser numérico baseado no nome
        const numericFields = ['_dias', '_Score', '_Peso', 'Atividades', 'Mudancas', 'Editores', 'Confianca', 
                              'Gross', 'Net', 'Total_', 'Valor_', 'Billing_', 'Booking_', 'Idle_'];
        const isNumericField = numericFields.some(pattern => key.includes(pattern));
        
        // Detectar se o campo é de data baseado no nome
        // EXCLUSÕES: Mudancas_Close_Date, Mudancas_Stage, etc são INTEGER
        const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Data', 'Fecha_', 'closed_date', 'created_date'];
        const excludeFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
        const isDateField = dateFields.some(pattern => key.includes(pattern)) && 
                           !excludeFields.some(pattern => key.startsWith(pattern));
        
        if (value === null || value === undefined || value === '') {
          sanitized[key] = null;
        } else if (value instanceof Date) {
          // CRITICAL: Só converter Date para string se for campo de data
          if (isDateField) {
            // Date object → yyyy-mm-dd para BigQuery
            const year = value.getFullYear();
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const day = String(value.getDate()).padStart(2, '0');
            sanitized[key] = `${year}-${month}-${day}`;
          } else {
            // Se não é campo de data, converter Date back para serial number (ex: 3 para Mudancas_Close_Date)
            // Serial date: dias desde 30/12/1899 (padrão Excel/Sheets)
            const serialDate = Math.floor((value - new Date(1899, 11, 30)) / 86400000);
            sanitized[key] = serialDate;
          }
        } else if (typeof value === 'number' && !isFinite(value)) {
          sanitized[key] = null; // NaN or Infinity
        } else if (typeof value === 'number' && isDateField && value > 1000) {
          // Número grande em campo de data: provavelmente serial date do Excel/Sheets
          // Serial date: dias desde 30/12/1899 (Excel) ou 01/01/1900 (Sheets)
          // Fórmula: (serial - 25569) * 86400000 = timestamp Unix
          try {
            const dateFromSerial = new Date((value - 25569) * 86400 * 1000);
            if (!isNaN(dateFromSerial.getTime())) {
              const year = dateFromSerial.getFullYear();
              const month = String(dateFromSerial.getMonth() + 1).padStart(2, '0');
              const day = String(dateFromSerial.getDate()).padStart(2, '0');
              sanitized[key] = `${year}-${month}-${day}`;
            } else {
              sanitized[key] = null;
            }
          } catch (e) {
            sanitized[key] = null;
          }
        } else if (typeof value === 'string') {
          const strVal = String(value).trim();
          
          // Converter dd/mm/yyyy → yyyy-mm-dd SOMENTE para campos de data
          // IMPORTANTE: Aceitar 1 ou 2 dígitos para dia/mês (ex: 1/02/2026 ou 01/02/2026)
          const dateMatch = strVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          const isoDateMatch = strVal.match(/^\d{4}-\d{2}-\d{2}$/);
          
          if (dateMatch && isDateField) {
            // Formato dd/mm/yyyy E campo é de data → converter para yyyy-mm-dd
            const day = dateMatch[1].padStart(2, '0');
            const month = dateMatch[2].padStart(2, '0');
            const year = dateMatch[3];
            sanitized[key] = `${year}-${month}-${day}`;
          } else if ((dateMatch || isoDateMatch) && !isDateField) {
            // String parece data mas campo NÃO é de data → deixar NULL ou tentar parse numérico
            // Ex: Mudancas_Close_Date com valor "03/01/1900" deve ser NULL, não string
            sanitized[key] = null;
          } else if (isNumericField) {
            // Para campos numéricos, tentar converter; se falhar, usar NULL
            const numVal = parseNumberForBQ(strVal);
            sanitized[key] = numVal;
          } else {
            sanitized[key] = strVal || null;
          }
        } else if (typeof value === 'number') {
          // Validação rigorosa para campos numéricos
          if (isNumericField) {
            if (!isFinite(value)) {
              sanitized[key] = null;
            } else {
              // Arredondar para 2 casas decimais para evitar problemas de precisão float
              sanitized[key] = Math.round(value * 100) / 100;
            }
          } else {
            sanitized[key] = value;
          }
        } else {
          sanitized[key] = value;
        }
      });
      sanitized['Run_ID'] = sanitized['Run_ID'] || runId;
      sanitized['data_carga'] = new Date().toISOString();
      return sanitized;
    } catch (error) {
      console.error(`❌ Erro ao sanitizar registro ${idx + 1}: ${error.message}`);
      console.error(`   Registro problemático: ${JSON.stringify(record).substring(0, 200)}...`);
      // Retornar registro básico para não quebrar o batch
      return {
        Run_ID: runId,
        data_carga: new Date().toISOString(),
        Oportunidade: record.Oportunidade || `ERROR_${idx}`,
        error_message: error.message
      };
    }
  });
  
  // DEBUG: Mostrar primeiros 3 registros sanitizados para diagnóstico
  if (sanitizedRecords.length > 0) {
    console.log(`🔍 DEBUG: Primeiros registros sanitizados para ${tableName}:`);
    const debugLimit = Math.min(3, sanitizedRecords.length);
    for (let i = 0; i < debugLimit; i++) {
      const rec = sanitizedRecords[i];
      console.log(`   📝 Registro ${i+1}/${sanitizedRecords.length}:`);
      
      // Mostrar campos relevantes para debug
      const debugFields = ['Oportunidade', 'Data_Fechamento', 'Data_Prevista', 'closed_date', 
                          'Gross', 'Net', 'Fiscal_Q', 'Confianca', 'Ciclo_dias', 'Mudancas_Close_Date',
                          'opportunity_name', 'booking_total_gross', 'fiscal_quarter'];
      debugFields.forEach(field => {
        if (rec.hasOwnProperty(field)) {
          const val = rec[field];
          const valType = val === null ? 'NULL' : typeof val;
          console.log(`      • ${field}: ${val} (${valType})`);
        }
      });
    }
  }
  
  // Converter para NDJSON com validação
  const ndjsonLines = [];
  for (let i = 0; i < sanitizedRecords.length; i++) {
    try {
      const jsonStr = JSON.stringify(sanitizedRecords[i]);
      // Validar que JSON não tem valores inválidos
      if (jsonStr.includes('null') || jsonStr.includes('NaN') || jsonStr.includes('Infinity')) {
        // Verificação extra: re-parse para garantir validade
        const parsed = JSON.parse(jsonStr);
      }
      ndjsonLines.push(jsonStr);
    } catch (jsonError) {
      console.error(`❌ Erro ao serializar registro ${i + 1}: ${jsonError.message}`);
      console.error(`   Registro problemático: ${JSON.stringify(sanitizedRecords[i]).substring(0, 300)}`);
      // Pular registro inválido
    }
  }
  const ndjson = ndjsonLines.join('\n');
  
  if (ndjsonLines.length < sanitizedRecords.length) {
    console.warn(`⚠️ ${sanitizedRecords.length - ndjsonLines.length} registros inválidos foram removidos`);
  }
  
  // Criar load job com WRITE_TRUNCATE
  try {
    const job = {
      configuration: {
        load: {
          sourceFormat: 'NEWLINE_DELIMITED_JSON',
          destinationTable: {
            projectId: projectId,
            datasetId: datasetId,
            tableId: tableName
          },
          writeDisposition: 'WRITE_TRUNCATE',
          autodetect: false,
          ignoreUnknownValues: true,
          maxBadRecords: 0
        }
      }
    };
    
    // Enviar dados via load job
    const blob = Utilities.newBlob(ndjson, 'application/json');
    const jobResult = BigQuery.Jobs.insert(job, projectId, blob);
    const jobId = jobResult.jobReference.jobId;
    const location = jobResult.jobReference.location || 'US'; // Capturar location do job
    
    console.log(`⏳ Job ${jobId} iniciado (location: ${location}), aguardando conclusão...`);
    
    // Polling do job (aguardar até 60s)
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      Utilities.sleep(2000); // Aguardar 2s
      attempts++;
      
      try {
        // IMPORTANTE: BigQuery.Jobs.get() precisa de location como 3º parâmetro
        const jobStatus = BigQuery.Jobs.get(projectId, jobId, { location: location });
        
        if (jobStatus.status.state === 'DONE') {
          if (jobStatus.status.errorResult) {
            const error = jobStatus.status.errorResult.message;
            console.error(`❌ Job falhou: ${error}`);
            
            // Tentar capturar erros detalhados
            if (jobStatus.status.errors && jobStatus.status.errors.length > 0) {
              console.error(`📋 Erros detalhados (${jobStatus.status.errors.length} erros):`);
              jobStatus.status.errors.slice(0, 3).forEach((err, idx) => {
                console.error(`   ${idx + 1}. ${JSON.stringify(err)}`);
              });
            }
            
            throw new Error(`Load job failed: ${error}`);
          }
          
          // Sucesso!
          const rowsLoaded = jobStatus.statistics.load.outputRows || records.length;
          console.log(`✅ ${rowsLoaded} linhas carregadas em ${tableName} (TRUNCATE aplicado)`);
          return {
            rowsInserted: parseInt(rowsLoaded),
            jobId: jobId,
            status: 'SUCCESS'
          };
        }
        
        console.log(`⏳ Job ainda processando (${attempts}/${maxAttempts})...`);
      } catch (pollError) {
        console.warn(`⚠️ Erro no polling (tentativa ${attempts}): ${pollError.message}`);
        if (attempts >= maxAttempts - 1) {
          // Última tentativa: tentar contar linhas diretamente na tabela
          console.log('⏳ Aguardando 5s extras para job completar...');
          Utilities.sleep(5000);
          const rowCount = countBigQueryRows(projectId, datasetId, tableName);
          if (rowCount >= records.length) {
            console.log(`✅ ${rowCount} linhas encontradas em ${tableName} (job completou)`);
            return {
              rowsInserted: rowCount,
              jobId: jobId,
              status: 'SUCCESS'
            };
          }
          throw pollError;
        }
      }
    }
    
    // Timeout após 60s: tentar validar contando linhas
    console.warn(`⚠️ Job timeout após 60s, verificando tabela...`);
    Utilities.sleep(5000);
    const rowCount = countBigQueryRows(projectId, datasetId, tableName);
    if (rowCount >= records.length) {
      console.log(`✅ ${rowCount} linhas encontradas em ${tableName} (job completou em background)`);
      return {
        rowsInserted: rowCount,
        jobId: jobId,
        status: 'SUCCESS'
      };
    }
    return {
      rowsInserted: records.length,
      jobId: jobId,
      status: 'TIMEOUT'
    };
    
  } catch (error) {
    console.error(`❌ Erro no load job: ${error.message}`);
    throw new Error(`Falha ao carregar ${tableName}: ${error.message}`);
  }
}

/**
 * Carrega dados usando streaming insert (rápido, sem truncate)
 * Usado para WRITE_APPEND
 */
function loadUsingStreamingInsert(projectId, datasetId, tableName, records, runId) {
  console.log(`🔄 Usando streaming insert para ${tableName} (APPEND)...`);
  
  // Sanitizar dados
  const sanitizedRecords = records.map(record => {
    const sanitized = {};
    Object.keys(record).forEach(key => {
      const value = record[key];
      
      const numericFields = ['_dias', '_Score', '_Peso', 'Atividades', 'Mudancas', 'Editores', 'Confianca', 
                            'Gross', 'Net', 'Total_', 'Valor_', 'Billing_', 'Booking_', 'Idle_'];
      const isNumericField = numericFields.some(pattern => key.includes(pattern));
      
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        sanitized[key] = `${year}-${month}-${day}`;
      } else if (value === null || value === undefined || value === '') {
        sanitized[key] = null;
      } else if (typeof value === 'number' && !isFinite(value)) {
        sanitized[key] = null;
      } else if (typeof value === 'string') {
        const strVal = String(value).trim();
        const dateMatch = strVal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (dateMatch) {
          const day = dateMatch[1];
          const month = dateMatch[2];
          const year = dateMatch[3];
          sanitized[key] = `${year}-${month}-${day}`;
        } else if (isNumericField) {
          const numVal = parseNumberForBQ(strVal);
          sanitized[key] = numVal;
        } else {
          sanitized[key] = strVal || null;
        }
      } else {
        sanitized[key] = value;
      }
    });
    sanitized['Run_ID'] = sanitized['Run_ID'] || runId;
    sanitized['data_carga'] = new Date().toISOString();
    return sanitized;
  });
  
  try {
    const rows = sanitizedRecords.map(record => ({
      json: record
    }));
    
    const request = {
      rows: rows,
      skipInvalidRows: false,
      ignoreUnknownValues: true
    };
    
    const result = BigQuery.Tabledata.insertAll(
      request,
      projectId,
      datasetId,
      tableName
    );
    
    if (result.insertErrors && result.insertErrors.length > 0) {
      const errorCount = result.insertErrors.length;
      const successCount = rows.length - errorCount;
      console.error(`⚠️ Erros ao inserir ${errorCount} registros (${successCount} inseridos): ${JSON.stringify(result.insertErrors.slice(0, 3))}`);
      
      // Ainda retornar sucesso se a maioria foi inserida
      return {
        rowsInserted: successCount,
        errors: errorCount,
        status: 'PARTIAL_SUCCESS'
      };
    }
    
    console.log(`✅ ${rows.length} linhas inseridas com sucesso em ${tableName}`);
    return {
      rowsInserted: rows.length,
      jobId: null,
      status: 'SUCCESS'
    };
    
  } catch (error) {
    console.error(`❌ Erro ao carregar dados no BigQuery: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    throw new Error(`Falha ao carregar ${tableName}: ${error.message}`);
  }
}

/**
 * Mapeia dados brutos para o schema pipeline do BigQuery
 * Lida com conversão de tipos e nomes de colunas
 */
function mapToPipelineSchema(row) {
  const parse = (val, type) => {
    if (val === null || val === undefined || val === '') return null;
    switch(type) {
      case 'FLOAT':
        return parseNumberForBQ(val);
      case 'INTEGER':
        const intVal = parseNumberForBQ(val);
        if (intVal === null || !isFinite(intVal)) return null;
        return intVal < 0 ? Math.ceil(intVal) : Math.floor(intVal);
      case 'DATE':
        return parseDateForBQ(val);
      case 'TIMESTAMP':
        return new Date().toISOString(); // Para Run_ID ou load timestamp
      default:
        return String(val).trim() || null;
    }
  };
  
  return {
    // Identificação
    'Oportunidade': parse(row['Oportunidade'] || row['Deal'], 'STRING') || 'N/A',
    'Conta': parse(row['Conta'] || row['Account'], 'STRING'),
    'Perfil': parse(row['Perfil'], 'STRING'),
    'Produtos': parse(row['Produtos'] || row['Product'], 'STRING'),
    'Vendedor': parse(row['Vendedor'] || row['Seller'], 'STRING'),
    
    // Valores
    'Gross': parse(row['Gross'] || row['Valor Bruto'], 'FLOAT'),
    'Net': parse(row['Net'] || row['Valor Líquido'], 'FLOAT'),
    
    // Pipeline Info
    'Fase_Atual': parse(row['Fase_Atual'] || row['Stage'], 'STRING'),
    'Forecast_SF': parse(row['Forecast_SF'] || row['Forecast'], 'STRING'),
    'Fiscal_Q': parse(row['Fiscal_Q'] || row['Fiscal Quarter'], 'STRING'),
    'Data_Prevista': parse(row['Data_Prevista'] || row['Expected Close'], 'DATE'),
    'Ciclo_dias': parse(row['Ciclo_dias'] || row['Cycle Days'], 'INTEGER'),
    'Dias_Funil': parse(row['Dias_Funil'] || row['Days in Funnel'], 'INTEGER'),
    
    // Atividades (podem vir do Sheet ou da Cloud Function)
    'Atividades': parse(row['Atividades'], 'INTEGER'),
    'Atividades_Peso': parse(row['Atividades_Peso'], 'FLOAT'),
    'Mix_Atividades': parse(row['Mix_Atividades'], 'STRING'),
    
    // Scores & IA (primariamente preenchidos pela Cloud Function)
    'Forecast_IA': parse(row['Forecast_IA'], 'STRING'),
    'Confiana': parse(row['Confiana'] || row['Confiança (%)'], 'INTEGER'), // ⚠️ SEM Ç no BQ!
    'MEDDIC_Score': parse(row['MEDDIC_Score'], 'INTEGER'),
    'BANT_Score': parse(row['BANT_Score'], 'INTEGER'),
    
    // Risco & Ação
    'Flags_de_Risco': parse(row['Flags_de_Risco'], 'STRING'),
    'Cd_Ao': parse(row['Cd_Ao'], 'STRING'), // ⚠️ Sem tilde!
    'Risco_Principal': parse(row['Risco_Principal'], 'STRING')
  };
}

/**
 * Mapeia dados para schema de closed deals (won ou lost)
 */
function mapToClosedDealsSchema(row, outcome) {
  const parse = (val, type) => {
    if (val === null || val === undefined || val === '') return null;
    switch(type) {
      case 'FLOAT':
        return parseNumberForBQ(val);
      case 'INTEGER':
        const intVal = parseNumberForBQ(val);
        if (intVal === null || !isFinite(intVal)) return null;
        return intVal < 0 ? Math.ceil(intVal) : Math.floor(intVal);
      case 'DATE':
        return parseDateForBQ(val);
      default:
        return String(val).trim() || null;
    }
  };
  
  return {
    'Oportunidade': parse(row['Oportunidade'] || row['Deal'], 'STRING') || 'N/A',
    'Conta': parse(row['Conta'] || row['Account'], 'STRING'),
    'Perfil_Cliente': parse(row['Perfil'] || row['Customer Profile'], 'STRING'),
    'Vendedor': parse(row['Vendedor'] || row['Seller'], 'STRING'),
    
    'Gross': parse(row['Gross'] || row['Valor Bruto'], 'FLOAT'),
    'Net': parse(row['Net'] || row['Valor Líquido'], 'FLOAT'),
    'Portfolio': parse(row['Portfólio'] || row['Portfolio'] || row['Portafolio'], 'STRING'),
    'Segmento': parse(row['Segmento'], 'STRING'),
    'Familia_Produto': parse(row['Família Produto'] || row['Familia Produto'] || row['Familia_Produto'], 'STRING'),
    'Status': parse(row['Status'], 'STRING'),
    
    'Fiscal_Q': parse(row['Fiscal_Q'] || row['Fiscal Quarter'], 'STRING'),
    'Data_Fechamento': parse(row['Data_Fechamento'] || row['Close Date'] || row['Closed Date'], 'DATE'),
    'Ciclo_dias': parse(row['Ciclo_dias'] || row['Cycle Days'], 'INTEGER'),
    'Produtos': parse(row['Produtos'] || row['Product'], 'STRING'),
    
    'Causa_Raiz': parse(row['Causa_Raiz'] || row['Root Cause'], 'STRING'),
    'Resumo_Analise': parse(row['Resumo_Analise'] || row['Analysis Summary'], 'STRING'),
    'Fatores_Sucesso': parse(row['Fatores_Sucesso'] || row['Success Factors'], 'STRING'),
    'Tipo_Resultado': parse(row['Tipo_Resultado'] || row['Tipo Resultado'], 'STRING'),
    'Qualidade_Engajamento': parse(row['Qualidade_Engajamento'], 'STRING'),
    'Gestao_Oportunidade': parse(row['Gestao_Oportunidade'] || row['Gestão Oportunidade'], 'STRING'),
    'Licoes_Aprendidas': parse(row['Licoes_Aprendidas'] || row['Lições Aprendidas'], 'STRING'),
    
    'Atividades': parse(row['Atividades'], 'INTEGER'),
    'Ativ_7d': parse(row['Ativ_7d'], 'INTEGER'),
    'Ativ_30d': parse(row['Ativ_30d'], 'INTEGER'),
    'Distribuicao_Tipos': parse(row['Distribuicao_Tipos'] || row['Distribuição Tipos'], 'STRING'),
    'Periodo_Pico': parse(row['Periodo_Pico'] || row['Período Pico'], 'STRING'),
    'Cadencia_Media_dias': parse(row['Cadencia_Media_dias'] || row['Cadência Média (dias)'] || row['Cadencia Media (dias)'], 'STRING'),
    
    'Total_Mudancas': parse(row['Total_Mudancas'], 'INTEGER'),
    'Mudancas_Criticas': parse(row['Mudancas_Criticas'], 'INTEGER'),
    'Mudancas_Close_Date': parse(row['Mudancas_Close_Date'] || row['Mudanças Close Date'], 'INTEGER'),
    'Mudancas_Stage': parse(row['Mudancas_Stage'] || row['Mudanças Stage'], 'INTEGER'),
    'Mudancas_Valor': parse(row['Mudancas_Valor'] || row['Mudanças Valor'], 'INTEGER'),
    'Campos_Alterados': parse(row['Campos_Alterados'] || row['Campos Alterados'], 'STRING'),
    'Padrao_Mudancas': parse(row['Padrao_Mudancas'] || row['Padrão Mudanças'], 'STRING'),
    'Freq_Mudancas': parse(row['Freq_Mudancas'] || row['Freq Mudanças'], 'STRING'),
    'Editores': parse(row['Editores'], 'INTEGER'),
    'Labels': parse(row['Labels'], 'STRING'),
    'Ultima_Atualizacao': parse(row['Ultima_Atualizacao'] || row['Última Atualização'], 'STRING'),
    
    'outcome': outcome // WON ou LOST
  };
}

/**
 * Parse de datas: suporta múltiplos formatos
 * Retorna yyyy-mm-dd (formato BigQuery) ou null
 */
function parseDateForBQ(val) {
  if (!val || val === '') return null;
  
  try {
    if (val instanceof Date) {
      // Google Sheets Date object
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    const str = String(val).trim();
    
    // Formato: dd/mm/yyyy → yyyy-mm-dd
    let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      // Validar data
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        return `${year}-${month}-${day}`;
      }
    }
    
    // Formato: yyyy-mm-dd (já está correto)
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return str;
      }
    }
    
    // Tentar parse como ISO
    const isoDate = new Date(str);
    if (!isNaN(isoDate.getTime())) {
      const year = isoDate.getFullYear();
      const month = String(isoDate.getMonth() + 1).padStart(2, '0');
      const day = String(isoDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return null;
  } catch (e) {
    console.warn(`Erro ao parsear data "${val}": ${e.message}`);
    return null;
  }
}

/**
 * Parse robusto de numeros com separadores de milhar/decimal.
 * Aceita formatos como: 1.234,56 | 1,234.56 | 1234,56 | 1234.56
 */
function parseNumberForBQ(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  
  const raw = String(val).trim();
  if (!raw) return null;
  
  // Mantem apenas digitos, sinais e separadores
  let cleaned = raw.replace(/[^0-9,.-]/g, '');
  if (!cleaned) return null;
  
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  
  // Define separador decimal pelo ultimo separador encontrado
  let decimalSep = null;
  if (lastComma > -1 && lastDot > -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma > -1) {
    // Se houver apenas virgula, assume decimal se houver 1-2 casas
    decimalSep = /,\d{1,2}$/.test(cleaned) ? ',' : null;
  } else if (lastDot > -1) {
    // Se houver apenas ponto, assume decimal se houver 1-2 casas
    decimalSep = /\.\d{1,2}$/.test(cleaned) ? '.' : null;
  }
  
  if (decimalSep === ',') {
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');
  } else if (decimalSep === '.') {
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // Sem separador decimal definido: remove todos os separadores
    cleaned = cleaned.replace(/[.,]/g, '');
  }
  
  const parsed = parseFloat(cleaned);
  return isFinite(parsed) ? parsed : null;
}

/**
 * Valida campos críticos antes de carregar no BigQuery
 * Retorna array filtrado sem registros inválidos
 */
function validateCriticalFields(records, type) {
  if (records.length === 0) {
    console.warn(`⚠️ Nenhum registro de ${type} para validar`);
    return records;
  }
  
  const criticalField = 'Oportunidade'; // Campo obrigatório em todas as tabelas
  
  const valid = records.filter(r => r[criticalField] && r[criticalField] !== 'N/A');
  const invalid = records.length - valid.length;
  
  if (invalid > 0) {
    console.warn(`⚠️ ${invalid} registros com ${criticalField} vazio serão pulados`);
  }
  
  return valid;
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
  
  // Normalizar headers: substituir espaços por underscores
  const normalizedHeaders = headers.map(h => {
    return String(h).trim().replace(/\s+/g, '_');
  });
  
  console.log(`📋 Headers em Sales Specialist: ${normalizedHeaders.slice(0, 10).join(', ')}...`);
  
  // Mapear colunas-chave (case-insensitive)
  // IMPORTANTE: Planilha tem 2 colunas "Status" (oportunidade e forecast)
  const statusIndexes = [];
  normalizedHeaders.forEach((h, idx) => {
    if (h.toLowerCase() === 'status') statusIndexes.push(idx);
  });
  
  const colMap = {
    account_name: normalizedHeaders.findIndex(h => h.toLowerCase().includes('account')),
    perfil: normalizedHeaders.findIndex(h => h.toLowerCase() === 'perfil'),
    opportunity_name: normalizedHeaders.findIndex(h => h.toLowerCase().includes('opportunity')),
    meses_fat: normalizedHeaders.findIndex(h => h.toLowerCase().includes('meses')),
    gtm_2026: normalizedHeaders.findIndex(h => h.toLowerCase().includes('gtm')),
    booking_total_gross: normalizedHeaders.findIndex(h => h.toLowerCase().includes('booking') && h.toLowerCase().includes('gross')),
    booking_total_net: normalizedHeaders.findIndex(h => h.toLowerCase().includes('booking') && h.toLowerCase().includes('net')),
    opportunity_status: statusIndexes[0] >= 0 ? statusIndexes[0] : normalizedHeaders.findIndex(h => h.toLowerCase() === 'status'),
    vendedor: normalizedHeaders.findIndex(h => h.toLowerCase() === 'vendedor'),
    forecast_status: statusIndexes[1] >= 0 ? statusIndexes[1] : -1, // Segunda coluna Status (UPSIDE/COMMIT)
    billing_quarter_gross: normalizedHeaders.findIndex(h => h.toLowerCase().includes('billing') && h.toLowerCase().includes('quarter') && h.toLowerCase().includes('gross')),
    billing_quarter_net: normalizedHeaders.findIndex(h => h.toLowerCase().includes('billing') && h.toLowerCase().includes('quarter') && h.toLowerCase().includes('net')),
    closed_date: normalizedHeaders.findIndex(h => h.toLowerCase().includes('closed'))
  };
  
  console.log('📋 Mapeamento de colunas Sales Specialist:');
  console.log(`   ℹ️ Colunas "Status" encontradas: ${statusIndexes.length} (indexes: ${statusIndexes.join(', ')})`);
  Object.keys(colMap).forEach(key => {
    if (colMap[key] >= 0) {
      console.log(`   • ${key}: col ${colMap[key]} (${headers[colMap[key]]})`);
    } else {
      console.warn(`   ⚠️ ${key}: NÃO ENCONTRADO`);
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
      const parsed = parseNumberForBQ(val);
      return parsed === null ? 0 : parsed;
    };
    
    // Parse data (dd/mm/yyyy mantém, Date → dd/mm/yyyy)
    const parseDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) {
        const day = String(val.getDate()).padStart(2, '0');
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const year = val.getFullYear();
        return `${day}/${month}/${year}`;
      }
      const str = String(val).trim();
      const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${day}/${month}/${year}`;
      }
      return null;
    };
    
    // Calcular fiscal quarter baseado em closed_date
    const closedDateStr = parseDate(row[colMap.closed_date]);
    let fiscalQuarter = null;
    if (closedDateStr) {
      // Parsear dd/mm/yyyy
      const parts = closedDateStr.split('/');
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]); // 1-12
      const year = parseInt(parts[2]);
      
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
    console.log(`   • Closed Date exemplo: ${records[0].closed_date || 'NULL'} → Fiscal Q: ${records[0].fiscal_quarter || 'NULL'}`);
    
    // Debug: contar quantos têm closed_date
    const withDate = records.filter(r => r.closed_date).length;
    console.log(`   • Deals com Closed Date: ${withDate}/${records.length}`);
  }
  
  return records;
}

// ==================== FUNÇÕES AUXILIARES ====================

/**
 * Conta registros reais em uma tabela do BigQuery
 * Usado como fallback quando polling falha
 */
function countBigQueryRows(projectId, datasetId, tableName) {
  try {
    const query = `
      SELECT COUNT(*) as count 
      FROM \`${projectId}.${datasetId}.${tableName}\`
    `;
    
    const request = {
      query: query,
      useLegacySql: false,
      timeoutMs: 30000
    };
    
    const queryResults = BigQuery.Jobs.query(request, projectId);
    
    if (queryResults.rows && queryResults.rows.length > 0) {
      return parseInt(queryResults.rows[0].f[0].v);
    }
    
    return 0;
  } catch (error) {
    console.warn(`Erro ao contar linhas: ${error.message}`);
    return -1; // Retorna -1 para indicar erro na contagem
  }
}

/**
 * Limpa e padroniza valores para envio ao BigQuery
 */
function sanitizeValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

// ==================== FIM DO BIGQUERYSYNC ====================
