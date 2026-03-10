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
      // Substituir hífens por underscores (nomes de colunas BQ não suportam hífen)
      .replace(/-+/g, '_')
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
      const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Date', '_Data', 'Fecha_', 'fecha_', 'closed_date', 'created_date'];
      const excludeFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
      const isDateField = (header === 'Data') || (
        dateFields.some(pattern => header.includes(pattern)) &&
        !excludeFields.some(pattern => header.startsWith(pattern))
      );
      
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
      } else if (typeof val === 'number' && isDateField) {
        // Exceção controlada para Atividades: alguns conectores trazem Date como serial numérico.
        // Convertemos somente valores plausíveis de serial Excel/Sheets para preservar data da atividade.
        if (sheetName === 'Atividades' && val >= 20000 && val <= 80000) {
          const serialDate = new Date(1899, 11, 30);
          serialDate.setDate(serialDate.getDate() + Math.floor(val));
          const day = String(serialDate.getDate()).padStart(2, '0');
          const month = String(serialDate.getMonth() + 1).padStart(2, '0');
          const year = serialDate.getFullYear();
          obj[header] = `${day}/${month}/${year}`;
        } else {
          // Mantém comportamento conservador para as demais abas.
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
const BQ_SYNC_FATURAMENTO_WEEK = false; // Q1_2026 fora deste fluxo

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
    const pipelinePrepared = preparePipelineDataForBigQuery_(pipelineRaw);
    const wonRaw = loadSheetData('📈 Análise Ganhas');
    const lostRaw = loadSheetData('📉 Análise Perdidas');
    const atividadesRaw = prepareAtividadesData();
    const metaRaw = prepareMetaData();
    const metaBdmRaw = prepareMetaBdmData();
    const contasNomeadasRaw = prepareContasNomeadasData();
    
    console.log(`📊 Dados carregados do Sheet:`);
    console.log(`   • Pipeline: ${pipelinePrepared.length} deals`);
    console.log(`   • Won: ${wonRaw.length} deals`);
    console.log(`   • Lost: ${lostRaw.length} deals`);
    console.log(`   • Atividades: ${atividadesRaw.length} registros`);
    console.log(`   • Meta: ${metaRaw.length} registros`);
    console.log(`   • Meta_BDM: ${metaBdmRaw.length} registros`);
    console.log(`   • Contas_Nomeadas: ${contasNomeadasRaw.length} registros`);
    
    if (pipelinePrepared.length === 0 && wonRaw.length === 0 && lostRaw.length === 0) {
      throw new Error('Nenhum dado encontrado nas abas de análise');
    }
    
    // ETAPA 2: NÃO corrigir nem filtrar datas aqui.
    // Motivo: este sync deve ser não-destrutivo. Qualquer correção de datas deve
    // acontecer nas rotinas de governança do Sheet (ex: corrigirDatasFechamentoClosedDeals),
    // evitando reinterpretação DD/MM como MM/DD e remoção de linhas.
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const parsePtBrDate_ = (val) => {
      if (!val) return null;
      if (val instanceof Date) {
        const d = new Date(val.getFullYear(), val.getMonth(), val.getDate());
        d.setHours(0, 0, 0, 0);
        return d;
      }
      const match = String(val).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!match) return null;
      const dia = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10) - 1;
      const ano = parseInt(match[3], 10);
      const d = new Date(ano, mes, dia);
      d.setHours(0, 0, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    };

    const countFuture_ = (rows) => rows.reduce((acc, deal) => {
      const d = parsePtBrDate_(deal && deal.Data_Fechamento);
      return d && d > hoje ? acc + 1 : acc;
    }, 0);

    const wonFuture = countFuture_(wonRaw);
    const lostFuture = countFuture_(lostRaw);
    if (wonFuture > 0 || lostFuture > 0) {
      console.warn(`⚠️ Existem deals com Data_Fechamento futura (sem filtro no sync): WON=${wonFuture}, LOST=${lostFuture}`);
    }

    const wonFiltered = wonRaw;
    const lostFiltered = lostRaw;

    // Garantir tabela Meta no dataset antes da carga
    ensureMetaTableExists_();
    ensureMetaBdmTableExists_();
    ensureContasNomeadasTableExists_();

    // Corrige drift de tipos em tabelas históricas (STRING -> DATE/TIMESTAMP) de forma idempotente.
    // Isso evita parse/cast espalhado na API e mantém compatibilidade com valores já normalizados.
    enforceCanonicalTypesBeforeSync_();
    
    // ETAPA 3: Carregar para BigQuery
    console.log('📤 Sincronizando com BigQuery (WRITE_TRUNCATE para evitar duplicação)...');

    const pipelineResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.pipeline`,
      pipelinePrepared,
      'WRITE_TRUNCATE',
      '🎯 Análise Forecast IA'
    );

    // Garantia final: após o WRITE_TRUNCATE, reforçar Data_Prevista como DATE no pipeline.
    enforcePipelineDataPrevistaTypePostLoad_();

    const wonResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_won`,
      wonFiltered, // Usar dados filtrados
      'WRITE_TRUNCATE',
      '📈 Análise Ganhas'
    );

    const lostResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.closed_deals_lost`,
      lostFiltered, // Usar dados filtrados
      'WRITE_TRUNCATE',
      '📉 Análise Perdidas'
    );

    const atividadesResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.atividades`,
      atividadesRaw,
      'WRITE_TRUNCATE'
    );

    const metaResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.meta`,
      metaRaw,
      'WRITE_TRUNCATE'
    );

    const metaBdmResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.meta_bdm`,
      metaBdmRaw,
      'WRITE_TRUNCATE'
    );

    const contasNomeadasResult = loadToBigQuery(
      `${BQ_PROJECT}.${BQ_DATASET}.Contas_Nomeadas`,
      contasNomeadasRaw,
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

    // ETAPA 6: Carregar FATURAMENTO_2025 → tabela BQ: faturamento_2025
    let faturamentoResult = { rowsInserted: 0, status: 'SKIPPED' };
    try {
      ensureFaturamentoTableExists_();
      const faturamentoData = prepareFaturamentoData();
      if (faturamentoData.length > 0) {
        faturamentoResult = loadToBigQuery(
          `${BQ_PROJECT}.${BQ_DATASET}.faturamento_2025`,
          faturamentoData,
          'WRITE_TRUNCATE'
        );
      } else {
        console.warn('⚠️ Aba FATURAMENTO_2025 vazia ou não encontrada — sync ignorado');
      }
    } catch (e) {
      console.warn('⚠️ FATURAMENTO_2025 não sincronizado:', e.message);
    }

    // ETAPA 7: Carregar FATURAMENTO_2026 → tabela BQ: faturamento_2026
    let faturamento2026Result = { rowsInserted: 0, status: 'SKIPPED' };
    try {
      ensureFaturamento2026TableExists_();
      const faturamento2026Data = prepareFaturamento2026Data();
      if (faturamento2026Data.length > 0) {
        faturamento2026Result = loadToBigQuery(
          `${BQ_PROJECT}.${BQ_DATASET}.faturamento_2026`,
          faturamento2026Data,
          'WRITE_TRUNCATE'
        );
      } else {
        console.warn('⚠️ Aba FATURAMENTO_2026 vazia ou não encontrada — sync ignorado');
      }
    } catch (e) {
      console.warn('⚠️ FATURAMENTO_2026 não sincronizado:', e.message);
    }

    // ETAPA 8: Carregar Faturamento_Week → tabela BQ: faturamento_semanal
    let faturamentoSemanalResult = { rowsInserted: 0, status: 'SKIPPED' };
    try {
      if (BQ_SYNC_FATURAMENTO_WEEK) {
        ensureFaturamentoSemanalTableExists_();
        const faturamentoSemanalData = prepareFaturamentoSemanalData();
        if (faturamentoSemanalData.length > 0) {
          faturamentoSemanalResult = loadToBigQuery(
            `${BQ_PROJECT}.${BQ_DATASET}.faturamento_semanal`,
            faturamentoSemanalData,
            'WRITE_TRUNCATE'
          );
        } else {
          console.warn('⚠️ Aba Faturamento_Week vazia ou não encontrada — sync ignorado');
        }
      } else {
        console.log('ℹ️ Sync de Faturamento_Week desativado (Q1_2026 fora deste cenário).');
      }
    } catch (e) {
      console.warn('⚠️ Faturamento_Week não sincronizado:', e.message);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Sync concluído em ${duration}s`);
    console.log(`   • Pipeline: ${pipelineResult.rowsInserted} linhas`);
    console.log(`   • Closed Won: ${wonResult.rowsInserted} linhas`);
    console.log(`   • Closed Lost: ${lostResult.rowsInserted} linhas`);
    console.log(`   • Atividades: ${atividadesResult.rowsInserted} linhas`);
    console.log(`   • Meta: ${metaResult.rowsInserted} linhas`);
    console.log(`   • Meta_BDM: ${metaBdmResult.rowsInserted} linhas`);
    console.log(`   • Contas_Nomeadas: ${contasNomeadasResult.rowsInserted} linhas`);
    console.log(`   • Sales Specialist: ${salesSpecResult.rowsInserted} linhas`);
    console.log(`   • FATURAMENTO_2025: ${faturamentoResult.rowsInserted} linhas`);
    console.log(`   • FATURAMENTO_2026: ${faturamento2026Result.rowsInserted} linhas`);
    console.log(`   • Faturamento_Week: ${faturamentoSemanalResult.rowsInserted} linhas`);
    
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
      atividadesRows: atividadesResult.rowsInserted,
      metaRows: metaResult.rowsInserted,
      metaBdmRows: metaBdmResult.rowsInserted,
      contasNomeadasRows: contasNomeadasResult.rowsInserted,
      salesSpecRows: salesSpecResult.rowsInserted,
      faturamentoRows: faturamentoResult.rowsInserted,
      faturamento2026Rows: faturamento2026Result.rowsInserted,
      faturamentoSemanalRows: faturamentoSemanalResult.rowsInserted,
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

/**
 * Configura (ou reconfigura) o trigger de tempo para o BigQuery Sync.
 * Pode ser executada diretamente deste arquivo, sem depender do MenuOpen.gs.
 * @param {boolean} runNow - Se true, executa uma sync imediatamente após criar o trigger.
 * @returns {Object} Resumo da operação
 */
function configurarTriggerBigQuerySync_(runNow) {
  const handlerName = 'syncToBigQueryScheduled';

  // Remove triggers duplicados do mesmo handler para manter apenas 1 agendamento ativo.
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  if (!BQ_ENABLED) {
    console.warn('⚠️ Trigger não criado: BQ_ENABLED=false');
    return {
      success: false,
      reason: 'BQ_DISABLED',
      removed: removed,
      created: false,
      frequency: null
    };
  }

  ScriptApp.newTrigger(handlerName)
    .timeBased()
    .everyHours(1)
    .create();

  console.log('✅ Trigger do BigQuery Sync configurado (a cada 1 hora)');

  let runResult = null;
  if (runNow) {
    runResult = syncToBigQueryScheduled();
  }

  return {
    success: true,
    removed: removed,
    created: true,
    frequency: 'everyHours(1)',
    runNow: !!runNow,
    runResult: runResult
  };
}

/**
 * Aplica correções de tipo diretamente no schema das tabelas legadas.
 * Idempotente: pode rodar em toda sync sem efeito colateral quando já estiver correto.
 */
function enforceCanonicalTypesBeforeSync_() {
  const jobs = [
    {
      table: 'pipeline',
      sql: `
        CREATE OR REPLACE TABLE \`${BQ_PROJECT}.${BQ_DATASET}.pipeline\`
        PARTITION BY DATE(data_carga)
        AS
        SELECT
          * REPLACE (
            COALESCE(
              SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Prevista AS STRING)),
              SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Prevista AS STRING)),
              SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Prevista AS STRING)),
              SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Prevista AS STRING))
            ) AS Data_Prevista
          )
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.pipeline\`
      `
    },
    {
      table: 'closed_deals_won',
      sql: `
        CREATE OR REPLACE TABLE \`${BQ_PROJECT}.${BQ_DATASET}.closed_deals_won\` AS
        SELECT
          * REPLACE (
            COALESCE(
              SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Fechamento AS STRING))
            ) AS Data_Fechamento
          )
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.closed_deals_won\`
      `
    },
    {
      table: 'closed_deals_lost',
      sql: `
        CREATE OR REPLACE TABLE \`${BQ_PROJECT}.${BQ_DATASET}.closed_deals_lost\` AS
        SELECT
          * REPLACE (
            COALESCE(
              SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Fechamento AS STRING)),
              SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Fechamento AS STRING))
            ) AS Data_Fechamento
          )
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.closed_deals_lost\`
      `
    },
    {
      table: 'atividades',
      sql: `
        CREATE OR REPLACE TABLE \`${BQ_PROJECT}.${BQ_DATASET}.atividades\` AS
        SELECT
          * REPLACE (
            SAFE_CAST(Run_ID AS TIMESTAMP) AS Run_ID,
            SAFE_CAST(data_carga AS TIMESTAMP) AS data_carga
          )
        FROM \`${BQ_PROJECT}.${BQ_DATASET}.atividades\`
      `
    }
  ];

  jobs.forEach((jobDef) => {
    try {
      runBigQueryQueryAndWait_(jobDef.sql, `Tipos canônicos (${jobDef.table})`, 120000);
      console.log(`🧱 Tipos canônicos aplicados em ${jobDef.table}`);
    } catch (e) {
      console.warn(`⚠️ Não foi possível aplicar tipos canônicos em ${jobDef.table}: ${e.message}`);
    }
  });
}

