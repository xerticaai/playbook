/**
 * CorrigirFiscalQ.gs
 * Função para padronizar datas e recalcular Fiscal Q e Ciclo de todas as análises
 * 
 * FUNCIONALIDADES:
 * 1. PADRONIZAÇÃO: Todas as colunas de data são convertidas para formato DD/MM/AAAA
 * 2. FISCAL Q: Recalcula baseado na data correta para cada cenário:
 *    - WON/LOST: usa data da última mudança de fase (do Historico)
 *    - OPEN: usa data prevista de fechamento
 * 3. CICLO: Recalcula dias entre data de criação e data de fechamento
 * 
 * Esta correção atualiza todas as análises existentes em uma única execução
 */

/**
 * Diagnóstico completo de datas em todas as abas
 */
function diagnosticarTodasDatas() {
  console.log('\n🔍 ========================================');
  console.log('🔍 DIAGNÓSTICO COMPLETO DE DATAS');
  console.log('🔍 ========================================\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Diagnosticar TODAS as abas da base
  const abasDiagnostico = ss.getSheets().map(sheet => sheet.getName());
  
  const relatorio = [];
  const violacoes = [];
  const today = normalizeDateToNoon_(new Date());
  
  for (const abaNome of abasDiagnostico) {
    const sheet = ss.getSheetByName(abaNome);
    
    if (!sheet) {
      console.log(`⚠️ Aba "${abaNome}" não encontrada - PULANDO\n`);
      continue;
    }
    
    console.log(`\n📋 ==================== ${abaNome} ====================`);
    
    const data = sheet.getDataRange().getValues();
    const displayData = sheet.getDataRange().getDisplayValues();
    
    if (data.length <= 1) {
      console.log('   ⚠️ Aba vazia ou só com header\n');
      continue;
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    const displayRows = displayData.slice(1);
    
    // Identificar colunas de data
    const dateColumns = identificarColunasDatas_(headers);
    
    console.log(`   📊 Total de colunas: ${headers.length}`);
    console.log(`   📅 Colunas de data identificadas: ${dateColumns.length}\n`);
    
    if (dateColumns.length === 0) {
      console.log('   ⚠️ Nenhuma coluna de data encontrada\n');
      continue;
    }
    
    // Diagnosticar cada coluna de data
    for (const colInfo of dateColumns) {
      const idx = colInfo.idx;
      const nome = colInfo.name;
      
      console.log(`   🔍 Coluna [${idx + 1}]: "${nome}"`);
      
      const diagnostico = diagnosticarColuna_(rows, displayRows, idx, nome, abaNome, today);
      
      console.log(`      📊 Total valores: ${diagnostico.total}`);
      console.log(`      📊 Vazios: ${diagnostico.vazios}`);
      console.log(`      📊 Date objects: ${diagnostico.dateObjects}`);
      console.log(`      📊 Strings: ${diagnostico.strings}`);
      console.log(`      📊 Numbers: ${diagnostico.numbers}`);
      console.log(`      📊 Numbers < 1000: ${diagnostico.numbersSmall}`);
      
      if (diagnostico.formatosString.size > 0) {
        console.log(`      📝 Formatos de string detectados:`);
        diagnostico.formatosString.forEach((count, formato) => {
          console.log(`         • ${formato}: ${count} ocorrências`);
        });
      }
      
      if (diagnostico.amostras.length > 0) {
        console.log(`      🔬 Amostras (primeiras 5 não-vazias):`);
        diagnostico.amostras.forEach((amostra, i) => {
          console.log(`         [${i+1}] RAW: ${JSON.stringify(amostra.raw)} | DISPLAY: "${amostra.display}" | TIPO: ${amostra.tipo}`);
        });
      }
      
      console.log('');
      
      relatorio.push({
        aba: abaNome,
        coluna: nome,
        indice: idx + 1,
        diagnostico: diagnostico
      });

      if (diagnostico.violacoes && diagnostico.violacoes.length > 0) {
        violacoes.push(...diagnostico.violacoes);
      }
    }
  }

  if (violacoes.length > 0) {
    writeDateDiagnosticsReport_(violacoes);
    console.log(`✅ Relatorio de violacoes gerado: ${violacoes.length} registros`);
  } else {
    console.log('✅ Nenhuma violacao de formato ou data futura encontrada');
  }
  
  console.log('\n✅ ========================================');
  console.log('✅ DIAGNÓSTICO COMPLETO');
  console.log('✅ ========================================\n');
  
  return relatorio;
}

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
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;

  const headers = data[0];
  const rows = data.slice(1);
  const dateColumns = identificarColunasDatas_(headers);

  console.log(`\n📋 ==================== ${sheetName} ====================`);
  console.log(`   📊 Total de colunas: ${headers.length}`);
  console.log(`   📅 Colunas de data identificadas: ${dateColumns.length}`);

  if (dateColumns.length === 0) return null;

  dateColumns.forEach(col => {
    const colLetter = columnToLetter_(col.idx + 1);
    const range = sheet.getRange(`${colLetter}2:${colLetter}${rows.length + 1}`);
    const hasTime = rows.some(row => {
      const val = row[col.idx];
      return val instanceof Date && (val.getHours() || val.getMinutes() || val.getSeconds());
    });
    range.setNumberFormat(hasTime ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
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
    const rowIndex = i + 2;

    columnBuffers.forEach(buf => {
      const cellValue = row[buf.idx];
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
          const cleanValue = String(cellValue).replace(/^['"]/, '');
          const parsed = parseDate(cleanValue);
          if (parsed && !isNaN(parsed.getTime())) {
            newValue = normalizeDateToNoon_(parsed);
          }
        } else if (typeof cellValue === 'number') {
          const dateFromSerial = new Date((cellValue - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            newValue = normalizeDateToNoon_(dateFromSerial);
          }
        }

        if (newValue) {
          const originalTs = cellValue instanceof Date ? cellValue.getTime() : null;
          if (originalTs === null || originalTs !== newValue.getTime()) {
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
 * Configura trigger para normalizacao de datas a cada 2 horas
 */
function configurarNormalizacaoDatasAutomatica() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    '🧹 Normalizacao Automatica de Datas',
    'Deseja ativar a normalizacao automatica de datas?\n\n' +
    '⏰ Frequencia: a cada 2 horas\n' +
    '📋 Abrange todas as abas da base\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  clearTriggersByHandler_('normalizarDatasTodasAbas');

  ScriptApp.newTrigger('normalizarDatasTodasAbas')
    .timeBased()
    .everyHours(2)
    .create();

  ui.alert(
    '✅ Normalizacao Automatica Ativada',
    'Trigger criado para normalizar datas a cada 2 horas.',
    ui.ButtonSet.OK
  );
}

/**
 * Desativa trigger automatico de normalizacao de datas
 */
function desativarNormalizacaoDatasAutomatica() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    '🛑 Desativar Normalizacao Automatica',
    'Remover trigger de normalizacao automatica de datas?\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  clearTriggersByHandler_('normalizarDatasTodasAbas');

  ui.alert(
    '✅ Normalizacao Automatica Desativada',
    'Trigger removido com sucesso.',
    ui.ButtonSet.OK
  );
}

/**
 * Identificar colunas que contêm datas (helper function)
 */
function identificarColunasDatas_(headers) {
  const dateColumns = [];
  
  headers.forEach((header, idx) => {
    const headerLower = String(header).toLowerCase().trim();
    
    // EXCLUSÕES: Colunas que contêm palavras de data mas NÃO são datas reais
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
      headerLower.includes('🕐')  // Emoji de relógio usado em metadados
    );
    
    if (isExcluded) return;
    
    // Padrões que indicam coluna de data REAL
    const isDateColumn = (
      headerLower.includes('data') ||
      headerLower.includes('date') ||
      headerLower.includes('fecha') ||
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
 * Diagnosticar uma coluna específica
 */
function diagnosticarColuna_(rows, displayRows, idx, nome, sheetName, today) {
  const resultado = {
    total: rows.length,
    vazios: 0,
    dateObjects: 0,
    strings: 0,
    numbers: 0,
    numbersSmall: 0,
    formatosString: new Map(),
    amostras: [],
    violacoes: []
  };
  
  let amostraCount = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][idx];
    const display = displayRows[i][idx];
    
    // Contar vazios
    if (!raw || raw === '') {
      resultado.vazios++;
      continue;
    }
    
    // Identificar tipo
    let tipo = 'unknown';
    
    if (raw instanceof Date) {
      resultado.dateObjects++;
      tipo = 'Date';
    } else if (typeof raw === 'string') {
      resultado.strings++;
      tipo = 'string';
      
      // Detectar formato da string
      const formato = detectarFormatoData_(raw);
      if (formato) {
        resultado.formatosString.set(formato, (resultado.formatosString.get(formato) || 0) + 1);
      }

      if (!isValidDateStringFormat_(raw)) {
        resultado.violacoes.push({
          aba: sheetName || '',
          coluna: nome,
          linha: i + 2,
          valor_raw: raw,
          valor_display: display,
          tipo: tipo,
          problema: 'Formato invalido (nao dd/mm/aaaa ou dd-mm-aaaa)',
          formato_detectado: formato || 'Outro'
        });
      }
    } else if (typeof raw === 'number') {
      resultado.numbers++;
      tipo = 'number';
      
      if (raw < 1000) {
        resultado.numbersSmall++;
      }

      resultado.violacoes.push({
        aba: sheetName || '',
        coluna: nome,
        linha: i + 2,
        valor_raw: raw,
        valor_display: display,
        tipo: tipo,
        problema: 'Numero em coluna de data',
        formato_detectado: 'Numero'
      });
    }

    if (display && !isValidDateDisplayFormat_(display)) {
      resultado.violacoes.push({
        aba: sheetName || '',
        coluna: nome,
        linha: i + 2,
        valor_raw: raw,
        valor_display: display,
        tipo: tipo,
        problema: 'Display fora do padrao (dd/mm/aaaa ou dd-mm-aaaa)',
        formato_detectado: detectarFormatoDisplay_(display)
      });
    }

    if (isAtividadesCreationColumn_(sheetName, nome)) {
      const parsed = parseDateValueForCompare_(raw || display);
      if (parsed && today && parsed.getTime() > today.getTime()) {
        resultado.violacoes.push({
          aba: sheetName || '',
          coluna: nome,
          linha: i + 2,
          valor_raw: raw,
          valor_display: display,
          tipo: tipo,
          problema: 'Data de criacao maior que hoje (Atividades)',
          formato_detectado: tipo === 'string' ? detectarFormatoData_(raw) : tipo
        });
      }
    }
    
    // Coletar amostras (primeiras 5 não-vazias)
    if (amostraCount < 5) {
      resultado.amostras.push({
        raw: raw,
        display: display,
        tipo: tipo
      });
      amostraCount++;
    }
  }

  resultado.formatosStringObj = {};
  resultado.formatosString.forEach((count, formato) => {
    resultado.formatosStringObj[formato] = count;
  });
  
  return resultado;
}

/**
 * Detectar formato de string de data
 */
function detectarFormatoData_(str) {
  const s = String(str).trim();
  
  // DD/MM/AAAA ou DD/MM/AA
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    return 'DD/MM/AAAA';
  }
  
  // DD-MM-AAAA ou DD-MM-AA
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) {
    return 'DD-MM-AAAA';
  }
  
  // AAAA-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    return 'AAAA-MM-DD';
  }
  
  // Formato longo: "Mon Jan 27 2026..."
  if (/^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}/.test(s)) {
    return 'Date.toString()';
  }
  
  // Com prefixo de aspas
  if (/^['"]/.test(s)) {
    return 'Com prefixo aspas';
  }
  
  return 'Outro';
}

function isValidDateStringFormat_(str) {
  const s = String(str).trim();
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(s);
}

function isValidDateDisplayFormat_(str) {
  const s = String(str).trim();
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(s);
}

function detectarFormatoDisplay_(str) {
  const s = String(str).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return 'DD/MM/AAAA';
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) return 'DD-MM-AAAA';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(s)) return 'DD/MM/AAAA HH:MM';
  if (/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}/.test(s)) return 'DD-MM-AAAA HH:MM';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) return 'MM/DD/AAAA HH:MM AM/PM';
  if (/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s)) return 'MM-DD-AAAA HH:MM AM/PM';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return 'AAAA-MM-DD';
  return 'Outro';
}

function isAtividadesCreationColumn_(sheetName, columnName) {
  if (!sheetName || !columnName) return false;
  if (String(sheetName).toLowerCase() !== 'atividades') return false;
  const name = String(columnName).toLowerCase();
  return name.includes('data de criação') ||
    name.includes('data de criacao') ||
    name.includes('created date');
}

function parseDateValueForCompare_(raw) {
  if (!raw || raw === '') return null;
  if (raw instanceof Date) return normalizeDateToNoon_(raw);
  if (typeof raw === 'string') {
    const parsed = parseDate(raw);
    return parsed ? normalizeDateToNoon_(parsed) : null;
  }
  if (typeof raw === 'number' && isFinite(raw) && raw > 1000) {
    return normalizeDateToNoon_(new Date((raw - 25569) * 86400 * 1000));
  }
  return null;
}

function writeDateDiagnosticsReport_(violacoes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'Diagnostico_Datas';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  sheet.clearContents();

  const header = [
    'Aba',
    'Coluna',
    'Linha',
    'Valor Raw',
    'Valor Display',
    'Tipo',
    'Problema',
    'Formato Detectado'
  ];

  const rows = violacoes.map(v => [
    v.aba || '',
    v.coluna || '',
    v.linha || '',
    v.valor_raw === undefined ? '' : v.valor_raw,
    v.valor_display === undefined ? '' : v.valor_display,
    v.tipo || '',
    v.problema || '',
    v.formato_detectado || ''
  ]);

  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  sheet.setFrozenRows(1);
}

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
      '• Usar data prevista para Pipeline\n\n' +
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
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      console.log(`   ⚠️ Aba ${sheetName} vazia`);
      return { total: 0, atualizados: 0, erros: 0, datesStd: 0 };
    }
    
    const headers = data[0];
    const rows = data.slice(1);
  
  // ========================================
  // FASE 1: PADRONIZAÇÃO DE TODAS AS DATAS
  // ========================================
  console.log(`\n   📅 FASE 1: Padronizando TODAS as datas para DD/MM/AAAA...`);
  
  // Identificar TODAS as colunas que contêm datas (usando helper que já tem exclusões corretas)
  const dateColumns = identificarColunasDatas_(headers);
  
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
    const hasTime = rows.some(row => {
      const val = row[col.idx];
      return val instanceof Date && (val.getHours() || val.getMinutes() || val.getSeconds());
    });
    range.setNumberFormat(hasTime ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy');
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
    const rowIndex = i + 2;
    
    columnBuffers.forEach(buf => {
      const cellValue = row[buf.idx];
      
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
          const cleanValue = String(cellValue).replace(/^['"]/, '');
          const parsed = parseDate(cleanValue);
          if (parsed && !isNaN(parsed.getTime())) {
            newValue = normalizeDateToNoon_(parsed);
          }
        } else if (typeof cellValue === 'number') {
          const dateFromSerial = new Date((cellValue - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            newValue = normalizeDateToNoon_(dateFromSerial);
          }
        }
        
        if (newValue) {
          const originalTs = cellValue instanceof Date ? cellValue.getTime() : null;
          if (originalTs === null || originalTs !== newValue.getTime()) {
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
          // Limpar prefixo de aspas
          createdDate = typeof createdDate === 'string' ? 
            createdDate.replace(/^['\"]/, '') : createdDate;
          
          const parsedCreatedDate = createdDate instanceof Date ? createdDate : parseDate(createdDate);
          if (parsedCreatedDate && !isNaN(parsedCreatedDate.getTime())) {
            dataCriacao = normalizeDateToNoon_(parsedCreatedDate);
            
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
            } else if (typeof lastStageDate === 'string') {
              const cleanDate = lastStageDate.replace(/^['\"]/, '');
              parsedLastStageDate = parseDate(cleanDate);
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
            } else if (typeof createdDate === 'string') {
              const cleanDate = createdDate.replace(/^['\"]/, '');
              const parsedCreatedDate = parseDate(cleanDate);
              if (parsedCreatedDate && !isNaN(parsedCreatedDate.getTime())) {
                dataCriacao = normalizeDateToNoon_(parsedCreatedDate);
              }
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
      } else if (typeof closeDate === 'string') {
        // Ainda é string, parsear
        const cleanCloseDate = closeDate.replace(/^['\"]/, '');
        const parsed = parseDate(cleanCloseDate);
        parsedDate = parsed ? normalizeDateToNoon_(parsed) : null;
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
      
      // Calcular novo Fiscal Q
      const fiscal = calculateFiscalQuarter(parsedDate);
      const oldFiscalQ = String(row[colFiscalQ] || '');
      const newFiscalQ = fiscal.label;
      
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
          
          // Tentar corrigir invertendo as datas
          const closeDateInverted = normalizeDateToNoon_(
            new Date(parsedDate.getFullYear(), parsedDate.getDate() - 1, parsedDate.getMonth() + 1)
          );
          const dataCriacaoInverted = normalizeDateToNoon_(
            new Date(dataCriacao.getFullYear(), dataCriacao.getDate() - 1, dataCriacao.getMonth() + 1)
          );
          const cicloInverted = Math.ceil((closeDateInverted - dataCriacaoInverted) / MS_PER_DAY);
          
          console.warn(`   🔄 [${i+1}] Testando inversão: ${cicloInverted} dias`);
          console.warn(`   🔄 [${i+1}] closeDate invertido: ${closeDateInverted.getDate()}/${closeDateInverted.getMonth()+1}/${closeDateInverted.getFullYear()}`);
          console.warn(`   🔄 [${i+1}] dataCriacao invertido: ${dataCriacaoInverted.getDate()}/${dataCriacaoInverted.getMonth()+1}/${dataCriacaoInverted.getFullYear()}`);
          
          // Se a inversão resultar em ciclo positivo, usar ela
          if (cicloInverted > 0 && cicloInverted < 1000) {
            console.warn(`   ✅ [${i+1}] Usando ciclo invertido: ${cicloInverted} dias`);
            newCiclo = cicloInverted;
            parsedDate = closeDateInverted;
            dataCriacao = dataCriacaoInverted;
            closeDate = parsedDate;
            dataCorrected = true;
          } else {
            console.error(`   ❌ [${i+1}] Inversão não resolveu. Pulando cálculo de ciclo.`);
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
  const lowered = patterns.map(p => String(p).toLowerCase());
  return headers.findIndex(h =>
    lowered.some(p => String(h).toLowerCase().includes(p))
  );
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
