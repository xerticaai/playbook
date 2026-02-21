/**
 * Módulo de diagnóstico de colunas de data.
 */

function identificarColunasDatas_(headers) {
  const dateColumns = [];

  headers.forEach((header, idx) => {
    const headerLower = String(header).toLowerCase().trim();

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
      headerLower.includes('📅') ||
      headerLower.includes('⏰')
    );

    if (isDateColumn) {
      dateColumns.push({ idx, name: header });
    }
  });

  return dateColumns;
}

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

    if (!raw || raw === '') {
      resultado.vazios++;
      continue;
    }

    let tipo = 'unknown';

    if (raw instanceof Date) {
      resultado.dateObjects++;
      tipo = 'Date';
    } else if (typeof raw === 'string') {
      resultado.strings++;
      tipo = 'string';

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

function detectarFormatoData_(str) {
  const s = String(str).trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    return 'DD/MM/AAAA';
  }

  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) {
    return 'DD-MM-AAAA';
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    return 'AAAA-MM-DD';
  }

  if (/^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}/.test(s)) {
    return 'Date.toString()';
  }

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
