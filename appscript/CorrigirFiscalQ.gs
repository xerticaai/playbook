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
  const dateColumns = identificarColunasDatas_(headers);

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
 * Configura trigger para normalizacao de datas a cada 30 minutos
 */
function getUiIfAvailable_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

function configurarNormalizacaoDatasAutomatica() {
  const ui = getUiIfAvailable_();

  if (ui) {
    const response = ui.alert(
      '🧹 Normalizacao Automatica de Datas',
      'Deseja ativar a normalizacao automatica de datas?\n\n' +
      '⏰ Frequencia: a cada 30 minutos\n' +
      '📋 Abrange todas as abas da base\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_('normalizarDatasTodasAbas');

  ScriptApp.newTrigger('normalizarDatasTodasAbas')
    .timeBased()
    .everyMinutes(30)
    .create();

  if (ui) {
    ui.alert(
      '✅ Normalizacao Automatica Ativada',
      'Trigger criado para normalizar datas a cada 30 minutos.',
      ui.ButtonSet.OK
    );
  } else {
    console.log('✅ Normalizacao automatica ativada (a cada 30 min).');
  }
}

const FISCALQ_REFRESH_LOG_SHEET_ = 'Auto Refresh Execution Log';
const FISCALQ_REFRESH_PROP_TS_ = 'FISCALQ_LAST_REFRESH_TS';
const FISCALQ_REFRESH_MONITOR_HANDLER_ = 'monitorarRefreshSalesConnectorFiscalQ';
const FISCALQ_REFRESH_TARGET_SHEETS_ = [
  'Pipeline_Aberto',
  'Historico_Ganhos',
  'Historico_Perdidas',
  'Historico_Alteracoes_Ganhos',
  'Alteracoes_Oportunidade',
  'Atividades'
];

function parsePtBrDateTime_(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const hh = parseInt(m[4], 10);
  const mm = parseInt(m[5], 10);
  const ss = parseInt(m[6] || '0', 10);

  const dt = new Date(year, month - 1, day, hh, mm, ss, 0);
  if (isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== year || (dt.getMonth() + 1) !== month || dt.getDate() !== day) return null;
  return dt;
}

function getRefreshLogLatestTimestamp_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName(FISCALQ_REFRESH_LOG_SHEET_);
  if (!logSheet) return null;

  const lastRow = logSheet.getLastRow();
  const lastCol = logSheet.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) return null;

  const data = logSheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(h => String(h || '').trim().toLowerCase());
  const colRefresh = headers.findIndex(h => h === 'refresh time' || h === 'refresh' || h.includes('refresh'));
  if (colRefresh === -1) return null;

  let maxTs = null;
  for (let i = 1; i < data.length; i++) {
    const dt = parsePtBrDateTime_(data[i][colRefresh]);
    if (!dt) continue;
    if (!maxTs || dt.getTime() > maxTs.getTime()) maxTs = dt;
  }
  return maxTs;
}

/**
 * Configura monitor do Sales Connector para disparar Corrigir Fiscal Q quando houver novo refresh.
 * Trigger time-based (15 min), sem onEdit.
 */