/**
 * Executa query no BigQuery e aguarda conclusão do job para evitar condição de corrida.
 */
function runBigQueryQueryAndWait_(sql, label, timeoutMs) {
  const req = {
    query: sql,
    useLegacySql: false,
    timeoutMs: timeoutMs || 120000
  };

  const initial = BigQuery.Jobs.query(req, BQ_PROJECT);
  if (initial.jobComplete) return initial;

  const jobRef = initial.jobReference || {};
  const jobId = jobRef.jobId;
  const location = jobRef.location;
  if (!jobId) {
    throw new Error(`Job não retornou jobId (${label || 'query'})`);
  }

  const startedAt = Date.now();
  const maxWaitMs = timeoutMs || 120000;
  while ((Date.now() - startedAt) < maxWaitMs) {
    Utilities.sleep(1500);
    const status = BigQuery.Jobs.get(BQ_PROJECT, jobId, location ? { location: location } : undefined);
    const state = status && status.status && status.status.state;
    if (state === 'DONE') {
      if (status.status && status.status.errorResult) {
        throw new Error(status.status.errorResult.message || `Falha no job ${jobId}`);
      }
      return status;
    }
  }

  throw new Error(`Timeout aguardando job ${jobId} (${label || 'query'})`);
}

/**
 * Reforça Data_Prevista como DATE após carga do pipeline.
 * Evita regressão de tipo quando a tabela é truncada/recarregada.
 */
function enforcePipelineDataPrevistaTypePostLoad_() {
  const sql = `
    CREATE OR REPLACE TABLE \`${BQ_PROJECT}.${BQ_DATASET}.pipeline\`
    PARTITION BY DATE(data_carga)
    AS
    SELECT
      * REPLACE (
        COALESCE(
          SAFE.PARSE_DATE('%Y-%m-%d', CAST(Data_Prevista AS STRING)),
          SAFE.PARSE_DATE('%d/%m/%Y', CAST(Data_Prevista AS STRING)),
          SAFE.PARSE_DATE('%d-%m-%Y', CAST(Data_Prevista AS STRING)),
          SAFE.PARSE_DATE('%Y/%m/%d', CAST(Data_Prevista AS STRING))
        ) AS Data_Prevista
      )
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.pipeline\`
  `;

  try {
    runBigQueryQueryAndWait_(sql, 'Pipeline Data_Prevista post-load', 120000);
    console.log('🧱 Pipeline pós-load: Data_Prevista reforçada como DATE');
  } catch (e) {
    console.warn(`⚠️ Não foi possível reforçar Data_Prevista no pipeline após carga: ${e.message}`);
  }
}

/**
 * Normaliza aliases de colunas do Pipeline para garantir estabilidade de schema no BigQuery.
 * Em especial, padroniza a nova coluna "Data de criação (DE ONDE PEGAR)" em `Data_de_criacao`.
 */
function preparePipelineDataForBigQuery_(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((row) => {
    const dataCriacao =
      row.Data_de_criacao_DE_ONDE_PEGAR ||
      row.Data_de_criacao ||
      row.Created_Date ||
      row.Date_Created ||
      row.Created;

    const cidadeCobranca =
      row.Cidade_de_cobranca ||
      row.Cidade_cobranca ||
      row.Billing_City ||
      row.BillingCity ||
      null;

    const estadoProvinciaCobranca =
      row.Estado_Provincia_de_cobranca ||
      row.EstadoProvincia_de_cobranca ||
      row.Estado_Provincia_cobranca ||
      row.EstadoProvincia_cobranca ||
      row.Billing_State ||
      row.BillingState ||
      null;

    const subsegmentoMercado =
      row.Subsegmento_de_mercado ||
      row.Subsegmento_mercado ||
      row.Subsegmento ||
      null;

    const segmentoConsolidado =
      row.Segmento_consolidado ||
      row.Segmento_Consolidado ||
      row.SegmentoConsolidado ||
      null;

    const portfolio =
      row.Portfolio ||
      row.Portafolio ||
      row.Portfolio_FDM ||
      row.PortfolioFDM ||
      null;

    const portfolioFdm =
      row.Portfolio_FDM ||
      row.PortfolioFDM ||
      row.Portfolio ||
      row.Portafolio ||
      null;

    return {
      ...row,
      Data_de_criacao: dataCriacao || null,
      Cidade_de_cobranca: cidadeCobranca,
      Estado_Provincia_de_cobranca: estadoProvinciaCobranca,
      Subsegmento_de_mercado: subsegmentoMercado,
      Segmento_consolidado: segmentoConsolidado,
      Portfolio: portfolio,
      Portfolio_FDM: portfolioFdm
    };
  });
}

/**
 * Prepara dados da aba Atividades para o schema real do BigQuery
 * com mapeamento tolerante a variações de cabeçalho.
 * @returns {Array} Array de objetos prontos para carga em sales_intelligence.atividades
 */
function prepareAtividadesData() {
  const rawRows = loadSheetData('Atividades');
  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const canonicalFields = [
    'Atribuido',
    'Data',
    'Data_de_criacao',
    'EmpresaConta',
    'Tipo_de_Actividad',
    'Comentarios_completos',
    'Comentarios',
    'Assunto',
    'Local',
    'Oportunidade',
    'Contato',
    'Status'
  ];

  const canonicalByNorm = {};
  canonicalFields.forEach(field => {
    canonicalByNorm[normalizeKey(field)] = field;
  });

  const aliasByNorm = {
    atribuido: 'Atribuido',
    atribuidoa: 'Atribuido',
    assigned: 'Atribuido',
    assignedto: 'Atribuido',
    assignedowner: 'Atribuido',
    assigneduser: 'Atribuido',
    owner: 'Atribuido',
    vendedor: 'Atribuido',

    data: 'Data',
    date: 'Data',
    fecha: 'Data',
    activitydate: 'Data',
    datadaatividade: 'Data',

    datadecriacao: 'Data_de_criacao',
    datacriacao: 'Data_de_criacao',
    createddate: 'Data_de_criacao',
    creationdate: 'Data_de_criacao',

    empresaconta: 'EmpresaConta',
    companyaccount: 'EmpresaConta',
    company: 'EmpresaConta',
    empresa: 'EmpresaConta',
    conta: 'EmpresaConta',
    account: 'EmpresaConta',
    accountname: 'EmpresaConta',

    tipodeactividad: 'Tipo_de_Actividad',
    tipodeatividade: 'Tipo_de_Actividad',
    tipoatividade: 'Tipo_de_Actividad',
    tipo: 'Tipo_de_Actividad',
    activitytype: 'Tipo_de_Actividad',

    comentarioscompletos: 'Comentarios_completos',
    fullcomments: 'Comentarios_completos',
    commentsfull: 'Comentarios_completos',
    completecomments: 'Comentarios_completos',
    detalhes: 'Comentarios_completos',

    comentarios: 'Comentarios',
    comentario: 'Comentarios',
    comments: 'Comentarios',
    notes: 'Comentarios',

    assunto: 'Assunto',
    subject: 'Assunto',

    local: 'Local',
    location: 'Local',

    oportunidade: 'Oportunidade',
    opportunity: 'Oportunidade',
    opportunityname: 'Oportunidade',
    deal: 'Oportunidade',

    contato: 'Contato',
    contact: 'Contato',

    status: 'Status'
  };

  const mappedRows = rawRows.map((row) => {
    const mapped = {};

    Object.keys(row || {}).forEach(sourceKey => {
      const sourceVal = row[sourceKey];
      if (sourceVal === null || sourceVal === undefined || sourceVal === '') {
        return;
      }

      const norm = normalizeKey(sourceKey);
      const targetKey = canonicalByNorm[norm] || aliasByNorm[norm];
      if (!targetKey) {
        return;
      }

      // Preserva primeiro valor útil quando houver múltiplos aliases da mesma coluna.
      if (mapped[targetKey] === null || mapped[targetKey] === undefined || mapped[targetKey] === '') {
        mapped[targetKey] = sourceVal;
      }
    });

    return mapped;
  }).filter(row => {
    return !!(
      row.Atribuido ||
      row.Data ||
      row.Data_de_criacao ||
      row.Oportunidade ||
      row.EmpresaConta ||
      row.Comentarios ||
      row.Comentarios_completos
    );
  });

  const countNonNull = (field) => mappedRows.reduce((acc, row) => {
    const val = row[field];
    return (val === null || val === undefined || val === '') ? acc : acc + 1;
  }, 0);

  console.log(`📊 Atividades mapeadas para schema BQ: ${mappedRows.length}/${rawRows.length} registros válidos`);
  console.log(`   • Atribuido preenchido: ${countNonNull('Atribuido')}`);
  console.log(`   • Data preenchida: ${countNonNull('Data')}`);
  console.log(`   • Data_de_criacao preenchida: ${countNonNull('Data_de_criacao')}`);
  console.log(`   • Oportunidade preenchida: ${countNonNull('Oportunidade')}`);
  console.log(`   • Comentarios preenchido: ${countNonNull('Comentarios')}`);

  return mappedRows;
}

