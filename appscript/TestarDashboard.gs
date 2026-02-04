/**
 * 🧪 TESTE COMPLETO DO DASHBOARD
 * 
 * Execute: testarDashboard()
 * 
 * Testa todas as abas, valores, cálculos e identifica inconsistências
 */

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🚀 EXECUTAR TODOS OS TESTES - DASHBOARD + CLOUD FUNCTION
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Esta função executa:
 * 1. Testes completos do Dashboard (abas, estrutura, métricas)
 * 2. Testes completos da Cloud Function (6 módulos)
 * 
 * Tempo estimado: 2-3 minutos
 */
function executarTodosTestes() {
  const startTime = new Date();
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║        🧪 SUITE COMPLETA DE TESTES - DASHBOARD           ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📅 Data:', new Date().toLocaleString('pt-BR'));
  console.log('⏱️  Início:', startTime.toLocaleTimeString('pt-BR'));
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FASE 1: TESTES DO DASHBOARD');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // ====================================================================
  // FASE 1: TESTES DO DASHBOARD
  // ====================================================================
  let dashboardResultados;
  try {
    dashboardResultados = testarDashboard();
  } catch (error) {
    console.error('❌ Erro nos testes do Dashboard:', error);
    dashboardResultados = { erros: [error.message], avisos: [], sucessos: [] };
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('FASE 2: TESTES DA CLOUD FUNCTION');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // ====================================================================
  // FASE 2: TESTES DA CLOUD FUNCTION
  // ====================================================================
  const cloudTests = [
    { name: '1. Ping Cloud Function', fn: testarCloudFunction_Ping },
    { name: '2. Dados Reais', fn: testarCloudFunction_DadosReais },
    { name: '3. Visão Executiva', fn: testarCloudFunction_VisaoExecutiva },
    { name: '4. Pipeline', fn: testarCloudFunction_Pipeline },
    { name: '5. Vendedores', fn: testarCloudFunction_Vendedores },
    { name: '6. War Targets', fn: testarCloudFunction_WarTargets }
  ];
  
  let cloudPassed = 0;
  let cloudFailed = 0;
  
  cloudTests.forEach((test, index) => {
    console.log(`${'─'.repeat(60)}`);
    console.log(`TESTE ${index + 1}/6: ${test.name}`);
    console.log('─'.repeat(60));
    
    try {
      test.fn();
      cloudPassed++;
    } catch (error) {
      console.error('❌ ERRO:', error);
      cloudFailed++;
    }
    
    if (index < cloudTests.length - 1) {
      Utilities.sleep(1000); // Pausa de 1s entre testes
    }
  });
  
  // ====================================================================
  // RESUMO FINAL
  // ====================================================================
  const endTime = new Date();
  const totalTime = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log('\n\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║                    📊 RESUMO FINAL                        ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Resumo Dashboard
  const dashErros = dashboardResultados?.erros?.length || 0;
  const dashAvisos = dashboardResultados?.avisos?.length || 0;
  const dashSucessos = dashboardResultados?.sucessos?.length || 0;
  const dashTotal = dashErros + dashAvisos + dashSucessos;
  const dashTaxa = dashTotal > 0 ? ((dashSucessos / dashTotal) * 100).toFixed(1) : 0;
  
  console.log('📋 TESTES DO DASHBOARD:');
  console.log(`   ✅ Sucessos: ${dashSucessos}`);
  console.log(`   ⚠️  Avisos: ${dashAvisos}`);
  console.log(`   ❌ Erros: ${dashErros}`);
  console.log(`   📊 Taxa de sucesso: ${dashTaxa}%`);
  console.log('');
  
  // Resumo Cloud Function
  const cloudTotal = cloudPassed + cloudFailed;
  const cloudTaxa = cloudTotal > 0 ? ((cloudPassed / cloudTotal) * 100).toFixed(1) : 0;
  
  console.log('☁️  TESTES DA CLOUD FUNCTION:');
  console.log(`   ✅ Passou: ${cloudPassed}/${cloudTotal}`);
  console.log(`   ❌ Falhou: ${cloudFailed}/${cloudTotal}`);
  console.log(`   📊 Taxa de sucesso: ${cloudTaxa}%`);
  console.log('');
  
  // Status Geral
  const statusGeral = (dashErros === 0 && cloudFailed === 0) ? '✅ TUDO OK' : '⚠️  ATENÇÃO NECESSÁRIA';
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`STATUS GERAL: ${statusGeral}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('⏱️  Tempo total:', totalTime, 'segundos');
  console.log('🏁 Fim:', endTime.toLocaleTimeString('pt-BR'));
  console.log('');
  
  // Recomendações
  if (dashErros > 0 || cloudFailed > 0) {
    console.log('💡 RECOMENDAÇÕES:');
    if (dashErros > 0) {
      console.log('   • Verificar abas do Dashboard');
      console.log('   • Conferir estrutura das planilhas');
    }
    if (cloudFailed > 0) {
      console.log('   • Verificar conexão com Cloud Function');
      console.log('   • Conferir logs no GCP Console');
    }
    console.log('');
  }
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                 TESTES CONCLUÍDOS                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

function testarDashboard() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE COMPLETO DO DASHBOARD');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultados = {
    erros: [],
    avisos: [],
    sucessos: []
  };
  
  // ========================================================================
  // TESTE 1: Verificar Abas Necessárias
  // ========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TESTE 1: Verificar Abas Necessárias');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const abasNecessarias = [
    '🎯 Análise Forecast IA',  // ✅ CORRIGIDO: era "🔮 Pipeline"
    '📈 Análise Ganhas',
    '📉 Análise Perdidas',
    'Análise Sales Specialist',
    '📊 Dashboard_Metrics',
    'Payload_Debug'
  ];
  
  abasNecessarias.forEach(nome => {
    const aba = ss.getSheetByName(nome);
    if (aba) {
      console.log(`✅ ${nome} - ENCONTRADA (${aba.getLastRow()} linhas)`);
      resultados.sucessos.push(`Aba ${nome} existe`);
    } else {
      console.log(`❌ ${nome} - NÃO ENCONTRADA`);
      resultados.erros.push(`Aba ${nome} não existe`);
    }
  });
  
  // ========================================================================
  // TESTE 2: Verificar Estrutura da Aba Pipeline
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔮 TESTE 2: Estrutura da Aba Pipeline');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const pipeline = ss.getSheetByName('🎯 Análise Forecast IA');  // ✅ CORRIGIDO
  if (pipeline) {
    const headers = pipeline.getRange(1, 1, 1, pipeline.getLastColumn()).getValues()[0];
    
    // Colunas essenciais da ABA DE SAÍDA (não da entrada HubSpot)
    const colunasEssenciais = [
      { nome: 'Oportunidade', alternativas: ['Opportunity Name', 'Opp Name', 'Opportunity', 'Deal Name'] },
      { nome: 'Gross', alternativas: ['Booking Total ($)Gross', 'Total Price (converted)'] },
      { nome: 'Fiscal Q', alternativas: ['Quarter', 'FY Quarter'] },
      { nome: 'Confiança (%)', alternativas: ['Confidence', 'Confidence Score (%)', 'Prob'] },
      { nome: 'Forecast IA', alternativas: ['Forecast SF', 'Forecast Category', 'Categoria Forecast'] }
    ];
    
    console.log('Colunas encontradas:', headers.length);
    colunasEssenciais.forEach(colInfo => {
      const allNames = [colInfo.nome, ...(colInfo.alternativas || [])];
      const idx = headers.findIndex(h => allNames.includes(h));
      
      if (idx >= 0) {
        console.log(`✅ ${colInfo.nome} - Coluna ${idx + 1} (encontrada como "${headers[idx]}")`);
        resultados.sucessos.push(`Coluna ${colInfo.nome} existe`);
      } else {
        console.log(`❌ ${colInfo.nome} - NÃO ENCONTRADA`);
        console.log(`   Buscou por: ${allNames.join(', ')}`);
        resultados.erros.push(`Coluna ${colInfo.nome} não existe em Pipeline`);
      }
    });
    
    // Testa amostra de dados
    console.log('\n📊 Amostra de 3 deals:');
    const dados = pipeline.getRange(2, 1, Math.min(3, pipeline.getLastRow() - 1), pipeline.getLastColumn()).getValues();
    
    // Busca índices com mais flexibilidade (abas de análise usam "Oportunidade")
    const oppIdx = headers.findIndex(h => ['Oportunidade', 'Opportunity Name', 'Opp Name', 'Opportunity', 'Deal Name'].includes(h));
    const grossIdx = headers.findIndex(h => ['Gross', 'Booking Total ($)Gross', 'Total Price (converted)'].includes(h));
    const confIdx = headers.findIndex(h => ['Confiança (%)', 'Confidence', 'Confidence Score (%)', 'Prob'].includes(h));
    const fiscalQIdx = headers.findIndex(h => ['Fiscal Q', 'Quarter', 'FY Quarter'].includes(h));
    
    dados.forEach((row, i) => {
      console.log(`\n   Deal ${i + 1}:`);
      console.log(`   • Opp: ${row[oppIdx]}`);
      console.log(`   • Gross: $${formatNum(row[grossIdx])}`);
      console.log(`   • Confidence: ${row[confIdx]}%`);
      console.log(`   • Fiscal Q: ${row[fiscalQIdx]}`);
    });
  }
  
  // ========================================================================
  // TESTE 3: Verificar wonAgg e lostAgg
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TESTE 3: wonAgg e lostAgg (Conversão)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const ganhas = ss.getSheetByName('📈 Análise Ganhas');
  const perdidas = ss.getSheetByName('📉 Análise Perdidas');
  
  if (ganhas) {
    const totalGanhas = ganhas.getLastRow() - 1;
    console.log(`✅ Análise Ganhas: ${totalGanhas} deals`);
    
    // Testa se há Gross/Net/FiscalQ
    const headersGanhas = ganhas.getRange(1, 1, 1, ganhas.getLastColumn()).getValues()[0];
    const hasGross = headersGanhas.some(h => h === 'Gross' || h === 'Total Price (converted)' || h === 'Booking Total ($)Gross');
    const hasNet = headersGanhas.some(h => h === 'Net' || h === 'Margen Total $' || h === 'Net Revenue');
    const hasFiscalQ = headersGanhas.some(h => h === 'Fiscal Q' || h === 'Fiscal Quarter');
    
    console.log(`   • Tem coluna Gross: ${hasGross ? '✅' : '❌'}`);
    console.log(`   • Tem coluna Net: ${hasNet ? '✅' : '❌'}`);
    console.log(`   • Tem coluna Fiscal Q: ${hasFiscalQ ? '✅' : '❌'}`);
    
    if (!hasGross) resultados.erros.push('Análise Ganhas sem coluna Gross');
    if (!hasFiscalQ) resultados.erros.push('Análise Ganhas sem coluna Fiscal Q');
  } else {
    console.log('❌ Análise Ganhas não encontrada');
    resultados.erros.push('Aba Análise Ganhas não existe');
  }
  
  if (perdidas) {
    const totalPerdidas = perdidas.getLastRow() - 1;
    console.log(`✅ Análise Perdidas: ${totalPerdidas} deals`);
  }
  
  // ========================================================================
  // TESTE 4: Verificar Sales Specialist
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 TESTE 4: Sales Specialist (Curadoria Manual)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const salesSpec = ss.getSheetByName('Análise Sales Specialist');
  if (salesSpec) {
    const totalSales = salesSpec.getLastRow() - 1;
    console.log(`✅ Análise Sales Specialist: ${totalSales} deals`);
    
    const headersSales = salesSpec.getRange(1, 1, 1, salesSpec.getLastColumn()).getValues()[0];
    const grossIdx = headersSales.findIndex(h => h === 'Gross' || h === 'Booking Total ($)Gross');
    const statusIdx = headersSales.findIndex(h => h === 'Status');
    const closedDateIdx = headersSales.findIndex(h => h === 'Closed Date');
    
    console.log(`   • Coluna Gross: ${grossIdx >= 0 ? 'Coluna ' + (grossIdx + 1) + ' ✅' : '❌ NÃO ENCONTRADA'}`);
    console.log(`   • Coluna Status: ${statusIdx >= 0 ? 'Coluna ' + (statusIdx + 1) + ' ✅' : '❌ NÃO ENCONTRADA'}`);
    console.log(`   • Coluna Closed Date: ${closedDateIdx >= 0 ? 'Coluna ' + (closedDateIdx + 1) + ' ✅' : '❌ NÃO ENCONTRADA'}`);
    
    if (grossIdx >= 0 && statusIdx >= 0) {
      // Agrupa por Status
      const dados = salesSpec.getRange(2, 1, totalSales, salesSpec.getLastColumn()).getValues();
      const byStatus = { commit: 0, upside: 0, outros: 0 };
      const byStatusGross = { commit: 0, upside: 0, outros: 0 };
      
      dados.forEach(row => {
        const status = (row[statusIdx] || '').toLowerCase();
        const gross = parseFloat(row[grossIdx]) || 0;
        
        if (status === 'commit') {
          byStatus.commit++;
          byStatusGross.commit += gross;
        } else if (status === 'upside') {
          byStatus.upside++;
          byStatusGross.upside += gross;
        } else {
          byStatus.outros++;
          byStatusGross.outros += gross;
        }
      });
      
      console.log(`\n   📊 Distribuição por Status:`);
      console.log(`   • COMMIT: ${byStatus.commit} deals = $${formatNum(byStatusGross.commit)}`);
      console.log(`   • UPSIDE: ${byStatus.upside} deals = $${formatNum(byStatusGross.upside)}`);
      console.log(`   • Outros: ${byStatus.outros} deals = $${formatNum(byStatusGross.outros)}`);
      
      if (byStatus.commit === 0 && byStatus.upside === 0) {
        resultados.avisos.push('Sales Specialist sem deals commit/upside');
      }
    }
  }
  
  // ========================================================================
  // TESTE 5: Testar getDashboardPayload()
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 TESTE 5: getDashboardPayload()');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    console.log('⏳ Executando getDashboardPayload() (pode demorar)...\n');
    const payload = getDashboardPayload();
    
    console.log('✅ Payload gerado com sucesso!\n');
    
    // Valida estrutura
    const currentQuarter = payload.quarterLabel;
    console.log(`📅 Quarter Atual: ${currentQuarter}\n`);
    
    // wonAgg
    const wonAgg = payload.wonAgg || [];
    console.log(`📊 wonAgg: ${wonAgg.length} deals`);
    if (wonAgg.length > 0) {
      const wonCurrentQ = wonAgg.filter(d => d.fiscalQ === currentQuarter);
      const wonGross = wonCurrentQ.reduce((sum, d) => sum + (d.gross || 0), 0);
      console.log(`   • No ${currentQuarter}: ${wonCurrentQ.length} deals = $${formatNum(wonGross)}`);
      
      if (wonCurrentQ.length === 0) {
        resultados.avisos.push(`Nenhum deal ganho no ${currentQuarter}`);
      }
    } else {
      resultados.erros.push('wonAgg está vazio!');
    }
    
    // lostAgg
    const lostAgg = payload.lostAgg || [];
    console.log(`📊 lostAgg: ${lostAgg.length} deals`);
    if (lostAgg.length > 0) {
      const lostCurrentQ = lostAgg.filter(d => d.fiscalQ === currentQuarter);
      console.log(`   • No ${currentQuarter}: ${lostCurrentQ.length} deals`);
    }
    
    // Taxa de conversão
    const wonCurrentQ = wonAgg.filter(d => d.fiscalQ === currentQuarter);
    const lostCurrentQ = lostAgg.filter(d => d.fiscalQ === currentQuarter);
    const totalCurrentQ = wonCurrentQ.length + lostCurrentQ.length;
    const conversion = totalCurrentQ > 0 ? Math.round((wonCurrentQ.length / totalCurrentQ) * 100) : 0;
    console.log(`\n   🎯 Taxa de Conversão (${currentQuarter}): ${conversion}% (${wonCurrentQ.length}/${totalCurrentQ})`);
    
    // fsrScorecard
    const fsrScorecard = payload.fsrScorecard || [];
    const activeReps = fsrScorecard.filter(r => r.isActive);
    console.log(`\n👥 fsrScorecard: ${fsrScorecard.length} vendedores (${activeReps.length} ativos)`);
    
    // salesSpecByFiscalQ
    const salesSpecByFiscalQ = payload.l10.salesSpecByFiscalQ || {};
    const quarters = Object.keys(salesSpecByFiscalQ);
    console.log(`\n🎯 salesSpecByFiscalQ: ${quarters.length} quarters`);
    
    if (quarters.length === 0) {
      resultados.erros.push('salesSpecByFiscalQ está VAZIO!');
      console.log('   ❌ VAZIO - Previsão Sales Specialist não vai adaptar por data');
    } else {
      console.log('   ✅ Quarters disponíveis:', quarters.join(', '));
      quarters.forEach(q => {
        const data = salesSpecByFiscalQ[q];
        console.log(`   • ${q}: $${formatNum(data.gross)} (${data.deals} deals)`);
      });
    }
    
    // weeklyAgenda (é um OBJETO, não array)
    const weeklyAgenda = payload.weeklyAgenda || {};
    const weeklyAgendaQuarters = Object.keys(weeklyAgenda);  // ✅ RENOMEADO para evitar conflito
    console.log(`\n📅 weeklyAgenda: ${weeklyAgendaQuarters.length} quarters`);
    if (weeklyAgendaQuarters.length > 0) {
      console.log(`   ✅ Quarters disponíveis: ${weeklyAgendaQuarters.join(', ')}`);
      if (weeklyAgenda[currentQuarter]) {
        console.log(`   ✅ ${currentQuarter}: ${weeklyAgenda[currentQuarter].length} deals`);
      } else {
        resultados.avisos.push(`${currentQuarter} não encontrado no weeklyAgenda`);
      }
    } else {
      resultados.erros.push('weeklyAgenda está VAZIO!');
    }
    
  } catch (err) {
    console.log('❌ ERRO ao executar getDashboardPayload():');
    console.log(err.toString());
    resultados.erros.push('getDashboardPayload() falhou: ' + err.message);
  }
  
  // ========================================================================
  // TESTE 6: Verificar Dashboard_Metrics
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TESTE 6: Dashboard_Metrics (Métricas Estáticas)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const metricsSheet = ss.getSheetByName('📊 Dashboard_Metrics');
  if (metricsSheet) {
    const lastRow = metricsSheet.getLastRow();
    console.log(`✅ Dashboard_Metrics encontrado (${lastRow} linhas)`);
    
    if (lastRow >= 2) {
      const data = metricsSheet.getRange(2, 1, 1, metricsSheet.getLastColumn()).getValues()[0];
      const headers = metricsSheet.getRange(1, 1, 1, metricsSheet.getLastColumn()).getValues()[0];
      
      const metricsMap = {};
      headers.forEach((h, i) => {
        metricsMap[h] = data[i];
      });
      
      console.log('📊 Métricas Disponíveis:');
      const keysToShow = [
        'quarterLabel',
        'allPipelineGross',
        'fy26PipelineGross',
        'salesSpecGross',
        'revenueQuarter',
        'avgConfidence',
        'highConfGross'
      ];
      
      keysToShow.forEach(key => {
        if (metricsMap[key] !== undefined) {
          const val = metricsMap[key];
          if (typeof val === 'number') {
            console.log(`   • ${key}: $${formatNum(val)}`);
          } else {
            console.log(`   • ${key}: ${val}`);
          }
        }
      });
      
      // Valida confiança média
      const avgConf = metricsMap['avgConfidence'];
      if (avgConf === 50) {
        resultados.avisos.push('Confiança média = 50% (pode estar fixo)');
      }
    }
  }
  
  // ========================================================================
  // TESTE 7: Validar Consistência de Dados
  // ========================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 TESTE 7: Consistência de Dados');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Verifica se Pipeline tem Confidence Score preenchido
  if (pipeline) {
    const headers = pipeline.getRange(1, 1, 1, pipeline.getLastColumn()).getValues()[0];
    const confIdx = headers.findIndex(h => h === 'Confidence Score (%)' || h === 'Confidence');
    
    if (confIdx >= 0) {
      const dados = pipeline.getRange(2, confIdx + 1, Math.min(10, pipeline.getLastRow() - 1), 1).getValues();
      const comConfianca = dados.filter(row => row[0] !== '' && row[0] !== null && row[0] !== 0).length;
      const semConfianca = dados.length - comConfianca;
      
      console.log(`📊 Confidence Score (amostra de ${dados.length} deals):`);
      console.log(`   • Com confiança: ${comConfianca}`);
      console.log(`   • Sem confiança: ${semConfianca}`);
      
      if (semConfianca > comConfianca) {
        resultados.avisos.push('Muitos deals sem Confidence Score');
      }
      
      // Verifica distribuição
      const valores = dados.filter(row => row[0] !== '' && row[0] !== null && row[0] !== 0).map(row => parseFloat(row[0]));
      if (valores.length > 0) {
        const commit = valores.filter(v => v >= 90).length;
        const upside = valores.filter(v => v >= 50 && v < 90).length;
        const pipeline = valores.filter(v => v < 50).length;
        
        console.log(`\n   📊 Distribuição:`);
        console.log(`   • COMMIT (≥90%): ${commit} deals`);
        console.log(`   • UPSIDE (50-89%): ${upside} deals`);
        console.log(`   • PIPELINE (<50%): ${pipeline} deals`);
        
        if (upside > 0 && commit === 0 && pipeline === 0) {
          resultados.avisos.push('Todos deals em UPSIDE (50-89%) - distribuição suspeita');
        }
      }
    }
  }
  
  // ========================================================================
  // RESUMO FINAL
  // ========================================================================
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎯 RESUMO DOS TESTES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`✅ SUCESSOS: ${resultados.sucessos.length}`);
  console.log(`⚠️  AVISOS: ${resultados.avisos.length}`);
  console.log(`❌ ERROS: ${resultados.erros.length}\n`);
  
  if (resultados.erros.length > 0) {
    console.log('━━━ ERROS CRÍTICOS ━━━');
    resultados.erros.forEach((err, i) => {
      console.log(`${i + 1}. ❌ ${err}`);
    });
    console.log('');
  }
  
  if (resultados.avisos.length > 0) {
    console.log('━━━ AVISOS ━━━');
    resultados.avisos.forEach((aviso, i) => {
      console.log(`${i + 1}. ⚠️  ${aviso}`);
    });
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ TESTE CONCLUÍDO');
  console.log('═══════════════════════════════════════════════════════════');
  
  return resultados;
}

/**
 * 🧪 TESTE RÁPIDO - Apenas valida se payload funciona
 */
function testeRapido() {
  console.log('🧪 TESTE RÁPIDO\n');
  
  try {
    console.log('⏳ Gerando payload...');
    const payload = getDashboardPayload();
    
    const wonAgg = payload.wonAgg || [];
    const lostAgg = payload.lostAgg || [];
    const currentQ = payload.quarterLabel;
    
    console.log('✅ Payload OK\n');
    console.log(`Quarter: ${currentQ}`);
    console.log(`wonAgg: ${wonAgg.length} deals`);
    console.log(`lostAgg: ${lostAgg.length} deals`);
    
    const wonQ = wonAgg.filter(d => d.fiscalQ === currentQ);
    const lostQ = lostAgg.filter(d => d.fiscalQ === currentQ);
    console.log(`\n${currentQ}:`);
    console.log(`  Ganhos: ${wonQ.length}`);
    console.log(`  Perdas: ${lostQ.length}`);
    console.log(`  Conversão: ${Math.round((wonQ.length / (wonQ.length + lostQ.length)) * 100)}%`);
    
  } catch (err) {
    console.log('❌ ERRO:', err.toString());
  }
}

/**
 * 🔍 Testa Sales Specialist - Validação COMPLETA de Datas, FiscalQ e Vendedores
 */
function testarSalesSpecialist() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎯 TESTE COMPLETO: Sales Specialist');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const salesSpec = ss.getSheetByName('Análise Sales Specialist');
  
  if (!salesSpec) {
    console.log('❌ Aba "Análise Sales Specialist" não encontrada\n');
    return;
  }
  
  const data = salesSpec.getDataRange().getValues();
  const headers = data[0];
  
  console.log('📋 Estrutura da aba:');
  console.log(`   Total de linhas: ${data.length - 1} deals`);
  console.log(`   Total de colunas: ${headers.length}\n`);
  
  // Encontra índices
  const closedDateIdx = headers.findIndex(h => 
    String(h).toLowerCase().includes('closed') && String(h).toLowerCase().includes('date')
  );
  const grossIdx = headers.findIndex(h => h === 'Gross' || h === 'Booking Total ($)Gross');
  const netIdx = headers.findIndex(h => h === 'Net' || h === 'Booking Total ($) Net');
  const statusIdx = headers.findIndex(h => h === 'Status');
  const ownerIdx = headers.findIndex(h => 
    String(h).toLowerCase().includes('owner') || String(h).toLowerCase().includes('opp') && String(h).toLowerCase().includes('owner')
  );
  
  console.log('📊 Colunas identificadas:');
  console.log(`   • Closed Date: ${closedDateIdx >= 0 ? 'Col ' + (closedDateIdx + 1) + ' (' + headers[closedDateIdx] + ')' : '❌'}`);
  console.log(`   • Gross: ${grossIdx >= 0 ? 'Col ' + (grossIdx + 1) : '❌'}`);
  console.log(`   • Net: ${netIdx >= 0 ? 'Col ' + (netIdx + 1) : '❌'}`);
  console.log(`   • Status: ${statusIdx >= 0 ? 'Col ' + (statusIdx + 1) : '❌'}`);
  console.log(`   • Owner: ${ownerIdx >= 0 ? 'Col ' + (ownerIdx + 1) + ' (' + headers[ownerIdx] + ')' : '⚠️'}\n`);
  
  if (closedDateIdx === -1 || grossIdx === -1 || statusIdx === -1) {
    console.log('❌ ERRO: Colunas essenciais não encontradas!\n');
    return;
  }
  
  const byFiscalQ = {};
  const byVendedor = {};
  const problemas = [];
  
  console.log('📅 Processando deals:\n');
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const closedDate = row[closedDateIdx];
    const grossRaw = String(row[grossIdx] || '0').replace(/[$,\s]/g, '');
    const netRaw = String(row[netIdx] || '0').replace(/[$,\s]/g, '');
    const gross = parseFloat(grossRaw) || 0;
    const net = parseFloat(netRaw) || 0;
    const status = (row[statusIdx] || '').toLowerCase().trim();
    const owner = ownerIdx >= 0 ? row[ownerIdx] : 'N/A';
    
    if (!closedDate || closedDate === '') {
      problemas.push(`Linha ${i + 1}: Sem Closed Date`);
      continue;
    }
    
    // Parse da data
    let date;
    if (closedDate instanceof Date) {
      date = closedDate;
    } else {
      const str = String(closedDate).trim();
      // Tenta DD/MM/YYYY primeiro
      const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        date = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      } else {
        date = new Date(str);
      }
    }
    
    if (isNaN(date.getTime())) {
      problemas.push(`Linha ${i + 1}: Data inválida (${closedDate})`);
      continue;
    }
    
    // Calcula FiscalQ
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();
    
    let fy, q;
    if (month >= 2 && month <= 4) { // Q1: Fev, Mar, Abr
      fy = year;
      q = 1;
    } else if (month >= 5 && month <= 7) { // Q2: Mai, Jun, Jul
      fy = year;
      q = 2;
    } else if (month >= 8 && month <= 10) { // Q3: Ago, Set, Out
      fy = year;
      q = 3;
    } else { // Q4: Nov, Dez, Jan
      fy = month === 1 ? year - 1 : year;
      q = 4;
    }
    
    const fiscalQ = `FY${String(fy).slice(-2)}-Q${q}`;
    
    // Agrupa por FiscalQ
    if (!byFiscalQ[fiscalQ]) {
      byFiscalQ[fiscalQ] = {
        gross: 0,
        net: 0,
        deals: 0,
        commit: 0,
        upside: 0,
        commitGross: 0,
        upsideGross: 0
      };
    }
    
    byFiscalQ[fiscalQ].gross += gross;
    byFiscalQ[fiscalQ].net += net;
    byFiscalQ[fiscalQ].deals++;
    
    if (status === 'commit') {
      byFiscalQ[fiscalQ].commit++;
      byFiscalQ[fiscalQ].commitGross += gross;
    } else if (status === 'upside') {
      byFiscalQ[fiscalQ].upside++;
      byFiscalQ[fiscalQ].upsideGross += gross;
    }
    
    // Agrupa por Vendedor
    if (ownerIdx >= 0 && owner && owner !== 'N/A' && owner !== '') {
      if (!byVendedor[owner]) {
        byVendedor[owner] = {
          gross: 0,
          net: 0,
          deals: 0,
          commit: 0,
          upside: 0
        };
      }
      
      byVendedor[owner].gross += gross;
      byVendedor[owner].net += net;
      byVendedor[owner].deals++;
      
      if (status === 'commit') byVendedor[owner].commit++;
      if (status === 'upside') byVendedor[owner].upside++;
    }
    
    // Mostra primeiras 3
    if (i <= 3) {
      console.log(`   Deal ${i}:`);
      console.log(`      Data: ${date.toLocaleDateString('pt-BR')} → ${fiscalQ}`);
      console.log(`      Gross: $${formatNum(gross)} | Status: ${status || 'N/A'}`);
      if (ownerIdx >= 0) console.log(`      Owner: ${owner}`);
      console.log('');
    }
  }
  
  // Mostra distribuição por FiscalQ
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 DISTRIBUIÇÃO POR FISCAL QUARTER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  Object.keys(byFiscalQ).sort().forEach(q => {
    const d = byFiscalQ[q];
    console.log(`${q}:`);
    console.log(`   Total: ${d.deals} deals = $${formatNum(d.gross)} Gross, $${formatNum(d.net)} Net`);
    console.log(`   Commit: ${d.commit} deals ($${formatNum(d.commitGross)})`);
    console.log(`   Upside: ${d.upside} deals ($${formatNum(d.upsideGross)})`);
    console.log('');
  });
  
  // Mostra distribuição por Vendedor
  if (ownerIdx >= 0 && Object.keys(byVendedor).length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👥 DISTRIBUIÇÃO POR VENDEDOR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    Object.keys(byVendedor).sort().forEach(v => {
      const d = byVendedor[v];
      console.log(`${v}:`);
      console.log(`   ${d.deals} deals = $${formatNum(d.gross)}`);
      console.log(`   Commit: ${d.commit} | Upside: ${d.upside}`);
      console.log('');
    });
  }
  
  // Mostra problemas
  if (problemas.length > 0) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️ PROBLEMAS ENCONTRADOS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    problemas.slice(0, 10).forEach(p => console.log(`   • ${p}`));
    if (problemas.length > 10) {
      console.log(`   ... e mais ${problemas.length - 10} problemas`);
    }
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ TESTE CONCLUÍDO');
  console.log('═══════════════════════════════════════════════════════════');
}

/**
 * 🔍 Testa distribuição de confiança no Pipeline
 */
function testarConfianca() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 TESTE: Distribuição de Confiança');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Lista de abas para procurar (em ordem de prioridade)
  const abasPossiveis = [
    '🎯 Análise Forecast IA',
    '🔮 Pipeline',
    'DB_AnalisePipeline',
    'Pipeline',
    'Oportunidades'
  ];
  
  let sheet = null;
  
  for (const nome of abasPossiveis) {
    sheet = ss.getSheetByName(nome);
    if (sheet) {
      console.log(`✅ Usando aba: "${nome}"\n`);
      break;
    }
  }
  
  if (!sheet) {
    console.log('❌ Nenhuma aba de pipeline/forecast encontrada\n');
    console.log('Abas disponíveis:');
    ss.getSheets().forEach(s => console.log(`   • ${s.getName()}`));
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  console.log('📋 Cabeçalhos da aba:\n');
  headers.forEach((h, i) => {
    if (h && String(h).trim() !== '') {
      console.log(`   ${i + 1}. ${h}`);
    }
  });
  console.log('');
  
  const confIdx = headers.findIndex(h => 
    String(h).toLowerCase().includes('confidence') || 
    String(h).toLowerCase().includes('confiança') ||
    String(h).toLowerCase().includes('confianca')
  );
  
  if (confIdx === -1) {
    console.log('❌ Coluna de Confiança não encontrada\n');
    console.log('Procurando por: "Confidence", "Confiança", "Confianca"\n');
    return;
  }
  
  console.log(`✅ Coluna de Confiança: "${headers[confIdx]}" (coluna ${confIdx + 1})\n`);
  
  const distribution = {
    commit: { count: 0, values: [] },
    upside: { count: 0, values: [] },
    pipeline: { count: 0, values: [] },
    missing: { count: 0 }
  };
  
  const totalRows = Math.min(data.length, 101); // Header + 100 deals
  
  for (let i = 1; i < totalRows; i++) {
    const val = data[i][confIdx];
    
    if (val === null || val === '' || val === 0) {
      distribution.missing.count++;
      continue;
    }
    
    const conf = parseFloat(val);
    
    if (isNaN(conf)) {
      distribution.missing.count++;
      continue;
    }
    
    if (conf >= 90) {
      distribution.commit.count++;
      distribution.commit.values.push(conf);
    } else if (conf >= 50) {
      distribution.upside.count++;
      distribution.upside.values.push(conf);
    } else {
      distribution.pipeline.count++;
      distribution.pipeline.values.push(conf);
    }
  }
  
  const total = distribution.commit.count + distribution.upside.count + distribution.pipeline.count + distribution.missing.count;
  
  console.log(`📊 Distribuição (amostra de ${total} deals):\n`);
  console.log(`   COMMIT (≥90%):   ${distribution.commit.count} deals`);
  console.log(`   UPSIDE (50-89%): ${distribution.upside.count} deals`);
  console.log(`   PIPELINE (<50%): ${distribution.pipeline.count} deals`);
  console.log(`   SEM CONFIANÇA:   ${distribution.missing.count} deals\n`);
  
  // Valores únicos
  ['commit', 'upside', 'pipeline'].forEach(cat => {
    if (distribution[cat].values.length > 0) {
      const unique = [...new Set(distribution[cat].values)].sort((a, b) => b - a);
      console.log(`   ${cat.toUpperCase()} valores: ${unique.slice(0, 8).join(', ')}${unique.length > 8 ? '...' : ''}`);
    }
  });
  
  console.log('');
  
  // Diagnóstico
  if (distribution.upside.count > 0 && distribution.commit.count === 0 && distribution.pipeline.count === 0) {
    console.log('⚠️ PROBLEMA: Todos em UPSIDE (50-89%)!');
    console.log('   Confiança pode estar fixo entre 50-89%\n');
  }
  
  if (distribution.missing.count > total * 0.5) {
    console.log('⚠️ PROBLEMA: Mais de 50% sem confiança!');
    console.log('   Análise IA não está populando Confidence Score.\n');
  }
  
  // Mostra amostra de valores
  console.log('📊 Amostra de 5 deals com confiança:\n');
  let amostras = 0;
  for (let i = 1; i < totalRows && amostras < 5; i++) {
    const val = data[i][confIdx];
    const conf = parseFloat(val);
    
    if (!isNaN(conf) && conf > 0) {
      // Pega outras colunas úteis
      const oppIdx = headers.findIndex(h => String(h).toLowerCase().includes('opportunity'));
      const grossIdx = headers.findIndex(h => String(h).toLowerCase().includes('gross') || String(h).includes('Total Price'));
      
      console.log(`   Deal ${amostras + 1}:`);
      if (oppIdx >= 0) console.log(`      Opp: ${data[i][oppIdx]}`);
      console.log(`      Confidence: ${conf}%`);
      if (grossIdx >= 0) console.log(`      Gross: $${formatNum(data[i][grossIdx])}`);
      console.log('');
      
      amostras++;
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ TESTE CONCLUÍDO');
  console.log('═══════════════════════════════════════════════════════════');
}

/**
 * Formata número
 */
function formatNum(num) {
  if (num === null || num === undefined) return '0';
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ================================================================================================
// --- TESTES DA CLOUD FUNCTION ---
// ================================================================================================

/**
 * Teste 1: Ping na Cloud Function
 */
function testarCloudFunction_Ping() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: PING CLOUD FUNCTION');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const url = 'https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine';
  
  const testPayload = {
    data: {
      pipeline: [{ "Oportunidade": "Teste", "Gross": "100000", "Net": "50000" }],
      won: [],
      lost: []
    },
    filters: { quarter: null, seller: null, min_value: 0 }
  };
  
  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    console.log('Status:', code);
    
    if (code === 200) {
      const result = JSON.parse(response.getContentText());
      console.log('✅ Cloud Function respondendo!');
      console.log('   Status:', result.status);
      console.log('   Timestamp:', result.timestamp);
      console.log('\n✅ TESTE PASSOU\n');
    } else {
      console.log('❌ Erro:', code);
      console.log('❌ TESTE FALHOU\n');
    }
  } catch (error) {
    console.log('❌ Erro:', error);
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * Teste 2: Dados Reais
 */
function testarCloudFunction_DadosReais() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: DADOS REAIS DAS ABAS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const rawData = prepareRawDataForCloudFunction();
  
  console.log('📊 Dados preparados:');
  console.log('   Pipeline:', rawData.pipeline.length, 'deals');
  console.log('   Ganhas:', rawData.won.length, 'deals');
  console.log('   Perdidas:', rawData.lost.length, 'deals\n');
  
  if (rawData.pipeline.length === 0 && rawData.won.length === 0 && rawData.lost.length === 0) {
    console.log('⚠️ Sem dados nas abas de análise');
    console.log('❌ TESTE FALHOU\n');
    return;
  }
  
  const result = callCloudFunction(rawData, { quarter: null, seller: null, min_value: 0 });
  
  if (result) {
    console.log('✅ Cloud Function executada!');
    console.log('   Tempo:', result.processing_time_seconds, 's');
    console.log('   Total deals:', result.summary?.total_deals || 0);
    console.log('   Sellers:', result.seller_scorecard?.length || 0);
    console.log('\n✅ TESTE PASSOU\n');
  } else {
    console.log('❌ Cloud Function falhou');
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * Teste 3: Módulo Visão Executiva
 */
function testarCloudFunction_VisaoExecutiva() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: MÓDULO VISÃO EXECUTIVA (L10)');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const visaoData = prepareVisaoExecutivaData();
  console.log('📊 Filtros aplicados\n');
  
  const result = callCloudFunction(visaoData.data, visaoData.filters);
  
  if (result && result.closed_analysis) {
    console.log('✅ Análise recebida!');
    console.log('   Won deals:', result.closed_analysis.won?.count || 0);
    console.log('   Lost deals:', result.closed_analysis.lost?.count || 0);
    console.log('   Pipeline:', result.pipeline_analysis?.total_deals || 0);
    console.log('\n✅ TESTE PASSOU\n');
  } else {
    console.log('❌ Falha na análise');
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * Teste 4: Módulo Pipeline
 */
function testarCloudFunction_Pipeline() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: MÓDULO PIPELINE');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const pipelineData = preparePipelineData('FY26-Q1');
  console.log('📊 Quarter:', pipelineData.filters.quarter);
  console.log('📊 Deals:', pipelineData.data.pipeline.length, '\n');
  
  const result = callCloudFunction(pipelineData.data, pipelineData.filters);
  
  if (result && result.pipeline_analysis) {
    console.log('✅ Pipeline analisado!');
    console.log('   Total deals:', result.pipeline_analysis.total_deals || 0);
    console.log('   Total value:', result.pipeline_analysis.total_value || 0);
    console.log('   Zombies:', result.pipeline_analysis.zombies?.length || 0);
    console.log('\n✅ TESTE PASSOU\n');
  } else {
    console.log('❌ Falha na análise');
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * Teste 5: Módulo Vendedores
 */
function testarCloudFunction_Vendedores() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: MÓDULO VENDEDORES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const vendedoresData = prepareVendedoresData(null);
  const result = callCloudFunction(vendedoresData.data, vendedoresData.filters);
  
  if (result && result.seller_scorecard) {
    console.log('✅ Vendedores analisados!');
    console.log('   Total sellers:', result.seller_scorecard.length);
    
    if (result.seller_scorecard.length > 0) {
      const topSeller = result.seller_scorecard.sort((a, b) => b.win_rate - a.win_rate)[0];
      console.log('   Top seller:', topSeller.seller);
      console.log('   Win rate:', (topSeller.win_rate * 100).toFixed(1), '%');
    }
    console.log('\n✅ TESTE PASSOU\n');
  } else {
    console.log('❌ Falha na análise');
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * Teste 6: War Targets
 */
function testarCloudFunction_WarTargets() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TESTE: WAR TARGETS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const warData = prepareWarTargetsData();
  console.log('📊 Min value:', warData.filters.min_value, '\n');
  
  const result = callCloudFunction(warData.data, warData.filters);
  
  if (result && result.war_targets) {
    console.log('✅ War Targets identificados!');
    console.log('   Total targets:', result.war_targets.length);
    
    if (result.war_targets.length > 0) {
      console.log('\n🎯 Top 3:');
      result.war_targets.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i+1}. ${t.opportunity || 'N/A'}`);
        console.log(`      Seller: ${t.seller || 'N/A'}`);
        console.log(`      Risk: ${t.risk_score || 0}`);
      });
    }
    console.log('\n✅ TESTE PASSOU\n');
  } else {
    console.log('❌ Falha na análise');
    console.log('❌ TESTE FALHOU\n');
  }
}

