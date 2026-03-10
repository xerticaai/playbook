/**
 * CorrigirFiscalQ.gs
 * Função para padronizar datas e recalcular Fiscal Q e Ciclo de todas as análises
 * 
 * FUNCIONALIDADES:
 * 1. PADRONIZAÇÃO: Todas as colunas de data são convertidas para formato DD/MM/AAAA
 * 2. FISCAL Q: Recalcula baseado na fonte correta para cada cenário:
 *    - WON/LOST: usa data da última mudança de fase (do Historico)
 *    - OPEN: usa "Período fiscal" (Tn-YYYY/Qn-YYYY → FYyy-Qn), sem parser de data
 * 3. CICLO: Recalcula dias entre data de criação e data de fechamento
 * 
 * Esta correção atualiza todas as análises existentes em uma única execução
 * 
 * DEPENDÊNCIAS:
 * - ShareCode.gs: callGeminiAPI, cleanAndParseJSON, normText_
 * - SheetCode.gs: findColumnByPatterns_, logToSheet
 */

// Funções de diagnóstico movidas para:
// appscript/backup/Backup_CorrigirFiscalQ_FuncoesRemovidas_2026_02_21.gs

/**
 * Normaliza datas em todas as abas (sem recalcular Fiscal Q)
 * Uso recomendado para trigger periódico
 */
function normalizarDatasTodasAbas() {
  console.log('\n🧹 ========================================');
  console.log('🧹 NORMALIZAÇÃO GLOBAL DE DATAS');
  console.log('🧹 ========================================\n');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const originalLocale = ss.getSpreadsheetLocale();
  let localeChanged = false;

  console.log(`🌍 Locale atual global: ${originalLocale}`);
  if (originalLocale !== 'pt_BR' && originalLocale !== 'pt-BR') {
    console.log('🔧 Alterando locale GLOBAL para pt_BR...');
    ss.setSpreadsheetLocale('pt_BR');
    localeChanged = true;
    if (typeof invalidateSheetCache_ === 'function') {
      invalidateSheetCache_();
      console.log('🧹 Cache de sheets limpo após mudança de locale');
    }
  }

  try {
    const sheets = ss.getSheets();
    const resumo = [];
    let totalDatas = 0;
    let totalAbas = 0;

    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        console.log(`⚠️ Aba "${sheetName}" vazia ou só com header - PULANDO`);
        return;
      }

      const result = normalizarDatasAba_(sheet);
      if (result) {
        totalAbas++;
        totalDatas += result.datasPadronizadas;
        resumo.push(result);
      }
    });

    console.log('\n✅ ========================================');
    console.log(`✅ Normalização concluída: ${totalDatas} datas padronizadas em ${totalAbas} abas`);
    console.log('✅ ========================================\n');

    return resumo;
  } finally {
    if (localeChanged) {
      console.log(`↩️ Restaurando locale para ${originalLocale}...`);
      ss.setSpreadsheetLocale(originalLocale);
      if (typeof invalidateSheetCache_ === 'function') {
        invalidateSheetCache_();
        console.log('🧹 Cache de sheets limpo após restaurar locale');
      }
    }
  }
}

/**
 * Normaliza datas em uma aba específica
 * @param {Sheet} sheet - Aba do Google Sheets
 * @return {Object|null} Resultado com métricas
 */
function normalizarDatasAba_(sheet) {
  const sheetName = sheet.getName();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return null;

  const fullRange = sheet.getRange(1, 1, lastRow, lastCol);
  const data = fullRange.getValues();
  const displayData = fullRange.getDisplayValues();
  if (data.length <= 1) return null;

  const headers = data[0];
  const rows = data.slice(1);
  const displayRows = displayData.slice(1);
    const dateColumns = identificarColunasDatasFiscalQ_(headers);

  console.log(`\n📋 ==================== ${sheetName} ====================`);
  console.log(`   📊 Total de colunas: ${headers.length}`);
  console.log(`   📅 Colunas de data identificadas: ${dateColumns.length}`);

  if (dateColumns.length === 0) return null;

  dateColumns.forEach(col => {
    const colLetter = columnToLetter_(col.idx + 1);
    const range = sheet.getRange(`${colLetter}2:${colLetter}${rows.length + 1}`);
    range.setNumberFormat('dd/mm/yyyy');
  });
  SpreadsheetApp.flush();

  let datasPadronizadas = 0;
  const columnBuffers = dateColumns.map(col => ({
    idx: col.idx,
    name: col.name,
    values: [],
    changed: false
  }));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const displayRow = displayRows[i] || [];
    const rowIndex = i + 2;

    columnBuffers.forEach(buf => {
      const cellValue = row[buf.idx];
      const cellDisplay = displayRow[buf.idx];
      if (!cellValue || cellValue === '') {
        buf.values.push(cellValue);
        return;
      }

      try {
        let newValue = null;

        if (typeof cellValue === 'number' && cellValue < 1000) {
          return; // Provavelmente contador, nao data
        }

        if (cellValue instanceof Date) {
          newValue = normalizeDateToNoon_(cellValue);
        } else if (typeof cellValue === 'string') {
          // Sem parser custom: reusa valor de display/raw e deixa o Sheets interpretar
          const localeInput = String(cellDisplay || cellValue)
            .replace(/^['"]/, '')
            .trim()
            .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?$/i, '')
            .replace(/T\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i, '')
            .replace(/[\.-]/g, '/');
          if (localeInput) {
            newValue = localeInput;
          }
        } else if (typeof cellValue === 'number') {
          const dateFromSerial = new Date((cellValue - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            newValue = normalizeDateToNoon_(dateFromSerial);
          }
        }

        if (newValue) {
          const valueChanged = (newValue instanceof Date)
            ? ((cellValue instanceof Date) ? cellValue.getTime() !== newValue.getTime() : true)
            : String(cellDisplay || cellValue || '').trim() !== String(newValue).trim();
          if (valueChanged) {
            buf.changed = true;
          }
          buf.values.push(newValue);
          datasPadronizadas++;
        } else {
          buf.values.push(cellValue);
        }
      } catch (error) {
        console.error(`   ⚠️ Erro ao padronizar [${sheetName}] L${rowIndex} ${buf.name}: ${error.message}`);
        buf.values.push(cellValue);
      }
    });
  }

  let anyWrites = false;
  columnBuffers.forEach(buf => {
    if (!buf.changed) return;
    const range = sheet.getRange(2, buf.idx + 1, rows.length, 1);
    range.setValues(buf.values.map(v => [v]));
    anyWrites = true;
  });
  if (anyWrites) SpreadsheetApp.flush();

  console.log(`   ✅ ${datasPadronizadas} datas padronizadas`);
  return {
    aba: sheetName,
    datasPadronizadas: datasPadronizadas,
    colunasData: dateColumns.length
  };
}

/**
 * Identifica colunas de data para normalização.
 * Inclui padrões PT/EN/ES e campos de faturamento.
 */
function identificarColunasDatasFiscalQ_(headers) {
  const dateColumns = [];

  headers.forEach((header, idx) => {
    const headerLower = String(header || '').toLowerCase().trim();

    const isExcluded = (
      headerLower.includes('mudanças') ||
      headerLower.includes('mudancas') ||
      headerLower.includes('total') ||
      headerLower.includes('críticas') ||
      headerLower.includes('criticas') ||
      headerLower.includes('#') ||
      headerLower.includes('freq') ||
      headerLower.includes('padrão') ||
      headerLower.includes('padrao') ||
      headerLower.includes('duração') ||
      headerLower.includes('duracao') ||
      headerLower.includes('última atualização') ||
      headerLower.includes('ultima atualizacao') ||
      headerLower.includes('last updated') ||
      headerLower.includes('🕐')
    );

    if (isExcluded) return;

    const isDateColumn = (
      headerLower.includes('data') ||
      headerLower.includes('date') ||
      headerLower.includes('fecha') ||
      headerLower.includes('fecha de factura') ||
      headerLower.includes('fecha doc. timbrado') ||
      headerLower.includes('fecha doc timbrado') ||
      headerLower.includes('📅') ||
      headerLower.includes('⏰')
    );

    if (isDateColumn) {
      dateColumns.push({ idx, name: header });
    }
  });

  return dateColumns;
}

/**
 * Compatibilidade retroativa: chamadas legadas para o helper antigo.
 */
function identificarColunasDatas_(headers) {
  return identificarColunasDatasFiscalQ_(headers);
}

/**
 * Configura trigger para normalizacao de datas a cada 30 minutos
 */
// [MOVIDO PARA BACKUP 2026-02-21]
// Bloco de monitoramento/trigger e diagnóstico de datas removido do ativo.
// Backup: appscript/backup/Backup_CorrigirFiscalQ_Monitoramento_2026_02_21.gs
// Backup: appscript/backup/Backup_CorrigirFiscalQ_DiagnosticoDatas_2026_02_21.gs

/**
 * Recalcular Fiscal Q de todas as análises (chamada pelo menu)
 */
function recalcularFiscalQTodasAnalises() {
  // Tentar usar UI se disponível, senão executar direto
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    
    const response = ui.alert(
      '🔄 Recalcular Fiscal Q',
      'Esta função irá:\n' +
      '• PADRONIZAR todas as datas para DD/MM/AAAA\n' +
      '• Recalcular Fiscal Q de TODAS as análises (Ganhas, Perdidas, Pipeline)\n' +
      '• Recalcular Ciclo (dias) para todas as análises\n' +
      '• Usar data da última mudança de fase para WON/LOST\n' +
      '• Usar Período fiscal para Pipeline (sem parser de data)\n\n' +
      '⏱️ Tempo estimado: 2-5 minutos\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) return;
    
    ui.alert(
      '⏳ Processando...',
      'Padronizando datas e recalculando Fiscal Q e Ciclo.\n' +
      'Aguarde...\n\n' +
      'Não feche esta aba até o final.',
      ui.ButtonSet.OK
    );
  } catch (e) {
    console.log('⚠️ UI não disponível, executando sem confirmação...');
  }
  
  const startTime = new Date();
  const results = {
    ganhas: { total: 0, atualizados: 0, erros: 0, datesStd: 0 },
    perdidas: { total: 0, atualizados: 0, erros: 0, datesStd: 0 },
    pipeline: { total: 0, atualizados: 0, erros: 0, datesStd: 0 }
  };
  
  // CRÍTICO: Aplicar locale pt_BR GLOBALMENTE antes de processar qualquer aba
  // Isso garante que quando o código carregar Historico_Ganhos/Historico_Perdidas,
  // as datas já estarão interpretadas corretamente (DD/MM em vez de MM/DD)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const originalLocale = ss.getSpreadsheetLocale();
  let localeChanged = false;
  console.log(`🌍 Locale atual global: ${originalLocale}`);
  if (originalLocale !== 'pt_BR' && originalLocale !== 'pt-BR') {
    console.log('🔧 Alterando locale GLOBAL para pt_BR...');
    ss.setSpreadsheetLocale('pt_BR');
    localeChanged = true;
    console.log(`✅ Locale alterado para: ${ss.getSpreadsheetLocale()}`);
    
    // CRÍTICO: Limpar cache de sheets após mudar locale
    // Caso contrário, dados cached ainda terão datas interpretadas no formato antigo
    if (typeof invalidateSheetCache_ === 'function') {
      invalidateSheetCache_();
      console.log('🧹 Cache de sheets limpo após mudança de locale');
    }
  } else {
    console.log('✅ Locale já configurado como pt_BR');
  }
  
  try {
    // Processar Ganhas
    console.log('\n🏆 Recalculando Fiscal Q - Ganhas...');
    results.ganhas = recalcularFiscalQAba_('📈 Análise Ganhas', 'WON', false);
    
    // Processar Perdidas
    console.log('\n❌ Recalculando Fiscal Q - Perdidas...');
    results.perdidas = recalcularFiscalQAba_('📉 Análise Perdidas', 'LOST', false);
    
    // Processar Pipeline
    console.log('\n📊 Recalculando Fiscal Q - Pipeline...');
    results.pipeline = recalcularFiscalQAba_('🎯 Análise Forecast IA', 'OPEN', false);
    
    const duration = ((new Date() - startTime) / 1000).toFixed(1);
    const totalAtualizados = results.ganhas.atualizados + results.perdidas.atualizados + results.pipeline.atualizados;
    const totalErros = results.ganhas.erros + results.perdidas.erros + results.pipeline.erros;
    const totalDatesStd = results.ganhas.datesStd + results.perdidas.datesStd + results.pipeline.datesStd;
    
    logToSheet("INFO", "FiscalQ", 
      `Recálculo concluído: ${totalDatesStd} datas padronizadas, ${totalAtualizados} atualizados, ${totalErros} erros em ${duration}s`
    );
    
    const message = 
      `✅ Recálculo Concluído!\n\n` +
      `📅 Datas Padronizadas:\n` +
      `   • Ganhas: ${results.ganhas.datesStd}\n` +
      `   • Perdidas: ${results.perdidas.datesStd}\n` +
      `   • Pipeline: ${results.pipeline.datesStd}\n` +
      `   • Total: ${totalDatesStd}\n\n` +
      `📊 Fiscal Q & Ciclo Atualizados:\n` +
      `   • Ganhas: ${results.ganhas.atualizados}/${results.ganhas.total}\n` +
      `   • Perdidas: ${results.perdidas.atualizados}/${results.perdidas.total}\n` +
      `   • Pipeline: ${results.pipeline.atualizados}/${results.pipeline.total}\n\n` +
      `❌ Erros: ${totalErros}\n` +
      `⏱️ Duração: ${duration}s`;
    
    console.log('\n' + message);
    if (ui) {
      ui.alert('✅ Concluído', message, ui.ButtonSet.OK);
    }
    
  } catch (error) {
    console.error('❌ Erro no recálculo:', error);
    logToSheet("ERROR", "FiscalQ", `Erro: ${error.message}`);
    
    if (ui) {
      ui.alert(
        '❌ Erro',
        `Falha ao recalcular Fiscal Q:\n\n${error.message}\n\n` +
        `Verifique os logs para mais detalhes.`,
        ui.ButtonSet.OK
      );
    }
    throw error;
  } finally {
    if (localeChanged) {
      console.log(`↩️ Restaurando locale para ${originalLocale}...`);
      ss.setSpreadsheetLocale(originalLocale);
      if (typeof invalidateSheetCache_ === 'function') {
        invalidateSheetCache_();
        console.log('🧹 Cache de sheets limpo após restaurar locale');
      }
    }
  }
}

/**
 * Recalcula Fiscal Q de uma aba específica
 * @param {string} sheetName - Nome da aba
 * @param {string} mode - OPEN, WON ou LOST
 * @return {Object} { total, atualizados, erros }
 */
function recalcularFiscalQAba_(sheetName, mode, manageLocale = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    console.error(`   ❌ Aba ${sheetName} não encontrada`);
    return { total: 0, atualizados: 0, erros: 0, datesStd: 0 };
  }
  
  const originalLocale = ss.getSpreadsheetLocale();
  let localeChanged = false;

  if (manageLocale) {
    console.log(`   🌍 Locale atual da planilha: ${originalLocale}`);
    if (originalLocale !== 'pt_BR' && originalLocale !== 'pt-BR') {
      console.log('   🔧 Alterando locale para pt_BR...');
      ss.setSpreadsheetLocale('pt_BR');
      localeChanged = true;
      if (typeof invalidateSheetCache_ === 'function') {
        invalidateSheetCache_();
        console.log('   🧹 Cache de sheets limpo após mudança de locale');
      }
    }
  }

  try {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol <= 0) {
      console.log(`   ⚠️ Aba ${sheetName} vazia`);
      return { total: 0, atualizados: 0, erros: 0, datesStd: 0 };
    }

    const fullRange = sheet.getRange(1, 1, lastRow, lastCol);
    const data = fullRange.getValues();
    const displayData = fullRange.getDisplayValues();
    if (data.length <= 1) {
      console.log(`   ⚠️ Aba ${sheetName} vazia`);
      return { total: 0, atualizados: 0, erros: 0, datesStd: 0 };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    const displayRows = displayData.slice(1);
  
  // ========================================
  // FASE 1: PADRONIZAÇÃO DE TODAS AS DATAS
  // ========================================
  console.log(`\n   📅 FASE 1: Padronizando TODAS as datas para DD/MM/AAAA...`);
  
  // Identificar TODAS as colunas que contêm datas (usando helper que já tem exclusões corretas)
  const dateColumns = identificarColunasDatasFiscalQ_(headers);
  
  console.log(`   📋 ${dateColumns.length} colunas de data identificadas (excluindo contadores e métricas):`);
  dateColumns.forEach(col => {
    console.log(`      • [${col.idx + 1}] ${col.name}`);
  });
  
  let datesStandardized = 0;
  
  // IMPORTANTE: Aplicar formato de DATA em todas as colunas de data
  // Com locale pt_BR, o formato dd/mm/yyyy garante exibição correta
  console.log('   🔧 Aplicando formato de data dd/mm/yyyy em colunas de data...');
  dateColumns.forEach(col => {
    const colLetter = columnToLetter_(col.idx + 1);
    const range = sheet.getRange(`${colLetter}2:${colLetter}${rows.length + 1}`);
    range.setNumberFormat('dd/mm/yyyy');
  });
  SpreadsheetApp.flush();
  
  // Padronizar todas as datas encontradas - ESCREVER DATE OBJECTS, NAO STRINGS
  const columnBuffers = dateColumns.map(col => ({
    idx: col.idx,
    name: col.name,
    values: [],
    changed: false
  }));
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const displayRow = displayRows[i] || [];
    const rowIndex = i + 2;
    
    columnBuffers.forEach(buf => {
      const cellValue = row[buf.idx];
      const cellDisplay = displayRow[buf.idx];
      
      if (!cellValue || cellValue === '') {
        buf.values.push(cellValue);
        return;
      }
      
      try {
        let newValue = null;
        
        if (typeof cellValue === 'number' && cellValue < 1000) {
          buf.values.push(cellValue);
          return; // Pular - nao e data, e numero/contador
        }
        
        if (cellValue instanceof Date) {
          newValue = normalizeDateToNoon_(cellValue);
        } else if (typeof cellValue === 'string') {
          // Sem parser custom: reentrada estilo console para locale pt_BR
          const localeInput = String(cellDisplay || cellValue)
            .replace(/^['"]/, '')
            .trim()
            .replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?$/i, '')
            .replace(/T\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i, '')
            .replace(/[\.-]/g, '/');
          if (localeInput) {
            newValue = localeInput;
          }
        } else if (typeof cellValue === 'number') {
          const dateFromSerial = new Date((cellValue - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            newValue = normalizeDateToNoon_(dateFromSerial);
          }
        }
        
        if (newValue) {
          const valueChanged = (newValue instanceof Date)
            ? ((cellValue instanceof Date) ? cellValue.getTime() !== newValue.getTime() : true)
            : String(cellDisplay || cellValue || '').trim() !== String(newValue).trim();
          if (valueChanged) {
            buf.changed = true;
          }
          buf.values.push(newValue);
          datesStandardized++;
          
          if (i < 3) {
            const valueType = cellValue instanceof Date ? 'Date' : typeof cellValue;
            const displayValue = formatDateRobust(newValue);
            console.log(`      📅 [L${rowIndex}] ${buf.name}: ${cellValue} (tipo: ${valueType}) → ${displayValue}`);
          }
        } else {
          buf.values.push(cellValue);
        }
      } catch (error) {
        console.error(`      ⚠️ Erro ao padronizar [L${rowIndex}][${buf.name}]: ${error.message}`);
        buf.values.push(cellValue);
      }
    });
  }
  
  let anyWrites = false;
  columnBuffers.forEach(buf => {
    if (!buf.changed) return;
    const range = sheet.getRange(2, buf.idx + 1, rows.length, 1);
    range.setValues(buf.values.map(v => [v]));
    anyWrites = true;
  });
  if (anyWrites) SpreadsheetApp.flush();
  
  console.log(`   ✅ ${datesStandardized} datas padronizadas\n`);
  
  // Array de atualizacoes para logs na Fase 2
  const updates = [];
  
  // Recarregar dados após padronização
  // CRÍTICO: Usar getValues() para pegar Date objects nativos do Google Sheets
  // Com locale pt_BR + formato dd/mm/yyyy, os Date objects serão interpretados corretamente
  console.log(`   🔄 Recarregando dados após padronização...`);
  const dataAfterStd = sheet.getDataRange().getValues();
  const rowsAfterStd = dataAfterStd.slice(1);
  // ========================================
  // FASE 2: RECÁLCULO DE FISCAL Q E CICLO
  // ========================================
  console.log(`   🔢 FASE 2: Recalculando Fiscal Q e Ciclo...`);
  
  // Encontrar índices das colunas necessárias
  const colFiscalQ = headers.findIndex(h => 
    String(h).includes('Fiscal Q') || String(h).includes('Fiscal Quarter')
  );
  const colDataFechamento = findCloseDateColumn_(headers, mode);
  const colCiclo = headers.findIndex(h =>
    String(h).includes('Ciclo') && String(h).includes('dias')
  );
  const colOportunidade = headers.findIndex(h => 
    String(h).includes('Oportunidade') || String(h).includes('Opportunity')
  );
  const colDataCriacaoLocal = headers.findIndex(h =>
    String(h).toLowerCase().includes('data de criação') ||
    String(h).toLowerCase().includes('data de criacao') ||
    String(h).toLowerCase().includes('created date') ||
    String(h).toLowerCase().includes('create date')
  );
  const colPeriodoFiscal = headers.findIndex(h => {
    const hs = String(h).toLowerCase();
    return hs.includes('período fiscal') || hs.includes('periodo fiscal') || hs.includes('fiscal period');
  });
  
  if (colFiscalQ === -1) {
    console.error(`   ❌ Coluna "Fiscal Q" não encontrada em ${sheetName}`);
    return { total: 0, atualizados: 0, erros: 0, datesStd: datesStandardized };
  }
  
  if (colDataFechamento === -1) {
    console.error(`   ❌ Coluna de data não encontrada em ${sheetName}`);
    return { total: 0, atualizados: 0, erros: 0, datesStd: datesStandardized };
  }
  
  console.log(`   📊 Processando ${rowsAfterStd.length} linhas (após padronização)...`);
  console.log(`   📍 Fiscal Q: coluna ${colFiscalQ + 1} | Data: coluna ${colDataFechamento + 1} | Ciclo: coluna ${colCiclo + 1}`);
  if (colPeriodoFiscal >= 0) {
    console.log(`   📍 Período fiscal: coluna ${colPeriodoFiscal + 1}`);
  }
  if (colDataCriacaoLocal >= 0 && mode === 'OPEN') {
    console.log(`   📍 Data Criação (local): coluna ${colDataCriacaoLocal + 1}`);
  }
  
  let atualizados = 0;
  let erros = 0;
  // Buffers de colunas para escrita em lote na Fase 2

  const fiscalQValues = rowsAfterStd.map(row => [row[colFiscalQ]]);
  const closeDateValues = colDataFechamento >= 0
    ? rowsAfterStd.map(row => [row[colDataFechamento]])
    : null;
  const cicloValues = colCiclo >= 0
    ? rowsAfterStd.map(row => [row[colCiclo]])
    : null;
  let fiscalQChangedAny = false;
  let closeDateChangedAny = false;
  let cicloChangedAny = false;
  
  // Para WON/LOST: carregar Historico para pegar "Data da última mudança de fase" e "Data de criação"
  let historicoMap = null;
  let historicoHeaders = [];
  let colLastStageChange = -1;
  let colDataCriacao = -1;
  
  if (mode === 'WON' || mode === 'LOST') {
    const historicoSheetName = mode === 'WON' ? 'Historico_Ganhos' : 'Historico_Perdidas';
    const rawHistorico = getSheetData(historicoSheetName);
    
    if (rawHistorico && rawHistorico.values && rawHistorico.values.length > 0) {
      historicoHeaders = rawHistorico.headers;
      
      // Encontrar coluna "Data da última mudança de fase"
      colLastStageChange = historicoHeaders.findIndex(h => 
        String(h).toLowerCase().includes('última mudança de fase') ||
        String(h).toLowerCase().includes('ultima mudanca de fase') ||
        String(h).toLowerCase().includes('last stage change')
      );
      
      // Encontrar coluna "Data de criação"
      colDataCriacao = historicoHeaders.findIndex(h =>
        String(h).toLowerCase().includes('data de criação') ||
        String(h).toLowerCase().includes('data de criacao') ||
        String(h).toLowerCase().includes('created date') ||
        String(h).toLowerCase().includes('create date')
      );
      
      if (colLastStageChange >= 0 && colDataCriacao >= 0) {
        // Indexar por nome da oportunidade
        historicoMap = indexDataByMultiKey_(rawHistorico);
        console.log(`   🔄 Histórico carregado: ${rawHistorico.values.length} linhas de "${historicoSheetName}"`);
        console.log(`   📋 Coluna "Data última fase": índice ${colLastStageChange} ("${historicoHeaders[colLastStageChange]}")`);
        console.log(`   📋 Coluna "Data criação": índice ${colDataCriacao} ("${historicoHeaders[colDataCriacao]}")`);
        console.log(`   🔑 Map size: ${historicoMap.size} chaves únicas`);
      } else {
        console.warn(`   ⚠️ Colunas necessárias NÃO ENCONTRADAS em ${historicoSheetName}`);
        console.warn(`   📋 "Data última fase": ${colLastStageChange >= 0 ? 'OK' : 'NÃO ENCONTRADA'}`);
        console.warn(`   📋 "Data criação": ${colDataCriacao >= 0 ? 'OK' : 'NÃO ENCONTRADA'}`);
        console.warn(`   📋 Headers disponíveis: ${historicoHeaders.slice(0, 10).join(' | ')}`);
      }
    } else {
      console.warn(`   ⚠️ Aba "${historicoSheetName}" não encontrada ou vazia`);
    }
  }
  
  // Processar cada linha (agora com datas já padronizadas)
  for (let i = 0; i < rowsAfterStd.length; i++) {
    try {
      const row = rowsAfterStd[i];
      const rowIndex = i + 2; // +2 porque sheet é 1-based e tem header
      
      let closeDate = row[colDataFechamento];
      const oppName = colOportunidade >= 0 ? String(row[colOportunidade] || '') : '';
      const originalCloseDate = closeDate;
      const originalCiclo = colCiclo >= 0 ? row[colCiclo] : null;
      let dataCorrected = false;
      let dataCriacao = null;
      
      // Para OPEN (Pipeline): buscar data de criação da própria linha
      if (mode === 'OPEN' && colDataCriacaoLocal >= 0) {
        let createdDate = row[colDataCriacaoLocal];
        if (createdDate) {
          if (createdDate instanceof Date) {
            dataCriacao = normalizeDateToNoon_(createdDate);
          } else if (typeof createdDate === 'number' && createdDate > 1000) {
            dataCriacao = normalizeDateToNoon_(new Date((createdDate - 25569) * 86400 * 1000));
          }

          if (dataCriacao && !isNaN(dataCriacao.getTime())) {
            
            if (i < 3) {
              console.log(`   📅 [${i+1}] dataCriacao (local): ${dataCriacao.toDateString()} (${dataCriacao.getDate()}/${dataCriacao.getMonth()+1}/${dataCriacao.getFullYear()})`);
            }
          }
        }
      }
      
      // Para WON/LOST: buscar data da última mudança de fase no Historico
      if ((mode === 'WON' || mode === 'LOST') && historicoMap && oppName && colLastStageChange >= 0 && colDataCriacao >= 0) {
        const oppLookupKey = normText_(oppName);
        const relatedHistorico = historicoMap.get(oppLookupKey) || [];
        
        // Debug nas primeiras 3 linhas
        if (i < 3) {
          console.log(`   🔍 [${i+1}] Original: "${oppName}"`);
          console.log(`   🔑 [${i+1}] Normalizado: "${oppLookupKey}"`);
          console.log(`   📊 [${i+1}] Historico encontrado: ${relatedHistorico.length} linha(s)`);
        }
        
        if (relatedHistorico.length > 0) {
          // Pegar a data da última mudança de fase do histórico
          let lastStageDate = relatedHistorico[0][colLastStageChange];
          let createdDate = relatedHistorico[0][colDataCriacao];
          
          if (lastStageDate) {
            // Converter para Date object se necessário
            let parsedLastStageDate;
            if (lastStageDate instanceof Date) {
              parsedLastStageDate = lastStageDate;
            } else if (typeof lastStageDate === 'number') {
              parsedLastStageDate = new Date((lastStageDate - 25569) * 86400 * 1000);
            }
            
            if (parsedLastStageDate && !isNaN(parsedLastStageDate.getTime())) {
              closeDate = normalizeDateToNoon_(parsedLastStageDate);
              dataCorrected = true;
              
              if (i < 3) {
                const origDisplay = originalCloseDate instanceof Date ? 
                  formatDateRobust(originalCloseDate) : originalCloseDate;
                console.log(`   📅 [${i+1}] Data corrigida: ${origDisplay} → ${formatDateRobust(parsedLastStageDate)}`);
              }
            }
          } else if (i < 3) {
            console.log(`   ⚠️ [${i+1}] Data da última fase vazia no histórico`);
          }
          
          // Capturar data de criação para calcular ciclo
          if (createdDate) {
            // Converter para Date object se necessário
            if (createdDate instanceof Date) {
              dataCriacao = normalizeDateToNoon_(createdDate);
            } else if (typeof createdDate === 'number') {
              dataCriacao = normalizeDateToNoon_(new Date((createdDate - 25569) * 86400 * 1000));
            }
            
            if (i < 3 && dataCriacao) {
              console.log(`   📅 [${i+1}] dataCriacao: ${dataCriacao.getDate()}/${dataCriacao.getMonth()+1}/${dataCriacao.getFullYear()}`);
            }
          }
        }
      }
      
      // Pular se não tiver data
      if (!closeDate || closeDate === '') continue;
      
      // Parse da data (já padronizada na FASE 1 como Date object)
      let parsedDate;
      if (closeDate instanceof Date) {
        // Já é Date object, usar diretamente
        parsedDate = normalizeDateToNoon_(closeDate);
      } else if (typeof closeDate === 'number') {
        // Serial date
        parsedDate = normalizeDateToNoon_(new Date((closeDate - 25569) * 86400 * 1000));
      }
      
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        console.error(`   ⚠️ [${i+1}] Data inválida: ${closeDate}`);
        continue;
      }
      
      // Debug detalhado nas primeiras 3 linhas
      if (i < 3) {
        console.log(`   🔍 [${i+1}] closeDate: "${closeDate}" (tipo: ${closeDate instanceof Date ? 'Date' : typeof closeDate})`);
        console.log(`   📅 [${i+1}] PARSED: ${parsedDate.getDate()}/${parsedDate.getMonth()+1}/${parsedDate.getFullYear()}`);
        if (dataCriacao) {
          console.log(`   📅 [${i+1}] dataCriacao: ${dataCriacao.getDate()}/${dataCriacao.getMonth()+1}/${dataCriacao.getFullYear()}`);
        }
      }
      
      const oldFiscalQ = String(row[colFiscalQ] || '');
      let newFiscalQ = oldFiscalQ;

      if (mode === 'OPEN') {
        const pipelineFiscalRaw = colPeriodoFiscal >= 0 ? row[colPeriodoFiscal] : row[colFiscalQ];
        const fiscalFromPipeline = (typeof parsePipelineFiscalQuarter_ === 'function')
          ? parsePipelineFiscalQuarter_(pipelineFiscalRaw)
          : null;

        if (fiscalFromPipeline && fiscalFromPipeline.label) {
          newFiscalQ = fiscalFromPipeline.label;
        }
      } else {
        // WON/LOST continuam calculados pela data de fechamento consolidada
        const fiscal = calculateFiscalQuarter(parsedDate);
        newFiscalQ = fiscal.label;
      }
      
      // Calcular novo Ciclo (dias) se temos data de criação
      let newCiclo = null;
      if (dataCriacao && parsedDate) {
        newCiclo = Math.ceil((parsedDate - dataCriacao) / MS_PER_DAY);
        
        // VALIDAÇÃO: Ciclo negativo indica erro de interpretação de data
        if (newCiclo < 0) {
          console.error(`   ❌ [${i+1}] CICLO NEGATIVO DETECTADO (${newCiclo} dias)!`);
          console.error(`   📅 [${i+1}] closeDate: ${parsedDate.toISOString()} (${parsedDate.getDate()}/${parsedDate.getMonth()+1}/${parsedDate.getFullYear()})`);
          console.error(`   📅 [${i+1}] dataCriacao: ${dataCriacao.toISOString()} (${dataCriacao.getDate()}/${dataCriacao.getMonth()+1}/${dataCriacao.getFullYear()})`);
          console.error(`   ⚠️ [${i+1}] Oportunidade: "${oppName}"`);
          console.error(`   ⚠️ [${i+1}] Possível inversão DD/MM ↔ MM/DD nas datas!`);

          const fix = (typeof tryFixInvertedDates_ === 'function')
            ? tryFixInvertedDates_(dataCriacao, parsedDate)
            : { fixed: false };

          if (fix.fixed) {
            console.warn(`   ✅ [${i+1}] Inversão válida aplicada: ${fix.ciclo} dias`);
            newCiclo = fix.ciclo;
            parsedDate = fix.closed;
            dataCriacao = fix.created;
            closeDate = fix.closed;
            dataCorrected = true;
          } else {
            console.error(`   ❌ [${i+1}] Inversão segura não aplicável. Pulando cálculo de ciclo.`);
            newCiclo = null;
          }
        }
      }
      
      // Debug nas primeiras 3 linhas
      if (i < 3) {
        console.log(`   📊 [${i+1}] FiscalQ: "${oldFiscalQ}" → "${newFiscalQ}" (${oldFiscalQ === newFiscalQ ? 'IGUAL' : 'DIFERENTE'})`);
        if (newCiclo !== null) {
          console.log(`   ⏱️ [${i+1}] Ciclo: ${originalCiclo} → ${newCiclo} dias`);
        }
      }
      
      // Só atualizar se mudou alguma coisa
      const cicloChanged = newCiclo !== null && originalCiclo !== newCiclo;
      
      if (oldFiscalQ !== newFiscalQ || dataCorrected || cicloChanged) {
        if (oldFiscalQ !== newFiscalQ) {
          fiscalQValues[i][0] = newFiscalQ;
          fiscalQChangedAny = true;
        }
        if (dataCorrected && closeDateValues) {
          closeDateValues[i][0] = closeDate;
          closeDateChangedAny = true;
        }
        if (cicloChanged && cicloValues) {
          cicloValues[i][0] = newCiclo;
          cicloChangedAny = true;
        }

        // Adicionar update da Fase 2 ao array (já limpo após Fase 1)
        updates.push({
          row: rowIndex,
          colFiscalQ: colFiscalQ + 1,
          colDataFechamento: colDataFechamento + 1,
          colCiclo: colCiclo >= 0 ? colCiclo + 1 : -1,
          newFiscalQ: newFiscalQ,
          newDataFechamento: dataCorrected ? closeDate : null,
          newCiclo: newCiclo,
          oldFiscalQ: oldFiscalQ,
          oldDataFechamento: originalCloseDate,
          oldCiclo: originalCiclo,
          oppName: oppName
        });
        atualizados++;
      }
      
    } catch (error) {
      console.error(`   ⚠️ Erro na linha ${i + 2}: ${error.message}`);
      erros++;
    }
  }
  
  // Aplicar atualizações em batch
  if (updates.length > 0) {
    console.log(`   ✍️ Aplicando ${updates.length} atualizações...`);
    
    if (fiscalQChangedAny) {
      sheet.getRange(2, colFiscalQ + 1, rowsAfterStd.length, 1).setValues(fiscalQValues);
    }
    if (closeDateChangedAny && closeDateValues) {
      sheet.getRange(2, colDataFechamento + 1, rowsAfterStd.length, 1).setValues(closeDateValues);
    }
    if (cicloChangedAny && cicloValues) {
      sheet.getRange(2, colCiclo + 1, rowsAfterStd.length, 1).setValues(cicloValues);
    }
    SpreadsheetApp.flush();
    
    // Log das mudanças
    if (updates.length <= 10) {
      updates.forEach(u => {
        if (u.newDataFechamento || u.newCiclo !== null) {
          console.log(`      • ${u.oppName || 'linha ' + u.row}:`);
          if (u.newDataFechamento) {
            console.log(`        Data: ${formatDateRobust(u.oldDataFechamento)} → ${formatDateRobust(u.newDataFechamento)}`);
          }
          console.log(`        FiscalQ: ${u.oldFiscalQ} → ${u.newFiscalQ}`);
          if (u.newCiclo !== null) {
            console.log(`        Ciclo: ${u.oldCiclo} → ${u.newCiclo} dias`);
          }
        } else {
          console.log(`      • ${u.oppName || 'linha ' + u.row}: FiscalQ ${u.oldFiscalQ} → ${u.newFiscalQ}`);
        }
      });
    } else {
      console.log(`      • Primeiras 5:`);
      updates.slice(0, 5).forEach(u => {
        if (u.newDataFechamento || u.newCiclo !== null) {
          console.log(`        ${u.oppName || 'linha ' + u.row}: Data+FiscalQ+Ciclo atualizados`);
        } else {
          console.log(`        ${u.oppName || 'linha ' + u.row}: ${u.oldFiscalQ} → ${u.newFiscalQ}`);
        }
      });
      console.log(`      • ... e mais ${updates.length - 5}`);
    }
  }
  
  console.log(`   ✅ ${datesStandardized} datas padronizadas, ${atualizados} recalculados, ${erros} erros`);
  
    return {
      total: rowsAfterStd.length,
      atualizados: atualizados,
      erros: erros,
      datesStd: datesStandardized
    };
  } finally {
    if (manageLocale && localeChanged) {
      console.log(`   ↩️ Restaurando locale para ${originalLocale}...`);
      ss.setSpreadsheetLocale(originalLocale);
      if (typeof invalidateSheetCache_ === 'function') {
        invalidateSheetCache_();
        console.log('   🧹 Cache de sheets limpo após restaurar locale');
      }
    }
  }
}