function prepareMetaData() {
  const metaSheetName = resolveMetaSheetName_();
  if (!metaSheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const available = ss.getSheets().map(s => s.getName()).join(', ');
    console.warn(`⚠️ Aba de Meta não encontrada. Abas disponíveis: ${available}`);
    return [];
  }

  if (metaSheetName !== 'Meta') {
    console.log(`ℹ️ Aba de Meta detectada automaticamente: "${metaSheetName}"`);
  }

  const rawRows = loadSheetData(metaSheetName);
  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const aliases = {
    tipodemeta: 'Tipo_de_meta',
    tipodemeta_: 'Tipo_de_meta',
    tipo_meta: 'Tipo_de_meta',
    mesano: 'Mes_Ano',
    mes_ano: 'Mes_Ano',
    monthyear: 'Mes_Ano',
    gross: 'Gross',
    net: 'Net',
    periodofiscal: 'Periodo_Fiscal',
    fiscalquarter: 'Periodo_Fiscal',
    fiscal_q: 'Periodo_Fiscal'
  };

  const padMesAno_ = (val) => {
    if (val === null || val === undefined || val === '') return null;

    if (val instanceof Date) {
      const mes = String(val.getMonth() + 1).padStart(2, '0');
      const ano = val.getFullYear();
      return `${mes}/${ano}`;
    }

    if (typeof val === 'number' && isFinite(val) && val >= 20000 && val <= 80000) {
      const serialDate = new Date(1899, 11, 30);
      serialDate.setDate(serialDate.getDate() + Math.floor(val) + 1);
      const mes = String(serialDate.getMonth() + 1).padStart(2, '0');
      const ano = serialDate.getFullYear();
      return `${mes}/${ano}`;
    }

    const str = String(val).trim();

    if (/^\d{5}$/.test(str)) {
      const serial = parseInt(str, 10);
      if (serial >= 20000 && serial <= 80000) {
        const serialDate = new Date(1899, 11, 30);
        serialDate.setDate(serialDate.getDate() + serial + 1);
        const mes = String(serialDate.getMonth() + 1).padStart(2, '0');
        const ano = serialDate.getFullYear();
        return `${mes}/${ano}`;
      }
    }

    const m = str.match(/^(\d{1,2})\/(\d{4})$/);
    if (!m) return str;
    const mes = String(parseInt(m[1], 10)).padStart(2, '0');
    return `${mes}/${m[2]}`;
  };

  const mappedRows = rawRows.map((row) => {
    const mapped = {
      Tipo_de_meta: null,
      Mes_Ano: null,
      Gross: null,
      Net: null,
      Periodo_Fiscal: null
    };

    Object.keys(row || {}).forEach((sourceKey) => {
      const sourceVal = row[sourceKey];
      if (sourceVal === null || sourceVal === undefined || sourceVal === '') return;

      const norm = normalizeKey(sourceKey);
      const target = aliases[norm] || null;
      if (!target) return;

      if (target === 'Gross' || target === 'Net') {
        mapped[target] = parseNumberForBQ(sourceVal);
      } else if (target === 'Mes_Ano') {
        mapped[target] = padMesAno_(sourceVal);
      } else {
        mapped[target] = String(sourceVal).trim();
      }
    });

    return mapped;
  }).filter((row) => {
    return !!(row.Tipo_de_meta || row.Mes_Ano || row.Gross !== null || row.Net !== null || row.Periodo_Fiscal);
  });

  console.log(`📊 Meta mapeada para schema BQ: ${mappedRows.length}/${rawRows.length} registros válidos`);
  return mappedRows;
}

function resolveMetaSheetName_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());

  const preferredNames = [
    'Meta',
    'META',
    'Metas',
    '📊 Meta',
    '📈 Meta',
    'Meta 2026',
    'Metas 2026'
  ];

  for (let i = 0; i < preferredNames.length; i++) {
    const candidate = preferredNames[i];
    if (sheets.indexOf(candidate) > -1) return candidate;
  }

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const scored = sheets
    .map((name) => ({ raw: name, norm: normalize(name) }))
    .filter((item) => item.norm.indexOf('meta') > -1)
    .sort((a, b) => a.norm.length - b.norm.length);

  return scored.length > 0 ? scored[0].raw : null;
}

function prepareMetaBdmData() {
  const metaBdmSheetName = resolveMetaBdmSheetName_();
  if (!metaBdmSheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const available = ss.getSheets().map(s => s.getName()).join(', ');
    console.warn(`⚠️ Aba Meta_BDM não encontrada. Abas disponíveis: ${available}`);
    return [];
  }

  if (metaBdmSheetName !== 'Meta_BDM') {
    console.log(`ℹ️ Aba Meta_BDM detectada automaticamente: "${metaBdmSheetName}"`);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(metaBdmSheetName);
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }

  const matrix = sheet.getDataRange().getValues();
  const headerRow = matrix[0] || [];
  const dataRows = matrix.slice(1);

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const aliases = {
    tipodemeta: 'Tipo_de_meta',
    tipo_meta: 'Tipo_de_meta',
    salesspecialist: 'Sales_Specialist',
    sellerspecialist: 'Sales_Specialist',
    bdm: 'BDM',
    mesano: 'Mes_Ano',
    monthyear: 'Mes_Ano',
    netgerado: 'Net_gerado',
    netfaturado: 'Net_faturado',
    // Compatibilidade retroativa (layout anterior)
    gross: 'Net_gerado',
    net: 'Net_faturado',
    periodofiscal: 'Periodo_Fiscal',
    fiscalquarter: 'Periodo_Fiscal',
    fiscalq: 'Periodo_Fiscal'
  };

  // Fallback operacional para manter consistência do owner de meta quando a coluna
  // Sales Specialist vier vazia no Sheet após sync/migração.
  const fallbackSpecialistByTipo = {
    sales: 'Gabriele Oliveira',
    cs: 'Emilio Goncalves'
  };

  const expectedByPosition = [
    'Tipo_de_meta',
    'BDM',
    'Sales_Specialist',
    'Mes_Ano',
    'Net_gerado',
    'Net_faturado',
    'Periodo_Fiscal'
  ];

  const padMesAno_ = (val) => {
    if (val === null || val === undefined || val === '') return null;

    if (val instanceof Date) {
      const mes = String(val.getMonth() + 1).padStart(2, '0');
      const ano = val.getFullYear();
      return `${mes}/${ano}`;
    }

    if (typeof val === 'number' && isFinite(val) && val >= 20000 && val <= 80000) {
      const serialDate = new Date(1899, 11, 30);
      serialDate.setDate(serialDate.getDate() + Math.floor(val) + 1);
      const mes = String(serialDate.getMonth() + 1).padStart(2, '0');
      const ano = serialDate.getFullYear();
      return `${mes}/${ano}`;
    }

    const str = String(val).trim();
    const m = str.match(/^(\d{1,2})\/(\d{4})$/);
    if (!m) return str;
    const mes = String(parseInt(m[1], 10)).padStart(2, '0');
    return `${mes}/${m[2]}`;
  };

  const isLikelyPersonName_ = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (/^FY\d{2}-Q\d$/i.test(raw)) return false;
    if (/^\d{1,2}\/\d{4}$/.test(raw)) return false;
    if (/^[\d\s$.,-]+$/.test(raw)) return false;
    return raw.length >= 3;
  };

  const mappedRows = dataRows.map((rawRow) => {
    const mapped = {
      Tipo_de_meta: null,
      Sales_Specialist: null,
      BDM: null,
      Mes_Ano: null,
      Net_gerado: null,
      Net_faturado: null,
      Periodo_Fiscal: null
    };

    headerRow.forEach((sourceHeader, idx) => {
      const sourceVal = rawRow[idx];
      if (sourceVal === null || sourceVal === undefined || sourceVal === '') return;

      const norm = normalizeKey(sourceHeader);
      const normBase = norm.replace(/[0-9]+$/, '');
      let target = aliases[norm] || aliases[normBase] || null;

      if (!target && idx < expectedByPosition.length) {
        // Fallback posicional para proteger contra headers quebrados/duplicados na planilha.
        target = expectedByPosition[idx];
      }

      if (!target) return;

      if (target === 'Net_gerado' || target === 'Net_faturado') {
        const parsed = parseNumberForBQ(sourceVal);
        if (parsed !== null) mapped[target] = parsed;
      } else if (target === 'Mes_Ano') {
        const mesAno = padMesAno_(sourceVal);
        if (mesAno) mapped[target] = mesAno;
      } else {
        const value = String(sourceVal).trim();
        if (!value) return;
        // Evita sobrescrever um valor válido por colisão de header duplicado.
        if (!mapped[target]) mapped[target] = value;
      }
    });

    // Resgate posicional defensivo (layout esperado: Tipo | BDM | SS | Mes | NetG | NetF | Fiscal).
    if (!mapped.BDM && isLikelyPersonName_(rawRow[1])) {
      mapped.BDM = String(rawRow[1]).trim();
    }
    if (!mapped.Sales_Specialist && isLikelyPersonName_(rawRow[2])) {
      const ssCandidate = String(rawRow[2]).trim();
      if (!mapped.BDM || ssCandidate.toLowerCase() !== String(mapped.BDM).toLowerCase()) {
        mapped.Sales_Specialist = ssCandidate;
      }
    }

    // Fallback por tipo quando a coluna Sales Specialist continuar vazia.
    if (!mapped.Sales_Specialist) {
      const tipoKey = String(mapped.Tipo_de_meta || '').trim().toLowerCase();
      if (fallbackSpecialistByTipo[tipoKey]) {
        mapped.Sales_Specialist = fallbackSpecialistByTipo[tipoKey];
      }
    }

    return mapped;
  }).filter((row) => {
    return !!(
      row.Tipo_de_meta ||
      row.Sales_Specialist ||
      row.BDM ||
      row.Mes_Ano ||
      row.Net_gerado !== null ||
      row.Net_faturado !== null ||
      row.Periodo_Fiscal
    );
  });

  const ssFilled = mappedRows.reduce((acc, row) => acc + (row.Sales_Specialist ? 1 : 0), 0);
  const bdmFilled = mappedRows.reduce((acc, row) => acc + (row.BDM ? 1 : 0), 0);
  const ssFallbackApplied = mappedRows.reduce((acc, row) => {
    if (!row.Sales_Specialist) return acc;
    const tipoKey = String(row.Tipo_de_meta || '').trim().toLowerCase();
    const fallback = fallbackSpecialistByTipo[tipoKey] || '';
    return row.Sales_Specialist === fallback ? acc + 1 : acc;
  }, 0);
  console.log(`📊 Meta_BDM mapeada para schema BQ: ${mappedRows.length}/${dataRows.length} registros válidos`);
  console.log(`   • BDM preenchido: ${bdmFilled}`);
  console.log(`   • Sales_Specialist preenchido: ${ssFilled}`);
  console.log(`   • Sales_Specialist via fallback: ${ssFallbackApplied}`);
  return mappedRows;
}

