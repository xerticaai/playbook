/**
 * Módulo de monitoramento/trigger para normalização de datas e recálculo fiscal.
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