/**
 * Converte índice de coluna (1-based) em letra (A, B, ..., Z, AA, AB, ...)
 * @param {number} column - Índice da coluna (1-based)
 * @return {string} Letra da coluna
 */
function columnToLetter_(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function normalizeDateToNoon_(dateObj) {
  if (!(dateObj instanceof Date)) return null;
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function findColumnByPatterns_(headers, patterns) {
  const normalize = (value) => {
    if (typeof normText_ === 'function') return normText_(value);
    return String(value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const normalizedPatterns = patterns.map(p => normalize(p));
  return headers.findIndex(h => {
    const normHeader = normalize(h);
    return normalizedPatterns.some(p => normHeader.includes(p));
  });
}

function findCloseDateColumn_(headers, mode) {
  const isOpen = mode === 'OPEN';
  const primary = isOpen
    ? ['data prevista', 'expected close']
    : ['data fechamento', 'close date', 'closed date'];
  const secondary = isOpen
    ? ['data fechamento', 'close date', 'closed date']
    : ['data prevista', 'expected close'];

  let idx = findColumnByPatterns_(headers, primary);
  if (idx === -1) idx = findColumnByPatterns_(headers, secondary);
  return idx;
}

/**
 * Atualiza Data Prevista e Fiscal Q da aba de análise de Pipeline.
 * Regras:
 * - Data Prevista passa a espelhar Data Fechamento (quando houver data de fechamento)
 * - Fiscal Q é atualizado EXCLUSIVAMENTE a partir de "Período fiscal" (sem fallback por data)
 */
function atualizarDataPrevistaEFiscalQPipeline() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🛠️ Atualizar Data Prevista + Fiscal Q (Pipeline)',
      'Esta função irá, na aba "🎯 Análise Forecast IA":\n' +
      '• Atualizar "Data Prevista" com o valor de "Data Fechamento"\n' +
      '• Atualizar "Fiscal Q" usando APENAS "Período fiscal"\n\n' +
      'Nenhum fallback por data será aplicado ao Fiscal Q.\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando atualização direta...');
  }

  const result = atualizarDataPrevistaEFiscalQPipeline_();
  const msg =
    `✅ Atualização concluída\n\n` +
    `• Linhas avaliadas: ${result.total}\n` +
    `• Data Prevista atualizada: ${result.dataPrevistaAtualizada}\n` +
    `• Fiscal Q atualizado: ${result.fiscalQAtualizado}\n` +
    `• Linhas com erro: ${result.erros}\n\n` +
    `Cabeçalhos usados:\n` +
    `• Base (${result.baseSheet}): Oportunidade="${result.headersUsados.baseOportunidade}", ` +
    `Período fiscal="${result.headersUsados.basePeriodoFiscal}", ` +
    `Data de fechamento="${result.headersUsados.baseDataFechamento}"\n` +
    `• Análise: Oportunidade="${result.headersUsados.analiseOportunidade}", ` +
    `Data Prevista="${result.headersUsados.analiseDataPrevista}", ` +
    `Fiscal Q="${result.headersUsados.analiseFiscalQ}"`;

  console.log(msg);
  if (ui) {
    ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  }
}

function atualizarDataPrevistaEFiscalQPipeline_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = '🎯 Análise Forecast IA';
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Aba ${sheetName} não encontrada`);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) {
    return { total: 0, dataPrevistaAtualizada: 0, fiscalQAtualizado: 0, erros: 0 };
  }

  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const data = range.getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Fonte de Período fiscal vem da BASE de pipeline (não da análise)
  const baseSheetName = (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto';
  const baseSheet = ss.getSheetByName(baseSheetName);
  if (!baseSheet || baseSheet.getLastRow() <= 1) {
    throw new Error(`Aba base "${baseSheetName}" não encontrada ou vazia`);
  }
  const baseData = baseSheet.getDataRange().getValues();
  const baseHeaders = baseData[0];
  const baseRows = baseData.slice(1);

  const colBaseOpp = findColumnByPatterns_(baseHeaders, ['nome da oportunidade', 'opportunity name', 'oportunidade']);
  const colBasePeriodoFiscal = findColumnByPatterns_(baseHeaders, ['período fiscal', 'periodo fiscal', 'fiscal period']);
  const colBaseDataFechamento = findColumnByPatterns_(baseHeaders, ['data de fechamento', 'data fechamento', 'close date', 'closed date']);

  if (colBaseOpp === -1) {
    throw new Error(`Coluna de oportunidade não encontrada na base "${baseSheetName}"`);
  }
  if (colBasePeriodoFiscal === -1) {
    throw new Error(`Coluna "Período fiscal" não encontrada na base "${baseSheetName}"`);
  }
  if (colBaseDataFechamento === -1) {
    throw new Error(`Coluna "Data de fechamento/Close Date" não encontrada na base "${baseSheetName}"`);
  }

  const fiscalByOpp = new Map();
  const closeDateByOpp = new Map();
  const normalizeDateForWrite_ = (rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    if (rawValue instanceof Date) {
      return normalizeDateToNoon_(rawValue) || rawValue;
    }
    if (typeof rawValue === 'number' && isFinite(rawValue) && rawValue > 1000) {
      const dt = new Date((rawValue - 25569) * 86400 * 1000);
      if (!isNaN(dt.getTime())) return normalizeDateToNoon_(dt) || dt;
    }
    const fmt = formatDateRobust(rawValue);
    return (fmt && fmt !== '-') ? fmt : null;
  };

  baseRows.forEach((row) => {
    const opp = String(row[colBaseOpp] || '').trim();
    if (!opp) return;
    const oppKey = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();

    const rawCloseDate = row[colBaseDataFechamento];
    const closeDateWriteValue = normalizeDateForWrite_(rawCloseDate);
    if (closeDateWriteValue !== null && !closeDateByOpp.has(oppKey)) {
      closeDateByOpp.set(oppKey, closeDateWriteValue);
    }

    const rawPeriodo = row[colBasePeriodoFiscal];
    const parsed = (typeof parsePipelineFiscalQuarter_ === 'function') ? parsePipelineFiscalQuarter_(rawPeriodo) : null;
    if (!parsed || !parsed.label) return;
    if (!fiscalByOpp.has(oppKey)) {
      fiscalByOpp.set(oppKey, parsed.label);
    }
  });

  const colDataPrevista = findColumnByPatterns_(headers, ['data prevista', 'expected close']);
  const colFiscalQ = findColumnByPatterns_(headers, ['fiscal q', 'fiscal quarter']);
  const colAnaliseOpp = findColumnByPatterns_(headers, ['oportunidade', 'opportunity']);

  if (colDataPrevista === -1) {
    throw new Error('Coluna "Data Prevista/Expected Close" não encontrada na análise de pipeline');
  }
  if (colFiscalQ === -1) {
    throw new Error('Coluna "Fiscal Q" não encontrada na análise de pipeline');
  }
  if (colAnaliseOpp === -1) {
    throw new Error('Coluna "Oportunidade" não encontrada na análise de pipeline');
  }

  let dataPrevistaAtualizada = 0;
  let fiscalQAtualizado = 0;
  let erros = 0;

  const dataPrevistaValues = rows.map(r => [r[colDataPrevista]]);
  const fiscalQValues = rows.map(r => [r[colFiscalQ]]);
  let dataPrevistaChangedAny = false;
  let fiscalQChangedAny = false;

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];

      // 1) Data Prevista <- Data de fechamento da BASE (Pipeline_Aberto)
      const analysisOpp = String(row[colAnaliseOpp] || '').trim();
      const analysisOppKey = (typeof normText_ === 'function') ? normText_(analysisOpp) : String(analysisOpp).toLowerCase().trim();

      const fechamentoBaseRaw = closeDateByOpp.get(analysisOppKey);
      const fechamentoBaseFmt = formatDateRobust(fechamentoBaseRaw);
      if (fechamentoBaseFmt && fechamentoBaseFmt !== '-') {
        const previstaAtualFmt = formatDateRobust(row[colDataPrevista]);
        if (previstaAtualFmt !== fechamentoBaseFmt) {
          dataPrevistaValues[i][0] = fechamentoBaseRaw;
          dataPrevistaChangedAny = true;
          dataPrevistaAtualizada++;
        }
      }

      // 2) Fiscal Q <- Período fiscal (SEM fallback por data)
      const fiscalFromPeriodo = fiscalByOpp.get(analysisOppKey);

      if (fiscalFromPeriodo) {
        const fiscalAtual = String(row[colFiscalQ] || '').trim();
        if (fiscalAtual !== fiscalFromPeriodo) {
          fiscalQValues[i][0] = fiscalFromPeriodo;
          fiscalQChangedAny = true;
          fiscalQAtualizado++;
        }
      }
    } catch (e) {
      erros++;
      console.error(`⚠️ Erro na linha ${i + 2}: ${e.message}`);
    }
  }

  if (dataPrevistaChangedAny) {
    sheet.getRange(2, colDataPrevista + 1, rows.length, 1).setValues(dataPrevistaValues);
  }
  if (fiscalQChangedAny) {
    sheet.getRange(2, colFiscalQ + 1, rows.length, 1).setValues(fiscalQValues);
  }
  if (dataPrevistaChangedAny || fiscalQChangedAny) {
    SpreadsheetApp.flush();
  }

  return {
    total: rows.length,
    dataPrevistaAtualizada,
    fiscalQAtualizado,
    erros,
    baseSheet: baseSheetName,
    headersUsados: {
      baseOportunidade: String(baseHeaders[colBaseOpp] || ''),
      basePeriodoFiscal: String(baseHeaders[colBasePeriodoFiscal] || ''),
      baseDataFechamento: String(baseHeaders[colBaseDataFechamento] || ''),
      analiseOportunidade: String(headers[colAnaliseOpp] || ''),
      analiseDataPrevista: String(headers[colDataPrevista] || ''),
      analiseFiscalQ: String(headers[colFiscalQ] || '')
    }
  };
}

/**
 * Preenche a coluna "Data de criação (DE ONDE PEGAR)" na análise de Pipeline
 * a partir da aba base "Pipeline_Aberto".
 *
 * Regras:
 * - Garante a existência da coluna na análise
 * - Mantém essa coluna como penúltima (antes de "🕐 Última Atualização")
 * - Faz match por Oportunidade
 */
function preencherDataCriacaoPipelineAnaliseUnico() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🧩 Preencher Data de criação (Pipeline → Análise)',
      'Esta função irá:\n' +
      '• Criar/garantir a coluna "Data de criação (DE ONDE PEGAR)" na aba de análise\n' +
      '• Posicionar essa coluna antes de "🕐 Última Atualização"\n' +
      '• Preencher valores a partir da base "Pipeline_Aberto" via Oportunidade\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando preenchimento direto...');
  }

  const result = preencherDataCriacaoPipelineAnaliseUnico_();
  const msg =
    `✅ Preenchimento concluído\n\n` +
    `• Linhas avaliadas: ${result.total}\n` +
    `• Coluna inserida: ${result.colunaInserida ? 'Sim' : 'Não'}\n` +
    `• Datas preenchidas/atualizadas: ${result.atualizados}\n` +
    `• Sem match na base: ${result.semMatch}\n` +
    `• Erros: ${result.erros}\n\n` +
    `Cabeçalhos usados:\n` +
    `• Base Oportunidade: "${result.headersUsados.baseOportunidade}"\n` +
    `• Base Data Criação: "${result.headersUsados.baseDataCriacao}"\n` +
    `• Análise Oportunidade: "${result.headersUsados.analiseOportunidade}"\n` +
    `• Análise Data Criação: "${result.headersUsados.analiseDataCriacao}"`;

  console.log(msg);
  if (ui) {
    ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  }
}

function preencherDataCriacaoPipelineAnaliseUnico_() {
  const ANALYSIS_SHEET = '🎯 Análise Forecast IA';
  const CREATED_HEADER = 'Data de criação';
  const LAST_UPDATE_HEADER = '🕐 Última Atualização';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const analysisSheet = ss.getSheetByName(ANALYSIS_SHEET);
  if (!analysisSheet) throw new Error(`Aba ${ANALYSIS_SHEET} não encontrada`);

  const baseSheetName = (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto';
  const baseSheet = ss.getSheetByName(baseSheetName);
  if (!baseSheet || baseSheet.getLastRow() <= 1) {
    throw new Error(`Aba base "${baseSheetName}" não encontrada ou vazia`);
  }

  const baseData = baseSheet.getDataRange().getValues();
  const baseHeaders = baseData[0];
  const baseRows = baseData.slice(1);

  const colBaseOpp = findColumnByPatterns_(baseHeaders, ['nome da oportunidade', 'opportunity name', 'oportunidade']);
  const colBaseCreated = findColumnByPatterns_(baseHeaders, [
    'data de criacao (de onde pegar)',
    'data de criação (de onde pegar)',
    'data de criacao de onde pegar',
    'data de criação de onde pegar',
    'data de criacao',
    'data de criação',
    'created date',
    'date created'
  ]);

  if (colBaseOpp === -1) throw new Error(`Coluna de oportunidade não encontrada na base "${baseSheetName}"`);
  if (colBaseCreated === -1) throw new Error(`Coluna de data de criação não encontrada na base "${baseSheetName}"`);

  const createdByOpp = new Map();
  const normalizeDateForWrite_ = (rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    if (rawValue instanceof Date) return normalizeDateToNoon_(rawValue) || rawValue;
    if (typeof rawValue === 'number' && isFinite(rawValue) && rawValue > 1000) {
      const dt = new Date((rawValue - 25569) * 86400 * 1000);
      if (!isNaN(dt.getTime())) return normalizeDateToNoon_(dt) || dt;
    }
    const fmt = formatDateRobust(rawValue);
    return (fmt && fmt !== '-') ? fmt : null;
  };

  baseRows.forEach((row) => {
    const opp = String(row[colBaseOpp] || '').trim();
    if (!opp) return;
    const oppKey = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
    if (createdByOpp.has(oppKey)) return;
    const normalizedCreated = normalizeDateForWrite_(row[colBaseCreated]);
    if (normalizedCreated !== null) createdByOpp.set(oppKey, normalizedCreated);
  });

  let headers = analysisSheet.getRange(1, 1, 1, analysisSheet.getMaxColumns()).getValues()[0];
  let colCreatedAnalysis = findColumnByPatterns_(headers, [
    'data de criacao',
    'data de criação',
    'data de criacao (de onde pegar)',
    'data de criação (de onde pegar)',
    'data de criacao de onde pegar',
    'data de criação de onde pegar'
  ]);
  const colLastUpdate = headers.findIndex(h => String(h || '').trim() === LAST_UPDATE_HEADER);
  let colunaInserida = false;

  if (colCreatedAnalysis === -1) {
    const insertAt = colLastUpdate >= 0 ? (colLastUpdate + 1) : (analysisSheet.getMaxColumns() + 1);
    analysisSheet.insertColumnBefore(insertAt);
    analysisSheet.getRange(1, insertAt).setValue(CREATED_HEADER);
    analysisSheet.getRange(1, insertAt).setBackground('#134f5c').setFontColor('white').setFontWeight('bold');
    colunaInserida = true;
    SpreadsheetApp.flush();
  }

  headers = analysisSheet.getRange(1, 1, 1, analysisSheet.getMaxColumns()).getValues()[0];
  colCreatedAnalysis = findColumnByPatterns_(headers, [
    'data de criacao',
    'data de criação',
    'data de criacao (de onde pegar)',
    'data de criação (de onde pegar)',
    'data de criacao de onde pegar',
    'data de criação de onde pegar'
  ]);
  const colAnaliseOpp = findColumnByPatterns_(headers, ['oportunidade', 'opportunity']);

  if (colCreatedAnalysis === -1) throw new Error('Falha ao localizar a coluna de Data de criação na análise');
  if (colAnaliseOpp === -1) throw new Error('Coluna "Oportunidade" não encontrada na análise de pipeline');

  const lastRow = analysisSheet.getLastRow();
  if (lastRow <= 1) {
    return {
      total: 0,
      colunaInserida,
      atualizados: 0,
      semMatch: 0,
      erros: 0,
      headersUsados: {
        baseOportunidade: String(baseHeaders[colBaseOpp] || ''),
        baseDataCriacao: String(baseHeaders[colBaseCreated] || ''),
        analiseOportunidade: String(headers[colAnaliseOpp] || ''),
        analiseDataCriacao: String(headers[colCreatedAnalysis] || '')
      }
    };
  }

  const rows = analysisSheet.getRange(2, 1, lastRow - 1, analysisSheet.getMaxColumns()).getValues();
  const createdValues = rows.map(r => [r[colCreatedAnalysis]]);

  let atualizados = 0;
  let semMatch = 0;
  let erros = 0;
  let changedAny = false;

  for (let i = 0; i < rows.length; i++) {
    try {
      const opp = String(rows[i][colAnaliseOpp] || '').trim();
      if (!opp) continue;
      const oppKey = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
      const createdBase = createdByOpp.get(oppKey);
      if (!createdBase) {
        semMatch++;
        continue;
      }

      const currentFmt = formatDateRobust(rows[i][colCreatedAnalysis]);
      const baseFmt = formatDateRobust(createdBase);
      if (baseFmt && baseFmt !== '-' && currentFmt !== baseFmt) {
        createdValues[i][0] = createdBase;
        atualizados++;
        changedAny = true;
      }
    } catch (e) {
      erros++;
      console.error(`⚠️ Erro na linha ${i + 2}: ${e.message}`);
    }
  }

  if (changedAny) {
    analysisSheet.getRange(2, colCreatedAnalysis + 1, rows.length, 1).setValues(createdValues);
  }

  analysisSheet.getRange(2, colCreatedAnalysis + 1, Math.max(1, lastRow - 1), 1).setNumberFormat('dd/mm/yyyy');
  SpreadsheetApp.flush();

  return {
    total: rows.length,
    colunaInserida,
    atualizados,
    semMatch,
    erros,
    headersUsados: {
      baseOportunidade: String(baseHeaders[colBaseOpp] || ''),
      baseDataCriacao: String(baseHeaders[colBaseCreated] || ''),
      analiseOportunidade: String(headers[colAnaliseOpp] || ''),
      analiseDataCriacao: String(headers[colCreatedAnalysis] || '')
    }
  };
}

// [ATIVO TEMPORARIAMENTE NO CORE]
// TODO (após finalização operacional): mover novamente este bloco para backup
// em `appscript/backup/Backup_CorrigirFiscalQ_EnriquecimentoIA_YYYY_MM_DD.gs`.
// Bloco de Enriquecimento IA (wrappers, limpeza/reenriquecimento, testes, trigger e core).

const ENRIQUECER_PERDIDAS_TRIGGER_HANDLER_ = 'executarTriggerEnriquecimentoPerdidasIA_';

function enriquecerForecastComSegmentacaoIA() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🏷️ Enriquecer Forecast (Preventa + Segmentação IA)',
      'Esta função irá, na aba "🎯 Análise Forecast IA":\n' +
      '• Garantir as colunas de enriquecimento antes de "🕐 Última Atualização"\n' +
      '• Preencher Owner Preventa, Produtos, Cidade/Estado de cobrança via Pipeline_Aberto\n' +
      '• Classificar Vertical/Sub-vertical/Sub-sub-vertical com regra + IA (fallback)\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando enriquecimento direto...');
  }

  const result = enriquecerForecastComSegmentacaoIA_();

  let msg;
  if (result.skipped) {
    msg = `⏭️ Enriquecimento pulado\n\n${result.skipReason}`;
  } else {
    const taxaSucessoIA = result.tentativasIA > 0 ? Math.round((result.tentativasIA - result.falhasIA) / result.tentativasIA * 100) : 0;
    msg =
      `✅ Enriquecimento concluído\n\n` +
      `• Linhas avaliadas: ${result.totalAvaliadas || result.total}\n` +
      `• Linhas já classificadas (puladas): ${result.linhasPuladas || 0}\n` +
      `• Linhas processadas agora: ${result.total}\n` +
      `• Colunas inseridas: ${result.colunasInseridas}\n` +
      `• Campos base atualizados: ${result.baseAtualizados}\n` +
      `• Classificações por regra: ${result.classificadosRegra}\n` +
      `• Classificações por IA: ${result.classificadosIA}\n` +
      `• Tentativas de IA: ${result.tentativasIA} (${taxaSucessoIA}% sucesso)\n` +
      `• Classificações por busca: ${result.classificadosBusca}\n` +
      `• Pendentes revisão: ${result.pendentes}\n` +
      `• Erros: ${result.erros}`;
  }

  console.log(msg);
  if (ui) {
    ui.alert(result.skipped ? '⏭️ Pulado' : '✅ Concluído', msg, ui.ButtonSet.OK);
  }
}

function enriquecerForecastComSegmentacaoIA_() {
  return enriquecerAnaliseComSegmentacaoIA_('🎯 Análise Forecast IA', (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto');
}

function enriquecerForecast_TESTE_5_LINHAS() {
  console.log('🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE: Processando apenas as 5 primeiras linhas');
  console.log('🧪 ═══════════════════════════════════════════════════\n');

  const result = enriquecerAnaliseComSegmentacaoIA_('🎯 Análise Forecast IA', (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto', 5);

  console.log('\n🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE CONCLUÍDO - Resultados:');
  console.log(`   • Linhas avaliadas: ${result.totalAvaliadas || result.total}`);
  console.log(`   • Linhas puladas (já tinham classificação): ${result.linhasPuladas || 0}`);
  console.log(`   • Linhas processadas: ${result.total}`);
  console.log(`   • Classificações por regra: ${result.classificadosRegra}`);
  console.log(`   • Classificações por IA: ${result.classificadosIA}`);
  console.log(`   • Tentativas de IA: ${result.tentativasIA}`);
  console.log(`   • Falhas de IA: ${result.falhasIA}`);
  console.log(`   • Pendentes: ${result.pendentes}`);
  console.log(`   • Erros: ${result.erros}`);
  console.log('🧪 ═══════════════════════════════════════════════════');

  return result;
}

function limparClassificacaoIA_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Aba "${sheetName}" não encontrada`);

  const headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
  const colV = headers.findIndex(h => String(h).trim() === 'Vertical IA');
  const colSV = headers.findIndex(h => String(h).trim() === 'Sub-vertical IA');
  const colSSV = headers.findIndex(h => String(h).trim() === 'Sub-sub-vertical IA');

  if (colV === -1) {
    console.warn(`⚠️ Coluna "Vertical IA" não encontrada em "${sheetName}"`);
    return 0;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;

  const numRows = lastRow - 1;
  sheet.getRange(2, colV + 1, numRows, 1).clearContent();
  if (colSV > -1) sheet.getRange(2, colSV + 1, numRows, 1).clearContent();
  if (colSSV > -1) sheet.getRange(2, colSSV + 1, numRows, 1).clearContent();
  SpreadsheetApp.flush();

  console.log(`🗑️ Limpeza concluída: ${numRows} linhas de classificação removidas em "${sheetName}"`);
  return numRows;
}