function resolveMetaBdmSheetName_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());

  const preferredNames = [
    'Meta_BDM',
    'META_BDM',
    'Meta BDM',
    'MetaBDM',
    'Metas_BDM'
  ];

  for (let i = 0; i < preferredNames.length; i++) {
    const candidate = preferredNames[i];
    if (sheets.indexOf(candidate) > -1) return candidate;
  }

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const scored = sheets
    .map((name) => ({ raw: name, norm: normalize(name) }))
    .filter((item) => item.norm.indexOf('meta') > -1 && item.norm.indexOf('bdm') > -1)
    .sort((a, b) => a.norm.length - b.norm.length);

  return scored.length > 0 ? scored[0].raw : null;
}

function resolveContasNomeadasSheetName_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());

  const preferredNames = [
    'Contas_Nomeadas',
    'Contas Nomeadas',
    'Contas nomeadas',
    'CONTAS_NOMEADAS'
  ];

  for (let i = 0; i < preferredNames.length; i++) {
    const candidate = preferredNames[i];
    if (sheets.indexOf(candidate) > -1) return candidate;
  }

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const scored = sheets
    .map((name) => ({ raw: name, norm: normalize(name) }))
    .filter((item) => item.norm.indexOf('contas') > -1 && item.norm.indexOf('nomeadas') > -1)
    .sort((a, b) => a.norm.length - b.norm.length);

  return scored.length > 0 ? scored[0].raw : null;
}

function prepareContasNomeadasData() {
  const sheetName = resolveContasNomeadasSheetName_();
  if (!sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const available = ss.getSheets().map(s => s.getName()).join(', ');
    console.warn(`⚠️ Aba Contas_Nomeadas não encontrada. Abas disponíveis: ${available}`);
    return [];
  }

  if (sheetName !== 'Contas_Nomeadas') {
    console.log(`ℹ️ Aba Contas_Nomeadas detectada automaticamente: "${sheetName}"`);
  }

  const rawRows = loadSheetData(sheetName);
  if (!rawRows || rawRows.length === 0) {
    return [];
  }

  const normalizeKey = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const aliases = {
    nomedaconta: 'Nome_da_Conta',
    nomeconta: 'Nome_da_Conta',
    conta: 'Nome_da_Conta',
    accountname: 'Nome_da_Conta',
    segmento: 'Segmento',
    comercial: 'Comercial',
    owner: 'Comercial',
    responsavel: 'Comercial',
    tipo: 'Tipo'
  };

  const mappedRows = rawRows.map((row) => {
    const mapped = {
      Nome_da_Conta: null,
      Segmento: null,
      Comercial: null,
      Tipo: null
    };

    Object.keys(row || {}).forEach((sourceKey) => {
      const sourceVal = row[sourceKey];
      if (sourceVal === null || sourceVal === undefined || sourceVal === '') return;

      const target = aliases[normalizeKey(sourceKey)] || null;
      if (!target) return;

      mapped[target] = String(sourceVal).trim();
    });

    return mapped;
  }).filter((row) => {
    return !!(row.Nome_da_Conta || row.Segmento || row.Comercial || row.Tipo);
  });

  console.log(`📊 Contas_Nomeadas mapeada para schema BQ: ${mappedRows.length}/${rawRows.length} registros válidos`);
  return mappedRows;
}

function ensureMetaTableExists_() {
  const tableName = 'meta';
  try {
    BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    return;
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar tabela ${tableName}: ${msg}`);
      return;
    }
  }

  const tableResource = {
    tableReference: {
      projectId: BQ_PROJECT,
      datasetId: BQ_DATASET,
      tableId: tableName
    },
    description: 'Metas mensais (Budget Board) sincronizadas da aba Meta do Google Sheets',
    timePartitioning: {
      type: 'DAY',
      field: 'data_carga'
    },
    schema: {
      fields: [
        { name: 'Tipo_de_meta', type: 'STRING', mode: 'NULLABLE' },
        { name: 'Mes_Ano', type: 'STRING', mode: 'NULLABLE' },
        { name: 'Gross', type: 'FLOAT', mode: 'NULLABLE' },
        { name: 'Net', type: 'FLOAT', mode: 'NULLABLE' },
        { name: 'Periodo_Fiscal', type: 'STRING', mode: 'NULLABLE' },
        { name: 'Run_ID', type: 'TIMESTAMP', mode: 'NULLABLE' },
        { name: 'data_carga', type: 'TIMESTAMP', mode: 'NULLABLE' }
      ]
    }
  };

  BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
  console.log('✅ Tabela meta criada em BigQuery');
}

function ensureMetaBdmTableExists_() {
  const tableName = 'meta_bdm';

  const schemaFields = [
    { name: 'Tipo_de_meta', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Sales_Specialist', type: 'STRING', mode: 'NULLABLE' },
    { name: 'BDM', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Mes_Ano', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Net_gerado', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'Net_faturado', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'Periodo_Fiscal', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Run_ID', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'data_carga', type: 'TIMESTAMP', mode: 'NULLABLE' }
  ];

  let tableExists = false;
  let existingFields = [];
  try {
    const existingTable = BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    tableExists = true;
    existingFields = (existingTable.schema && existingTable.schema.fields) || [];
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar tabela ${tableName}: ${msg}`);
      return;
    }
  }

  if (!tableExists) {
    const tableResource = {
      tableReference: {
        projectId: BQ_PROJECT,
        datasetId: BQ_DATASET,
        tableId: tableName
      },
      description: 'Metas BDM mensais sincronizadas da aba Meta_BDM do Google Sheets',
      timePartitioning: {
        type: 'DAY',
        field: 'data_carga'
      },
      schema: {
        fields: schemaFields
      }
    };

    BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
    console.log('✅ Tabela meta_bdm criada em BigQuery');
    return;
  }

  const existingNames = new Set(existingFields.map(f => String(f.name || '').trim()));
  const missing = schemaFields.filter(f => !existingNames.has(f.name));
  if (missing.length === 0) return;

  BigQuery.Tables.patch(
    { schema: { fields: existingFields.concat(missing) } },
    BQ_PROJECT,
    BQ_DATASET,
    tableName
  );

  console.log(`🧩 ${tableName}: ${missing.length} coluna(s) adicionada(s) — ${missing.map(f => f.name).join(', ')}`);
}

function ensureContasNomeadasTableExists_() {
  const tableName = 'Contas_Nomeadas';

  const schemaFields = [
    { name: 'Nome_da_Conta', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Segmento', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Comercial', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Tipo', type: 'STRING', mode: 'NULLABLE' },
    { name: 'Run_ID', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'data_carga', type: 'TIMESTAMP', mode: 'NULLABLE' }
  ];

  let tableExists = false;
  let existingFields = [];
  try {
    const existingTable = BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    tableExists = true;
    existingFields = (existingTable.schema && existingTable.schema.fields) || [];
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar tabela ${tableName}: ${msg}`);
      return;
    }
  }

  if (!tableExists) {
    const tableResource = {
      tableReference: {
        projectId: BQ_PROJECT,
        datasetId: BQ_DATASET,
        tableId: tableName
      },
      description: 'Contas nomeadas sincronizadas da aba Contas_Nomeadas do Google Sheets',
      timePartitioning: {
        type: 'DAY',
        field: 'data_carga'
      },
      schema: {
        fields: schemaFields
      }
    };

    BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
    console.log('✅ Tabela Contas_Nomeadas criada em BigQuery');
    return;
  }

  const existingNames = new Set(existingFields.map(f => String(f.name || '').trim()));
  const missing = schemaFields.filter(f => !existingNames.has(f.name));
  if (missing.length === 0) return;

  BigQuery.Tables.patch(
    { schema: { fields: existingFields.concat(missing) } },
    BQ_PROJECT,
    BQ_DATASET,
    tableName
  );

  console.log(`🧩 ${tableName}: ${missing.length} coluna(s) adicionada(s) — ${missing.map(f => f.name).join(', ')}`);
}

// ==================== LOADER BIGQUERY ====================

/**
 * Carrega dados no BigQuery usando load jobs (WRITE_TRUNCATE) ou streaming inserts (WRITE_APPEND)
 * Load jobs suportam WRITE_TRUNCATE nativo sem problema de streaming buffer
 * @param {string} tableId - project.dataset.table
 * @param {Array} records - Array de objetos
 * @param {string} writeDisposition - WRITE_TRUNCATE ou WRITE_APPEND
 */
function loadToBigQuery(tableId, records, writeDisposition, sourceSheetName) {
  const [projectId, datasetId, tableName] = tableId.split('.');
  const runId = PropertiesService.getScriptProperties().getProperty('BQ_CURRENT_RUN_ID') || new Date().toISOString();
  
  console.log(`📤 Carregando ${records.length} registros em ${tableName} (${writeDisposition})...`);
  
  if (records.length === 0) {
    console.warn(`⚠️ Nenhum registro para carregar em ${tableName}`);
    return { rowsInserted: 0, jobId: null, status: 'SKIPPED' };
  }

  // Garantir colunas novas de enriquecimento IA antes da carga.
  // Sem isso, BigQuery descarta campos desconhecidos quando ignoreUnknownValues=true.
  ensureEnrichmentColumnsForTable_(projectId, datasetId, tableName, sourceSheetName);
  
  // ESTRATÉGIA:
  // - WRITE_TRUNCATE: usar load job (suporta truncate nativo, sem problema de streaming buffer)
  // - WRITE_APPEND: usar streaming insert (mais rápido)
  
  if (writeDisposition === 'WRITE_TRUNCATE') {
    return loadUsingJob(projectId, datasetId, tableName, records, runId);
  } else {
    return loadUsingStreamingInsert(projectId, datasetId, tableName, records, runId);
  }
}

function insertLoadJobWithRetry_(projectId, jobConfig, blob, options) {
  const maxAttempts = (options && options.maxAttempts) || 3;
  const baseSleepMs = (options && options.baseSleepMs) || 1500;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return BigQuery.Jobs.insert(jobConfig, projectId, blob);
    } catch (error) {
      lastError = error;
      const message = String((error && error.message) || error || '');
      const isRetryable = /empty response|timeout|temporar|backend|internal/i.test(message);

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      const waitMs = baseSleepMs * attempt;
      console.warn(`⚠️ Tentativa ${attempt}/${maxAttempts} do load job falhou (${message}). Retry em ${waitMs}ms...`);
      Utilities.sleep(waitMs);
    }
  }

  throw lastError || new Error('Falha desconhecida ao inserir load job no BigQuery');
}

function truncateTableForFallback_(projectId, datasetId, tableName) {
  const query = `TRUNCATE TABLE \`${projectId}.${datasetId}.${tableName}\``;
  const request = {
    query: query,
    useLegacySql: false,
    timeoutMs: 60000
  };
  BigQuery.Jobs.query(request, projectId);
}

function normalizeSheetHeadersForBQ_(headers) {
  const normalizedHeaders = (headers || []).map((h, idx) => {
    let normalized = String(h)
      .trim()
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu, '')
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/-+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!normalized) {
      normalized = `Column_${idx}`;
    }

    return normalized;
  });

  const headerCounts = {};
  return normalizedHeaders.map(h => {
    if (!headerCounts[h]) {
      headerCounts[h] = 0;
      return h;
    }
    headerCounts[h]++;
    return `${h}_${headerCounts[h]}`;
  });
}