/**
 * EXECUTAR TODOS OS TESTES DA CLOUD FUNCTION
 */
function testarCloudFunction_Completo() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       SUITE DE TESTES - CLOUD FUNCTION INTEGRATION       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const tests = [
    { name: 'Ping Cloud Function', fn: testarCloudFunction_Ping },
    { name: 'Dados Reais', fn: testarCloudFunction_DadosReais },
    { name: 'Visão Executiva', fn: testarCloudFunction_VisaoExecutiva },
    { name: 'Pipeline', fn: testarCloudFunction_Pipeline },
    { name: 'Vendedores', fn: testarCloudFunction_Vendedores },
    { name: 'War Targets', fn: testarCloudFunction_WarTargets }
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TESTE ${index + 1}/${tests.length}: ${test.name}`);
    console.log('═'.repeat(60));
    
    try {
      test.fn();
      passed++;
    } catch (error) {
      console.error('❌ ERRO:', error);
      failed++;
    }
    
    if (index < tests.length - 1) {
      Utilities.sleep(1000);
    }
  });
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTADO FINAL                        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`✅ Passou: ${passed}/${tests.length}`);
  console.log(`❌ Falhou: ${failed}/${tests.length}`);
  console.log(`📊 Taxa: ${((passed / tests.length) * 100).toFixed(1)}%\n`);
}
