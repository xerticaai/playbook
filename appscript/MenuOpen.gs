/**
 * MenuOpen.gs
 * Menu principal do Sales AI (GTM)
 * Centralizado para melhor organização e manutenção
 */

function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🚀 Sales AI (GTM)')
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 1: AUTOMAÇÃO (Auto-Sync)
      // ══════════════════════════════════════════════════════════════
      .addSubMenu(ui.createMenu('⚡ Sistema Automático')
        .addItem('🤖 ▶️ Ativar Auto-Sync', 'ativarAutoSync')
        .addItem('🛑 Desativar Sistema', 'desativarAutoSync')
        .addItem('📊 Verificar Status Completo', 'verificarStatusAutoSync')
        .addSeparator()
        .addItem('🔄 Processar Mudanças Manualmente', 'processarMudancasManual')
        .addSeparator()
        .addItem('🔓 Limpar Lock (Manutenção)', 'limparLockAutoSync'))
      
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 2: ANÁLISES MANUAIS (Para processamento sob demanda)
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🎯 Análises Manuais')
        .addItem('📊 Analisar Pipeline (Open)', 'startPipeline')
        .addItem('✅ Analisar Ganhas (Won)', 'startWon')
        .addItem('❌ Analisar Perdidas (Lost)', 'startLost')
        .addSeparator()
        .addItem('🔧 Corrigir Change Tracking (Ganhas/Perdidas)', 'corrigirChangeTrackingClosedDeals')
        .addItem('📅 Corrigir Datas de Fechamento (Ganhas/Perdidas)', 'corrigirDatasFechamentoClosedDeals')
        .addItem('📊 Recalcular Fiscal Q (Todas Análises)', 'recalcularFiscalQTodasAnalises')
        .addItem('⏰ Atualizar Timestamps', 'atualizarTimestampsManual')
        .addItem('📋 Relatório de Qualidade de Dados', 'gerarRelatorioQualidadeDados'))
      
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 4: FERRAMENTAS & DIAGNÓSTICO
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🔧 Ferramentas & Diagnóstico')
        .addItem('💊 Health Check Completo', 'runHealthCheck')
        .addItem('⚡ Teste Rápido de API', 'runQuickTest')
        .addSeparator()
        .addItem('🔍 Diagnóstico: Agregação Gross/Net', 'diagnosticarAgregacaoGrossNet')
        .addItem('🔍 Varredura Completa: Todas Oportunidades', 'varreduraCompletaAgregacao')
        .addSeparator()
        .addItem('🩺 Diagnosticar Flags do Sistema', 'diagnosticarFlags')
        .addItem('🧹 Limpar Flags Residuais', 'limparFlagsResiduais')
        .addSeparator()
        .addItem('📋 Auditoria: Base vs Análise', 'auditarBaseVsAnalise')
        .addItem('🔄 Ativar Auditoria Automática (15 min)', 'configurarAuditoriaAutomatica')
        .addItem('⏸️ Desativar Auditoria Automática', 'desativarAuditoriaAutomatica')
        .addItem('🗑️ Limpar Logs Antigos', 'limparLogsManualmente'))
      
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 5: BIGQUERY (Nova integração)
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🗄️ BigQuery')
        .addItem('🔄 Sincronizar Agora', 'syncToBigQueryManual')
        .addItem('⚙️ Configurar Sync Automático', 'configurarBigQuerySync')
        .addItem('🛑 Desativar Sync BigQuery', 'desativarBigQuerySync')
        .addSeparator()
        .addItem('📊 Ver Status BigQuery', 'verificarStatusBigQuery')
        .addItem('🧪 Testar Conexão', 'testarConexaoBigQuery'))
      
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 6: RESET COMPLETO (Isolado para segurança)
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addItem('🔄 ⚠️ REINICIALIZAÇÃO TOTAL', 'resetPanel')
      .addToUi();
    
    console.log("✅ Menu Sales AI (GTM) carregado com sucesso");
  } catch (e) {
    console.error("❌ Falha ao carregar menu: " + e.message);
    console.error("Stack: " + e.stack);
  }
}

// ==================== FUNÇÕES DO MENU BIGQUERY ====================

/**
 * Sincroniza manualmente com BigQuery (chamada pelo menu)
 */
function syncToBigQueryManual() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '⏳ Sincronizar com BigQuery',
    'Carregar dados das abas de análise para o BigQuery?\n\n' +
    'Isso pode levar 10-30 segundos.\n\n' +
    'IMPORTANTE: Execute "Processar Mudanças" primeiro se houver dados novos.',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response !== ui.Button.OK) return;
  
  ui.alert(
    '⏳ Sincronizando...',
    'Carregando dados para o BigQuery. Aguarde...',
    ui.ButtonSet.OK
  );
  
  const result = syncToBigQueryScheduled();
  
  if (result.success) {
    ui.alert(
      '✅ Sincronização Concluída',
      `Dados carregados no BigQuery com sucesso!\n\n` +
      `• Pipeline: ${result.pipelineRows} linhas\n` +
      `• Closed Deals: ${result.closedRows} linhas\n` +
      `• Duração: ${result.duration}s`,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      '❌ Erro na Sincronização',
      `Falha ao carregar dados no BigQuery:\n\n${result.error || result.reason}\n\n` +
      `Verifique os logs (View > Logs) para mais detalhes.`,
      ui.ButtonSet.OK
    );
  }
}

