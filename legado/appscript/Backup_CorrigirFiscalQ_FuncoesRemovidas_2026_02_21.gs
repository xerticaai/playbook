/**
 * Backup_CorrigirFiscalQ_FuncoesRemovidas_2026_02_21.gs
 * Backup de funções removidas do arquivo principal CorrigirFiscalQ.gs.
 *
 * Motivo:
 * - Manter o arquivo CorrigirFiscalQ mais focado em normalização de datas
 * - Preservar funções retiradas para eventual rollback
 */

/**
 * Função de diagnóstico: Verificar disponibilidade de funções necessárias para IA
 */
function diagnosticarDisponibilidadeIA() {
  console.log('\n🔍 ========================================');
  console.log('🔍 DIAGNÓSTICO DE DISPONIBILIDADE DA IA');
  console.log('🔍 ========================================\n');
  
  const checks = {
    'callGeminiAPI': typeof callGeminiAPI === 'function',
    'cleanAndParseJSON': typeof cleanAndParseJSON === 'function',
    'normText_': typeof normText_ === 'function',
    'API_KEY': typeof API_KEY !== 'undefined' && API_KEY !== ''
  };
  
  let allOk = true;
  for (const [fn, available] of Object.entries(checks)) {
    const status = available ? '✅' : '❌';
    console.log(`${status} ${fn}: ${available ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL'}`);
    if (!available) allOk = false;
  }
  
  let testResult = null;
  if (allOk) {
    console.log('\n🧪 Testando chamada real à API Gemini...');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetPerdidas = ss.getSheetByName('📉 Análise Perdidas');
    let testConta = 'Missão Kairós';
    let testProdutos = 'Cloud Services';
    let testCidade = 'São Paulo';
    let testEstado = 'SP';
    
    if (sheetPerdidas) {
      const data = sheetPerdidas.getDataRange().getValues();
      const headers = data[0];
      const accIdx = headers.findIndex(h => /account.*name/i.test(h));
      const prodIdx = headers.findIndex(h => /product.*name/i.test(h));
      const cidadeIdx = headers.findIndex(h => /city|cidade/i.test(h));
      const estadoIdx = headers.findIndex(h => /state|estado/i.test(h));
      
      if (data.length > 1 && accIdx >= 0) {
        testConta = data[1][accIdx] || testConta;
        testProdutos = prodIdx >= 0 ? data[1][prodIdx] : testProdutos;
        testCidade = cidadeIdx >= 0 ? data[1][cidadeIdx] : testCidade;
        testEstado = estadoIdx >= 0 ? data[1][estadoIdx] : testEstado;
        console.log('📊 Usando dados reais da primeira linha da tabela Perdidas');
      }
    }
    
    console.log(`📝 Teste: "${testConta}" | Produtos: "${testProdutos}" | ${testCidade}/${testEstado}`);
    
    try {
      testResult = classificarContaComIAFallback_(
        testConta,
        testProdutos,
        testCidade,
        testEstado
      );
      
      if (testResult) {
        console.log('✅ TESTE DE IA BEM SUCEDIDO!');
        console.log(`   Vertical: ${testResult.vertical}`);
        console.log(`   Sub-vertical: ${testResult.subVertical}`);
        console.log(`   Sub-sub-vertical: ${testResult.subSubVertical}`);
        console.log('\n📊 A IA está funcionando perfeitamente!');
      } else {
        console.log('⚠️ IA retornou null - verifique os logs acima para detalhes');
        console.log('💡 Dica: Verifique se o modelo Gemini está disponível na sua região');
        allOk = false;
      }
    } catch (e) {
      console.error('❌ Erro ao testar IA:', e.message);
      console.error('   Stack:', e.stack);
      allOk = false;
    }
  }
  
  console.log('\n📊 Resultado final:', allOk ? '✅ TODAS AS DEPENDÊNCIAS OK E IA FUNCIONANDO' : '❌ PROBLEMAS DETECTADOS');
  console.log('========================================\n');
  
  SpreadsheetApp.getUi().alert(
    allOk ? '✅ Diagnóstico IA' : '⚠️ Diagnóstico IA',
    allOk 
      ? 'Todas as dependências necessárias estão disponíveis e a IA está funcionando!\n\n' +
        `Resultado do teste:\n` +
        `✅ Modelo: gemini-2.5-pro\n` +
        `✅ Classificação: ${testResult ? testResult.vertical : 'N/A'}\n\n` +
        'Verifique o console (F12) para detalhes completos.' 
      : 'Problemas detectados. Verifique o console (Ctrl+Shift+J ou Cmd+Option+J) para detalhes.\n\n' +
        'Possíveis causas:\n' +
        '• Modelo Gemini não disponível\n' +
        '• Formato de resposta inesperado\n' +
        '• Quota ou limite de API atingido',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  return allOk;
}

/**
 * Diagnóstico completo de datas em todas as abas
 */
function diagnosticarTodasDatas() {
  console.log('\n🔍 ========================================');
  console.log('🔍 DIAGNÓSTICO COMPLETO DE DATAS');
  console.log('🔍 ========================================\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
    const dateColumns = identificarColunasDatas_(headers);
    
    console.log(`   📊 Total de colunas: ${headers.length}`);
    console.log(`   📅 Colunas de data identificadas: ${dateColumns.length}\n`);
    
    if (dateColumns.length === 0) {
      console.log('   ⚠️ Nenhuma coluna de data encontrada\n');
      continue;
    }
    
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