function inferFieldTypeForBQ_(fieldName) {
  const key = String(fieldName || '').trim();
  if (!key) return 'STRING';

  if (isIntegerFieldForBQ_(key)) return 'INTEGER';

  const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Data', 'Fecha_', 'fecha_', 'created_date', 'closed_date'];
  const excludeDateFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
  const isDateField = (key === 'Data') || (
    dateFields.some(pattern => key.includes(pattern)) &&
    !excludeDateFields.some(pattern => key.startsWith(pattern))
  );

  if (isDateField) return 'DATE';
  if (isNumericFieldForBQ_(key)) return 'FLOAT';
  return 'STRING';
}

function isIntegerFieldForBQ_(key) {
  const lowerKey = String(key || '').toLowerCase();
  if (!lowerKey) return false;

  const integerPatterns = [
    'mudancas',
    'total_mudancas',
    'mudancas_criticas',
    'mudancas_close_date',
    'mudancas_stage',
    'mudancas_valor',
    'editores',
    'atividades',
    'ativ_7d',
    'ativ_30d',
    'ciclo_dias',
    'dias_funil',
    'idle_dias',
    'dias_idle',
    'confianca',
    'meddic_score',
    'bant_score'
  ];

  if (integerPatterns.some(pattern => lowerKey.includes(pattern))) {
    return true;
  }

  const explicitIntegerFields = new Set([
    'mes',
    'ano_oportunidade'
  ]);

  return explicitIntegerFields.has(lowerKey);
}

function toIntegerForBQ_(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = parseNumberForBQ(value);
  if (numeric === null || !isFinite(numeric)) return null;
  return numeric < 0 ? Math.ceil(numeric) : Math.floor(numeric);
}