/**
 * Configurar sync automático com BigQuery
 */
function configurarBigQuerySync() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '⚙️ Configurar Sync Automático BigQuery',
    'Deseja ativar sincronização automática com BigQuery?\n\n' +
    '⏰ Frequência: A cada 1 hora\n' +
    '📊 Dados: Pipeline + Closed Deals\n' +
    '🔄 Ocorre após o auto-sync normal\n\n' +
    'Recomendado: SIM para usar ML predictions',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  // Remover triggers antigos
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncToBigQueryScheduled') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Criar novo trigger (a cada 1 hora)
  ScriptApp.newTrigger('syncToBigQueryScheduled')
    .timeBased()
    .everyHours(1)
    .create();
  
  // Executar primeira sincronização
  ui.alert(
    '⏳ Primeira Sincronização',
    'Executando primeira sincronização com BigQuery...\n\nAguarde...',
    ui.ButtonSet.OK
  );
  
  const result = syncToBigQueryScheduled();
  
  if (result.success) {
    ui.alert(
      '✅ BigQuery Configurado',
      `Sync automático ativado!\n\n` +
      `⏰ Frequência: A cada 1 hora\n` +
      `📊 Última sync: ${result.pipelineRows} pipeline + ${result.closedRows} closed\n` +
      `⏱️ Duração: ${result.duration}s`,
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      '⚠️ Aviso',
      `Trigger criado, mas primeira sync falhou:\n\n${result.error || result.reason}\n\n` +
      `O trigger continuará tentando a cada hora.`,
      ui.ButtonSet.OK
    );
  }
}

/**
 * Desativar sync BigQuery
 */
function desativarBigQuerySync() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '🛑 Desativar BigQuery',
    'Remover trigger de sync automático com BigQuery?\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  // Remover triggers
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncToBigQueryScheduled') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  
  ui.alert(
    '✅ BigQuery Desativado',
    `Sync automático removido (${removed} trigger${removed > 1 ? 's' : ''}).`,
    ui.ButtonSet.OK
  );
}

/**
 * Verificar status do BigQuery
 */
function verificarStatusBigQuery() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  // Verificar se trigger está ativo
  const triggers = ScriptApp.getProjectTriggers();
  const bqTrigger = triggers.find(t => t.getHandlerFunction() === 'syncToBigQueryScheduled');
  
  const status = bqTrigger ? '🟢 ATIVO' : '🔴 INATIVO';
  const lastSync = props.getProperty('BIGQUERY_LAST_SYNC') || 'Nunca';
  
  let message = `Status BigQuery Sync: ${status}\n\n`;
  
  if (bqTrigger) {
    const nextRun = new Date(bqTrigger.getTriggerSource() === ScriptApp.TriggerSource.CLOCK 
      ? Date.now() + 3600000 
      : Date.now());
    message += `⏰ Frequência: A cada hora\n`;
    message += `📅 Última sync: ${lastSync}\n\n`;
    message += `Feature Flag: ${BQ_ENABLED ? '🟢 ATIVADO' : '🔴 DESATIVADO'}\n`;
  } else {
    message += `ℹ️ Sync automático não está configurado.\n\n`;
    message += `Use "Configurar Sync Automático" para ativar.\n\n`;
    message += `Feature Flag: ${BQ_ENABLED ? '🟢 ATIVADO' : '🔴 DESATIVADO'}`;
  }
  
  ui.alert('📊 Status BigQuery', message, ui.ButtonSet.OK);
}

/**
 * Testar conexão BigQuery
 */
function testarConexaoBigQuery() {
  const ui = SpreadsheetApp.getUi();
  
  ui.alert(
    '⏳ Testando BigQuery',
    'Verificando conexão com BigQuery...',
    ui.ButtonSet.OK
  );
  
  try {
    // Testar query simples
    const query = `SELECT COUNT(*) as total FROM \`operaciones-br.sales_intelligence.pipeline\``;
    const request = {
      query: query,
      useLegacySql: false
    };
    
    const queryResults = BigQuery.Jobs.query(request, 'operaciones-br');
    const rows = queryResults.rows || [];
    
    if (rows.length > 0) {
      const total = rows[0].f[0].v;
      ui.alert(
        '✅ Conexão OK',
        `BigQuery conectado com sucesso!\n\n` +
        `Tabela 'pipeline' tem ${total} linhas.\n\n` +
        `Projeto: operaciones-br\n` +
        `Dataset: sales_intelligence`,
        ui.ButtonSet.OK
      );
    } else {
      ui.alert(
        '⚠️ Tabela Vazia',
        `Conexão OK, mas tabela 'pipeline' está vazia.\n\n` +
        `Execute "Sincronizar Agora" para carregar dados.`,
        ui.ButtonSet.OK
      );
    }
    
  } catch (error) {
    ui.alert(
      '❌ Erro de Conexão',
      `Falha ao conectar com BigQuery:\n\n${error.message}\n\n` +
      `Verifique:\n` +
      `1. Biblioteca BigQuery está instalada?\n` +
      `2. Projeto existe? (operaciones-br)\n` +
      `3. Dataset existe? (sales_intelligence)`,
      ui.ButtonSet.OK
    );
  }
}
