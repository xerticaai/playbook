/**
 * CorrigirFiscalQ.gs
 * Função para recalcular Fiscal Q de todas as análises (Ganhas, Perdidas, Pipeline)
 * 
 * CONTEXTO:
 * - Antes: usava closeDate que poderia ser futura
 * - Agora: usa data da última mudança de fase (sempre passada) para WON/LOST
 * - Pipeline: usa data prevista de fechamento
 * 
 * Esta correção atualiza o Fiscal Q de todas as análises existentes
 */

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
      '• Recalcular Fiscal Q de TODAS as análises (Ganhas, Perdidas, Pipeline)\n' +
      '• Usar data da última mudança de fase para WON/LOST\n' +
      '• Usar data prevista para Pipeline\n\n' +
      '⏱️ Tempo estimado: 2-5 minutos\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) return;
    
    ui.alert(
      '⏳ Processando...',
      'Recalculando Fiscal Q. Aguarde...\n\n' +
      'Não feche esta aba até o final.',
      ui.ButtonSet.OK
    );
  } catch (e) {
    console.log('⚠️ UI não disponível, executando sem confirmação...');
  }
  
  const startTime = new Date();
  const results = {
    ganhas: { total: 0, atualizados: 0, erros: 0 },
    perdidas: { total: 0, atualizados: 0, erros: 0 },
    pipeline: { total: 0, atualizados: 0, erros: 0 }
  };
  
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
    
    logToSheet("INFO", "FiscalQ", 
      `Recálculo concluído: ${totalAtualizados} atualizados, ${totalErros} erros em ${duration}s`
    );
    
    const message = 
      `✅ Recálculo Concluído!\n\n` +
      `📈 Ganhas: ${results.ganhas.atualizados}/${results.ganhas.total}\n` +
      `📉 Perdidas: ${results.perdidas.atualizados}/${results.perdidas.total}\n` +
      `📊 Pipeline: ${results.pipeline.atualizados}/${results.pipeline.total}\n\n` +
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
    return { total: 0, atualizados: 0, erros: 0 };
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.log(`   ⚠️ Aba ${sheetName} vazia`);
    return { total: 0, atualizados: 0, erros: 0 };
  }
  
  const headers = data[0];
  const rows = data.slice(1);
  
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
  
  if (colFiscalQ === -1) {
    console.error(`   ❌ Coluna "Fiscal Q" não encontrada em ${sheetName}`);
    return { total: 0, atualizados: 0, erros: 0 };
  }
  
  if (colDataFechamento === -1) {
    console.error(`   ❌ Coluna de data não encontrada em ${sheetName}`);
    return { total: 0, atualizados: 0, erros: 0 };
  }
  
  console.log(`   📊 Processando ${rows.length} linhas...`);
  console.log(`   📍 Fiscal Q: coluna ${colFiscalQ + 1} | Data: coluna ${colDataFechamento + 1} | Ciclo: coluna ${colCiclo + 1}`);
  
  let atualizados = 0;
  let erros = 0;
  const updates = [];
  
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
    }const originalCiclo = colCiclo >= 0 ? row[colCiclo] : null;
      let dataCorrected = false;
      let dataCriacao = null;
      
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
          const lastStageDate = relatedHistorico[0][colLastStageChange];
          const createdDate = relatedHistorico[0][colDataCriacao];
          
          if (lastStageDate) {
            const parsedLastStageDate = lastStageDate instanceof Date ? lastStageDate : parseDate(lastStageDate);
            
            if (parsedLastStageDate && !isNaN(parsedLastStageDate.getTime())) {
              closeDate = parsedLastStageDate;
              dataCorrected = true;
              
              if (i < 3) {
                console.log(`   📅 [${i+1}] Data corrigida: ${formatDateRobust(originalCloseDate)} → ${formatDateRobust(parsedLastStageDate)}`);
              }
            }
          } else if (i < 3) {
            console.log(`   ⚠️ [${i+1}] Data da última fase vazia no histórico`);
          }
          
          // Capturar data de criação para calcular ciclo
          if (createdDate) {
            const parsedCreatedDate = createdDate instanceof Date ? createdDate : parseDate(createdDate);
            if (parsedCreatedDate && !isNaN(parsedCreatedDate.getTime())) {
              dataCriacao = parsedCreatedDate;
            }Date : parseDate(lastStageDate);
            
            if (parsedLastStageDate && !isNaN(parsedLastStageDate.getTime())) {
              closeDate = parsedLastStageDate;
              dataCorrected = true;
              
              if (i < 3) {
                console.log(`   📅 [${i+1}] Data corrigida: ${formatDateRobust(originalCloseDate)} → ${formatDateRobust(parsedLastStageDate)}`);
              }
            }
          } else if (i < 3) {
        if (dataCriacao) {
          console.log(`   📅 [${i+1}] dataCriacao: ${dataCriacao.toDateString()} (${dataCriacao.getDate()}/${dataCriacao.getMonth()+1}/${dataCriacao.getFullYear()})`);
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
      }
      if (!closeDate || closeDate === '') continue;
      
      let parsedDate = closeDate;
      if (!(parsedDate instanceof Date)) {
        parsedDate = parseDate(closeDate);
      }
        if (newCiclo !== null) {
          console.log(`   ⏱️ [${i+1}] Ciclo: ${originalCiclo} → ${newCiclo} dias`);
        }
      }
      
      // Só atualizar se mudou alguma coisa
      const cicloChanged = newCiclo !== null && originalCiclo !== newCiclo;
      
      if (oldFiscalQ !== newFiscalQ || dataCorrected || cicloChanged) {
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
          oldCiclo: originalCiclo
      // Calcular novo Fiscal Q
      const fiscal = calculateFiscalQuarter(parsedDate);
      const oldFiscalQ = String(row[colFiscalQ] || '');
      const newFiscalQ = fiscal.label;
      
      // Debug nas primeiras 3 linhas
      if (i < 3) {
        console.log(`   📊 [${i+1}] FiscalQ: "${oldFiscalQ}" → "${newFiscalQ}" (${oldFiscalQ === newFiscalQ ? 'IGUAL' : 'DIFERENTE'})`);
      }
      
      // Só atualizar se mudou
      if (oldFiscalQ !== newFiscalQ || dataCorrected) {
        updates.push({
          row: rowIndex,
          colFiscalQ: colFiscalQ + 1,
          colDataFechamento: colDataFechamento + 1,
          newFiscalQ: newFiscalQ,
          newDataFechamento: dataCorrected ? closeDate : null,
          oldFiscalQ: oldFiscalQ,
          oldDataFechamento: originalCloseDate,
          oppName: oppName
        });
        atualizados++;
      }
      
    } catch (error) {
      
      // Atualizar Ciclo se calculado e coluna existe
      if (update.newCiclo !== null && update.colCiclo > 0) {
        sheet.getRange(update.row, update.colCiclo).setValue(update.newCiclo);
      }
      console.error(`   ⚠️ Erro na linha ${rowIndex}: ${error.message}`);
      erros++;
    }
  }
  
  // Aplicar atualizações em batch
  if (updates.length > 0) {
    console.log(`   ✍️ Aplicando ${updates.length} atualizações...`);
    
    updates.forEach(update => {
      // Atualizar Fiscal Q
      sheet.getRange(update.row || u.newCiclo !== null) {
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
          console.log(`        ${u.oppName || 'linha ' + u.row}: Data+FiscalQ+Ciclo
        if (u.newDataFechamento) {
          console.log(`      • ${u.oppName || 'linha ' + u.row}:`);
          console.log(`        Data: ${formatDateRobust(u.oldDataFechamento)} → ${formatDateRobust(u.newDataFechamento)}`);
          console.log(`        FiscalQ: ${u.oldFiscalQ} → ${u.newFiscalQ}`);
        } else {
          console.log(`      • ${u.oppName || 'linha ' + u.row}: FiscalQ ${u.oldFiscalQ} → ${u.newFiscalQ}`);
        }
      });
    } else {
      console.log(`      • Primeiras 5:`);
      updates.slice(0, 5).forEach(u => {
        if (u.newDataFechamento) {
          console.log(`        ${u.oppName || 'linha ' + u.row}: Data+FiscalQ atualizados`);
        } else {
          console.log(`        ${u.oppName || 'linha ' + u.row}: ${u.oldFiscalQ} → ${u.newFiscalQ}`);
        }
      });
      console.log(`      • ... e mais ${updates.length - 5}`);
    }
  }
  
  console.log(`   ✅ ${atualizados} atualizados, ${erros} erros`);
  
  return {
    total: rows.length,
    atualizados: atualizados,
    erros: erros
  };
}