function ensureEnrichmentColumnsForTable_(projectId, datasetId, tableName, sourceSheetName) {
  try {
    const targetTables = new Set(['pipeline', 'closed_deals_won', 'closed_deals_lost']);
    if (!targetTables.has(tableName)) return;

    const requiredFields = [
      { name: 'Vertical_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Sub_vertical_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Sub_sub_vertical_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Justificativa_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Owner_Preventa', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Cidade_de_cobranca', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Estado_Provincia_de_cobranca', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Subsegmento_de_mercado', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Segmento_consolidado', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Portfolio',          type: 'STRING', mode: 'NULLABLE' },
      { name: 'Portfolio_FDM',      type: 'STRING', mode: 'NULLABLE' },
      { name: 'Evidencia_Citada_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Avaliacao_Personas_IA', type: 'STRING', mode: 'NULLABLE' },
      { name: 'Tipo_Oportunidade',   type: 'STRING', mode: 'NULLABLE' },
      { name: 'Processo',            type: 'STRING', mode: 'NULLABLE' },
      { name: 'Processo_IA',         type: 'STRING', mode: 'NULLABLE' }
    ];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dynamicSheetFields = [];
    if (sourceSheetName) {
      const sourceSheet = ss.getSheetByName(sourceSheetName);
      if (sourceSheet && sourceSheet.getLastColumn() > 0) {
        const rawHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0] || [];
        const normalizedHeaders = normalizeSheetHeadersForBQ_(rawHeaders);
        normalizedHeaders.forEach((fieldName) => {
          dynamicSheetFields.push({ name: fieldName, type: inferFieldTypeForBQ_(fieldName), mode: 'NULLABLE' });
        });
      }
    }

    const table = BigQuery.Tables.get(projectId, datasetId, tableName);
    const schema = table && table.schema && Array.isArray(table.schema.fields)
      ? table.schema.fields
      : [];
    const existing = new Set(schema.map(f => String(f.name || '').trim()));
    const existingLower = new Set(schema.map(f => String(f.name || '').trim().toLowerCase()));

    const allRequiredFields = requiredFields.concat(dynamicSheetFields);
    const dedupedRequired = [];
    const seen = new Set();
    allRequiredFields.forEach((f) => {
      const name = String(f && f.name || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      dedupedRequired.push(f);
    });

    const missing = dedupedRequired.filter(f => {
      const name = String(f.name || '').trim();
      return name && !existing.has(name) && !existingLower.has(name.toLowerCase());
    });
    if (missing.length === 0) {
      return;
    }

    const updated = {
      schema: {
        fields: schema.concat(missing)
      }
    };

    BigQuery.Tables.patch(updated, projectId, datasetId, tableName);
    console.log(`🧩 Schema atualizado em ${tableName}: adicionadas ${missing.length} colunas (${missing.map(f => f.name).join(', ')})`);
  } catch (e) {
    console.warn(`⚠️ Não foi possível garantir schema enriquecido em ${tableName}: ${e.message}`);
  }
}

function normalizeRecordKeysForBigQuery_(record) {
  const source = record && typeof record === 'object' ? record : {};
  const normalized = {};
  const selectedByLower = {};
  const preferredNames = {
    'segmento_consolidado': 'Segmento_consolidado'
  };

  Object.keys(source).forEach((rawKey) => {
    const safeKey = String(rawKey || '').trim();
    if (!safeKey) return;

    const lowerKey = safeKey.toLowerCase();
    const canonicalKey = preferredNames[lowerKey] || safeKey;
    const value = source[rawKey];

    if (!Object.prototype.hasOwnProperty.call(selectedByLower, lowerKey)) {
      selectedByLower[lowerKey] = canonicalKey;
      normalized[canonicalKey] = value;
      return;
    }

    const existingKey = selectedByLower[lowerKey];
    const existingValue = normalized[existingKey];
    const hasExisting = !(existingValue === null || existingValue === undefined || existingValue === '');
    const hasIncoming = !(value === null || value === undefined || value === '');

    if (!hasExisting && hasIncoming) {
      normalized[existingKey] = value;
    }
  });

  return normalized;
}

function isNumericFieldForBQ_(key) {
  const keyStr = String(key || '');
  const lowerKey = keyStr.toLowerCase();

  const numericPatterns = [
    '_dias', '_score', '_peso', 'atividades', 'mudancas', 'editores',
    'confianca', 'gross', 'net', 'total_', 'valor_', 'billing_', 'booking_', 'idle_'
  ];
  if (numericPatterns.some(pattern => lowerKey.includes(pattern))) {
    return true;
  }

  const explicitNumericFields = new Set([
    'mes',
    'ano_oportunidade',
    'valor_fatura_moeda_local_sem_iva',
    'percentual_margem',
    'percentual_desconto_xertica_ns',
    'tipo_cambio_ajustado',
    'tipo_cambio_diario',
    'valor_fatura_usd_comercial',
    'net_revenue',
    'net_ajustado_usd',
    'incentivos_google',
    'backlog_nomeado',
    'tipo_cambio_pactado',
    'margem_percentual_final',
    'desconto_xertica',
    'custo_percentual',
    'custo_moeda_local',
    'receita_usd',
    'pnl_receita',
    'custo_usd',
    'pnl_custo',
    'revenue_revision',
    'net_real',
    'backlog_comissao',
    'net_comissoes',
    'percentual_margem_net_comissoes'
  ]);

  return explicitNumericFields.has(lowerKey);
}

/**
 * Carrega dados usando load job com WRITE_TRUNCATE nativo
 * Mais lento (~5-10s) mas suporta truncate sem problema de streaming buffer
 */
function loadUsingJob(projectId, datasetId, tableName, records, runId) {
  console.log(`🔄 Usando load job para ${tableName} (suporta WRITE_TRUNCATE)...`);

  // Normaliza strings de data para ISO (YYYY-MM-DD) de forma estrita.
  // Aceita apenas DD/MM/YYYY (ou DD.MM.YYYY) e YYYY-MM-DD.
  // Não aplica heurísticas ambíguas (ex.: MM-DD-YYYY).
  const normalizeDateStringToIso_ = (raw) => {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // YYYY-MM-DD (com ou sem sufixo de horário)
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      }
      return null;
    }

    // DD/MM/YYYY, DD.MM.YYYY ou DD-MM-YYYY (com ou sem sufixo de horário)
    const m = s.match(/^(\d{1,2})([\/\.\-])(\d{1,2})\2(\d{4})(?:\s+.*)?$/);
    if (!m) return null;

    const day = parseInt(m[1], 10);
    const month = parseInt(m[3], 10);
    const year = parseInt(m[4], 10);
    if (!year || year < 1900 || year > 2100) return null;

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };
  
  // Sanitizar dados (Date → yyyy-mm-dd, dd/mm/yyyy → yyyy-mm-dd)
  const sanitizedRecords = records.map((record, idx) => {
    try {
      const sanitized = {};
      const normalizedRecord = normalizeRecordKeysForBigQuery_(record);
      Object.keys(normalizedRecord).forEach(key => {
        const value = normalizedRecord[key];
        
        // Detectar se o campo deve ser numérico baseado no nome
        const isNumericField = isNumericFieldForBQ_(key);
        const isIntegerField = isIntegerFieldForBQ_(key);
        
        // Detectar se o campo é de data baseado no nome
        // EXCLUSÕES: Mudancas_Close_Date, Mudancas_Stage, etc são INTEGER
        const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Data', 'Fecha_', 'fecha_', 'closed_date', 'created_date'];
        const excludeFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
        const isDateField = (key === 'Data') || (
               dateFields.some(pattern => key.includes(pattern)) && 
               !excludeFields.some(pattern => key.startsWith(pattern))
               );
        
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
        } else if (typeof value === 'number' && isDateField) {
          // Não inferir serial date no sync: normalização é responsabilidade do CorrigirFiscalQ.
          sanitized[key] = null;
        } else if (typeof value === 'string') {
          const strVal = String(value).trim();
          
          const isoMaybe = normalizeDateStringToIso_(strVal);

          if (isDateField) {
            // Campo é de data: converter para ISO ou null (evita falha no load)
            sanitized[key] = isoMaybe;
          } else if (isoMaybe) {
            // String parece data mas campo NÃO é de data → deixar NULL
            sanitized[key] = null;
          } else if (isNumericField) {
            // Para campos numéricos, tentar converter; se falhar, usar NULL
            sanitized[key] = isIntegerField ? toIntegerForBQ_(strVal) : parseNumberForBQ(strVal);
          } else {
            sanitized[key] = strVal || null;
          }
        } else if (typeof value === 'number') {
          // Validação rigorosa para campos numéricos
          if (isNumericField) {
            if (!isFinite(value)) {
              sanitized[key] = null;
            } else {
              if (isIntegerField) {
                sanitized[key] = value < 0 ? Math.ceil(value) : Math.floor(value);
              } else {
                // Arredondar para 2 casas decimais para evitar problemas de precisão float
                sanitized[key] = Math.round(value * 100) / 100;
              }
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
      const debugFields = ['Atribuido', 'Data', 'Data_de_criacao', 'EmpresaConta', 'Tipo_de_Actividad', 'Comentarios', 'Oportunidade', 'Data_Fechamento', 'Data_Prevista', 'closed_date', 
                          'Gross', 'Net', 'Fiscal_Q', 'Confianca', 'Ciclo_dias', 'Mudancas_Close_Date',
                          'opportunity_name', 'booking_total_gross', 'fiscal_quarter',
                          'Vertical_IA', 'Sub_vertical_IA', 'Sub_sub_vertical_IA', 'Owner_Preventa'];
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
    
    // Enviar dados via load job com retry para erros transitórios (ex: Empty response)
    const blob = Utilities.newBlob(ndjson, 'application/json');
    const jobResult = insertLoadJobWithRetry_(projectId, job, blob, {
      maxAttempts: 4,
      baseSleepMs: 2000
    });
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
        if (String((pollError && pollError.message) || '').indexOf('Load job failed:') > -1) {
          throw pollError;
        }
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
    const errMsg = String((error && error.message) || error || 'Erro desconhecido');
    console.error(`❌ Erro no load job: ${errMsg}`);

    // Fallback específico para meta: evita derrubar o sync inteiro por flutuação da API de load job.
    if (tableName === 'meta' && /empty response/i.test(errMsg)) {
      try {
        console.warn('⚠️ Ativando fallback para meta: TRUNCATE + streaming insert...');
        truncateTableForFallback_(projectId, datasetId, tableName);
        const fallback = loadUsingStreamingInsert(projectId, datasetId, tableName, records, runId);
        return {
          rowsInserted: fallback.rowsInserted || 0,
          jobId: null,
          status: fallback.status || 'FALLBACK_SUCCESS',
          fallback: true
        };
      } catch (fallbackError) {
        const fallbackMsg = String((fallbackError && fallbackError.message) || fallbackError || 'Erro desconhecido no fallback');
        console.error(`❌ Fallback meta também falhou: ${fallbackMsg}`);
      }
    }

    throw new Error(`Falha ao carregar ${tableName}: ${errMsg}`);
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
    const normalizedRecord = normalizeRecordKeysForBigQuery_(record);
    Object.keys(normalizedRecord).forEach(key => {
      const value = normalizedRecord[key];
      
      const isNumericField = isNumericFieldForBQ_(key);
      const isIntegerField = isIntegerFieldForBQ_(key);
      const dateFields = ['Data_', 'Date_', 'data_', 'date_', '_Date', '_Data', 'Fecha_', 'fecha_', 'closed_date', 'created_date'];
      const excludeFields = ['Mudancas_', 'Total_', 'Ativ_', 'Distribuicao_'];
      const isDateField = (key === 'Data') || (
        dateFields.some(pattern => key.includes(pattern)) &&
        !excludeFields.some(pattern => key.startsWith(pattern))
      );
      
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
        if (isDateField) {
          sanitized[key] = parseDateForBQ(strVal);
        } else if (isNumericField) {
          sanitized[key] = isIntegerField ? toIntegerForBQ_(strVal) : parseNumberForBQ(strVal);
        } else {
          sanitized[key] = strVal || null;
        }
      } else if (typeof value === 'number') {
        if (!isFinite(value)) {
          sanitized[key] = null;
        } else if (isNumericField && isIntegerField) {
          sanitized[key] = value < 0 ? Math.ceil(value) : Math.floor(value);
        } else if (isNumericField) {
          sanitized[key] = Math.round(value * 100) / 100;
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
  const aliasValue = (aliasKey, fallbackList) => {
    if (typeof getFieldByAlias_ === 'function') {
      return getFieldByAlias_(row, aliasKey, fallbackList);
    }
    const list = Array.isArray(fallbackList) ? fallbackList : [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (Object.prototype.hasOwnProperty.call(row, candidate) && row[candidate] !== '') {
        return row[candidate];
      }
    }
    return null;
  };

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

  const portfolioValue = aliasValue('portfolio', ['Categoria_SDR', 'CategoriaSDR']) || aliasValue('portfolio_fdm');
  const portfolioFdmValue = aliasValue('portfolio_fdm') || aliasValue('portfolio', ['Categoria_SDR', 'CategoriaSDR']);
  
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
    'Data_de_criacao': parse(
      row['Data_de_criacao'] ||
      row['Data_de_criacao_DE_ONDE_PEGAR'] ||
      row['Created_Date'] ||
      row['Date_Created'],
      'DATE'
    ),
    'Data_Prevista': parse(row['Data_Prevista'] || row['Expected Close'], 'DATE'),
    'Ciclo_dias': parse(row['Ciclo_dias'] || row['Cycle Days'], 'INTEGER'),
    'Dias_Funil': parse(row['Dias_Funil'] || row['Days in Funnel'], 'INTEGER'),
    'Subsegmento_de_mercado': parse(aliasValue('subsegmento_mercado'), 'STRING'),
    'Segmento_Consolidado': parse(aliasValue('segmento_consolidado'), 'STRING'),
    'Portfolio': parse(portfolioValue, 'STRING'),
    'Portfolio_FDM': parse(portfolioFdmValue, 'STRING'),
    
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
    'Risco_Principal': parse(row['Risco_Principal'], 'STRING'),

    // Segmentação IA (preenchidos por CorrigirFiscalQ.gs)
    'Vertical_IA': parse(aliasValue('vertical_ia'), 'STRING'),
    'Sub_vertical_IA': parse(aliasValue('sub_vertical_ia'), 'STRING'),
    'Sub_sub_vertical_IA': parse(aliasValue('sub_sub_vertical_ia'), 'STRING'),
    'Justificativa_IA':   parse(row['Justificativa_IA'] || row['Justificativa IA'], 'STRING'),
    'Tipo_Oportunidade':  parse(row['Tipo Oportunidade'] || row['Tipo_Oportunidade'] || row['tipoOportunidade'], 'STRING'),
    'Processo_IA':        parse(row['Processo'] || row['Processo_IA'] || row['processoTipo'], 'STRING'),
    'Owner_Preventa':     parse(aliasValue('owner_preventa'), 'STRING')
  };
}

/**
 * Mapeia dados para schema de closed deals (won ou lost)
 */
function mapToClosedDealsSchema(row, outcome) {
  const aliasValue = (aliasKey, fallbackList) => {
    if (typeof getFieldByAlias_ === 'function') {
      return getFieldByAlias_(row, aliasKey, fallbackList);
    }
    const list = Array.isArray(fallbackList) ? fallbackList : [];
    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (Object.prototype.hasOwnProperty.call(row, candidate) && row[candidate] !== '') {
        return row[candidate];
      }
    }
    return null;
  };

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

  const portfolioValue = aliasValue('portfolio', ['Categoria_SDR', 'CategoriaSDR']) || aliasValue('portfolio_fdm');
  const portfolioFdmValue = aliasValue('portfolio_fdm') || aliasValue('portfolio', ['Categoria_SDR', 'CategoriaSDR']);
  
  return {
    'Oportunidade': parse(row['Oportunidade'] || row['Deal'], 'STRING') || 'N/A',
    'Conta': parse(row['Conta'] || row['Account'], 'STRING'),
    'Perfil_Cliente': parse(row['Perfil'] || row['Customer Profile'], 'STRING'),
    'Vendedor': parse(row['Vendedor'] || row['Seller'], 'STRING'),
    
    'Gross': parse(row['Gross'] || row['Valor Bruto'], 'FLOAT'),
    'Net': parse(row['Net'] || row['Valor Líquido'], 'FLOAT'),
    'Portfolio': parse(portfolioValue, 'STRING'),
    'Segmento': parse(row['Segmento'], 'STRING'),
    'Subsegmento_de_mercado': parse(aliasValue('subsegmento_mercado'), 'STRING'),
    'Segmento_Consolidado': parse(aliasValue('segmento_consolidado'), 'STRING'),
    'Portfolio_FDM': parse(portfolioFdmValue, 'STRING'),
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
    
    'outcome': outcome, // WON ou LOST

    // Segmentação IA (preenchidos por CorrigirFiscalQ.gs)
    'Vertical_IA': parse(aliasValue('vertical_ia'), 'STRING'),
    'Sub_vertical_IA': parse(aliasValue('sub_vertical_ia'), 'STRING'),
    'Sub_sub_vertical_IA': parse(aliasValue('sub_sub_vertical_ia'), 'STRING'),
    'Justificativa_IA': parse(row['Justificativa_IA'] || row['Justificativa IA'], 'STRING'),
    'Owner_Preventa': parse(aliasValue('owner_preventa'), 'STRING')
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

  const decideSingleSeparator_ = (text, sep) => {
    const parts = text.split(sep);
    if (parts.length <= 1) return null;
    const tail = parts[parts.length - 1];

    // Ex.: 5.3332, 12,3456 -> decimal válido (3+ casas)
    if (/^\d{1,6}$/.test(tail) && tail.length !== 3) return sep;

    // Ex.: 1.234.567 -> milhares (sem decimal)
    const headParts = parts.slice(1);
    const allThousandsGroups = headParts.every((p) => /^\d{3}$/.test(p));
    if (allThousandsGroups) return null;

    // Caso ambíguo (ex.: 12.345), assume milhar
    return null;
  };

  // Define separador decimal pelo último separador encontrado
  let decimalSep = null;
  if (lastComma > -1 && lastDot > -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma > -1) {
    decimalSep = decideSingleSeparator_(cleaned, ',');
  } else if (lastDot > -1) {
    decimalSep = decideSingleSeparator_(cleaned, '.');
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

// ==================== FATURAMENTO 2025 ====================

/**
 * Garante que a tabela `faturamento_2025` existe no BigQuery.
 * Schema de FATURAMENTO_2025 (normalizado na planilha destino).
 * Cria com 50 campos se não existir; em caso contrário, adiciona apenas colunas novas.
 */
function ensureFaturamentoTableExists_() {
  const tableName = 'faturamento_2025';

  // Schema baseado nos aliases de FaturamentoSync.gs + campos BQ padrão
  const schemaFields = [
    // ── Identificação ─────────────────────────────────────────────────
    { name: 'mes',                              type: 'INTEGER',  mode: 'NULLABLE' },
    { name: 'pais',                             type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cuenta_financeira',                type: 'STRING',   mode: 'NULLABLE' },
    { name: 'tipo_documento',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'fecha_factura',                    type: 'STRING',   mode: 'NULLABLE' }, // dd/mm/yyyy
    { name: 'poliza_pais',                      type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cuenta_contable',                  type: 'STRING',   mode: 'NULLABLE' },
    // ── Valores Financeiros ───────────────────────────────────────────
    { name: 'valor_fatura_moeda_local_sem_iva', type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'percentual_margem',                type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Produto / Oportunidade ────────────────────────────────────────
    { name: 'produto',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'oportunidade',                     type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cliente',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'tipo_oportunidade_ns',             type: 'STRING',   mode: 'NULLABLE' },
    { name: 'folio_salesforce_ns',              type: 'STRING',   mode: 'NULLABLE' },
    { name: 'percentual_desconto_xertica_ns',   type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'tipo_produto',                     type: 'STRING',   mode: 'NULLABLE' },
    { name: 'portafolio',                       type: 'STRING',   mode: 'NULLABLE' },
    { name: 'timbradas',                        type: 'STRING',   mode: 'NULLABLE' },
    { name: 'estado_pagamento',                 type: 'STRING',   mode: 'NULLABLE' },
    { name: 'fecha_doc_timbrado',               type: 'STRING',   mode: 'NULLABLE' }, // dd/mm/yyyy
    { name: 'familia',                          type: 'STRING',   mode: 'NULLABLE' },
    // ── Câmbio ────────────────────────────────────────────────────────
    { name: 'tipo_cambio_ajustado',             type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'tipo_cambio_diario',               type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'valor_fatura_usd_comercial',       type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'net_revenue',                      type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'net_ajustado_usd',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'backlog_nomeado',                  type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Comercial ─────────────────────────────────────────────────────
    { name: 'pais_comercial',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'comercial',                        type: 'STRING',   mode: 'NULLABLE' },
    { name: 'ano_oportunidade',                 type: 'INTEGER',  mode: 'NULLABLE' },
    { name: 'tipo_oportunidade_line',           type: 'STRING',   mode: 'NULLABLE' },
    { name: 'dominio',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'segmento',                         type: 'STRING',   mode: 'NULLABLE' },
    { name: 'concatenar',                       type: 'STRING',   mode: 'NULLABLE' },
    // ── Margens e Etapas ──────────────────────────────────────────────
    { name: 'margem_percentual_final',          type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'revisao_margem',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'etapa_oportunidade',               type: 'STRING',   mode: 'NULLABLE' },
    { name: 'desconto_xertica',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'cenario_nr',                       type: 'STRING',   mode: 'NULLABLE' },
    { name: 'q',                                type: 'STRING',   mode: 'NULLABLE' },
    { name: 'validacao_custo_margem',           type: 'STRING',   mode: 'NULLABLE' },
    { name: 'processo',                         type: 'STRING',   mode: 'NULLABLE' },
    { name: 'coluna_extra',                     type: 'STRING',   mode: 'NULLABLE' }, // coluna vazia original
    // ── Custos ────────────────────────────────────────────────────────
    { name: 'custo_percentual',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'custo_moeda_local',                type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'generales_budget',                 type: 'STRING',   mode: 'NULLABLE' },
    { name: 'backlog_comissao',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'net_comissoes',                    type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'percentual_margem_net_comissoes',  type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Metadados BQ ─────────────────────────────────────────────────
    { name: 'Run_ID',                           type: 'STRING',   mode: 'NULLABLE' },
    { name: 'data_carga',                       type: 'TIMESTAMP', mode: 'NULLABLE' }
  ];

  // Verificar se a tabela já existe
  let tableExists = false;
  let existingFields = [];
  try {
    const existingTable = BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    tableExists = true;
    existingFields = (existingTable.schema && existingTable.schema.fields) || [];
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar ${tableName}: ${msg}`);
      return;
    }
    // Tabela não existe → criar
  }

  if (!tableExists) {
    const tableResource = {
      tableReference: { projectId: BQ_PROJECT, datasetId: BQ_DATASET, tableId: tableName },
      description: 'Faturamento 2025 — migrado da aba FATURAMENTO_2025',
      schema: { fields: schemaFields }
    };
    BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
    console.log(`✅ Tabela ${tableName} criada no BigQuery (${schemaFields.length} colunas)`);
    return;
  }

  // Tabela existe → adicionar apenas colunas novas
  const existingNames = new Set(existingFields.map(f => String(f.name || '').trim()));
  const missing = schemaFields.filter(f => !existingNames.has(f.name));
  if (missing.length === 0) return;

  BigQuery.Tables.patch(
    { schema: { fields: existingFields.concat(missing) } },
    BQ_PROJECT, BQ_DATASET, tableName
  );
  console.log(`🧩 ${tableName}: ${missing.length} coluna(s) adicionada(s) — ${missing.map(f => f.name).join(', ')}`);
}

/**
 * Lê a aba "FATURAMENTO_2025" (gravada por migrarFaturamento())
 * e retorna array pronto para loadToBigQuery → tabela BQ: faturamento_2025.
 * @returns {Array<Object>}
 */
function prepareFaturamentoData() {
  const sheetName = 'FATURAMENTO_2025';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    console.warn(`⚠️ [Faturamento2025] Aba "${sheetName}" vazia ou não encontrada.`);
    return [];
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  const result = rows
    .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        const key = String(h).trim();
        if (!key) return;
        const val = row[idx];
        if (val === null || val === undefined || val === '') {
          obj[key] = null;
        } else if (val instanceof Date) {
          const d = String(val.getDate()).padStart(2, '0');
          const m = String(val.getMonth() + 1).padStart(2, '0');
          obj[key] = `${d}/${m}/${val.getFullYear()}`;
        } else if (typeof val === 'number') {
          obj[key] = val;
        } else {
          obj[key] = String(val).trim() || null;
        }
      });
      return obj;
    });

  console.log(`📊 [Faturamento2025] ${result.length} registros lidos de "${sheetName}"`);
  return result;
}

// ==================== FATURAMENTO 2026 ====================

/**
 * Garante que a tabela `faturamento_2026` existe no BigQuery.
 * Schema baseado no cabeçalho normalizado de FATURAMENTO_2026.
 */
function ensureFaturamento2026TableExists_() {
  const tableName = 'faturamento_2026';

  const schemaFields = [
    // ── Identificação ─────────────────────────────────────────────────
    { name: 'mes',                              type: 'INTEGER',  mode: 'NULLABLE' },
    { name: 'pais',                             type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cuenta_financeira',                type: 'STRING',   mode: 'NULLABLE' },
    { name: 'tipo_documento',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'fecha_factura',                    type: 'STRING',   mode: 'NULLABLE' }, // dd/mm/yyyy
    { name: 'poliza_pais',                      type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cuenta_contable',                  type: 'STRING',   mode: 'NULLABLE' },
    // ── Valores Financeiros ───────────────────────────────────────────
    { name: 'valor_fatura_moeda_local_sem_iva', type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'percentual_margem',                type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Produto / Oportunidade ────────────────────────────────────────
    { name: 'produto',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'oportunidade',                     type: 'STRING',   mode: 'NULLABLE' },
    { name: 'cliente',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'id_oportunidade',                  type: 'STRING',   mode: 'NULLABLE' }, // exclusivo Q1
    { name: 'billing_id',                       type: 'STRING',   mode: 'NULLABLE' }, // exclusivo Q1
    { name: 'percentual_desconto_xertica_ns',   type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'tipo_produto',                     type: 'STRING',   mode: 'NULLABLE' },
    { name: 'portafolio',                       type: 'STRING',   mode: 'NULLABLE' },
    { name: 'timbradas',                        type: 'STRING',   mode: 'NULLABLE' },
    { name: 'estado_pagamento',                 type: 'STRING',   mode: 'NULLABLE' },
    { name: 'fecha_doc_timbrado',               type: 'STRING',   mode: 'NULLABLE' }, // dd/mm/yyyy
    { name: 'familia',                          type: 'STRING',   mode: 'NULLABLE' },
    // ── Câmbio ────────────────────────────────────────────────────────
    { name: 'tipo_cambio_pactado',              type: 'FLOAT64',  mode: 'NULLABLE' }, // exclusivo Q1
    { name: 'tipo_cambio_diario',               type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'valor_fatura_usd_comercial',       type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'net_revenue',                      type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'incentivos_google',                type: 'FLOAT64',  mode: 'NULLABLE' }, // exclusivo Q1
    { name: 'backlog_nomeado',                  type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Comercial ─────────────────────────────────────────────────────
    { name: 'pais_comercial',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'comercial',                        type: 'STRING',   mode: 'NULLABLE' },
    { name: 'ano_oportunidade',                 type: 'INTEGER',  mode: 'NULLABLE' },
    { name: 'tipo_oportunidade_line',           type: 'STRING',   mode: 'NULLABLE' },
    { name: 'dominio',                          type: 'STRING',   mode: 'NULLABLE' },
    { name: 'segmento',                         type: 'STRING',   mode: 'NULLABLE' },
    { name: 'concatenar',                       type: 'STRING',   mode: 'NULLABLE' },
    // ── Margens e Etapas ──────────────────────────────────────────────
    { name: 'margem_percentual_final',          type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'revisao_margem',                   type: 'STRING',   mode: 'NULLABLE' },
    { name: 'etapa_oportunidade',               type: 'STRING',   mode: 'NULLABLE' },
    { name: 'desconto_xertica',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'cenario_nr',                       type: 'STRING',   mode: 'NULLABLE' },
    { name: 'q',                                type: 'STRING',   mode: 'NULLABLE' },
    { name: 'validacao_custo_margem',           type: 'STRING',   mode: 'NULLABLE' },
    { name: 'processo',                         type: 'STRING',   mode: 'NULLABLE' },
    // ── Custos e P&L (2026) ───────────────────────────────────────────
    { name: 'custo_percentual',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'custo_moeda_local',                type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'generales_budget',                 type: 'STRING',   mode: 'NULLABLE' },
    { name: 'receita_usd',                      type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'pnl_receita',                      type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'custo_usd',                        type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'pnl_custo',                        type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'revenue_revision',                 type: 'FLOAT64',  mode: 'NULLABLE' },
    { name: 'net_real',                         type: 'FLOAT64',  mode: 'NULLABLE' },
    // ── Metadados BQ ─────────────────────────────────────────────────
    { name: 'Run_ID',                           type: 'STRING',    mode: 'NULLABLE' },
    { name: 'data_carga',                       type: 'TIMESTAMP', mode: 'NULLABLE' }
  ];

  let tableExists = false;
  let existingFields = [];
  try {
    const existingTable = BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    tableExists = true;
    existingFields = (existingTable.schema && existingTable.schema.fields) || [];
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar ${tableName}: ${msg}`);
      return;
    }
  }

  if (!tableExists) {
    const tableResource = {
      tableReference: { projectId: BQ_PROJECT, datasetId: BQ_DATASET, tableId: tableName },
      description: 'Faturamento 2026 — migrado da aba FATURAMENTO_2026',
      schema: { fields: schemaFields }
    };
    BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
    console.log(`✅ Tabela ${tableName} criada no BigQuery (${schemaFields.length} colunas)`);
    return;
  }

  const existingNames = new Set(existingFields.map(f => String(f.name || '').trim()));
  const missing = schemaFields.filter(f => !existingNames.has(f.name));
  if (missing.length === 0) return;

  BigQuery.Tables.patch(
    { schema: { fields: existingFields.concat(missing) } },
    BQ_PROJECT, BQ_DATASET, tableName
  );
  console.log(`🧩 ${tableName}: ${missing.length} coluna(s) adicionada(s) — ${missing.map(f => f.name).join(', ')}`);
}

/**
 * Lê a aba "FATURAMENTO_2026" (gravada por migrarFaturamento2026())
 * e retorna array pronto para loadToBigQuery → tabela BQ: faturamento_2026.
 * @returns {Array<Object>}
 */
function prepareFaturamento2026Data() {
  const sheetName = 'FATURAMENTO_2026';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    console.warn(`⚠️ [Faturamento2026] Aba "${sheetName}" vazia ou não encontrada.`);
    return [];
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  const result = rows
    .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        const key = String(h).trim();
        if (!key) return;
        const val = row[idx];
        if (val === null || val === undefined || val === '') {
          obj[key] = null;
        } else if (val instanceof Date) {
          const d = String(val.getDate()).padStart(2, '0');
          const m = String(val.getMonth() + 1).padStart(2, '0');
          obj[key] = `${d}/${m}/${val.getFullYear()}`;
        } else if (typeof val === 'number') {
          obj[key] = val;
        } else {
          obj[key] = String(val).trim() || null;
        }
      });
      return obj;
    });

  console.log(`📊 [Faturamento2026] ${result.length} registros lidos de "${sheetName}"`);
  return result;
}

// ==================== FATURAMENTO SEMANAL (Q1 2026) ====================

/**
 * Garante que a tabela `faturamento_semanal` existe no BigQuery.
 * Schema baseado no cabeçalho normalizado da aba Faturamento_Week (origem: Q1 2026).
 */
function ensureFaturamentoSemanalTableExists_() {
  const tableName = 'faturamento_semanal';

  const schemaFields = [
    { name: 'mes',                              type: 'INTEGER',   mode: 'NULLABLE' },
    { name: 'pais',                             type: 'STRING',    mode: 'NULLABLE' },
    { name: 'cuenta_financeira',                type: 'STRING',    mode: 'NULLABLE' },
    { name: 'tipo_documento',                   type: 'STRING',    mode: 'NULLABLE' },
    { name: 'fecha_factura',                    type: 'STRING',    mode: 'NULLABLE' },
    { name: 'poliza_pais',                      type: 'STRING',    mode: 'NULLABLE' },
    { name: 'cuenta_contable',                  type: 'STRING',    mode: 'NULLABLE' },
    { name: 'valor_fatura_moeda_local_sem_iva', type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'produto',                          type: 'STRING',    mode: 'NULLABLE' },
    { name: 'oportunidade',                     type: 'STRING',    mode: 'NULLABLE' },
    { name: 'cliente',                          type: 'STRING',    mode: 'NULLABLE' },
    { name: 'id_oportunidade',                  type: 'STRING',    mode: 'NULLABLE' },
    { name: 'billing_id',                       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'percentual_desconto_xertica_ns',   type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'tipo_produto',                     type: 'STRING',    mode: 'NULLABLE' },
    { name: 'portafolio',                       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'timbradas',                        type: 'STRING',    mode: 'NULLABLE' },
    { name: 'estado_pagamento',                 type: 'STRING',    mode: 'NULLABLE' },
    { name: 'fecha_doc_timbrado',               type: 'STRING',    mode: 'NULLABLE' },
    { name: 'familia',                          type: 'STRING',    mode: 'NULLABLE' },
    { name: 'tipo_cambio_pactado',              type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'tipo_cambio_diario',               type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'valor_fatura_usd_comercial',       type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'net_revenue',                      type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'incentivos_google',                type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'backlog_nomeado',                  type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'pais_comercial',                   type: 'STRING',    mode: 'NULLABLE' },
    { name: 'comercial',                        type: 'STRING',    mode: 'NULLABLE' },
    { name: 'ano_oportunidade',                 type: 'INTEGER',   mode: 'NULLABLE' },
    { name: 'tipo_oportunidade_line',           type: 'STRING',    mode: 'NULLABLE' },
    { name: 'dominio',                          type: 'STRING',    mode: 'NULLABLE' },
    { name: 'segmento',                         type: 'STRING',    mode: 'NULLABLE' },
    { name: 'concatenar',                       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'margem_percentual_final',          type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'revisao_margem',                   type: 'STRING',    mode: 'NULLABLE' },
    { name: 'etapa_oportunidade',               type: 'STRING',    mode: 'NULLABLE' },
    { name: 'desconto_xertica',                 type: 'FLOAT64',   mode: 'NULLABLE' },
    { name: 'cenario_nr',                       type: 'STRING',    mode: 'NULLABLE' },
    { name: 'Run_ID',                           type: 'STRING',    mode: 'NULLABLE' },
    { name: 'data_carga',                       type: 'TIMESTAMP', mode: 'NULLABLE' }
  ];

  let tableExists = false;
  let existingFields = [];
  try {
    const existingTable = BigQuery.Tables.get(BQ_PROJECT, BQ_DATASET, tableName);
    tableExists = true;
    existingFields = (existingTable.schema && existingTable.schema.fields) || [];
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (msg.indexOf('Not found') === -1 && msg.indexOf('404') === -1) {
      console.warn(`⚠️ Falha ao verificar ${tableName}: ${msg}`);
      return;
    }
  }

  if (!tableExists) {
    const tableResource = {
      tableReference: { projectId: BQ_PROJECT, datasetId: BQ_DATASET, tableId: tableName },
      description: 'Faturamento semanal — migrado da aba Q1 2026 para Faturamento_Week',
      schema: { fields: schemaFields }
    };
    BigQuery.Tables.insert(tableResource, BQ_PROJECT, BQ_DATASET);
    console.log(`✅ Tabela ${tableName} criada no BigQuery (${schemaFields.length} colunas)`);
    return;
  }

  const existingNames = new Set(existingFields.map(f => String(f.name || '').trim()));
  const missing = schemaFields.filter(f => !existingNames.has(f.name));
  if (missing.length === 0) return;

  BigQuery.Tables.patch(
    { schema: { fields: existingFields.concat(missing) } },
    BQ_PROJECT, BQ_DATASET, tableName
  );
  console.log(`🧩 ${tableName}: ${missing.length} coluna(s) adicionada(s) — ${missing.map(f => f.name).join(', ')}`);
}

/**
 * Lê a aba "Faturamento_Week" (origem: Q1 2026)
 * e retorna array pronto para loadToBigQuery → tabela BQ: faturamento_semanal.
 * @returns {Array<Object>}
 */
function prepareFaturamentoSemanalData() {
  const sheetName = 'Faturamento_Week';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    console.warn(`⚠️ [FaturamentoSemanal] Aba "${sheetName}" vazia ou não encontrada.`);
    return [];
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const result = rows
    .filter(row => row.some(v => v !== '' && v !== null && v !== undefined))
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        const key = String(h).trim();
        if (!key) return;
        const val = row[idx];
        if (val === null || val === undefined || val === '') {
          obj[key] = null;
        } else if (val instanceof Date) {
          const d = String(val.getDate()).padStart(2, '0');
          const m = String(val.getMonth() + 1).padStart(2, '0');
          obj[key] = `${d}/${m}/${val.getFullYear()}`;
        } else if (typeof val === 'number') {
          obj[key] = val;
        } else {
          obj[key] = String(val).trim() || null;
        }
      });
      return obj;
    });

  console.log(`📊 [FaturamentoSemanal] ${result.length} registros lidos de "${sheetName}"`);
  return result;
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
