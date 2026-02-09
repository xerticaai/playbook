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
  
  // Lista de todas as abas a diagnosticar
  const abasDiagnostico = [
    'Historico_Alteracoes_Ganhos',
    'Historico_Ganhos',
    'Historico_Perdidas',
    'Pipeline_Aberto',
    'Alteracoes_Oportunidades',
    'Atividades',
    '🎯 Análise Forecast IA',
    '📉 Análise Perdidas',
    '📈 Análise Ganhas',
    'Análise Sales Specialist'
  ];
  
  const relatorio = [];
  
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
      
      const diagnostico = diagnosticarColuna_(rows, displayRows, idx, nome);
      
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
    }
  }
  
  console.log('\n✅ ========================================');
  console.log('✅ DIAGNÓSTICO COMPLETO');
  console.log('✅ ========================================\n');
  
  return relatorio;
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
function diagnosticarColuna_(rows, displayRows, idx, nome) {
  const resultado = {
    total: rows.length,
    vazios: 0,
    dateObjects: 0,
    strings: 0,
    numbers: 0,
    numbersSmall: 0,
    formatosString: new Map(),
    amostras: []
  };
  
  let amostraCount = 0;
  
  for (let i = 0; i < rows.length && amostraCount < 5; i++) {
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
    } else if (typeof raw === 'number') {
      resultado.numbers++;
      tipo = 'number';
      
      if (raw < 1000) {
        resultado.numbersSmall++;
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
  const currentLocale = ss.getSpreadsheetLocale();
  console.log(`🌍 Locale atual global: ${currentLocale}`);
  if (currentLocale !== 'pt_BR' && currentLocale !== 'pt-BR') {
    console.log(`🔧 Alterando locale GLOBAL para pt_BR...`);
    ss.setSpreadsheetLocale('pt_BR');
    console.log(`✅ Locale alterado para: ${ss.getSpreadsheetLocale()}`);
    
    // CRÍTICO: Limpar cache de sheets após mudar locale
    // Caso contrário, dados cached ainda terão datas interpretadas no formato antigo
    if (typeof invalidateSheetCache_ === 'function') {
      invalidateSheetCache_();
      console.log(`🧹 Cache de sheets limpo após mudança de locale`);
    }
  } else {
    console.log(`✅ Locale já configurado como pt_BR`);
  }
  
  try {
    // Processar Ganhas
    console.log('\n🏆 Recalculando Fiscal Q - Ganhas...');
    results.ganhas = recalcularFiscalQAba_('📈 Análise Ganhas', 'WON');
    
    // Processar Perdidas
    console.log('\n❌ Recalculando Fiscal Q - Perdidas...');
    results.perdidas = recalcularFiscalQAba_('📉 Análise Perdidas', 'LOST');
    
    // Processar Pipeline
    console.log('\n📊 Recalculando Fiscal Q - Pipeline...');
    results.pipeline = recalcularFiscalQAba_('🎯 Análise Forecast IA', 'OPEN');
    
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
  }
}

/**
 * Recalcula Fiscal Q de uma aba específica
 * @param {string} sheetName - Nome da aba
 * @param {string} mode - OPEN, WON ou LOST
 * @return {Object} { total, atualizados, erros }
 */
function recalcularFiscalQAba_(sheetName, mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    console.error(`   ❌ Aba ${sheetName} não encontrada`);
    return { total: 0, atualizados: 0, erros: 0, datesStd: 0 };
  }
  
  // CRÍTICO: Verificar e forçar locale pt-BR para evitar ambiguidade de datas
  const currentLocale = ss.getSpreadsheetLocale();
  console.log(`   🌍 Locale atual da planilha: ${currentLocale}`);
  if (currentLocale !== 'pt_BR' && currentLocale !== 'pt-BR') {
    console.log(`   🔧 Alterando locale para pt_BR...`);
    ss.setSpreadsheetLocale('pt_BR');
  }
  
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
  console.log(`   🔧 Aplicando formato de data dd/mm/yyyy em colunas de data...`);
  dateColumns.forEach(col => {
    const colLetter = columnToLetter_(col.idx + 1);
    const range = sheet.getRange(`${colLetter}2:${colLetter}${rows.length + 1}`);
    // Aplicar formato de data brasileiro: dia/mês/ano
    range.setNumberFormat('dd/mm/yyyy');
  });
  SpreadsheetApp.flush(); // Garantir que formato foi aplicado
  
  // Padronizar todas as datas encontradas - ESCREVER DATE OBJECTS, NÃO STRINGS
  const updates = [];  // Acumular mudanças para escritas em lote
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 2;
    
    dateColumns.forEach(col => {
      const cellValue = row[col.idx];
      
      // Pular se vazio
      if (!cellValue || cellValue === '') return;
      
      try {
        let newValue = null;
        
        // Validação: Se for número pequeno (< 1000), provavelmente é contador, não data
        if (typeof cellValue === 'number' && cellValue < 1000) {
          return; // Pular - não é data, é número/contador
        }
        
        // Se for Date object, manter como Date
        if (cellValue instanceof Date) {
          newValue = cellValue;
        }
        // Se for string, parsear para Date object
        else if (typeof cellValue === 'string') {
          // Remover qualquer prefixo de aspas se existir
          const cleanValue = String(cellValue).replace(/^['"]/, '');
          const parsed = parseDate(cleanValue);
          if (parsed && !isNaN(parsed.getTime())) {
            newValue = parsed;  // Manter como Date object
          }
        }
        // Se for número (serial date do Excel/Sheets)
        else if (typeof cellValue === 'number') {
          const dateFromSerial = new Date((cellValue - 25569) * 86400 * 1000);
          if (!isNaN(dateFromSerial.getTime())) {
            newValue = dateFromSerial;
          }
        }
        
        // Aplicar padronização se conseguimos converter
        if (newValue) {
          updates.push({
            row: rowIndex,
            col: col.idx + 1,
            value: newValue,  // Date object, não string
            colName: col.name
          });
          datesStandardized++;
          
          // Debug nas primeiras 3 linhas
          if (i < 3) {
            const valueType = cellValue instanceof Date ? 'Date' : typeof cellValue;
            const displayValue = formatDateRobust(newValue);
            console.log(`      📅 [L${rowIndex}] ${col.name}: ${cellValue} (tipo: ${valueType}) → ${displayValue}`);
          }
        }
      } catch (error) {
        console.error(`      ⚠️ Erro ao padronizar [L${rowIndex}][${col.name}]: ${error.message}`);
      }
    });
  }
  
  // Escrever todas as mudanças de uma vez
  if (updates.length > 0) {
    updates.forEach(u => {
      sheet.getRange(u.row, u.col).setValue(u.value);  // Escrever Date object
    });
    SpreadsheetApp.flush(); // Forçar gravação
  }
  
  console.log(`   ✅ ${datesStandardized} datas padronizadas\n`);
  
  // Limpar array para reutilização na Fase 2
  updates.length = 0;
  
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
  const colDataFechamento = headers.findIndex(h => 
    String(h).includes('Data Fechamento') || 
    String(h).includes('Data Prevista') ||
    String(h).includes('Close Date') ||
    String(h).includes('Expected Close')
  );
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
  // IMPORTANTE: Reutilizar o array updates já criado na Fase 1
  // (foi limpo após aplicar as mudanças da Fase 1)
  
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
            dataCriacao = parsedCreatedDate;
            
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
              closeDate = parsedLastStageDate;
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
              dataCriacao = createdDate;
            } else if (typeof createdDate === 'string') {
              const cleanDate = createdDate.replace(/^['\"]/, '');
              const parsedCreatedDate = parseDate(cleanDate);
              if (parsedCreatedDate && !isNaN(parsedCreatedDate.getTime())) {
                dataCriacao = parsedCreatedDate;
              }
            } else if (typeof createdDate === 'number') {
              dataCriacao = new Date((createdDate - 25569) * 86400 * 1000);
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
        parsedDate = closeDate;
      } else if (typeof closeDate === 'string') {
        // Ainda é string, parsear
        const cleanCloseDate = closeDate.replace(/^['\"]/, '');
        parsedDate = parseDate(cleanCloseDate);
      } else if (typeof closeDate === 'number') {
        // Serial date
        parsedDate = new Date((closeDate - 25569) * 86400 * 1000);
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
          const closeDateInverted = new Date(parsedDate.getFullYear(), parsedDate.getDate() - 1, parsedDate.getMonth() + 1);
          const dataCriacaoInverted = new Date(dataCriacao.getFullYear(), dataCriacao.getDate() - 1, dataCriacao.getMonth() + 1);
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
    
    updates.forEach(update => {
      // Verificar se é um update válido da Fase 2
      if (!update.colFiscalQ || !update.colDataFechamento) {
        console.error(`   ⚠️ Update inválido ignorado: ${JSON.stringify(update)}`);
        return;
      }
      
      // Atualizar Fiscal Q
      sheet.getRange(update.row, update.colFiscalQ).setValue(update.newFiscalQ);
      
      // Atualizar Data Fechamento se foi corrigida
      if (update.newDataFechamento) {
        sheet.getRange(update.row, update.colDataFechamento).setValue(update.newDataFechamento);
      }
      
      // Atualizar Ciclo se calculado e coluna existe
      if (update.newCiclo !== null && update.colCiclo > 0) {
        sheet.getRange(update.row, update.colCiclo).setValue(update.newCiclo);
      }
    });
    
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
