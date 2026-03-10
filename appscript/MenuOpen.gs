/**
 * MenuOpen.gs
 * Menu principal do Sales AI (GTM)
 * Centralizado para melhor organização e manutenção
 */

/**
 * Instalação automática: cria todos os triggers ao instalar o script
 */
function onInstall() {
  onOpen();
  instalarTodosTriggers();
  garantirTriggerOnOpenMenu_();
}

/**
 * Garante trigger instalavel de abertura para reduzir falhas do simple trigger onOpen.
 */
function garantirTriggerOnOpenMenu_() {
  try {
    clearTriggersByHandler_('onOpen');
    ScriptApp.newTrigger('onOpen')
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onOpen()
      .create();
    console.log('✅ Trigger instalável onOpen criado com sucesso');
  } catch (e) {
    console.error('❌ Falha ao criar trigger instalável onOpen: ' + e.message);
  }
}

/**
 * Recuperação manual: execute no editor Apps Script para recriar trigger e menu.
 */
function recuperarMenuSalesAI() {
  garantirTriggerOnOpenMenu_();
  onOpen();
}

/**
 * Instala todos os triggers do sistema silenciosamente (sem UI).
 * Garante: normalização de datas (30min) + sync BigQuery (1h)
 */
function instalarTodosTriggers() {
  // ── Normalização de Datas (30 min) ───────────────────────────────
  clearTriggersByHandler_('normalizarDatasTodasAbas');
  ScriptApp.newTrigger('normalizarDatasTodasAbas')
    .timeBased()
    .everyMinutes(30)
    .create();

  // ── BigQuery Sync (1 hora) ────────────────────────────────────────
  clearTriggersByHandler_('syncToBigQueryScheduled');
  if (BQ_ENABLED) {
    ScriptApp.newTrigger('syncToBigQueryScheduled')
      .timeBased()
      .everyHours(1)
      .create();
  }

  console.log('✅ Triggers instalados: normalizarDatasTodasAbas (30min)' + (BQ_ENABLED ? ' | syncToBigQueryScheduled (1h)' : ''));
}

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
        .addItem('🔓 Limpar Lock (Manutenção)', 'limparLockAutoSync'))

      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 1b: ANÁLISE MANUAL
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🔍 Análise Manual')
        .addItem('🔄 Rodar Auto-Sync completo agora', 'rodarAutoSyncCompletoManual')
        .addItem('🧪 Validar correção SS (OPEN)', 'validarCorrecaoSalesSpecialistManual')
        .addSeparator()
        .addItem('▶️ Rodar Análise OPEN agora', 'rodarAnaliseOPENManual')
        .addItem('▶️ Rodar Análise WON agora',  'rodarAnaliseWONManual')
        .addItem('▶️ Rodar Análise LOST agora', 'rodarAnaliseLOSTManual'))

      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 2: CORRIGIR FISCAL Q (somente normalização de datas)
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('📅 Corrigir Fiscal Q')
        .addItem('🧹 Normalizar Datas (todas as abas)', 'normalizarDatasTodasAbas')
        .addSeparator()
        .addItem('🏷️ Enriquecer Perdidas (Segmentação IA)', 'enriquecerAnalisePerdidasComSegmentacaoIA')
        .addItem('▶️ Rodar Perdidas IA agora (sem popup)', 'executarEnriquecimentoPerdidasIASemPopup')
        .addItem('🧪 TESTE Perdidas IA (5 linhas)', 'enriquecerPerdidas_TESTE_5_LINHAS')
        .addSeparator()
        .addItem('⚙️ Ativar Trigger Perdidas IA (15min)', 'ativarTriggerEnriquecimentoPerdidasIA')
        .addItem('🛑 Desativar Trigger Perdidas IA', 'desativarTriggerEnriquecimentoPerdidasIA')
        .addSeparator()
        .addItem('🏗️ Normalizar Verticais (dados históricos)', 'normalizarVerticaisNaPlanilha'))

      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 3: ALIASES
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🧭 Aliases')
        .addItem('📋 Gerar Tabela de Identificação', 'gerarTabelaIdentificacaoAliases'))
      
      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 4: FERRAMENTAS & DIAGNÓSTICO
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('🔧 Ferramentas & Diagnóstico')
        .addItem('📋 Auditoria: Base vs Análise', 'auditarBaseVsAnalise')
        .addItem('🧩 Ajustar Cabeçalho OPEN (1x)', 'configurarCabecalhoOpenParaAutoSync'))
      
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
      // SEÇÃO 6: FATURAMENTO (Migração da planilha origem)
      // ══════════════════════════════════════════════════════════════
      .addSeparator()
      .addSubMenu(ui.createMenu('💰 Faturamento')
        .addItem('🔄 Migrar FATURAMENTO (2025 + 2026 + SEMANAL)', 'migrarFaturamento')
        .addSeparator()
        .addItem('⏰ Ativar Sync FATURAMENTO (12h - inclui semanal)', 'instalarTriggerFaturamento12h')
        .addItem('🛑 Desativar Sync FATURAMENTO', 'removerTriggerFaturamento')
        .addItem('📊 Status Triggers', 'statusTriggerFaturamento'))

      // ══════════════════════════════════════════════════════════════
      // SEÇÃO 7: RESET COMPLETO (Isolado para segurança)
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

// ==================== ANÁLISE MANUAL ====================

/**
 * Inicia análise OPEN via setupTriggerAndStart (inicializa flag + fila + trigger).
 */
function rodarAnaliseOPENManual() {
  iniciarSyncOpenManualSemCleanup_();
}

/**
 * Inicia análise WON via setupTriggerAndStart (inicializa flag + fila + trigger).
 */
function rodarAnaliseWONManual() {
  setupTriggerAndStart('WON');
}

/**
 * Inicia análise LOST via setupTriggerAndStart (inicializa flag + fila + trigger).
 */
function rodarAnaliseLOSTManual() {
  setupTriggerAndStart('LOST');
}

/**
 * Executa ciclo completo BASE -> ANALISE imediatamente (OPEN + LOST + WON + SS).
 */
function rodarAutoSyncCompletoManual() {
  processarMudancasManual();
}

/**
 * Atalho para validar rapidamente a correção de Sales Specialist no fluxo OPEN.
 * Executa diagnóstico direto (sem iniciar pipeline OPEN).
 */
function validarCorrecaoSalesSpecialistManual() {
  validarCorrecaoSalesSpecialistOPEN();
}