function limparEReenriquecerForecast() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  const sheetName = '🎯 Análise Forecast IA';

  if (ui) {
    const r = ui.alert('🔄 Limpar e Reclassificar Forecast',
      `Esta ação vai APAGAR todas as classificações IA existentes em "${sheetName}" e reclassificar do zero.\n\nContinuar?`,
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  const cleared = limparClassificacaoIA_(sheetName);
  console.log(`🔄 Iniciando reclassificação de ${cleared} linhas no Forecast...`);
  enriquecerForecastComSegmentacaoIA();
}

function limparEReenriquecerGanhas() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  const sheetName = '📈 Análise Ganhas';

  if (ui) {
    const r = ui.alert('🔄 Limpar e Reclassificar Ganhas',
      `Esta ação vai APAGAR todas as classificações IA existentes em "${sheetName}" e reclassificar do zero.\n\nContinuar?`,
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  const cleared = limparClassificacaoIA_(sheetName);
  console.log(`🔄 Iniciando reclassificação de ${cleared} linhas em Ganhas...`);
  enriquecerAnaliseGanhasComSegmentacaoIA();
}

function limparEReenriquecerPerdidas() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  const sheetName = '📉 Análise Perdidas';

  if (ui) {
    const r = ui.alert('🔄 Limpar e Reclassificar Perdidas',
      `Esta ação vai APAGAR todas as classificações IA existentes em "${sheetName}" e reclassificar do zero.\n\nContinuar?`,
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  const cleared = limparClassificacaoIA_(sheetName);
  console.log(`🔄 Iniciando reclassificação de ${cleared} linhas em Perdidas...`);
  enriquecerAnalisePerdidasComSegmentacaoIA();
}

function limparEReenriquecerTodas() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  if (ui) {
    const r = ui.alert('🔄 Limpar + Reclassificar Todas',
      'Esta ação vai APAGAR todas as classificações IA de Forecast + Ganhas + Perdidas e reclassificar do zero.\n\nContinuar?',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }

  console.log('🗑️ Limpando classificações de todas as abas...');
  const c1 = limparClassificacaoIA_('🎯 Análise Forecast IA');
  const c2 = limparClassificacaoIA_('📈 Análise Ganhas');
  const c3 = limparClassificacaoIA_('📉 Análise Perdidas');
  console.log(`🗑️ Limpas: Forecast ${c1} | Ganhas ${c2} | Perdidas ${c3} linhas`);

  console.log('\n🔄 Reclassificando Forecast...');
  enriquecerForecastComSegmentacaoIA();
  console.log('\n🔄 Reclassificando Ganhas...');
  enriquecerAnaliseGanhasComSegmentacaoIA();
  console.log('\n🔄 Reclassificando Perdidas...');
  enriquecerAnalisePerdidasComSegmentacaoIA();
}

function enriquecerGanhas_TESTE_5_LINHAS() {
  console.log('🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE GANHAS: Processando apenas as 5 primeiras linhas');
  console.log('🧪 ═══════════════════════════════════════════════════\n');

  const result = enriquecerAnaliseComSegmentacaoIA_('📈 Análise Ganhas', (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos', 5);

  console.log('\n🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE GANHAS CONCLUÍDO - Resultados:');
  console.log(`   • Linhas avaliadas: ${result.totalAvaliadas || result.total}`);
  console.log(`   • Linhas puladas (já tinham classificação): ${result.linhasPuladas || 0}`);
  console.log(`   • Linhas processadas: ${result.total}`);
  console.log(`   • Classificações por regra: ${result.classificadosRegra}`);
  console.log(`   • Classificações por IA: ${result.classificadosIA}`);
  console.log(`   • Tentativas de IA: ${result.tentativasIA}`);
  console.log(`   • Falhas de IA: ${result.falhasIA}`);
  console.log(`   • Pendentes: ${result.pendentes}`);
  console.log(`   • Erros: ${result.erros}`);
  console.log('🧪 ═══════════════════════════════════════════════════');

  return result;
}

function enriquecerPerdidas_TESTE_5_LINHAS() {
  console.log('🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE PERDIDAS: Processando apenas as 5 primeiras linhas');
  console.log('🧪 ═══════════════════════════════════════════════════\n');

  const result = enriquecerAnaliseComSegmentacaoIA_('📉 Análise Perdidas', (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas', 5);

  console.log('\n🧪 ═══════════════════════════════════════════════════');
  console.log('🧪 TESTE PERDIDAS CONCLUÍDO - Resultados:');
  console.log(`   • Linhas avaliadas: ${result.totalAvaliadas || result.total}`);
  console.log(`   • Linhas puladas (já tinham classificação): ${result.linhasPuladas || 0}`);
  console.log(`   • Linhas processadas: ${result.total}`);
  console.log(`   • Classificações por regra: ${result.classificadosRegra}`);
  console.log(`   • Classificações por IA: ${result.classificadosIA}`);
  console.log(`   • Tentativas de IA: ${result.tentativasIA}`);
  console.log(`   • Falhas de IA: ${result.falhasIA}`);
  console.log(`   • Pendentes: ${result.pendentes}`);
  console.log(`   • Erros: ${result.erros}`);
  console.log('🧪 ═══════════════════════════════════════════════════');

  return result;
}

function enriquecerAnaliseGanhasComSegmentacaoIA() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🏷️ Enriquecer Análise Ganhas',
      'Esta função irá enriquecer a aba "📈 Análise Ganhas" com dados base e Segmentação IA.\n\nContinuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando enriquecimento de Ganhas direto...');
  }

  const result = enriquecerAnaliseComSegmentacaoIA_('📈 Análise Ganhas', (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos');

  let msg;
  if (result.skipped) {
    msg = `⏭️ Enriquecimento Ganhas pulado\n\n${result.skipReason}`;
  } else {
    const taxaSucessoIA = result.tentativasIA > 0 ? Math.round((result.tentativasIA - result.falhasIA) / result.tentativasIA * 100) : 0;
    msg =
      `✅ Enriquecimento Ganhas concluído\n\n` +
      `• Linhas avaliadas: ${result.totalAvaliadas || result.total}\n` +
      `• Linhas já classificadas (puladas): ${result.linhasPuladas || 0}\n` +
      `• Linhas processadas agora: ${result.total}\n` +
      `• Colunas inseridas: ${result.colunasInseridas}\n` +
      `• Campos base atualizados: ${result.baseAtualizados}\n` +
      `• Classificações por regra: ${result.classificadosRegra}\n` +
      `• Classificações por IA: ${result.classificadosIA}\n` +
      `• Tentativas de IA: ${result.tentativasIA} (${taxaSucessoIA}% sucesso)\n` +
      `• Classificações por busca: ${result.classificadosBusca}\n` +
      `• Pendentes revisão: ${result.pendentes}\n` +
      `• Erros: ${result.erros}`;
  }

  console.log(msg);
  if (ui) ui.alert(result.skipped ? '⏭️ Pulado' : '✅ Concluído', msg, ui.ButtonSet.OK);
}

function enriquecerAnalisePerdidasComSegmentacaoIA() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🏷️ Enriquecer Análise Perdidas',
      'Esta função irá enriquecer a aba "📉 Análise Perdidas" com dados base e Segmentação IA.\n\nContinuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando enriquecimento de Perdidas direto...');
  }

  const result = enriquecerAnaliseComSegmentacaoIA_('📉 Análise Perdidas', (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas');

  let msg;
  if (result.skipped) {
    msg = `⏭️ Enriquecimento Perdidas pulado\n\n${result.skipReason}`;
  } else {
    const taxaSucessoIA = result.tentativasIA > 0 ? Math.round((result.tentativasIA - result.falhasIA) / result.tentativasIA * 100) : 0;
    msg =
      `✅ Enriquecimento Perdidas concluído\n\n` +
      `• Linhas avaliadas: ${result.totalAvaliadas || result.total}\n` +
      `• Linhas já classificadas (puladas): ${result.linhasPuladas || 0}\n` +
      `• Linhas processadas agora: ${result.total}\n` +
      `• Colunas inseridas: ${result.colunasInseridas}\n` +
      `• Campos base atualizados: ${result.baseAtualizados}\n` +
      `• Classificações por regra: ${result.classificadosRegra}\n` +
      `• Classificações por IA: ${result.classificadosIA}\n` +
      `• Tentativas de IA: ${result.tentativasIA} (${taxaSucessoIA}% sucesso)\n` +
      `• Classificações por busca: ${result.classificadosBusca}\n` +
      `• Pendentes revisão: ${result.pendentes}\n` +
      `• Erros: ${result.erros}`;
  }

  console.log(msg);
  if (ui) ui.alert(result.skipped ? '⏭️ Pulado' : '✅ Concluído', msg, ui.ButtonSet.OK);
}

function enriquecerAnalisePerdidasComSegmentacaoIA_SEM_UI_() {
  return enriquecerAnaliseComSegmentacaoIA_(
    '📉 Análise Perdidas',
    (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas'
  );
}

function executarEnriquecimentoPerdidasIASemPopup() {
  const result = enriquecerAnalisePerdidasComSegmentacaoIA_SEM_UI_();
  console.log(
    `🤖 Execução manual sem popup (Perdidas IA) | avaliadas: ${result.totalAvaliadas || result.total || 0} | ` +
    `processadas: ${result.total || 0} | puladas: ${result.linhasPuladas || 0} | erros: ${result.erros || 0}`
  );
  return result;
}

function executarTriggerEnriquecimentoPerdidasIA_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('⏳ Trigger Perdidas IA já em execução. Pulando ciclo.');
    return;
  }

  try {
    const result = enriquecerAnalisePerdidasComSegmentacaoIA_SEM_UI_();
    console.log(
      `🤖 Trigger Perdidas IA executado | avaliadas: ${result.totalAvaliadas || result.total || 0} | ` +
      `processadas: ${result.total || 0} | puladas: ${result.linhasPuladas || 0} | erros: ${result.erros || 0}`
    );
  } catch (e) {
    console.error(`❌ Trigger Perdidas IA falhou: ${e.message}`);
    if (typeof logToSheet === 'function') {
      logToSheet('ERROR', 'EnriquecimentoPerdidasIA', `Falha no trigger: ${e.message}`);
    }
  } finally {
    lock.releaseLock();
  }
}

function ativarTriggerEnriquecimentoPerdidasIA() {
  const ui = (() => {
    try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
  })();

  if (ui) {
    const response = ui.alert(
      '⚙️ Ativar Trigger: Enriquecimento Perdidas IA',
      'Deseja ativar trigger automático para enriquecimento de Perdidas?\n\n' +
      '• Frequência: a cada 15 minutos\n' +
      '• Pula linhas já preenchidas automaticamente\n' +
      '• Pode continuar processamento em lotes (evita timeout manual)\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_(ENRIQUECER_PERDIDAS_TRIGGER_HANDLER_);
  ScriptApp.newTrigger(ENRIQUECER_PERDIDAS_TRIGGER_HANDLER_)
    .timeBased()
    .everyMinutes(15)
    .create();

  const msg = '✅ Trigger de Enriquecimento Perdidas IA ativado (15 min).';
  if (ui) ui.alert('Ativado', msg, ui.ButtonSet.OK);
  console.log(msg);
}

function desativarTriggerEnriquecimentoPerdidasIA() {
  const ui = (() => {
    try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
  })();

  if (ui) {
    const response = ui.alert(
      '🛑 Desativar Trigger: Enriquecimento Perdidas IA',
      'Remover trigger automático de enriquecimento de Perdidas?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_(ENRIQUECER_PERDIDAS_TRIGGER_HANDLER_);

  const msg = '✅ Trigger de Enriquecimento Perdidas IA desativado.';
  if (ui) ui.alert('Desativado', msg, ui.ButtonSet.OK);
  console.log(msg);
}

function enriquecerTodasAnalisesComSegmentacaoIA() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🏷️ Enriquecer Todas as Análises',
      'Executar enriquecimento em Forecast + Ganhas + Perdidas?\n\nContinuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando enriquecimento completo direto...');
  }

  let forecast, won, lost;
  const results = [];

  try {
    console.log('\n🎯 Iniciando enriquecimento de Forecast...');
    forecast = enriquecerAnaliseComSegmentacaoIA_('🎯 Análise Forecast IA', (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto');
    if (forecast.skipped) {
      results.push(`Forecast: ⏭️ Pulado - ${forecast.skipReason}`);
    } else {
      const taxaIA = forecast.tentativasIA > 0 ? Math.round((forecast.tentativasIA - forecast.falhasIA) / forecast.tentativasIA * 100) : 0;
      results.push(`Forecast: ${forecast.total} linhas | Regra ${forecast.classificadosRegra} | IA ${forecast.classificadosIA} (${forecast.tentativasIA} tentativas, ${taxaIA}% sucesso) | Pendentes ${forecast.pendentes}`);
    }
  } catch (e) {
    console.error('❌ Erro ao enriquecer Forecast:', e.message);
    forecast = { error: e.message, total: 0 };
    results.push(`Forecast: ❌ ${e.message}`);
  }

  try {
    console.log('\n📈 Iniciando enriquecimento de Ganhas...');
    won = enriquecerAnaliseComSegmentacaoIA_('📈 Análise Ganhas', (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos');
    if (won.skipped) {
      results.push(`Ganhas: ⏭️ Pulado - ${won.skipReason}`);
    } else {
      const taxaIA = won.tentativasIA > 0 ? Math.round((won.tentativasIA - won.falhasIA) / won.tentativasIA * 100) : 0;
      results.push(`Ganhas: ${won.total} linhas | Regra ${won.classificadosRegra} | IA ${won.classificadosIA} (${won.tentativasIA} tentativas, ${taxaIA}% sucesso) | Pendentes ${won.pendentes}`);
    }
  } catch (e) {
    console.error('❌ Erro ao enriquecer Ganhas:', e.message);
    won = { error: e.message, total: 0 };
    results.push(`Ganhas: ❌ ${e.message}`);
  }

  try {
    console.log('\n📉 Iniciando enriquecimento de Perdidas...');
    lost = enriquecerAnaliseComSegmentacaoIA_('📉 Análise Perdidas', (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas');
    if (lost.skipped) {
      results.push(`Perdidas: ⏭️ Pulado - ${lost.skipReason}`);
    } else {
      const taxaIA = lost.tentativasIA > 0 ? Math.round((lost.tentativasIA - lost.falhasIA) / lost.tentativasIA * 100) : 0;
      results.push(`Perdidas: ${lost.total} linhas | Regra ${lost.classificadosRegra} | IA ${lost.classificadosIA} (${lost.tentativasIA} tentativas, ${taxaIA}% sucesso) | Pendentes ${lost.pendentes}`);
    }
  } catch (e) {
    console.error('❌ Erro ao enriquecer Perdidas:', e.message);
    lost = { error: e.message, total: 0 };
    results.push(`Perdidas: ❌ ${e.message}`);
  }

  const msg = `✅ Enriquecimento completo concluído\n\n` + results.join('\n');

  console.log(msg);
  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);

  return { forecast, won, lost };
}

function enriquecerAnaliseComSegmentacaoIA_(analysisSheetName, baseSheetName, maxLinesToProcess) {
  const ANALYSIS_SHEET = '🎯 Análise Forecast IA';
  const LAST_UPDATE_HEADER = '🕐 Última Atualização';
  const REQUIRED_HEADERS = [
    'Owner Preventa',
    'Produtos',
    'Cidade de cobrança',
    'Estado/Província de cobrança',
    'Vertical IA',
    'Sub-vertical IA',
    'Sub-sub-vertical IA'
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const analysisSheet = ss.getSheetByName(analysisSheetName || ANALYSIS_SHEET);
  if (!analysisSheet) throw new Error(`Aba ${analysisSheetName || ANALYSIS_SHEET} não encontrada`);

  const colunasInseridas = ensureColumnsBeforeLastUpdate_(analysisSheet, REQUIRED_HEADERS, LAST_UPDATE_HEADER);

  const analysisLastRow = analysisSheet.getLastRow();
  const analysisMaxCol = analysisSheet.getMaxColumns();
  if (analysisLastRow <= 1 || analysisMaxCol <= 0) {
    return {
      total: 0,
      colunasInseridas,
      baseAtualizados: 0,
      classificadosRegra: 0,
      classificadosIA: 0,
      classificadosBusca: 0,
      pendentes: 0,
      erros: 0
    };
  }

  const analysisRange = analysisSheet.getRange(1, 1, analysisLastRow, analysisMaxCol);
  const analysisData = analysisRange.getValues();
  const analysisHeaders = analysisData[0];
  const analysisRows = analysisData.slice(1);

  const baseSheet = ss.getSheetByName(baseSheetName);
  if (!baseSheet) {
    throw new Error(`Aba base "${baseSheetName}" não encontrada`);
  }
  if (baseSheet.getLastRow() <= 1) {
    console.warn(`⚠️ Aba base "${baseSheetName}" está vazia (apenas header ou sem dados). Pulando enriquecimento.`);
    return {
      total: 0,
      colunasInseridas,
      baseAtualizados: 0,
      classificadosRegra: 0,
      classificadosIA: 0,
      classificadosBusca: 0,
      pendentes: 0,
      erros: 0,
      skipped: true,
      skipReason: `Aba base "${baseSheetName}" vazia`
    };
  }

  const baseData = baseSheet.getDataRange().getValues();
  const baseHeaders = baseData[0];
  const baseRows = baseData.slice(1);

  const colBaseOpp = findColumnByPatterns_(baseHeaders, ['nome da oportunidade', 'opportunity name', 'oportunidade']);
  const colBaseConta = findColumnByPatterns_(baseHeaders, ['nome da conta', 'account name', 'conta']);
  const colBaseProdutos = findColumnByPatterns_(baseHeaders, ['produtos', 'products', 'product name', 'nome do produto']);
  const colBaseOwnerPreventa = findColumnByPatterns_(baseHeaders, ['owner preventa', 'preventa', 'preventa principal', 'owner pre sales', 'pre sales owner']);
  const colBaseBillingCity = findColumnByPatterns_(baseHeaders, ['cidade de cobrança', 'cidade de cobranca', 'billing city']);
  const colBaseBillingState = findColumnByPatterns_(baseHeaders, ['estado/província de cobrança', 'estado/provincia de cobranca', 'estado de cobrança', 'estado de cobranca', 'billing state/province', 'billing state']);

  if (colBaseOpp === -1) {
    throw new Error(`Coluna de oportunidade não encontrada na base "${baseSheetName}"`);
  }

  const baseByOpp = new Map();
  baseRows.forEach((row) => {
    const opp = String(row[colBaseOpp] || '').trim();
    if (!opp) return;
    const key = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
    if (baseByOpp.has(key)) return;
    baseByOpp.set(key, {
      conta: colBaseConta > -1 ? String(row[colBaseConta] || '').trim() : '',
      produtos: colBaseProdutos > -1 ? String(row[colBaseProdutos] || '').trim() : '',
      ownerPreventa: colBaseOwnerPreventa > -1 ? String(row[colBaseOwnerPreventa] || '').trim() : '',
      billingCity: colBaseBillingCity > -1 ? String(row[colBaseBillingCity] || '').trim() : '',
      billingState: colBaseBillingState > -1 ? String(row[colBaseBillingState] || '').trim() : ''
    });
  });

  const colOpp = findColumnByPatterns_(analysisHeaders, ['oportunidade', 'opportunity']);
  const colConta = findColumnByPatterns_(analysisHeaders, ['conta', 'account']);
  const colOwnerPreventa = findLastHeaderIndexExact_(analysisHeaders, 'Owner Preventa');
  const colProdutos = findLastHeaderIndexExact_(analysisHeaders, 'Produtos');
  const colCidade = findLastHeaderIndexExact_(analysisHeaders, 'Cidade de cobrança');
  const colEstado = findLastHeaderIndexExact_(analysisHeaders, 'Estado/Província de cobrança');
  const colVertical = findLastHeaderIndexExact_(analysisHeaders, 'Vertical IA');
  const colSubVertical = findLastHeaderIndexExact_(analysisHeaders, 'Sub-vertical IA');
  const colSubSubVertical = findLastHeaderIndexExact_(analysisHeaders, 'Sub-sub-vertical IA');

  console.log(`\n📋 Colunas de classificação encontradas:`);
  console.log(`   Vertical IA: coluna ${colVertical} (${colVertical > -1 ? analysisHeaders[colVertical] : 'NÃO ENCONTRADA'})`);
  console.log(`   Sub-vertical IA: coluna ${colSubVertical} (${colSubVertical > -1 ? analysisHeaders[colSubVertical] : 'NÃO ENCONTRADA'})`);
  console.log(`   Sub-sub-vertical IA: coluna ${colSubSubVertical} (${colSubSubVertical > -1 ? analysisHeaders[colSubSubVertical] : 'NÃO ENCONTRADA'})`);
  console.log(`   Owner Preventa: coluna ${colOwnerPreventa} (${colOwnerPreventa > -1 ? analysisHeaders[colOwnerPreventa] : 'NÃO ENCONTRADA'})`);
  console.log(`   Cidade de cobrança: coluna ${colCidade} (${colCidade > -1 ? analysisHeaders[colCidade] : 'NÃO ENCONTRADA'})`);
  console.log(`   Estado/Província: coluna ${colEstado} (${colEstado > -1 ? analysisHeaders[colEstado] : 'NÃO ENCONTRADA'})`);
  const gravarContíguo = colOwnerPreventa > -1 && colSubSubVertical === colOwnerPreventa + 5;
  console.log(`   💾 Escrita contígua (1 chamada/linha): ${gravarContíguo ? '✅ SIM (colunas ' + colOwnerPreventa + '-' + colSubSubVertical + ')' : '⚠️ NÃO (fallback individual)'}\n`);

  const outputRows = analysisRows.map(r => r.slice());
  let baseAtualizados = 0;
  let classificadosRegra = 0;
  let classificadosIA = 0;
  let classificadosBusca = 0;
  let pendentes = 0;
  let erros = 0;
  let tentativasIA = 0;
  let falhasIA = 0;

  const classificationByAccount = new Map();

  const iaDisponivel = typeof callGeminiAPI === 'function' && typeof cleanAndParseJSON === 'function';
  if (!iaDisponivel) {
    console.warn('⚠️ ATENÇÃO: Funções de IA não disponíveis. callGeminiAPI ou cleanAndParseJSON não encontradas.');
    console.warn('⚠️ Todas as contas sem match de regra serão marcadas como PENDING.');
  } else {
    console.log('✅ Funções de IA disponíveis. Fallback IA ativo para contas sem match de regra.');
  }

  const linhasAProcessar = maxLinesToProcess && maxLinesToProcess > 0
    ? Math.min(maxLinesToProcess, outputRows.length)
    : outputRows.length;

  const scriptStartTime = Date.now();
  const MAX_EXECUTION_SECONDS = 300;

  if (maxLinesToProcess && maxLinesToProcess > 0) {
    console.log(`\n🧪 MODO TESTE: Processando apenas ${linhasAProcessar} de ${outputRows.length} linhas\n`);
  } else {
    console.log(`\n📊 Processando ${linhasAProcessar} linhas...\n`);
  }

  let linhasPuladas = 0;
  let linhasProcessadas = 0;

  for (let i = 0; i < linhasAProcessar; i++) {
    if (i > 0 && i % 10 === 0) {
      if (!maxLinesToProcess) {
        console.log(`⏳ Progresso: ${i}/${linhasAProcessar} linhas (${Math.round(i / linhasAProcessar * 100)}%) | Processadas: ${linhasProcessadas} | Puladas: ${linhasPuladas}`);
      }
      SpreadsheetApp.flush();

      const elapsedSec = (Date.now() - scriptStartTime) / 1000;
      if (elapsedSec > MAX_EXECUTION_SECONDS) {
        console.warn(`⏰ Limite de tempo atingido (${Math.round(elapsedSec)}s). Parando em linha ${i + 2} para salvar progresso.`);
        console.warn('   Reinicie o script para continuar (linhas já classificadas serão puladas automaticamente).');
        break;
      }
    }

    try {
      const row = outputRows[i];

      const jaTemClassificacao = colVertical > -1 && row[colVertical] && String(row[colVertical]).trim() !== '';
      if (jaTemClassificacao) {
        linhasPuladas++;
        if (linhasPuladas <= 5) {
          console.log(`⏭️ Pulando linha ${i + 2}: já tem classificação "${row[colVertical]}"`);
        }
        continue;
      }

      linhasProcessadas++;

      const opp = colOpp > -1 ? String(row[colOpp] || '').trim() : '';
      const oppKey = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
      const base = baseByOpp.get(oppKey);

      const conta = (base && base.conta) || (colConta > -1 ? String(row[colConta] || '').trim() : '');
      const produtos = (base && base.produtos) || (colProdutos > -1 ? String(row[colProdutos] || '').trim() : '');
      const billingCity = (base && base.billingCity) || (colCidade > -1 ? String(row[colCidade] || '').trim() : '');
      const billingState = (base && base.billingState) || (colEstado > -1 ? String(row[colEstado] || '').trim() : '');
      const ownerPreventa = (base && base.ownerPreventa) || (colOwnerPreventa > -1 ? String(row[colOwnerPreventa] || '').trim() : '');

      if (colOwnerPreventa > -1 && String(row[colOwnerPreventa] || '').trim() !== ownerPreventa) {
        row[colOwnerPreventa] = ownerPreventa || '';
        baseAtualizados++;
      }
      if (colProdutos > -1 && String(row[colProdutos] || '').trim() !== produtos) {
        row[colProdutos] = produtos || '';
        baseAtualizados++;
      }
      if (colCidade > -1 && String(row[colCidade] || '').trim() !== billingCity) {
        row[colCidade] = billingCity || '';
        baseAtualizados++;
      }
      if (colEstado > -1 && String(row[colEstado] || '').trim() !== billingState) {
        row[colEstado] = billingState || '';
        baseAtualizados++;
      }

      const accountKey = (typeof normText_ === 'function') ? normText_(conta) : String(conta).toLowerCase().trim();

      if (!classificationByAccount.has(accountKey)) {
        const byRule = classificarContaPorRegrasGTM_(conta, produtos, billingCity, billingState);
        if (byRule) {
          classificationByAccount.set(accountKey, { ...byRule, source: 'RULE' });
        } else {
          if (iaDisponivel) {
            tentativasIA++;

            if (tentativasIA === 1 || tentativasIA % 10 === 0) {
              console.log(`🤖 Tentativa ${tentativasIA} de classificação por IA - Conta: "${conta}"`);
            }

            const byIA = classificarContaComIAFallback_(conta, produtos, billingCity, billingState);
            if (byIA) {
              classificationByAccount.set(accountKey, { ...byIA, source: 'IA' });
              if (tentativasIA <= 3) {
                console.log(`✅ IA classificou: "${conta}" → ${byIA.vertical}`);
              }
            } else {
              falhasIA++;
              if (falhasIA <= 3) {
                console.warn(`⚠️ IA falhou para: "${conta}"`);
              }
              classificationByAccount.set(accountKey, {
                vertical: 'Não identificado',
                subVertical: 'Não identificado',
                subSubVertical: 'Não identificado',
                source: 'PENDING'
              });
            }
          } else {
            classificationByAccount.set(accountKey, {
              vertical: 'Não identificado',
              subVertical: 'Não identificado',
              subSubVertical: 'Não identificado',
              source: 'PENDING'
            });
          }
        }
      } else {
        if (i < 5) {
          console.log(`♻️ Reutilizando classificação de "${conta}" (cache)`);
        }
      }

      const classification = classificationByAccount.get(accountKey);

      if (linhasProcessadas <= 3) {
        console.log(`🔍 Linha ${i + 2} (proc ${linhasProcessadas}): Vertical:${colVertical} Owner:${colOwnerPreventa} Cidade:${colCidade} Estado:${colEstado}`);
        console.log(`   Valores IA: ${classification.vertical} | ${classification.subVertical} | ${classification.subSubVertical}`);
        console.log(`   Outros: owner="${ownerPreventa}" cidade="${billingCity}" estado="${billingState}"`);
      }

      if (colVertical > -1) row[colVertical] = classification.vertical;
      if (colSubVertical > -1) row[colSubVertical] = classification.subVertical;
      if (colSubSubVertical > -1) row[colSubSubVertical] = classification.subSubVertical;

      try {
        const saoContíguas = colOwnerPreventa > -1 && colSubSubVertical === colOwnerPreventa + 5;
        if (saoContíguas) {
          analysisSheet.getRange(i + 2, colOwnerPreventa + 1, 1, 6).setValues([[
            ownerPreventa || '',
            billingCity || '',
            billingState || '',
            classification.vertical || '',
            classification.subVertical || '',
            classification.subSubVertical || ''
          ]]);
        } else {
          if (colVertical > -1) {
            analysisSheet.getRange(i + 2, colVertical + 1, 1, 3).setValues([[
              classification.vertical || '', classification.subVertical || '', classification.subSubVertical || ''
            ]]);
          }
          if (colOwnerPreventa > -1) analysisSheet.getRange(i + 2, colOwnerPreventa + 1).setValue(ownerPreventa || '');
          if (colCidade > -1) analysisSheet.getRange(i + 2, colCidade + 1).setValue(billingCity || '');
          if (colEstado > -1) analysisSheet.getRange(i + 2, colEstado + 1).setValue(billingState || '');
        }
        if (linhasProcessadas <= 5) {
          console.log(`✅ Linha ${i + 2} escrita na planilha (${saoContíguas ? 'contígua' : 'individual'})`);
        }
      } catch (writeImmErr) {
        console.error(`❌ Falha ao escrever linha ${i + 2}: ${writeImmErr.message}`);
        console.error(`   Stack: ${writeImmErr.stack}`);
      }

      if (classification.source === 'RULE') classificadosRegra++;
      else if (classification.source === 'IA') classificadosIA++;
      else if (classification.source === 'SEARCH') classificadosBusca++;
      else pendentes++;
    } catch (err) {
      erros++;
      console.error(`⚠️ Erro ao enriquecer linha ${i + 2}: ${err.message}`);
      console.error(`   Stack: ${err.stack}`);
    }
  }

  console.log(`\n✅ Loop de processamento concluído!`);
  console.log(`   📊 Total avaliadas: ${linhasAProcessar}`);
  console.log(`   ✨ Processadas: ${linhasProcessadas}`);
  console.log(`   ⏭️ Puladas (já tinham classificação): ${linhasPuladas}`);

  console.log(`\n🔍 Amostra de 3 primeiras linhas processadas (antes de escrever):`);
  for (let i = 0; i < Math.min(3, outputRows.length); i++) {
    const sampleRow = outputRows[i];
    console.log(`   Linha ${i + 2}:`);
    if (colVertical > -1) console.log(`      Vertical IA [${colVertical}]: "${sampleRow[colVertical]}"`);
    if (colSubVertical > -1) console.log(`      Sub-vertical IA [${colSubVertical}]: "${sampleRow[colSubVertical]}"`);
    if (colSubSubVertical > -1) console.log(`      Sub-sub-vertical IA [${colSubSubVertical}]: "${sampleRow[colSubSubVertical]}"`);
  }

  const expectedLength = analysisHeaders.length;
  console.log(`\n📏 Validando tamanho das linhas:`);
  console.log(`   Header tem ${expectedLength} colunas`);
  console.log(`   OutputRows tem ${outputRows.length} linhas`);
  console.log(`   Linhas a processar: ${linhasAProcessar || outputRows.length}`);

  for (let i = 0; i < outputRows.length; i++) {
    if (outputRows[i].length < expectedLength) {
      while (outputRows[i].length < expectedLength) {
        outputRows[i].push('');
      }
    }
  }
  console.log(`   ✅ Todas as linhas ajustadas para ${expectedLength} colunas\n`);

  try {
    console.log(`💾 Preparando escrita de ${outputRows.length} linhas na planilha...`);
    console.log(`   Range: linha 2, coluna 1, ${outputRows.length} linhas, ${analysisHeaders.length} colunas`);

    const writeRange = analysisSheet.getRange(2, 1, outputRows.length, analysisHeaders.length);
    console.log(`   Range obtido: ${writeRange.getA1Notation()}`);

    writeRange.setValues(outputRows);
    console.log('   ✅ setValues executado!');

    SpreadsheetApp.flush();
    console.log('✅ Flush executado - Escrita concluída com sucesso!');
  } catch (writeErr) {
    console.error('❌ ERRO NA ESCRITA DA PLANILHA:');
    console.error(`   Mensagem: ${writeErr.message}`);
    console.error(`   Stack: ${writeErr.stack}`);
    console.error(`   OutputRows.length: ${outputRows.length}`);
    console.error(`   AnalysisHeaders.length: ${analysisHeaders.length}`);
    console.error(`   Primera linha length: ${outputRows[0] ? outputRows[0].length : 'N/A'}`);
    if (outputRows[0]) {
      console.error('   Primera linha sample (primeiros 10):', outputRows[0].slice(0, 10));
    }
    throw writeErr;
  }

  console.log(`\n📊 Resumo de classificação (${analysisSheetName}):`);
  console.log(`   • Total de linhas avaliadas: ${linhasAProcessar || outputRows.length}`);
  console.log(`   • Linhas já classificadas (puladas): ${linhasPuladas}`);
  console.log(`   • Linhas processadas agora: ${linhasProcessadas}`);
  console.log(`   • Contas únicas classificadas: ${classificationByAccount.size}`);
  console.log(`   • Economia de chamadas: ${Math.max(0, linhasProcessadas - classificationByAccount.size)} linhas reutilizaram cache`);
  console.log(`   • Tentativas de IA: ${tentativasIA}`);
  console.log(`   • Falhas de IA: ${falhasIA}`);
  console.log(`   • Taxa de sucesso IA: ${tentativasIA > 0 ? Math.round((tentativasIA - falhasIA) / tentativasIA * 100) : 0}%`);
  console.log(`   • Classificações por regra: ${classificadosRegra}`);
  console.log(`   • Classificações por IA: ${classificadosIA}`);
  console.log(`   • Pendentes revisão: ${pendentes}\n`);

  return {
    total: linhasProcessadas,
    totalAvaliadas: linhasAProcessar || outputRows.length,
    linhasPuladas,
    colunasInseridas,
    baseAtualizados,
    classificadosRegra,
    classificadosIA,
    classificadosBusca,
    pendentes,
    erros,
    tentativasIA,
    falhasIA
  };
}

/**
 * Preenche manualmente a coluna "Justificativa IA" da aba de Forecast (OPEN)
 * apenas quando estiver vazia. Se já tiver valor, pula a linha.
 *
 * LÓGICA: a justificativa explica o PORQUÊ da confiança do forecast com fatos
 * já existentes na própria linha (motivo, confiança, risco, fase, atividades, idle).
 */
function preencherJustificativaIAForecastVazia() {
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      '🧠 Preencher Justificativa IA (Forecast)',
      'Esta função irá preencher "Justificativa IA" APENAS em linhas vazias da aba "🎯 Análise Forecast IA".\n\n' +
      '• Não sobrescreve linhas já preenchidas\n' +
      '• Tenta gerar com IA por oportunidade (mais lento)\n' +
      '• Se a IA falhar, aplica fallback com fatos da própria linha\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  } catch (e) {
    console.log('⚠️ UI não disponível, executando preenchimento manual direto...');
  }

  const result = preencherJustificativaIAForecastVazia_SEM_UI_();
  const msg =
    `✅ Preenchimento de Justificativa IA concluído\n\n` +
    `• Linhas avaliadas: ${result.totalLinhas}\n` +
    `• Preenchidas agora: ${result.preenchidas}\n` +
    `• Via IA: ${result.preenchidasIA}\n` +
    `• Via fallback local: ${result.preenchidasFallback}\n` +
    `• Falhas de IA: ${result.falhasIA}\n` +
    `• Já preenchidas (puladas): ${result.puladasJaPreenchidas}\n` +
    `• Sem dados mínimos: ${result.semDados}\n` +
    `• Erros: ${result.erros}`;

  console.log(msg);
  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  return result;
}

function preencherJustificativaIAForecastVazia_SEM_UI_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = '🎯 Análise Forecast IA';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Aba não encontrada: ${sheetName}`);

  const lastRow = sheet.getLastRow();
  const maxCol = sheet.getMaxColumns();
  if (lastRow <= 1) {
    return {
      totalLinhas: 0,
      preenchidas: 0,
      preenchidasIA: 0,
      preenchidasFallback: 0,
      falhasIA: 0,
      puladasJaPreenchidas: 0,
      semDados: 0,
      erros: 0,
      colunaInserida: false
    };
  }

  let colunaInserida = false;
  const colunasInseridas = ensureColumnsBeforeLastUpdate_(sheet, ['Justificativa IA'], '🕐 Última Atualização');
  if (colunasInseridas > 0) {
    colunaInserida = true;
    SpreadsheetApp.flush();
  }

  const data = sheet.getRange(1, 1, lastRow, maxCol).getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const findByPattern = (patterns) => {
    if (typeof findColumnByPatterns_ === 'function') {
      return findColumnByPatterns_(headers, patterns);
    }
    const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizedHeaders = headers.map(norm);
    for (let i = 0; i < patterns.length; i++) {
      const p = norm(patterns[i]);
      const idx = normalizedHeaders.findIndex(h => h.includes(p));
      if (idx > -1) return idx;
    }
    return -1;
  };

  const colJustificativa   = findLastHeaderIndexExact_(headers, 'Justificativa IA');
  const colConfianca        = findByPattern(['confiança', 'confianca']);
  const colMotivo           = findByPattern(['motivo confiança', 'motivo confianca']);
  const colForecastIA       = findByPattern(['forecast ia']);
  const colRiscoPrincipal   = findByPattern(['risco principal']);
  const colFaseAtual        = findByPattern(['fase atual', 'stage']);
  const colIdleDias         = findByPattern(['idle (dias)', 'idle dias']);
  const colAtividades       = findByPattern(['atividades (peso)', 'atividades']);
  const colCicloDias        = findByPattern(['ciclo (dias)', 'ciclo dias']);
  const colDiasFunil        = findByPattern(['dias funil']);
  const colMeddicScore      = findByPattern(['meddic score']);
  const colMeddicGaps       = findByPattern(['meddic gaps']);
  const colMeddicEvidencias = findByPattern(['meddic evid']);
  const colBantScore        = findByPattern(['bant score']);
  const colBantGaps         = findByPattern(['bant gaps']);
  const colBantEvidencias   = findByPattern(['bant evid']);
  const colEngajamento      = findByPattern(['qualidade engajamento', 'qualidade do engajamento']);
  const colMixAtividades    = findByPattern(['mix atividades']);
  const colConta            = findByPattern(['conta']);
  const colFlagsRisco       = findByPattern(['flags de risco', 'flags risco']);
  const colGapsIdent        = findByPattern(['gaps identificados']);
  const colAnomalias        = findByPattern(['anomalias detectadas', 'anomalias']);
  const colVelocity         = findByPattern(['velocity predição', 'velocity pred']);
  const colDataPrevista     = findByPattern(['data prevista']);
  const colFiscalQ          = findByPattern(['fiscal q']);
  const colTipoOportunidade = findByPattern(['tipo oportunidade', 'tipo de oportunidade', 'tipo oportunidad']);
  const colProcesso         = findByPattern(['processo', 'proceso', 'processo tipo', 'processo tipo']);

  if (colJustificativa < 0) {
    throw new Error('Coluna "Justificativa IA" não encontrada após tentativa de criação.');
  }

  let preenchidas = 0;
  let preenchidasIA = 0;
  let preenchidasFallback = 0;
  let falhasIA = 0;
  let puladasJaPreenchidas = 0;
  let semDados = 0;
  let erros = 0;

  // Processa e escreve 1 linha por vez — garante que cada resultado persiste na planilha
  // imediatamente após geração, mesmo se o script for cancelado no meio da execução.
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    try {
      const atual = String(row[colJustificativa] || '').trim();
      if (atual && atual !== '-') {
        puladasJaPreenchidas++;
        continue;
      }

      const confiancaRaw      = colConfianca        > -1 ? row[colConfianca]        : null;
      const motivo            = colMotivo           > -1 ? String(row[colMotivo]           || '').trim() : '';
      const forecastIA        = colForecastIA       > -1 ? String(row[colForecastIA]       || '').trim() : '';
      const risco             = colRiscoPrincipal   > -1 ? String(row[colRiscoPrincipal]   || '').trim() : '';
      const fase              = colFaseAtual        > -1 ? String(row[colFaseAtual]        || '').trim() : '';
      const idle              = colIdleDias         > -1 ? String(row[colIdleDias]         || '').trim() : '';
      const atividades        = colAtividades       > -1 ? String(row[colAtividades]       || '').trim() : '';
      const cicloDias         = colCicloDias        > -1 ? String(row[colCicloDias]        || '').trim() : '';
      const diasFunil         = colDiasFunil        > -1 ? String(row[colDiasFunil]        || '').trim() : '';
      const meddicScore       = colMeddicScore      > -1 ? String(row[colMeddicScore]      || '').trim() : '';
      const meddicGaps        = colMeddicGaps       > -1 ? String(row[colMeddicGaps]       || '').trim() : '';
      const meddicEvidencias  = colMeddicEvidencias > -1 ? String(row[colMeddicEvidencias] || '').trim() : '';
      const bantScore         = colBantScore        > -1 ? String(row[colBantScore]        || '').trim() : '';
      const bantGaps          = colBantGaps         > -1 ? String(row[colBantGaps]         || '').trim() : '';
      const bantEvidencias    = colBantEvidencias   > -1 ? String(row[colBantEvidencias]   || '').trim() : '';
      const engajamento       = colEngajamento      > -1 ? String(row[colEngajamento]      || '').trim() : '';
      const mixAtividades     = colMixAtividades    > -1 ? String(row[colMixAtividades]    || '').trim() : '';
      const conta             = colConta            > -1 ? String(row[colConta]            || '').trim() : '';
      const flagsRisco        = colFlagsRisco       > -1 ? String(row[colFlagsRisco]       || '').trim() : '';
      const gapsIdent         = colGapsIdent        > -1 ? String(row[colGapsIdent]        || '').trim() : '';
      const anomalias         = colAnomalias        > -1 ? String(row[colAnomalias]        || '').trim() : '';
      const velocity          = colVelocity         > -1 ? String(row[colVelocity]         || '').trim() : '';
      const dataPrevista      = colDataPrevista     > -1 ? String(row[colDataPrevista]     || '').trim() : '';
      const fiscalQ           = colFiscalQ          > -1 ? String(row[colFiscalQ]          || '').trim() : '';
      const tipoOportunidade  = colTipoOportunidade > -1 ? String(row[colTipoOportunidade] || '').trim() : '';
      const processo          = colProcesso         > -1 ? String(row[colProcesso]         || '').trim() : '';

      const confiancaNum = parseFloat(String(confiancaRaw || '').replace('%', '').replace(',', '.'));
      const confiancaTxt = isNaN(confiancaNum) ? '' : `${Math.round(confiancaNum)}%`;

      const facts = {
        confiancaTxt, motivo, forecastIA, risco, fase, idle, atividades,
        cicloDias, diasFunil, meddicScore, meddicGaps, meddicEvidencias,
        bantScore, bantGaps, bantEvidencias, engajamento, mixAtividades,
        conta, flagsRisco, gapsIdent, anomalias, velocity, dataPrevista, fiscalQ,
        tipoOportunidade, processo
      };

      let justificativa = gerarJustificativaForecastComIA_(facts);
      if (justificativa) {
        preenchidasIA++;
      } else {
        falhasIA++;
        justificativa = gerarJustificativaForecastLocal_(facts);
        preenchidasFallback++;
      }

      if (!justificativa) {
        justificativa = 'Sem dados suficientes para detalhar a confiança do forecast nesta linha.';
        semDados++;
      }

      // Escreve imediatamente na célula — persiste mesmo se cancelar no meio
      sheet.getRange(idx + 2, colJustificativa + 1).setValue(justificativa);
      SpreadsheetApp.flush();
      preenchidas++;

      console.log(`✅ Linha ${idx + 2}: escrita OK (IA=${preenchidasIA}, Fallback=${preenchidasFallback})`);
    } catch (e) {
      erros++;
      console.error(`⚠️ Erro linha ${idx + 2}: ${e.message}`);
    }
  }

  return {
    totalLinhas: rows.length,
    preenchidas,
    preenchidasIA,
    preenchidasFallback,
    falhasIA,
    puladasJaPreenchidas,
    semDados,
    erros,
    colunaInserida
  };
}

function gerarJustificativaForecastComIA_(facts) {
  if (typeof callGeminiAPI !== 'function' || typeof cleanAndParseJSON !== 'function') {
    return '';
  }

  try {
    // Monta seções opcionais apenas quando os dados existem
    const linhaFunil     = (facts.cicloDias || facts.diasFunil)
      ? `Tempo no funil: ${[facts.cicloDias ? facts.cicloDias + ' dias (ciclo total)' : '', facts.diasFunil ? facts.diasFunil + ' dias nesta fase' : ''].filter(Boolean).join(', ')}\n`
      : '';
    const linhaTiming    = (facts.dataPrevista || facts.fiscalQ)
      ? `Prazo de fechamento: ${[facts.dataPrevista, facts.fiscalQ].filter(Boolean).join(' | ')}\n`
      : '';
    const linhaMeddic    = (facts.meddicScore || facts.meddicGaps)
      ? `MEDDIC: score ${facts.meddicScore || '?'} | gaps: ${facts.meddicGaps || 'nenhum'}${facts.meddicEvidencias ? ' | confirmados: ' + facts.meddicEvidencias : ''}\n`
      : '';
    const linhaBant      = (facts.bantScore || facts.bantGaps)
      ? `BANT: score ${facts.bantScore || '?'} | gaps: ${facts.bantGaps || 'nenhum'}${facts.bantEvidencias ? ' | confirmados: ' + facts.bantEvidencias : ''}\n`
      : '';
    const linhaGaps      = facts.gapsIdent       ? `Gaps específicos: ${facts.gapsIdent}\n`          : '';
    const linhaEngaj     = facts.engajamento    ? `Qualidade engajamento: ${facts.engajamento}\n`  : '';
    const linhaMix       = facts.mixAtividades  ? `Mix de atividades: ${facts.mixAtividades}\n`    : '';
    const linhaVelocity  = facts.velocity       ? `Velocity/tendência: ${facts.velocity}\n`       : '';
    const linhaAnomalias = facts.anomalias      ? `Anomalias detectadas: ${facts.anomalias}\n`     : '';
    const linhaFlags     = facts.flagsRisco     ? `Flags de risco: ${facts.flagsRisco}\n`          : '';
    // Tier de inatividade: orienta o piso de confiança esperado na justificativa
    const _idleN_    = parseInt(String(facts.idle || '0')) || 0;
    const _tierLbl_  = _idleN_ <  15 ? '🟢 Ativo (<15d — sem penalidade de idle)'
                     : _idleN_ <  30 ? '🟡 Moderado (15–29d — leve: -5pts easy / -10pts nova)'
                     : _idleN_ <  60 ? '🟠 Em risco (30–59d — média: -10pts easy / -20pts nova)'
                     : _idleN_ <  90 ? '🔴 Crítico (60–89d — alta: -20pts easy / -30pts nova)'
                     :                 '💀 Quase morto (≥90d — severa: -30pts easy / -40pts nova)';
    const linhaIdleTier = `Tier inatividade: ${_tierLbl_}\n`;
    // Tipo Oportunidade: contexto crítico — Renovacao/Adicional/TransferToken são intrinsecamente
    // mais fáceis de fechar que Nova. A IA deve considerar isso no score de confiança.
    const tiposClienteExistente = ['adicional', 'renovação', 'renovacao', 'transfertoken'];
    const isClienteExistente = tiposClienteExistente.some(t => (facts.tipoOportunidade || '').toLowerCase().includes(t));
    const linhaTipoOpp   = facts.tipoOportunidade
      ? `Tipo Oportunidade: ${facts.tipoOportunidade}${isClienteExistente ? ' (cliente existente — conversão facilitada, risco de desconhecimento não se aplica)' : ' (nova aquisição)'}\n`
      : '';
    const linhaProcesso  = facts.processo       ? `Processo: ${facts.processo}\n`                 : '';

    const prompt =
      'Você é um analista sênior de vendas B2B. Gere uma justificativa de 2 a 3 frases ' +
      'explicando o nível de confiança do forecast desta oportunidade. ' +
      'Sua análise deve cobrir obrigatoriamente: (1) o percentual de confiança e categoria forecast, ' +
      '(2) a fase atual e quanto tempo o deal está no funil vs. o prazo de fechamento, ' +
      '(3) a maturidade da qualificação (MEDDIC/BANT — o que está confirmado e o que falta), ' +
      '(4) a qualidade e tipo do engajamento, e (5) o principal fator de risco ou avanço que justifica a confiança. ' +
      'Se o Tipo Oportunidade for Adicional, Renovação ou TransferToken, incremente a confiança base pois o cliente já conhece a empresa. ' +
      'Use os dados abaixo. Seja direto, preciso e nunca invente informações.\n\n' +
      linhaTipoOpp +
      linhaProcesso +
      `Conta: ${facts.conta || 'N/A'}\n` +
      `Confiança: ${facts.confiancaTxt || 'N/A'}\n` +
      `Motivo da confiança: ${facts.motivo || 'N/A'}\n` +
      `Forecast IA: ${facts.forecastIA || 'N/A'}\n` +
      `Fase atual: ${facts.fase || 'N/A'}\n` +
      linhaFunil +
      linhaTiming +
      `Idle (dias sem atividade): ${facts.idle || 'N/A'}\n` +
      linhaIdleTier +
      `Atividades (peso ponderado): ${facts.atividades || 'N/A'}\n` +
      linhaEngaj +
      linhaMix +
      linhaMeddic +
      linhaBant +
      linhaGaps +
      `Risco principal: ${facts.risco || 'N/A'}\n` +
      linhaVelocity +
      linhaAnomalias +
      linhaFlags +
      '\nResponda SOMENTE JSON: {"justificativa":"..."}';

    // maxOutputTokens: 2048 — gemini-2.5-pro usa ~1000 tokens de thinking obrigatório.
    // Com 2048, sobram ~1000 tokens para o JSON de saída (mais que suficiente para 2 frases).
    // Nota: thinkingBudget:0 é inválido no 2.5-pro ("only works in thinking mode").
    const raw = callGeminiAPI(prompt, { temperature: 0.1, maxOutputTokens: 2048 });
    const parsed = cleanAndParseJSON(raw);
    const text = parsed && typeof parsed === 'object'
      ? String(parsed.justificativa || parsed.Justificativa || '').trim()
      : '';

    if (!text || text === '-') return '';
    return text.replace(/\s+/g, ' ').trim();
  } catch (e) {
    return '';
  }
}

function gerarJustificativaForecastLocal_(facts) {
  const partes = [];
  if (facts.confiancaTxt && facts.forecastIA) {
    partes.push(`Confiança da IA em ${facts.confiancaTxt} para o forecast ${facts.forecastIA}.`);
  } else if (facts.confiancaTxt) {
    partes.push(`Confiança da IA em ${facts.confiancaTxt} para o forecast atual.`);
  } else if (facts.forecastIA) {
    partes.push(`Forecast IA atual: ${facts.forecastIA}.`);
  }

  if (facts.motivo && facts.motivo !== '-') {
    partes.push(`Motivo da confiança: ${facts.motivo}.`);
  }
  if (facts.risco && facts.risco !== '-') {
    partes.push(`Risco principal observado: ${facts.risco}.`);
  }
  if (facts.fase && facts.fase !== '-') {
    partes.push(`Fase atual: ${facts.fase}.`);
  }
  if (facts.idle && facts.idle !== '-' && String(facts.idle).toUpperCase() !== 'SEM REGISTRO') {
    const _idleN   = parseInt(String(facts.idle)) || 0;
    const _tierTxt = _idleN >= 90 ? ' 💀 CRÍTICO — deal quase morto, requalificação urgente'
                   : _idleN >= 60 ? ' 🔴 Alto risco (60–89d sem atividade)'
                   : _idleN >= 30 ? ' 🟠 Em risco (30–59d sem atividade)'
                   : _idleN >= 15 ? ' 🟡 Atenção (15–29d sem atividade)'
                   : '';
    partes.push(`Idle: ${facts.idle} dias${_tierTxt}.`);
    const _tiposExist = ['adicional', 'renov', 'transfertoken', 'upsell', 'expans', 'aumento', 'add-on'];
    const _isExist    = _tiposExist.some(function(t) { return (facts.tipoOportunidade || '').toLowerCase().indexOf(t) > -1; });
    if (_idleN >= 60 && _isExist) {
      partes.push('Mesmo sendo cliente existente, inatividade crítica de ' + facts.idle + 'd exige retomada imediata para evitar CHURN.');
    } else if (_idleN >= 30 && _isExist) {
      partes.push('Cliente existente com inatividade moderada — retomada de contato recomendada para proteger a renovação.');
    } else if (_idleN >= 30 && !_isExist) {
      partes.push('Para nova aquisição, ' + facts.idle + ' dias sem atividade reduz significativamente a probabilidade de fechamento.');
    }
  }
  if (facts.atividades && facts.atividades !== '-') {
    partes.push(`Atividades registradas: ${facts.atividades}.`);
  }

  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

// [MOVIDO PARA BACKUP 2026-02-21]
// Bloco de Dimensões de Negócio (wrappers, testes e core) removido do ativo.
// Backup: appscript/backup/Backup_CorrigirFiscalQ_DimensoesNegocio_2026_02_21.gs

function findLastHeaderIndexExact_(headers, exactName) {
  const target = String(exactName || '').trim().toLowerCase();
  let idx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === target) {
      idx = i;
    }
  }
  return idx;
}

function ensureColumnsBeforeLastUpdate_(sheet, requiredHeaders, lastUpdateHeader) {
  let inserted = 0;
  requiredHeaders.forEach((header) => {
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    const alreadyExists = currentHeaders.some(h => String(h || '').trim().toLowerCase() === String(header).trim().toLowerCase());
    if (alreadyExists) return;

    const colLastUpdate = currentHeaders.findIndex(h => String(h || '').trim() === lastUpdateHeader);
    const insertAt = colLastUpdate >= 0 ? colLastUpdate + 1 : sheet.getMaxColumns() + 1;
    sheet.insertColumnBefore(insertAt);
    sheet.getRange(1, insertAt).setValue(header);
    sheet.getRange(1, insertAt)
      .setBackground('#134f5c')
      .setFontColor('white')
      .setFontWeight('bold')
      .setWrap(true);
    inserted++;
  });
  return inserted;
}

function gerarTabelaIdentificacaoAliases() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = '🧭 Tabela Aliases';
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.clear();

  const aliasCatalog = (typeof getColumnAliasCatalog_ === 'function')
    ? getColumnAliasCatalog_()
    : {};

  const keys = Object.keys(aliasCatalog).sort();
  const header = [['Chave Alias', 'Nome Canônico', 'Qtde Aliases', 'Aliases Aceitos', 'Aliases Normalizados']];
  const rows = keys.map((key) => {
    const aliases = Array.isArray(aliasCatalog[key]) ? aliasCatalog[key] : [];
    const canonical = aliases.length ? aliases[0] : '';
    const normalized = aliases
      .map((name) => (typeof normalizeHeaderAliasForTable_ === 'function' ? normalizeHeaderAliasForTable_(name) : name))
      .filter(Boolean);

    return [
      key,
      canonical,
      aliases.length,
      aliases.join(' | '),
      normalized.join(' | ')
    ];
  });

  const output = header.concat(rows);
  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  sheet.getRange(1, 1, 1, output[0].length)
    .setBackground('#134f5c')
    .setFontColor('white')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, output[0].length);

  const infoRow = output.length + 2;
  sheet.getRange(infoRow, 1).setValue('Atualizado em');
  sheet.getRange(infoRow, 2).setValue(formatDateRobust(new Date()));

  console.log(`✅ Tabela de aliases gerada na aba "${sheetName}" com ${rows.length} chaves.`);
  return { sheetName, totalAliases: rows.length };
}

/**
 * Identifica se uma conta é Conta Foco 2026 (BASE INSTALADA ou NOVO CLIENTE).
 * BASE INSTALADA tem prioridade sobre EXPANSÃO (ex: PROCERGS, MTI aparecem nas duas).
 * @param {string} conta - Nome da conta (CRM)
 * @returns {{tipo: string, sigla: string}|null}
 */
function classificarContaFoco2026_(conta) {
  if (!conta) return null;
  const n = (typeof normText_ === 'function') ? normText_(conta) : String(conta).toUpperCase().trim();

  const has = (arr) => arr.some(k => n.includes(normText_(k)));
  const hasWord = (arr) => arr.some(k => {
    const kn = (typeof normText_ === 'function') ? normText_(k) : k.toUpperCase();
    const re = new RegExp('(?:^|[\\s|\\-])' + kn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[\\s|\\-]|$)');
    return re.test(n);
  });

  // ══════════════════════════════════════════════════════
  // BASE INSTALADA (checar primeiro — tem prioridade)
  // ══════════════════════════════════════════════════════

  // Sistema S
  if (has(['SEBRAE'])) return { tipo: 'BASE INSTALADA', sigla: 'SEBRAE' };

  // Governo & Estatais
  if (has(['PRODERJ'])) return { tipo: 'BASE INSTALADA', sigla: 'PRODERJ' };
  if (has(['SERPRO'])) return { tipo: 'BASE INSTALADA', sigla: 'SERPRO' };
  if (has(['HEMOMINAS'])) return { tipo: 'BASE INSTALADA', sigla: 'HEMOMINAS' };
  if (has(['PROCERGS'])) return { tipo: 'NOVO CLIENTE', sigla: 'PROCERGS' };
  if (has(['SMART-RJ', 'SMART RJ', 'SISTEMA MUNICIPAL DE ADMINISTRACAO'])) return { tipo: 'BASE INSTALADA', sigla: 'SMART-RJ' };
  if (has(['CGE MT', 'CGE-MT', 'CGEMT', 'CONTROLADORIA GERAL DO ESTADO DE MATO GROSSO'])) return { tipo: 'BASE INSTALADA', sigla: 'CGE MT' };
  if (hasWord(['PRF']) && !has(['SEGURADORA', 'BANCO', 'VAREJO'])) return { tipo: 'BASE INSTALADA', sigla: 'PRF' };
  // MTI: classificada como novo cliente
  if (has(['EMPRESA MATO-GROSSENSE DE TECNOLOGIA', 'EMPRESA MATOGROSSENSE', 'MATOGROSSENSE DE TECNOLOGIA']) || hasWord(['MTI'])) return { tipo: 'NOVO CLIENTE', sigla: 'MTI' };

  // Judiciário (base instalada)
  if (has(['TRE-PR', 'TRE PR', 'TRIBUNAL REGIONAL ELEITORAL DO PARANA', 'TRIBUNAL REGIONAL ELEITORAL DO PARANÁ'])) return { tipo: 'BASE INSTALADA', sigla: 'TRE-PR' };
  if (hasWord(['TST']) || has(['TRIBUNAL SUPERIOR DO TRABALHO'])) return { tipo: 'BASE INSTALADA', sigla: 'TST' };

  // Educação (base instalada)
  if (has(['PUC-RIO', 'PUC RIO', 'PONTIFICIA UNIVERSIDADE CATOLIC', 'PUC'])) return { tipo: 'BASE INSTALADA', sigla: 'PUC-Rio' };
  if (hasWord(['USP']) || has(['UNIVERSIDADE DE SAO PAULO'])) return { tipo: 'BASE INSTALADA', sigla: 'USP' };
  if (has(['UENP', 'UNIVERSIDADE ESTADUAL DO NORTE DO PARANA'])) return { tipo: 'BASE INSTALADA', sigla: 'UENP' };

  // Privado & Saúde (base instalada)
  if (has(['CI&T'])) return { tipo: 'BASE INSTALADA', sigla: 'CI&T' };
  if (has(['CFM']) || has(['CONSELHO FEDERAL DE MEDICINA'])) return { tipo: 'BASE INSTALADA', sigla: 'CFM' };
  if (has(['DASS NORDESTE', 'DASS CALCADOS', 'DASS CALÇADOS', 'DASS NORDESTE CALCADOS']) || hasWord(['DASS']) || n === 'DASS') return { tipo: 'BASE INSTALADA', sigla: 'Dass' };
  if (has(['HFR']) || has(['FELICIO ROCHO', 'FELICIO ROCHU'])) return { tipo: 'BASE INSTALADA', sigla: 'HFR' };
  if (has(['SAL DA TERRA', 'MISSAO SAL'])) return { tipo: 'BASE INSTALADA', sigla: 'MST' };
  if (has(['OSKLEN'])) return { tipo: 'BASE INSTALADA', sigla: 'Osklen' };
  if (has(['STONE INSTITUICAO', 'STONE PAGAMENTOS', 'STONE PAGAMENTO', 'STONE S.A', 'STONE SA', 'STONE INSTITUIÇÃO'])) return { tipo: 'BASE INSTALADA', sigla: 'Stone' };

  // Municípios (base instalada)
  if (has(['CIDADES INTELIGENTES', 'INSTITUTO DAS CIDADES']) || hasWord(['ICI'])) return { tipo: 'BASE INSTALADA', sigla: 'ICI' };
  if (has(['GRAVATAI', 'GRAVATÁ'])) return { tipo: 'BASE INSTALADA', sigla: 'PM Gravataí' };
  if (has(['GUARAPUAVA'])) return { tipo: 'BASE INSTALADA', sigla: 'PM Guarapuava' };
  if (has(['NOVA LIMA'])) return { tipo: 'BASE INSTALADA', sigla: 'PM Nova Lima' };

  // ══════════════════════════════════════════════════════
  // EXPANSÃO (novos targets)
  // ══════════════════════════════════════════════════════

  // Ministérios Públicos (14 targets)
  if (has(['MPDFT', 'MPGO', 'MPMA', 'MPMG', 'MPMS', 'MPMT', 'MPPA', 'MPRJ', 'MPRO', 'MPRS', 'MPSC', 'MPSP', 'MPTO']) ||
      hasWord(['MPM']) ||
      has(['MINISTERIO PUBLICO', 'MINISTÉRIO PÚBLICO'])) {
    return { tipo: 'NOVO CLIENTE', sigla: 'MP' };
  }

  // Tribunais de Justiça (8 targets)
  if (has(['TJDFT', 'TJGO', 'TJMG', 'TJMT', 'TJPR', 'TJRS', 'TJSP', 'TJTO']) ||
      has(['TRIBUNAL DE JUSTICA', 'TRIBUNAL DE JUSTIÇA'])) {
    return { tipo: 'NOVO CLIENTE', sigla: 'TJ' };
  }

  // Secretarias de Estado (11 targets)
  if (has(['SEMAD GO', 'SEMAD MG', 'SEMAD-GO', 'SEMAD-MG']) ||
      has(['SEMA MT', 'SEMA-MT', 'SECRETARIA DE ESTADO DE MEIO AMBIENTE']) ||
      has(['SPGG RS', 'SPGG-RS', 'SECRETARIA DE PLANEJAMENTO, GOVERNANCA']) ||
      has(['SEPLAG MG', 'SEPLAG MT', 'SEPLAG-MG', 'SEPLAG-MT']) ||
      has(['SEFAZ MT', 'SEFAZ RS', 'SEFAZ TO', 'SEFAZ-MT', 'SEFAZ-RS', 'SEFAZ-TO', 'SEF SC', 'SEF-SC']) ||
      has(['FEAM MG', 'FEAM-MG', 'FUNDACAO ESTADUAL DO MEIO AMBIENTE', 'FUNDAÇÃO ESTADUAL DO MEIO AMBIENTE'])) {
    return { tipo: 'NOVO CLIENTE', sigla: 'Secretaria/SEFAZ' };
  }

  // Outros Órgãos (6 targets)
  if (has(['BANCO DA AMAZONIA', 'BANCO DA AMAZÔNIA', 'BASA'])) return { tipo: 'NOVO CLIENTE', sigla: 'BASA' };
  if (hasWord(['BNDES']) || has(['BANCO NACIONAL DE DESENVOLVIMENTO'])) return { tipo: 'NOVO CLIENTE', sigla: 'BNDES' };
  if (has(['BADESUL'])) return { tipo: 'NOVO CLIENTE', sigla: 'BADESUL' };
  if (has(['ATI TO', 'ATI-TO', 'AGENCIA DE TECNOLOGIA DA INFORMACAO DO TOCANTINS'])) return { tipo: 'NOVO CLIENTE', sigla: 'ATI TO' };

  return null;
}

function classificarContaPorRegrasGTM_(conta, produtos, cidade, estado) {
  const text = [conta, produtos, cidade, estado]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' | ');
  const n = (typeof normText_ === 'function') ? normText_(text) : text.toUpperCase();
  if (!n) return null;

  // has(): substring match — OK para termos longos
  const has = (arr) => arr.some(k => {
    const kn = (typeof normText_ === 'function') ? normText_(k) : String(k).toUpperCase();
    return n.indexOf(kn) > -1;
  });

  // hasWord(): exige que a keyword seja palavra inteira (não substring de outra palavra)
  // Usa espaço, hífen, pipe, início/fim da string como delimitadores
  const hasWord = (arr) => arr.some(k => {
    const kn = (typeof normText_ === 'function') ? normText_(k) : String(k).toUpperCase();
    const re = new RegExp('(?:^|[\\s|\\-])' + kn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[\\s|\\-]|$)');
    return re.test(n);
  });

  // Diagnóstico: log qual regra disparou (apenas inicias chamadas)
  let _ruleMatch = null;
  const matchRule = (label, testFn) => { if (!_ruleMatch && testFn()) { _ruleMatch = label; return true; } return false; };

  if (matchRule('Tribunais Superiores', () => hasWord(['STF', 'STJ', 'TST', 'TSE', 'STM']))) {
    return mkClass_('Governo', 'Justiça', 'Tribunais Superiores');
  }
  if (matchRule('TRT', () => hasWord(['TRT']) || has(['TRIBUNAL REGIONAL DO TRABALHO']))) {
    return mkClass_('Governo', 'Justiça', 'Tribunal Regional do Trabalho');
  }
  if (matchRule('TRE', () => hasWord(['TRE']) || has(['TRIBUNAL REGIONAL ELEITORAL']))) {
    return mkClass_('Governo', 'Justiça', 'Tribunal Regional Eleitoral');
  }
  if (matchRule('TJ', () => hasWord(['TJ']) || has(['TRIBUNAL DE JUSTICA']))) {
    return mkClass_('Governo', 'Justiça', 'Tribunal de Justiça Estadual');
  }
  if (matchRule('TRF', () => hasWord(['TRF']) || has(['JUSTICA FEDERAL', 'VARA FEDERAL']))) {
    return mkClass_('Governo', 'Justiça', 'Justiça Federal');
  }

  if (matchRule('Ministério Público', () => hasWord(['MPF', 'MPE', 'MPT']) || has(['MINISTERIO PUBLICO']))) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Ministério Público');
  }
  if (matchRule('AGU', () => hasWord(['AGU']) || has(['ADVOCACIA-GERAL DA UNIAO', 'ADVOCACIA GERAL DA UNIAO']))) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Advocacia-Geral da União');
  }
  if (matchRule('Tribunal de Contas', () => hasWord(['TCU', 'TCE', 'TCM']) || has(['TRIBUNAL DE CONTAS']))) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Tribunal de Contas');
  }
  if (matchRule('Defensoria', () => hasWord(['DPU', 'DPE']) || has(['DEFENSORIA']))) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Defensoria Pública');
  }
  if (matchRule('Procuradoria', () => hasWord(['PGE', 'PGM', 'PGFN']) || has(['PROCURADORIA']))) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Procuradoria e Advocacia Pública');
  }

  if (matchRule('Polícia', () => has(['POLICIA FEDERAL', 'POLICIA MILITAR', 'POLICIA CIVIL']) || hasWord(['PRF']))) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Forças Policiais');
  }
  if (matchRule('Sec. Segurança', () => hasWord(['SSP', 'SESP']) || has(['SECRETARIA DE SEGURANCA']))) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Secretaria de Segurança');
  }
  if (matchRule('Trânsito', () => has(['DETRAN']) || hasWord(['CET']))) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Órgão de Trânsito');
  }
  if (matchRule('Bombeiros', () => has(['BOMBEIRO']) || hasWord(['CBM']))) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Corpo de Bombeiros');
  }

  if (matchRule('TI Pública', () => has(['SERPRO', 'DATAPREV', 'PRODESP', 'PRODAM', 'PROCERGS', 'CIASC', 'PRODERJ', 'PRODEMGE', 'PRODABEL']) || hasWord(['MTI']))) {
    return mkClass_('Governo', 'Tecnologia e Processamento', 'Empresa Pública de TI');
  }

  if (matchRule('Ministério Federal', () => has(['MINISTERIO']) || hasWord(['MEC', 'MGI']))) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Ministério/Governo Federal');
  }
  if (matchRule('Gov. Estadual', () => has(['SEFAZ', 'SEPLAG', 'GOVERNO DO ESTADO', 'SECRETARIA DE']))) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Governo Estadual e Secretarias');
  }
  if (matchRule('Prefeitura', () => has(['PREFEITURA', 'MUNICIPIO DE']))) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Prefeitura Municipal');
  }

  if (matchRule('Legislativo Federal', () => has(['SENADO', 'CAMARA DOS DEPUTADOS']))) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Federal');
  }
  if (matchRule('Legislativo Estadual', () => has(['ASSEMBLEIA LEGISLATIVA']) || hasWord(['ALESP', 'ALERJ']))) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Estadual');
  }
  if (matchRule('Legislativo Municipal', () => has(['CAMARA MUNICIPAL', 'CAMARA DE VEREADORES']))) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Municipal');
  }

  if (matchRule('Saneamento', () => has(['COPASA', 'SABESP', 'SANEPAR', 'CAESB']))) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Saneamento e Água');
  }
  if (matchRule('Energia', () => has(['ELETROBRAS', 'CEMIG', 'ENERGISA', 'EQUATORIAL', 'ENGIE', 'COPEL', 'CEMAR', 'COELBA', 'CELPE', 'COELCE', 'CELG', 'COSERN', 'CEAL', 'AMAZONAS ENERGIA', 'GASODUTO', 'DISTRIBUIDORA DE GAS', 'NATURGY', 'COMGAS']) || hasWord(['CEB', 'CEG']))) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Energia e Gás');
  }
  if (matchRule('Logística/Portos', () => has(['PORTO', 'DOCAS']) || hasWord(['ANTAQ', 'ANTT', 'ANEEL', 'ANP']))) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Logística e Portos');
  }

  if (matchRule('Sistema S', () => has(['SEBRAE', 'SENAI', 'SENAC', 'SESC', 'SESI']))) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Sistema S');
  }
  if (matchRule('Conselho Profissional', () => hasWord(['OAB', 'CRM', 'CREA', 'CRO', 'CRP']) || has(['CONSELHO']))) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Conselho Profissional');
  }
  if (matchRule('Banco Fomento', () => has(['BNDES', 'BRDE', 'BANCO DE DESENVOLVIMENTO']))) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Banco de Desenvolvimento e Fomento');
  }

  if (matchRule('Saúde', () => has(['HOSPITAL', 'CLINICA', 'UNIMED', 'HAPVIDA', 'QUALICORP', 'FIOCRUZ', 'INCA', 'SECRETARIA DE SAUDE', 'HEMOCENTRO', 'HEMOMINAS', 'SANGUE']) || hasWord(['SES', 'SMS']))) {
    const isPublic = has(['SECRETARIA DE SAUDE', 'FIOCRUZ', 'INCA', 'HEMOCENTRO', 'HEMOMINAS']) || hasWord(['SES', 'SMS']);
    return mkClass_('Saúde', isPublic ? 'Saúde Pública' : 'Saúde Privada', isPublic ? 'Secretaria de Saúde' : 'Hospital e Clínica');
  }

  if (matchRule('Educação', () => has(['UNIVERSIDADE', 'FACULDADE', 'COLEGIO', 'ESCOLA', 'MACKENZIE', 'UNINOVE', 'UNIP', 'ANHANGUERA', 'KROTON', 'YDUQS', 'COGNA', 'INSTITUTO FEDERAL', 'IFSP', 'IFRS', 'IFMG']) || hasWord(['SEDUC', 'MEC', 'USP', 'UFMG']))) {
    const isPublic = has(['INSTITUTO FEDERAL', 'IFSP', 'IFRS', 'IFMG', 'SECRETARIA DE EDUCACAO']) || hasWord(['SEDUC', 'MEC', 'USP', 'UFMG']);
    return mkClass_('Educação', isPublic ? 'Educação Pública' : 'Educação Privada', isPublic ? 'Ensino Básico e Secretarias' : 'Ensino Superior');
  }

  if (matchRule('Agronegócio', () => has(['AMAGGI', 'BOM FUTURO', 'COOPERATIVA', 'FAZENDA', 'FERTILIZANTE', 'INSUMO', 'COPASUL', 'AGROPECUARIA', 'AGROPECUÁRIA', 'GRANJA', 'SEMENTES', 'AGRONEGOCIO']))) {
    if (has(['COOPERATIVA', 'COPASUL'])) {
      return mkClass_('Agronegócio e Cooperativas', 'Cadeia Produtiva Agrícola', 'Cooperativa Agroindustrial');
    }
    return mkClass_('Agronegócio e Cooperativas', 'Cadeia Produtiva Agrícola', 'Produtor e Fazenda');
  }

  // ══════════════════════════════════════════════════════════
  // REGRAS GENÉRICAS (Última tentativa antes de fallback IA)
  // ══════════════════════════════════════════════════════════
  if (matchRule('Terceiro Setor: ONG', () => has(['MISSAO', 'MISSÃO', 'IGREJA', 'PAROQUIA', 'DIOCESE', 'PRESBITÉRIO', 'PRESBITERIO', 'EVANGEL', 'BATISTA', 'ADVENTISTA', 'LUTERAN', 'METODISTA', 'ASSEMB']))) {
    return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'Entidade Religiosa e Missões');
  }
  if (matchRule('Terceiro Setor: Instituto', () => has(['ASSOCIACAO', 'ASSOCIAÇÃO', 'ONG ', ' ONG', 'CSEM', 'FUNDO PATRIMONIAL', 'FILANTROP', 'INSTITUTO', 'FUNDACAO', 'FUNDAÇÃO', 'PESQUISA', 'CENTRO DE ESTUDOS', 'LABORATORIO', 'LABORATÓRIO']))) {
    if (has(['MISSAO', 'MISSÃO', 'IGREJA', 'RELIGIOSA'])) {
      return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'Entidade Religiosa e Missões');
    }
    if (has(['ASSOCIACAO', 'ASSOCIAÇÃO', 'ONG ', ' ONG', 'CSEM', 'FUNDO PATRIMONIAL', 'FILANTROP'])) {
      return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'ONG e Associação Civil');
    }
    return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'Instituto de Pesquisa e Fundação');
  }

  if (matchRule('Finanças', () => has(['BANCO', 'SEGURADORA', 'PAGAMENTO', 'FINANCEIRA']))) {
    return mkClass_('Setor Privado: Corporativo', 'Finanças', 'Banco Comercial');
  }
  if (matchRule('Varejo', () => has(['CARREFOUR', 'MAGAZINE LUIZA', 'ATACADAO', 'ATACADO', 'SUPERMERCADO', 'VAREJO', 'E-COMMERCE']))) {
    return mkClass_('Setor Privado: Corporativo', 'Varejo e E-commerce', 'Supermercado e Atacado');
  }
  if (matchRule('Logística', () => has(['LOGISTICA', 'TRANSPORTE', 'MOBILIDADE']))) {
    return mkClass_('Setor Privado: Corporativo', 'Logística', 'Transporte e Mobilidade');
  }
  if (matchRule('Tecnologia', () => has(['CI&T', 'TECNOLOGIA', 'SOFTWARE', 'SAAS', 'DIGITAL']))) {
    return mkClass_('Setor Privado: Corporativo', 'Tecnologia e Telecomunicações', 'Software e Serviços de TI');
  }
  if (matchRule('Consultoria', () => has(['ADVOGADOS', 'ADVOCACIA', 'CONSULTORIA', 'FANTASY SPORTS', 'SERVICOS']))){
    return mkClass_('Setor Privado: Corporativo', 'Serviços Profissionais e B2B', 'Consultoria');
  }
  if (matchRule('Contabilidade', () => has(['CONTABIL', 'CONTÁBIL', 'CONTABILIDADE', 'ESCRITORIO', 'ESCRITÓRIO']))) {
    return mkClass_('Setor Privado: Corporativo', 'Serviços Profissionais e B2B', 'Contabilidade');
  }
  if (matchRule('Indústria', () => has(['INDUSTRIA', 'INDÚSTRIA', 'ALIMENTOS', 'FABRICA', 'FÁBRICA', 'MANUFATURA', 'PRODUCAO', 'PRODUÇÃO']))) {
    return mkClass_('Setor Privado: Corporativo', 'Indústria', 'Manufatura');
  }
  if (matchRule('Comércio', () => has(['COMERCIO', 'COMÉRCIO', 'LOJA', 'DISTRIBUIDORA', 'IMPORTADORA', 'EXPORTADORA']))) {
    return mkClass_('Setor Privado: Corporativo', 'Varejo e E-commerce', 'Comércio');
  }
  if (matchRule('Construção', () => has(['ENGENHARIA', 'CONSTRUCAO', 'CONSTRUÇÃO', 'ARQUITETURA', 'OBRAS', 'CONSTRUTORA', 'INCORPORADORA']))) {
    return mkClass_('Setor Privado: Corporativo', 'Engenharia e Construção', 'Construção Civil');
  }

  // Nenhuma regra disparou → fallback IA
  return null;
}

// ================================================================================================
// --- TAXONOMIA CANÔNICA DE VERTICAIS (fonte da verdade) ---
// Toda nova classificação deve usar EXATAMENTE os valores abaixo.
// Para padronizar dados históricos, use normalizarSubVertical_() e normalizarSubSubVertical_().
// ================================================================================================

const VERTICAL_TAXONOMY = {
  "Governo": {
    "Poder Executivo Estadual":     ["Governos Estaduais e DF","Secretarias de Estado","Autarquias e Fundações Estaduais","Empresas Públicas Estaduais","Distrito Federal"],
    "Poder Executivo Federal":      ["Ministérios e Órgãos Federais","Autarquias Federais","Empresas Públicas Federais"],
    "Poder Executivo Municipal":    ["Prefeituras","Secretarias Municipais","Autarquias Municipais"],
    "Poder Judiciário":             ["Tribunais de Justiça Estaduais","Tribunais Regionais do Trabalho","Tribunais Regionais Eleitorais","Tribunais Superiores","Justiça Federal","Ministério Público","Defensoria Pública","Tribunais de Contas"],
    "Poder Legislativo":            ["Câmara Federal e Senado","Assembleias Legislativas","Câmaras Municipais"],
    "Órgãos de Controle":           ["Controladorias","Agências Reguladoras"]
  },
  "Utilities e Infraestrutura Pública": {
    "Saneamento":                   ["Água e Esgoto","Companhias Estaduais de Saneamento"],
    "Energia":                      ["Distribuição de Energia","Geração de Energia","Gás Natural"],
    "Transporte e Logística Pública":["Transporte Metroferroviário","Logística e Ferrovias","Rodovias e Concessões"],
    "Empresa Pública de TI":        ["TI Estadual","TI Federal"]
  },
  "Sistema S": {
    "Sebrae":                       ["Sebrae Nacional","Sebrae Estadual"],
    "Entidades do Sistema S":       ["SENAI","SESI","SENAC","SENAR","SEST/SENAT"]
  },
  "Saúde": {
    "Hospitais e Clínicas":         ["Hospitais Públicos","Hospitais Privados","Clínicas e Reabilitação"],
    "Serviços de Saúde":            ["Planos de Saúde","Laboratórios"]
  },
  "Educação": {
    "Ensino Superior":              ["Universidades Públicas","Universidades Privadas"],
    "Ensino Básico":                ["Escolas Públicas","Escolas Privadas"],
    "Ensino a Distância":           ["EaD e Plataformas Educacionais"]
  },
  "Agronegócio e Cooperativas": {
    "Agroindústria":                ["Papel e Celulose","Sucroenergético","Alimentos e Bebidas"],
    "Cooperativas Agrícolas":       ["Cooperativas de Produção","Cooperativas de Crédito Rural"]
  },
  "Setor Privado: Corporativo": {
    "Tecnologia e TI":              ["Software e Cloud","Consultoria de TI","Telecomunicações"],
    "Serviços Financeiros":         ["Bancos e Fintechs","Seguradoras","Fundos e Investimentos"],
    "Indústria":                    ["Manufatura","Bens de Consumo","Embalagens"],
    "Varejo e Comércio":            ["Varejo Físico","E-commerce","Moda e Vestuário"],
    "Serviços Profissionais":       ["Consultoria","Serviços de Apoio a Empresas","Pequenas e Médias Empresas"]
  },
  "Terceiro Setor e ONGs": {
    "Organizações Religiosas":      ["Igrejas e Missões","Mídia Religiosa"],
    "Associações e Fundações":      ["Entidades de Classe","Fundações de Apoio à Pesquisa","Conselhos Profissionais"],
    "ONGs":                         ["ONGs Sociais","Organizações Internacionais"]
  }
};

/**
 * Mapeia variações de Sub-vertical → valor canônico.
 * Chave: string normalizada (upper, sem acentos). Valor: canônico exato.
 */
const SUB_VERTICAL_ALIAS_MAP = {
  // Judiciário / Justiça
  'JUDICIARIO': 'Poder Judiciário',
  'PODER JUDICIARIO': 'Poder Judiciário',
  'PODER JUDICIARIO E ORGAOS DE JUSTICA': 'Poder Judiciário',
  'JUDICIARIO E JUSTICA': 'Poder Judiciário',
  'PODER JUDICIARIO E FUNCOES ESSENCIAIS A JUSTICA': 'Poder Judiciário',
  'SISTEMA DE JUSTICA': 'Poder Judiciário',
  'MINISTERIO PUBLICO': 'Poder Judiciário',
  // Executivo Estadual
  'ESTADUAL': 'Poder Executivo Estadual',
  'GOVERNO ESTADUAL': 'Poder Executivo Estadual',
  'ADMINISTRACAO PUBLICA ESTADUAL': 'Poder Executivo Estadual',
  'PODER EXECUTIVO': 'Poder Executivo Estadual',
  'EXECUTIVO': 'Poder Executivo Estadual',
  'ADMINISTRACAO DIRETA': 'Poder Executivo Estadual',
  'ADMINISTRACAO INDIRETA': 'Poder Executivo Estadual',
  'AUTARQUIAS E FUNDACOES PUBLICAS': 'Poder Executivo Estadual',
  'SECRETARIAS': 'Poder Executivo Estadual',
  // Executivo Federal
  'GOVERNO FEDERAL': 'Poder Executivo Federal',
  'FEDERAL': 'Poder Executivo Federal',
  // Executivo Municipal
  'GOVERNO MUNICIPAL': 'Poder Executivo Municipal',
  'MUNICIPAL': 'Poder Executivo Municipal',
  'GOVERNO': 'Poder Executivo Estadual',
  'ADMINISTRACAO PUBLICA': 'Poder Executivo Estadual',
  // Legislativo
  'PODER LEGISLATIVO': 'Poder Legislativo',
  // Controle
  'ORGAOS DE CONTROLE': 'Órgãos de Controle',
  // Saneamento
  'SANEAMENTO': 'Saneamento',
  // Energia
  'ENERGIA': 'Energia',
  'GAS': 'Energia',
  // Transporte
  'TRANSPORTE E LOGISTICA': 'Transporte e Logística Pública',
  'TRANSPORTE E LOGISTICA PUBLICA': 'Transporte e Logística Pública',
  // Sebrae / Sistema S
  'SEBRAE': 'Sebrae',
  'APOIO AO EMPREENDEDORISMO': 'Sebrae',
  'APOIO A EMPRESAS': 'Sebrae',
  'APOIO AO EMPREENDEDORISMO E PEQUENAS EMPRESAS': 'Sebrae',
  'APOIO E FOMENTO AO EMPREENDEDORISMO': 'Sebrae',
  'SERVICOS DE APOIO': 'Sebrae',
  'SERVICOS DE APOIO A EMPRESAS': 'Sebrae',
  'APOIO A MICRO E PEQUENAS EMPRESAS': 'Sebrae',
  'APOIO AO EMPREENDEDORISMO E PEQUENAS EMPRESAS': 'Sebrae',
  'SISTEMA S': 'Entidades do Sistema S',
  // Saúde
  'HOSPITAIS E CLINICAS': 'Hospitais e Clínicas',
  'SAUDE': 'Hospitais e Clínicas',
  // Educação
  'ENSINO SUPERIOR': 'Ensino Superior',
  'ENSINO A DISTANCIA': 'Ensino a Distância',
  'EDUCACAO': 'Ensino Superior',
  // Agro
  'AGROINDUSTRIA': 'Agroindústria',
  'PAPEL E CELULOSE': 'Agroindústria',
  // Tecnologia Privada
  'TECNOLOGIA': 'Tecnologia e TI',
  'TECNOLOGIA E TELECOM': 'Tecnologia e TI',
  'TECNOLOGIA DA INFORMACAO': 'Tecnologia e TI',
  'TECNOLOGIA E SERVICOS DE TI': 'Tecnologia e TI',
  'TECNOLOGIA E SOFTWARE': 'Tecnologia e TI',
  'TECNOLOGIA E TI': 'Tecnologia e TI',
  'TECNOLOGIA DA INFORMACAO E COMUNICACAO': 'Tecnologia e TI',
  // Financeiro
  'SERVICOS FINANCEIROS': 'Serviços Financeiros',
  // Segurança Pública (órgão estadual de segurança)
  'SEGURANCA PUBLICA': 'Poder Executivo Estadual',
  // Indústria
  'INDUSTRIA': 'Indústria',
  // Varejo
  'VAREJO': 'Varejo e Comércio',
  'COMERCIO VAREJISTA': 'Varejo e Comércio',
  // Serviços
  'SERVICOS DE CONSULTORIA': 'Serviços Profissionais',
  'PEQUENAS E MEDIAS EMPRESAS': 'Serviços Profissionais',
  'PEQUENAS E MEDIAS EMPRESAS (PMES)': 'Serviços Profissionais',
  // ONGs / Terceiro Setor
  'ORGANIZACOES RELIGIOSAS': 'Organizações Religiosas',
  'ORGANIZACAO RELIGIOSA': 'Organizações Religiosas',
  'ASSOCIACOES E FUNDACOES': 'Associações e Fundações',
  'TERCEIRO SETOR E ONGS': 'ONGs',
  'TERCEIRO SETOR': 'ONGs',
  // Valores genéricos / inválidos
  'GERAL': null,
  'NAO APLICAVEL': null,
  'NAO ESPECIFICADO': null,
  'N/A': null,
  '-': null
};

/**
 * Mapeia variações de Sub-sub-vertical → valor canônico.
 */
const SUB_SUB_VERTICAL_ALIAS_MAP = {
  // Judiciário
  'PODER JUDICIARIO': 'Tribunais de Justiça Estaduais',
  'JUDICIARIO': 'Tribunais de Justiça Estaduais',
  'TRIBUNAL DE JUSTICA': 'Tribunais de Justiça Estaduais',
  'TRIBUNAIS DE JUSTICA': 'Tribunais de Justiça Estaduais',
  'TRIBUNAIS DE JUSTICA ESTADUAIS': 'Tribunais de Justiça Estaduais',
  'PODER JUDICIARIO E FUNCOES ESSENCIAIS A JUSTICA': 'Tribunais de Justiça Estaduais',
  'PODER JUDICIARIO E ORGAOS DE JUSTICA': 'Tribunais de Justiça Estaduais',
  'PODER JUDICIARIO E JURIDICO': 'Tribunais de Justiça Estaduais',
  'PODER JUDICIARIO E JUSTICA': 'Tribunais de Justiça Estaduais',
  'JUSTICA': 'Tribunais de Justiça Estaduais',
  'JUSTICA ESTADUAL': 'Tribunais de Justiça Estaduais',
  'JUSTICA FEDERAL': 'Justiça Federal',
  'TRIBUNAL REGIONAL DO TRABALHO': 'Tribunais Regionais do Trabalho',
  'TRIBUNAIS REGIONAIS DO TRABALHO': 'Tribunais Regionais do Trabalho',
  'JUSTICA DO TRABALHO': 'Tribunais Regionais do Trabalho',
  'JUSTICA ELEITORAL': 'Tribunais Regionais Eleitorais',
  'JUSTICA ELEITORAL ESTADUAL': 'Tribunais Regionais Eleitorais',
  'TRIBUNAIS REGIONAIS ELEITORAIS': 'Tribunais Regionais Eleitorais',
  'TRIBUNAL SUPERIOR': 'Tribunais Superiores',
  'TRIBUNAIS SUPERIORES': 'Tribunais Superiores',
  'MINISTERIO PUBLICO': 'Ministério Público',
  'DEFENSORIA PUBLICA': 'Defensoria Pública',
  'TRIBUNAIS DE CONTAS': 'Tribunais de Contas',
  // Segurança Pública → Secretarias de Estado (Pol. Militar, Sec. Segurança, etc.)
  'SEGURANCA PUBLICA': 'Secretarias de Estado',
  'SEGURANCA PUBLICA E JUSTICA': 'Secretarias de Estado',
  'SEGURANCA PUBLICA E DEFESA CIVIL': 'Secretarias de Estado',
  'POLICIA MILITAR': 'Secretarias de Estado',
  // Executivo Estadual
  'GOVERNO ESTADUAL': 'Governos Estaduais e DF',
  'ESTADUAL': 'Governos Estaduais e DF',
  'SECRETARIAS': 'Secretarias de Estado',
  'SECRETARIAS E ORGAOS DO EXECUTIVO': 'Secretarias de Estado',
  'PODER EXECUTIVO SECRETARIAS': 'Secretarias de Estado',
  'PODER EXECUTIVO - SECRETARIAS': 'Secretarias de Estado',
  'PODER EXECUTIVO ESTADUAL': 'Governos Estaduais e DF',
  'AUTARQUIAS E FUNDACOES': 'Autarquias e Fundações Estaduais',
  'AUTARQUIAS E FUNDACOES PUBLICAS': 'Autarquias e Fundações Estaduais',
  'ADMINISTRACAO INDIRETA': 'Autarquias e Fundações Estaduais',
  'ADMINISTRACAO DIRETA': 'Secretarias de Estado',
  'EMPRESA PUBLICA DE TI E PROCESSAMENTO DE DADOS': 'Empresas Públicas Estaduais',
  'EMPRESA PUBLICA DE TI': 'Empresas Públicas Estaduais',
  'EMPRESA PUBLICA': 'Empresas Públicas Estaduais',
  'EMPRESA PUBLICA ECONOMIA MISTA': 'Empresas Públicas Estaduais',
  'EMPRESA PUBLICA / ECONOMIA MISTA': 'Empresas Públicas Estaduais',
  'EMPRESA PUBLICA / SOCIEDADE DE ECONOMIA MISTA': 'Empresas Públicas Estaduais',
  'EMPRESAS PUBLICAS E SOCIEDADES DE ECONOMIA MISTA': 'Empresas Públicas Estaduais',
  'EMPRESAS ESTATAIS E DE ECONOMIA MISTA': 'Empresas Públicas Estaduais',
  'ADMINISTRACAO INDIRETA EMPRESAS PUBLICAS E AUTARQUIAS': 'Autarquias e Fundações Estaduais',
  'ADMINISTRACAO INDIRETA (EMPRESAS PUBLICAS E AUTARQUIAS)': 'Autarquias e Fundações Estaduais',
  'UNIDADE REGIONAL': 'Governos Estaduais e DF',
  'REGIONAL': 'Governos Estaduais e DF',
  'AGENCIA DE FOMENTO': 'Autarquias e Fundações Estaduais',
  'DISTRITO FEDERAL': 'Distrito Federal',
  // Executivo Federal
  'FEDERAL': 'Ministérios e Órgãos Federais',
  'MINISTERIO DA GESTAO E DA INOVACAO EM SERVICOS PUBLICOS': 'Ministérios e Órgãos Federais',
  // Executivo Municipal
  'GOVERNO MUNICIPAL': 'Prefeituras',
  'MUNICIPAL': 'Prefeituras',
  'PREFEITURA': 'Prefeituras',
  'ADMINISTRACAO PUBLICA MUNICIPAL': 'Prefeituras',
  'PODER EXECUTIVO MUNICIPAL': 'Prefeituras',
  'CAMARA MUNICIPAL': 'Câmaras Municipais',
  'PODER LEGISLATIVO MUNICIPAL': 'Câmaras Municipais',
  'COMISSAO GOVERNAMENTAL': 'Prefeituras',
  // Controle
  'PODER EXECUTIVO': 'Secretarias de Estado',
  'EXECUTIVO': 'Secretarias de Estado',
  'ADMINISTRACAO PUBLICA': 'Secretarias de Estado',
  'PUBLICO': 'Secretarias de Estado',
  // Sebrae
  'SEBRAE': 'Sebrae Estadual',
  'SEBRAE SP': 'Sebrae Estadual',
  'SEBRAE CE': 'Sebrae Estadual',
  'SEBRAE/CE': 'Sebrae Estadual',
  'SEBRAE/SP': 'Sebrae Estadual',
  'EMPREENDEDORISMO E PEQUENAS EMPRESAS': 'Sebrae Estadual',
  'MICRO E PEQUENAS EMPRESAS': 'Sebrae Estadual',
  'MICRO E PEQUENAS EMPRESAS (MPES)': 'Sebrae Estadual',
  'APOIO AS MICRO E PEQUENAS EMPRESAS': 'Sebrae Estadual',
  'APOIO A MICRO E PEQUENAS EMPRESAS': 'Sebrae Estadual',
  'SERVICOS DE APOIO AO EMPREENDEDORISMO': 'Sebrae Estadual',
  // Saneamento
  'AGUA E ESGOTO': 'Água e Esgoto',
  'COMPANHIA ESTADUAL DE SANEAMENTO': 'Companhias Estaduais de Saneamento',
  // Energia
  'GAS': 'Gás Natural',
  // Transporte
  'LOGISTICA E FERROVIAS': 'Logística e Ferrovias',
  'TRANSPORTE METROFERROVIARIO': 'Transporte Metroferroviário',
  // TI Pública
  'EMPRESA PUBLICA DE TECNOLOGIA DA INFORMACAO E COMUNICACAO': 'TI Estadual',
  // Hospitais
  'HOSPITAIS PUBLICOS': 'Hospitais Públicos',
  'HOSPITAL': 'Hospitais Públicos',
  'CLINICAS DE REABILITACAO': 'Clínicas e Reabilitação',
  // Tecnologia Privada
  'TECNOLOGIA': 'Software e Cloud',
  'SOFTWARE E SERVICOS DE TI': 'Software e Cloud',
  'SERVICOS DE CLOUD E SOFTWARE': 'Software e Cloud',
  'SERVICOS DE SOFTWARE E CLOUD': 'Software e Cloud',
  'SOLUCOES EM NUVEM E SOFTWARE': 'Software e Cloud',
  'SOFTWARE E CLOUD SERVICES': 'Software e Cloud',
  'SOLUCOES ENERGETICAS': null,  // ambíguo — manter como está
  'DESENVOLVIMENTO DE SISTEMAS': 'Software e Cloud',
  'CONSULTORIA EM LICITACOES': 'Consultoria de TI',
  'CONSULTORIA E SERVICOS DE TI': 'Consultoria de TI',
  'SERVICOS DE TI': 'Consultoria de TI',
  'SERVICOS PROFISSIONAIS': 'Consultoria',
  'TECNOLOGIA DA INFORMACAO': 'Software e Cloud',
  // Financeiro
  'BANCOS DIGITAIS': 'Bancos e Fintechs',
  // Fundações
  'FUNDOS PATRIMONIAIS ENDOWMENTS': 'Fundações de Apoio à Pesquisa',
  'FUNDOS PATRIMONIAIS / ENDOWMENTS': 'Fundações de Apoio à Pesquisa',
  'FUNDACAO DE APOIO A PESQUISA': 'Fundações de Apoio à Pesquisa',
  'CONSELHOS PROFISSIONAIS': 'Conselhos Profissionais',
  // Religioso
  'MISSAO': 'Igrejas e Missões',
  'MIDIA RELIGIOSA': 'Mídia Religiosa',
  // Varejo
  'MODA E VESTUARIO': 'Moda e Vestuário',
  'CALCADOS E ARTIGOS ESPORTIVOS': 'Moda e Vestuário',
  'PRODUTOS NATURAIS E SAUDAVEIS': 'Bens de Consumo',
  'BENS DE CONSUMO': 'Bens de Consumo',
  'EMBALAGENS DE VIDRO': 'Embalagens',
  'DISTRIBUICAO': 'Varejo Físico',
  'E-COMMERCE': 'E-commerce',
  // Agro
  'PRODUCAO DE CELULOSE E PAPEL': 'Papel e Celulose',
  'SUCROENERGETICO': 'Sucroenergético',
  // Secretarias temáticas
  'EDUCACAO': 'Secretarias de Estado',
  'SECRETARIA DE EDUCACAO': 'Secretarias de Estado',
  'SECRETARIA DA FAZENDA': 'Secretarias de Estado',
  'AGRICULTURA E MEIO AMBIENTE': 'Secretarias de Estado',
  'AGRICULTURA E ABASTECIMENTO': 'Secretarias de Estado',
  // Saúde genérico
  'SAUDE': 'Hospitais Públicos',
  // Educação continuada / EaD
  'EDUCACAO CONTINUADA': 'EaD e Plataformas Educacionais',
  // Sistema S como sub-sub
  'SISTEMA S': 'Entidades do Sistema S',
  // Terceiro setor como sub-sub
  'TERCEIRO SETOR E ONGS': 'ONGs Sociais',
  'TERCEIRO SETOR': 'ONGs Sociais',
  // Mídia pública (ambíguo — manter como está)
  'MIDIA E COMUNICACAO': null,
  // Valores genéricos / inválidos
  'GERAL': null,
  'NAO APLICAVEL': null,
  'NAO ESPECIFICADO': null,
  'N/A': null,
  '-': null
};

/**
 * Gera string plana da taxonomia para incluir no prompt da IA.
 */
function buildTaxonomyPromptBlock_() {
  const lines = [];
  for (const [vertical, subs] of Object.entries(VERTICAL_TAXONOMY)) {
    lines.push(`Vertical: "${vertical}"`);
    for (const [subV, subSubs] of Object.entries(subs)) {
      lines.push(`  Sub-vertical: "${subV}"`);
      subSubs.forEach(ss => lines.push(`    Sub-sub-vertical: "${ss}"`));
    }
  }
  return lines.join('\n');
}

/**
 * Normaliza um valor de Sub-vertical para o canônico, ou retorna o próprio valor se não houver alias.
 * @param {string} raw
 * @returns {string}
 */
function normalizarSubVertical_(raw) {
  if (!raw) return raw;
  const key = (typeof normText_ === 'function' ? normText_(raw) : raw.toUpperCase().trim());
  if (SUB_VERTICAL_ALIAS_MAP.hasOwnProperty(key)) {
    return SUB_VERTICAL_ALIAS_MAP[key] || raw;
  }
  return raw;
}

/**
 * Normaliza um valor de Sub-sub-vertical para o canônico, ou retorna o próprio valor se não houver alias.
 * @param {string} raw
 * @returns {string}
 */
function normalizarSubSubVertical_(raw) {
  if (!raw) return raw;
  const key = (typeof normText_ === 'function' ? normText_(raw) : raw.toUpperCase().trim());
  if (SUB_SUB_VERTICAL_ALIAS_MAP.hasOwnProperty(key)) {
    return SUB_SUB_VERTICAL_ALIAS_MAP[key] || raw;
  }
  return raw;
}

/**
 * Normaliza retroativamente os valores de Sub-vertical / Sub-sub-vertical nas abas de análise.
 * Executa pelo menu ou pode ser chamada ao atualizar o mapeamento.
 */
function normalizarVerticaisNaPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abasAlvo = [
    SHEETS.RESULTADO_PIPELINE,
    SHEETS.RESULTADO_GANHAS,
    SHEETS.RESULTADO_PERDIDAS
  ];

  let totalAlterados = 0;

  abasAlvo.forEach(nomAba => {
    const sheet = ss.getSheetByName(nomAba);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    const headers = data[0];

    // Localiza colunas pelo cabeçalho (case insensitive)
    const findCol = (nameFragments) => {
      return headers.findIndex(h => nameFragments.some(f => String(h).toLowerCase().includes(f.toLowerCase())));
    };

    const colSub    = findCol(['sub-vertical ia', 'sub_vertical_ia', 'subvertical ia']);
    const colSubSub = findCol(['sub-sub-vertical ia', 'sub_sub_vertical_ia', 'subsubvertical ia']);

    if (colSub < 0 && colSubSub < 0) return;

    const updates = [];
    for (let r = 1; r < data.length; r++) {
      let changed = false;
      const row = data[r];

      if (colSub >= 0) {
        const rawSub = String(row[colSub] || '').trim();
        const normed = normalizarSubVertical_(rawSub);
        if (normed && normed !== rawSub) {
          sheet.getRange(r + 1, colSub + 1).setValue(normed);
          changed = true;
        }
      }

      if (colSubSub >= 0) {
        const rawSubSub = String(row[colSubSub] || '').trim();
        const normed = normalizarSubSubVertical_(rawSubSub);
        if (normed && normed !== rawSubSub) {
          sheet.getRange(r + 1, colSubSub + 1).setValue(normed);
          changed = true;
        }
      }

      if (changed) totalAlterados++;
    }
    console.log(`✅ Aba "${nomAba}": ${totalAlterados} linhas normalizadas`);
  });

  SpreadsheetApp.getUi().alert(`✅ Normalização de verticais concluída!\n${totalAlterados} linhas atualizadas nas abas de análise.`);
}

function mkClass_(vertical, subVertical, subSubVertical) {
  return {
    vertical,
    subVertical,
    subSubVertical
  };
}

function classificarContaComIAFallback_(conta, produtos, cidade, estado) {
  // Verificar disponibilidade de funções do ShareCode.gs
  if (typeof callGeminiAPI !== 'function') {
    console.warn('⚠️ callGeminiAPI não disponível - verifique se ShareCode.gs está carregado');
    return null;
  }
  if (typeof cleanAndParseJSON !== 'function') {
    console.warn('⚠️ cleanAndParseJSON não disponível - verifique se ShareCode.gs está carregado');
    return null;
  }

  try {
    const taxonomyBlock = buildTaxonomyPromptBlock_();
    const prompt = `Classifique a empresa brasileira abaixo usando a taxonomia B2B Brasil padronizada.

DADOS DA EMPRESA:
- Nome da Conta: ${conta || 'N/A'}
- Produtos/Serviços: ${produtos || 'N/A'}
- Cidade: ${cidade || 'N/A'}
- Estado: ${estado || 'N/A'}

TAXONOMIA CANÔNICA (use EXATAMENTE os valores abaixo, sem inventar variações):
${taxonomyBlock}

REGRAS:
1. Escolha a Vertical, Sub-vertical e Sub-sub-vertical que melhor descrevem a empresa.
2. Os valores dos três campos devem ser copiados LITERALMENTE da taxonomia acima.
3. Não invente variações, acrônimos ou sinônimos.

RESPONDA APENAS COM JSON NESTE FORMATO EXATO:
{
  "Vertical_IA": "valor exato da Vertical",
  "Sub_vertical_IA": "valor exato da Sub-vertical",
  "Sub_sub_vertical_IA": "valor exato da Sub-sub-vertical"
}`;

    console.log(`\n📤 PROMPT ENVIADO (${prompt.length} chars):\n${prompt.substring(0, 400)}...\n`);
    
    // Aumentado para 2048 para dar espaço ao raciocínio do gemini-2.5-pro (usa ~500 tokens de thinking)
    const raw = callGeminiAPI(prompt, { temperature: 0.0, maxOutputTokens: 2048 });
    console.log(`📥 Raw response da IA (primeiros 300 chars): ${raw.substring(0, 300)}`);
    
    const parsed = cleanAndParseJSON(raw);
    console.log(`🔍 Parsed JSON (primeiros 200 chars):`, JSON.stringify(parsed).substring(0, 200));
    
    if (!parsed || typeof parsed !== 'object' || parsed.error) {
      console.warn(`⚠️ IA retornou resposta inválida para conta "${conta}"`);
      console.warn(`   Raw (primeiros 150 chars): ${raw.substring(0, 150)}`);
      console.warn(`   Parsed:`, parsed);
      return null;
    }

    const normalized = normalizeClassificationOutput_(parsed);
    if (!normalized) {
      console.warn(`⚠️ Não foi possível normalizar resposta da IA para conta "${conta}"`);
      console.warn(`   Parsed object keys:`, Object.keys(parsed).join(', '));
      console.warn(`   Parsed object (primeiro 300 chars):`, JSON.stringify(parsed).substring(0, 300));
      return null;
    }

    // Aplica mapa de aliases para garantir valores canônicos mesmo se a IA divergir levemente
    normalized.subVertical    = normalizarSubVertical_(normalized.subVertical)    || normalized.subVertical;
    normalized.subSubVertical = normalizarSubSubVertical_(normalized.subSubVertical) || normalized.subSubVertical;

    return normalized;
  } catch (e) {
    console.warn(`⚠️ Fallback IA falhou para conta "${conta}": ${e.message}`);
    return null;
  }
}

function classificarContaComBuscaWebFallback_(conta, produtos, cidade, estado) {
  // FALLBACK GOOGLE SEARCH desativado temporariamente.
  // Manter função para reativação futura sem retrabalho.
  return null;
}

function normalizeClassificationOutput_(obj) {
  // Tentar múltiplas variações de chaves (case insensitive)
  const vertical = String(
    obj.Vertical_IA || obj.vertical_ia || obj.VerticalIA || obj.verticalIA ||
    obj.Vertical || obj.vertical || obj.VERTICAL_IA || 
    obj['Vertical IA'] || obj['vertical ia'] || ''
  ).trim();
  
  const subVertical = String(
    obj.Sub_vertical_IA || obj.sub_vertical_IA || obj.SubVerticalIA || obj.subVerticalIA ||
    obj['Sub-vertical_IA'] || obj['sub-vertical_IA'] || obj['Sub-vertical IA'] ||
    obj.SubVertical || obj.subVertical || obj.sub_vertical || 
    obj['Sub Vertical'] || obj['sub vertical'] || ''
  ).trim();
  
  const subSubVertical = String(
    obj.Sub_sub_vertical_IA || obj.sub_sub_vertical_IA || obj.SubSubVerticalIA || obj.subSubVerticalIA ||
    obj['Sub-sub-vertical_IA'] || obj['sub-sub-vertical_IA'] || obj['Sub-sub-vertical IA'] ||
    obj.SubSubVertical || obj.subSubVertical || obj.sub_sub_vertical ||
    obj['Sub Sub Vertical'] || obj['sub sub vertical'] || ''
  ).trim();

  if (!vertical || !subVertical || !subSubVertical) {
    console.warn('⚠️ Normalização falhou - campos vazios:', { vertical, subVertical, subSubVertical });
    console.warn('   Chaves disponíveis no objeto:', Object.keys(obj).join(', '));
    return null;
  }

  return {
    vertical,
    subVertical,
    subSubVertical
  };
}