function configurarMonitorRefreshFiscalQ() {
  const ui = getUiIfAvailable_();
  if (ui) {
    const response = ui.alert(
      '🔗 Monitor FiscalQ por Refresh Log',
      'Ativar monitor automático baseado na aba "Auto Refresh Execution Log"?\n\n' +
      '• Verificação a cada 15 minutos\n' +
      '• Dispara normalização + recálculo somente se houver novo refresh SUCCESS\n' +
      '• Não usa gatilho onEdit\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_(FISCALQ_REFRESH_MONITOR_HANDLER_);
  // Evita concorrência com trigger antigo de normalização cega
  clearTriggersByHandler_('normalizarDatasTodasAbas');

  const latest = getRefreshLogLatestTimestamp_();
  if (latest) {
    PropertiesService.getScriptProperties().setProperty(FISCALQ_REFRESH_PROP_TS_, String(latest.getTime()));
  }

  ScriptApp.newTrigger(FISCALQ_REFRESH_MONITOR_HANDLER_)
    .timeBased()
    .everyMinutes(15)
    .create();

  if (ui) {
    ui.alert(
      '✅ Monitor Ativado',
      'Monitor de refresh configurado (15 min).\n' +
      'A rotina FiscalQ será executada quando houver novo SUCCESS nas abas-base.',
      ui.ButtonSet.OK
    );
  } else {
    console.log('✅ Monitor FiscalQ por refresh ativado (15 min).');
  }
}

function desativarMonitorRefreshFiscalQ() {
  const ui = getUiIfAvailable_();
  if (ui) {
    const response = ui.alert(
      '⏸️ Desativar Monitor FiscalQ',
      'Remover trigger de monitoramento por Refresh Log?\n\nContinuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_(FISCALQ_REFRESH_MONITOR_HANDLER_);
  if (ui) {
    ui.alert('✅ Monitor Desativado', 'Trigger removido com sucesso.', ui.ButtonSet.OK);
  } else {
    console.log('✅ Monitor FiscalQ desativado.');
  }
}

/**
 * Trigger target: verifica Auto Refresh Execution Log e dispara rotina fiscal somente quando necessário.
 */
function monitorarRefreshSalesConnectorFiscalQ() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.warn('⏳ monitorarRefreshSalesConnectorFiscalQ: execução já em andamento, pulando.');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName(FISCALQ_REFRESH_LOG_SHEET_);
    if (!logSheet) {
      console.warn(`⚠️ Aba "${FISCALQ_REFRESH_LOG_SHEET_}" não encontrada.`);
      return;
    }

    const lastRow = logSheet.getLastRow();
    const lastCol = logSheet.getLastColumn();
    if (lastRow <= 1 || lastCol <= 0) return;

    const data = logSheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headers = data[0].map(h => String(h || '').trim().toLowerCase());
    const colRefresh = headers.findIndex(h => h === 'refresh time' || h.includes('refresh'));
    const colSheet = headers.findIndex(h => h === 'sheet');
    const colStatus = headers.findIndex(h => h === 'status');
    if (colRefresh === -1 || colSheet === -1 || colStatus === -1) {
      console.warn('⚠️ Colunas esperadas não encontradas em Auto Refresh Execution Log.');
      return;
    }

    const props = PropertiesService.getScriptProperties();
    const lastTs = parseInt(props.getProperty(FISCALQ_REFRESH_PROP_TS_) || '0', 10) || 0;

    let hasNewSuccessInBase = false;
    let maxSeenTs = lastTs;

    // percorre de baixo para cima (mais recentes primeiro)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const dt = parsePtBrDateTime_(row[colRefresh]);
      if (!dt) continue;
      const ts = dt.getTime();

      if (ts <= lastTs) break;
      if (ts > maxSeenTs) maxSeenTs = ts;

      const sheetName = String(row[colSheet] || '').trim();
      const status = String(row[colStatus] || '').trim().toLowerCase();
      if (status === 'success' && FISCALQ_REFRESH_TARGET_SHEETS_.indexOf(sheetName) > -1) {
        hasNewSuccessInBase = true;
      }
    }

    if (!hasNewSuccessInBase) {
      if (maxSeenTs > lastTs) {
        props.setProperty(FISCALQ_REFRESH_PROP_TS_, String(maxSeenTs));
      }
      return;
    }

    console.log('🔄 Novo refresh SUCCESS detectado nas abas-base. Iniciando normalização + recálculo FiscalQ...');
    normalizarDatasTodasAbas();
    recalcularFiscalQTodasAnalises();

    props.setProperty(FISCALQ_REFRESH_PROP_TS_, String(maxSeenTs));
    console.log('✅ Rotina FiscalQ concluída após refresh do Sales Connector.');
  } catch (e) {
    console.error(`❌ monitorarRefreshSalesConnectorFiscalQ falhou: ${e.message}`);
    logToSheet("ERROR", "FiscalQMonitor", `Falha no monitor de refresh: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Desativa trigger automatico de normalizacao de datas
 */
function desativarNormalizacaoDatasAutomatica() {
  const ui = getUiIfAvailable_();

  if (ui) {
    const response = ui.alert(
      '🛑 Desativar Normalizacao Automatica',
      'Remover trigger de normalizacao automatica de datas?\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) return;
  }

  clearTriggersByHandler_('normalizarDatasTodasAbas');

  if (ui) {
    ui.alert(
      '✅ Normalizacao Automatica Desativada',
      'Trigger removido com sucesso.',
      ui.ButtonSet.OK
    );
  } else {
    console.log('✅ Normalizacao automatica desativada.');
  }
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
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s)) {
      const parsed = new Date(s);
      return isNaN(parsed.getTime()) ? null : normalizeDateToNoon_(parsed);
    }
    return null;
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

  let headers = analysisSheet.getRange(1, 1, 1, analysisSheet.getLastColumn()).getValues()[0];
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
    const insertAt = colLastUpdate >= 0 ? (colLastUpdate + 1) : (analysisSheet.getLastColumn() + 1);
    analysisSheet.insertColumnBefore(insertAt);
    analysisSheet.getRange(1, insertAt).setValue(CREATED_HEADER);
    analysisSheet.getRange(1, insertAt).setBackground('#134f5c').setFontColor('white').setFontWeight('bold');
    colunaInserida = true;
    SpreadsheetApp.flush();
  }

  headers = analysisSheet.getRange(1, 1, 1, analysisSheet.getLastColumn()).getValues()[0];
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

  const rows = analysisSheet.getRange(2, 1, lastRow - 1, analysisSheet.getLastColumn()).getValues();
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
  const msg =
    `✅ Enriquecimento concluído\n\n` +
    `• Linhas avaliadas: ${result.total}\n` +
    `• Colunas inseridas: ${result.colunasInseridas}\n` +
    `• Campos base atualizados: ${result.baseAtualizados}\n` +
    `• Classificações por regra: ${result.classificadosRegra}\n` +
    `• Classificações por IA: ${result.classificadosIA}\n` +
    `• Classificações por busca: ${result.classificadosBusca}\n` +
    `• Pendentes revisão: ${result.pendentes}\n` +
    `• Erros: ${result.erros}`;

  console.log(msg);
  if (ui) {
    ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  }
}

function enriquecerForecastComSegmentacaoIA_() {
  return enriquecerAnaliseComSegmentacaoIA_('🎯 Análise Forecast IA', (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto');
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
  const msg =
    `✅ Enriquecimento Ganhas concluído\n\n` +
    `• Linhas avaliadas: ${result.total}\n` +
    `• Colunas inseridas: ${result.colunasInseridas}\n` +
    `• Campos base atualizados: ${result.baseAtualizados}\n` +
    `• Classificações por regra: ${result.classificadosRegra}\n` +
    `• Classificações por IA: ${result.classificadosIA}\n` +
    `• Classificações por busca: ${result.classificadosBusca}\n` +
    `• Pendentes revisão: ${result.pendentes}\n` +
    `• Erros: ${result.erros}`;

  console.log(msg);
  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
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
  const msg =
    `✅ Enriquecimento Perdidas concluído\n\n` +
    `• Linhas avaliadas: ${result.total}\n` +
    `• Colunas inseridas: ${result.colunasInseridas}\n` +
    `• Campos base atualizados: ${result.baseAtualizados}\n` +
    `• Classificações por regra: ${result.classificadosRegra}\n` +
    `• Classificações por IA: ${result.classificadosIA}\n` +
    `• Classificações por busca: ${result.classificadosBusca}\n` +
    `• Pendentes revisão: ${result.pendentes}\n` +
    `• Erros: ${result.erros}`;

  console.log(msg);
  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
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

  const forecast = enriquecerAnaliseComSegmentacaoIA_('🎯 Análise Forecast IA', (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto');
  const won = enriquecerAnaliseComSegmentacaoIA_('📈 Análise Ganhas', (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos');
  const lost = enriquecerAnaliseComSegmentacaoIA_('📉 Análise Perdidas', (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas');

  const msg =
    `✅ Enriquecimento completo concluído\n\n` +
    `Forecast: ${forecast.total} linhas | Regra ${forecast.classificadosRegra} | IA ${forecast.classificadosIA} | Busca ${forecast.classificadosBusca} | Pendentes ${forecast.pendentes}\n` +
    `Ganhas: ${won.total} linhas | Regra ${won.classificadosRegra} | IA ${won.classificadosIA} | Busca ${won.classificadosBusca} | Pendentes ${won.pendentes}\n` +
    `Perdidas: ${lost.total} linhas | Regra ${lost.classificadosRegra} | IA ${lost.classificadosIA} | Busca ${lost.classificadosBusca} | Pendentes ${lost.pendentes}`;

  console.log(msg);
  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);

  return { forecast, won, lost };
}

function enriquecerAnaliseComSegmentacaoIA_(analysisSheetName, baseSheetName) {
  const ANALYSIS_SHEET = '🎯 Análise Forecast IA';
  const LAST_UPDATE_HEADER = '🕐 Última Atualização';
  const REQUIRED_HEADERS = [
    'Owner Preventa',
    'Produtos',
    'Cidade de cobrança',
    'Estado/Província de cobrança',
    'Vertical IA',
    'Sub-vertical IA',
    'Sub-sub-vertical IA',
    'Justificativa IA'
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const analysisSheet = ss.getSheetByName(analysisSheetName || ANALYSIS_SHEET);
  if (!analysisSheet) throw new Error(`Aba ${analysisSheetName || ANALYSIS_SHEET} não encontrada`);

  const colunasInseridas = ensureColumnsBeforeLastUpdate_(analysisSheet, REQUIRED_HEADERS, LAST_UPDATE_HEADER);

  const analysisLastRow = analysisSheet.getLastRow();
  const analysisLastCol = analysisSheet.getLastColumn();
  if (analysisLastRow <= 1 || analysisLastCol <= 0) {
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

  const analysisRange = analysisSheet.getRange(1, 1, analysisLastRow, analysisLastCol);
  const analysisData = analysisRange.getValues();
  const analysisHeaders = analysisData[0];
  const analysisRows = analysisData.slice(1);

  const baseSheet = ss.getSheetByName(baseSheetName);
  if (!baseSheet || baseSheet.getLastRow() <= 1) {
    throw new Error(`Aba base "${baseSheetName}" não encontrada ou vazia`);
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
  const colJustificativa = findLastHeaderIndexExact_(analysisHeaders, 'Justificativa IA');

  const outputRows = analysisRows.map(r => r.slice());
  let baseAtualizados = 0;
  let classificadosRegra = 0;
  let classificadosIA = 0;
  let classificadosBusca = 0;
  let pendentes = 0;
  let erros = 0;

  const classificationByAccount = new Map();

  for (let i = 0; i < outputRows.length; i++) {
    try {
      const row = outputRows[i];
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

      const accountKey = (typeof normText_ === 'function')
        ? normText_(`${conta}|${produtos}|${billingCity}|${billingState}`)
        : `${conta}|${produtos}|${billingCity}|${billingState}`.toLowerCase();

      if (!classificationByAccount.has(accountKey)) {
        const byRule = classificarContaPorRegrasGTM_(conta, produtos, billingCity, billingState);
        if (byRule) {
          classificationByAccount.set(accountKey, { ...byRule, source: 'RULE' });
        } else {
          const byIA = classificarContaComIAFallback_(conta, produtos, billingCity, billingState);
          if (byIA) {
            classificationByAccount.set(accountKey, { ...byIA, source: 'IA' });
          } else {
            // FALLBACK GOOGLE SEARCH (DESATIVADO TEMPORARIAMENTE)
            // const bySearch = classificarContaComBuscaWebFallback_(conta, produtos, billingCity, billingState);
            // if (bySearch) {
            //   classificationByAccount.set(accountKey, { ...bySearch, source: 'SEARCH' });
            // } else {
            //   classificationByAccount.set(accountKey, {
            //     vertical: 'Setor Privado: Corporativo',
            //     subVertical: 'Serviços Profissionais e B2B',
            //     subSubVertical: 'Consultoria',
            //     justificativa: 'Classificação padrão por ausência de sinais suficientes. Revisar manualmente.',
            //     source: 'PENDING'
            //   });
            // }
            classificationByAccount.set(accountKey, {
              vertical: 'Setor Privado: Corporativo',
              subVertical: 'Serviços Profissionais e B2B',
              subSubVertical: 'Consultoria',
              justificativa: 'Classificação padrão por ausência de sinais suficientes. Revisar manualmente.',
              source: 'PENDING'
            });
          }
        }
      }

      const classification = classificationByAccount.get(accountKey);

      if (colVertical > -1) row[colVertical] = classification.vertical;
      if (colSubVertical > -1) row[colSubVertical] = classification.subVertical;
      if (colSubSubVertical > -1) row[colSubSubVertical] = classification.subSubVertical;
      if (colJustificativa > -1) row[colJustificativa] = classification.justificativa;

      if (classification.source === 'RULE') classificadosRegra++;
      else if (classification.source === 'IA') classificadosIA++;
      else if (classification.source === 'SEARCH') classificadosBusca++;
      else pendentes++;
    } catch (err) {
      erros++;
      console.error(`⚠️ Erro ao enriquecer linha ${i + 2}: ${err.message}`);
    }
  }

  analysisSheet.getRange(2, 1, outputRows.length, analysisHeaders.length).setValues(outputRows);
  SpreadsheetApp.flush();

  return {
    total: outputRows.length,
    colunasInseridas,
    baseAtualizados,
    classificadosRegra,
    classificadosIA,
    classificadosBusca,
    pendentes,
    erros
  };
}

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
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const alreadyExists = currentHeaders.some(h => String(h || '').trim().toLowerCase() === String(header).trim().toLowerCase());
    if (alreadyExists) return;

    const colLastUpdate = currentHeaders.findIndex(h => String(h || '').trim() === lastUpdateHeader);
    const insertAt = colLastUpdate >= 0 ? colLastUpdate + 1 : sheet.getLastColumn() + 1;
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

function classificarContaPorRegrasGTM_(conta, produtos, cidade, estado) {
  const text = [conta, produtos, cidade, estado]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' | ');
  const n = (typeof normText_ === 'function') ? normText_(text) : text.toUpperCase();
  if (!n) return null;

  const has = (arr) => arr.some(k => n.indexOf((typeof normText_ === 'function') ? normText_(k) : String(k).toUpperCase()) > -1);

  if (has(['STF', 'STJ', 'TST', 'TSE', 'STM'])) {
    return mkClass_('Governo', 'Justiça', 'Tribunais Superiores', 'Identificado por sigla de tribunal superior.');
  }
  if (has(['TRT', 'TRIBUNAL REGIONAL DO TRABALHO'])) {
    return mkClass_('Governo', 'Justiça', 'Tribunal Regional do Trabalho', 'Identificado por sigla/descrição TRT.');
  }
  if (has(['TRE', 'TRIBUNAL REGIONAL ELEITORAL'])) {
    return mkClass_('Governo', 'Justiça', 'Tribunal Regional Eleitoral', 'Identificado por sigla/descrição TRE.');
  }
  if (has(['TJ ', 'TRIBUNAL DE JUSTICA'])) {
    return mkClass_('Governo', 'Justiça', 'Tribunal de Justiça Estadual', 'Identificado por TJ/Tribunal de Justiça.');
  }
  if (has(['TRF', 'JUSTICA FEDERAL', 'VARA FEDERAL'])) {
    return mkClass_('Governo', 'Justiça', 'Justiça Federal', 'Identificado por TRF/Justiça Federal.');
  }

  if (has(['MPF', 'MPE', 'MPT', 'MINISTERIO PUBLICO'])) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Ministério Público', 'Identificado por MP/Ministério Público.');
  }
  if (has(['TCU', 'TCE', 'TCM', 'TRIBUNAL DE CONTAS'])) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Tribunal de Contas', 'Identificado por Tribunal de Contas.');
  }
  if (has(['DPU', 'DPE', 'DEFENSORIA'])) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Defensoria Pública', 'Identificado por Defensoria.');
  }
  if (has(['AGU', 'PGE', 'PGM', 'PGFN', 'PROCURADORIA'])) {
    return mkClass_('Governo', 'Controle, Fiscalização e Defesa', 'Procuradoria e Advocacia Pública', 'Identificado por Procuradoria/AGU/PGE/PGM.');
  }

  if (has(['POLICIA FEDERAL', 'PF', 'PRF', 'POLICIA MILITAR', 'POLICIA CIVIL'])) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Forças Policiais', 'Identificado por forças policiais.');
  }
  if (has(['SSP', 'SESP', 'SECRETARIA DE SEGURANCA'])) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Secretaria de Segurança', 'Identificado por SSP/SESP.');
  }
  if (has(['DETRAN', 'CET'])) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Órgão de Trânsito', 'Identificado por DETRAN/CET.');
  }
  if (has(['BOMBEIRO', 'CBM'])) {
    return mkClass_('Governo', 'Segurança Pública e Trânsito', 'Corpo de Bombeiros', 'Identificado por Bombeiros/CBM.');
  }

  if (has(['SERPRO', 'DATAPREV', 'PRODESP', 'PRODAM', 'MTI', 'PROCERGS', 'CIASC', 'PRODERJ', 'PRODEMGE', 'PRODABEL'])) {
    return mkClass_('Governo', 'Tecnologia e Processamento', 'Empresa Pública de TI', 'Identificado por empresa pública de TI.');
  }

  if (has(['MINISTERIO', 'MEC', 'MGI'])) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Ministério/Governo Federal', 'Identificado por ministério/órgão federal.');
  }
  if (has(['SEFAZ', 'SEPLAG', 'GOVERNO DO ESTADO', 'SECRETARIA DE'])) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Governo Estadual e Secretarias', 'Identificado por secretaria/órgão estadual.');
  }
  if (has(['PREFEITURA', 'MUNICIPIO DE'])) {
    return mkClass_('Governo', 'Administração Direta e Ministérios', 'Prefeitura Municipal', 'Identificado por prefeitura/município.');
  }

  if (has(['SENADO', 'CAMARA DOS DEPUTADOS'])) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Federal', 'Identificado por casa legislativa federal.');
  }
  if (has(['ASSEMBLEIA LEGISLATIVA', 'ALESP', 'ALERJ'])) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Estadual', 'Identificado por assembleia legislativa.');
  }
  if (has(['CAMARA MUNICIPAL', 'CAMARA DE VEREADORES'])) {
    return mkClass_('Governo', 'Legislativo', 'Legislativo Municipal', 'Identificado por câmara municipal.');
  }

  if (has(['COPASA', 'SABESP', 'SANEPAR', 'CAESB'])) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Saneamento e Água', 'Identificado por empresa de saneamento/água.');
  }
  if (has(['ELETROBRAS', 'CEMIG', 'CEB', 'ENERGIA', 'GAS'])) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Energia e Gás', 'Identificado por empresa de energia/gás.');
  }
  if (has(['PORTO', 'DOCAS', 'ANTAQ', 'ANTT', 'ANEEL', 'ANP'])) {
    return mkClass_('Utilities e Infraestrutura Pública', 'Infraestrutura Essencial', 'Logística e Portos', 'Identificado por logística/portos/regulação.');
  }

  if (has(['SEBRAE', 'SENAI', 'SENAC', 'SESC', 'SESI'])) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Sistema S', 'Identificado por entidade do Sistema S.');
  }
  if (has(['OAB', 'CRM', 'CREA', 'CRO', 'CRP', 'CONSELHO'])) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Conselho Profissional', 'Identificado por conselho profissional.');
  }
  if (has(['BNDES', 'BRDE', 'BANCO DE DESENVOLVIMENTO'])) {
    return mkClass_('Sistema S, Entidades de Classe e Fomento', 'Apoio Institucional e Desenvolvimento', 'Banco de Desenvolvimento e Fomento', 'Identificado por instituição de fomento.');
  }

  if (has(['HOSPITAL', 'CLINICA', 'UNIMED', 'HAPVIDA', 'QUALICORP', 'FIOCRUZ', 'INCA', 'SECRETARIA DE SAUDE', 'SES', 'SMS'])) {
    const isPublic = has(['SECRETARIA DE SAUDE', 'SES', 'SMS', 'FIOCRUZ', 'INCA']);
    return mkClass_('Saúde', isPublic ? 'Saúde Pública' : 'Saúde Privada', isPublic ? 'Secretaria de Saúde' : 'Hospital e Clínica', 'Identificado por termos do setor de saúde.');
  }

  if (has(['SEDUC', 'MEC', 'UNIVERSIDADE', 'USP', 'UFMG', 'IF', 'FACULDADE', 'COLEGIO', 'ESCOLA', 'MACKENZIE'])) {
    const isPublic = has(['SEDUC', 'MEC', 'USP', 'UFMG', 'IF', 'SECRETARIA DE EDUCACAO']);
    return mkClass_('Educação', isPublic ? 'Educação Pública' : 'Educação Privada', isPublic ? 'Ensino Básico e Secretarias' : 'Ensino Superior', 'Identificado por termos do setor de educação.');
  }

  if (has(['AMAGGI', 'BOM FUTURO', 'COOPERATIVA', 'AGRO', 'FAZENDA', 'FERTILIZANTE', 'INSUMO', 'COPASUL', 'LAR'])) {
    if (has(['COOPERATIVA', 'COPASUL', 'LAR'])) {
      return mkClass_('Agronegócio e Cooperativas', 'Cadeia Produtiva Agrícola', 'Cooperativa Agroindustrial', 'Identificado por cooperativa do agro.');
    }
    return mkClass_('Agronegócio e Cooperativas', 'Cadeia Produtiva Agrícola', 'Produtor e Fazenda', 'Identificado por termos do agronegócio.');
  }

  if (has(['MISSAO', 'MISSAO', 'ONG', 'ASSOCIACAO', 'ASSOCIAÇÃO', 'CSEM', 'FUNDO PATRIMONIAL', 'FILANTROP'])) {
    if (has(['MISSAO', 'MISSAO', 'RELIGIOSA'])) {
      return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'Entidade Religiosa e Missões', 'Identificado por organização religiosa/missão.');
    }
    return mkClass_('Terceiro Setor e ONGs', 'Organizações da Sociedade Civil', 'ONG e Associação Civil', 'Identificado por ONG/associação civil.');
  }

  if (has(['TV ', 'TELEVISAO', 'RBS', 'CANCAO NOVA', 'CANÇÃO NOVA', 'CORREIO BRAZILIENSE', 'TELEBRAS', 'TELECOM'])) {
    return mkClass_('Setor Privado: Corporativo', 'Mídia, Comunicação e Telecom', 'Emissora de TV/Rádio', 'Identificado por mídia/telecom.');
  }

  if (has(['BANCO', 'SEGURADORA', 'PAGAMENTO', 'FINANCEIRA'])) {
    return mkClass_('Setor Privado: Corporativo', 'Finanças', 'Banco Comercial', 'Identificado por termos do setor financeiro.');
  }
  if (has(['CARREFOUR', 'MAGAZINE LUIZA', 'ATACADO', 'SUPERMERCADO', 'VAREJO', 'E-COMMERCE'])) {
    return mkClass_('Setor Privado: Corporativo', 'Varejo e E-commerce', 'Supermercado e Atacado', 'Identificado por termos de varejo/e-commerce.');
  }
  if (has(['LOGISTICA', 'TRANSPORTE', 'MOBILIDADE'])) {
    return mkClass_('Setor Privado: Corporativo', 'Logística', 'Transporte e Mobilidade', 'Identificado por termos de logística/transporte.');
  }
  if (has(['CI&T', 'TECNOLOGIA', 'SOFTWARE', 'SAAS'])) {
    return mkClass_('Setor Privado: Corporativo', 'Tecnologia Privada', 'Serviços Profissionais e B2B', 'Identificado por empresa de tecnologia privada.');
  }
  if (has(['ADVOGADOS', 'ADVOCACIA', 'CONSULTORIA', 'FANTASY SPORTS', 'SERVICOS'])) {
    return mkClass_('Setor Privado: Corporativo', 'Serviços Profissionais e B2B', 'Consultoria', 'Identificado por serviços profissionais/consultoria.');
  }

  return null;
}

function mkClass_(vertical, subVertical, subSubVertical, justificativa) {
  return {
    vertical,
    subVertical,
    subSubVertical,
    justificativa
  };
}

function classificarContaComIAFallback_(conta, produtos, cidade, estado) {
  if (typeof callGeminiAPI !== 'function' || typeof cleanAndParseJSON !== 'function') {
    return null;
  }

  try {
    const prompt =
      'Classifique a conta abaixo em JSON ESTRITO com chaves: Vertical_IA, Sub_vertical_IA, Sub_sub_vertical_IA, Justificativa. ' +
      'Use somente taxonomia B2B Brasil (Governo, Utilities e Infraestrutura Pública, Sistema S, Saúde, Educação, Agronegócio e Cooperativas, Setor Privado: Corporativo, Terceiro Setor e ONGs). ' +
      'Conta: ' + JSON.stringify(conta || '') + '; ' +
      'Produtos: ' + JSON.stringify(produtos || '') + '; ' +
      'Cidade de cobrança: ' + JSON.stringify(cidade || '') + '; ' +
      'Estado/Província de cobrança: ' + JSON.stringify(estado || '') + '. ' +
      'Responda apenas objeto JSON válido.';

    const raw = callGeminiAPI(prompt, { temperature: 0.0, maxOutputTokens: 512, responseMimeType: 'application/json' });
    const parsed = cleanAndParseJSON(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.error) return null;

    const normalized = normalizeClassificationOutput_(parsed);
    if (!normalized) return null;

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
  const vertical = String(obj.Vertical_IA || obj.vertical_ia || obj.VerticalIA || '').trim();
  const subVertical = String(obj.Sub_vertical_IA || obj.sub_vertical_ia || obj.SubVerticalIA || '').trim();
  const subSubVertical = String(obj.Sub_sub_vertical_IA || obj.sub_sub_vertical_ia || obj.SubSubVerticalIA || '').trim();
  const justificativa = String(obj.Justificativa || obj.Justificativa_IA || obj.justificativa || '').trim();

  if (!vertical || !subVertical || !subSubVertical) return null;

  return {
    vertical,
    subVertical,
    subSubVertical,
    justificativa: justificativa || 'Classificação inferida por IA.'
  };
}
