/**
 * @fileoverview ANALISADOR DE VENDAS & MOTOR DE GOVERNANÇA GTM (VERSÃO 52.0 - DISTRIBUIÇÃO PROPORCIONAL MENSAL)
 * @author Arquiteto de Software Sênior - Especialista em Operações de Vendas
 * 
 * ================================================================================
 * MANIFESTO ARQUITETURAL
 * ================================================================================
 * 1. GOVERNANÇA ANTES DA IA: Portões rígidos determinísticos (Net > 0, Inatividade < 45d).
 * 2. MOTOR DE INATIVIDADE (DIAS): Identificação real de ociosidade vs. atividades agendadas.
 * 3. INTEGRIDADE DE PRODUTOS: Agregação por Deal Name com busca multidimensional de colunas.
 * 4. MEDDIC TRILÍNGUE + GOV: Suporte a termos em PT, EN, ES e marcos de Setor Público (TR/ARP/ETP).
 * 5. TAXONOMIA FISCAL: Rótulos fiscal quarter automáticos calculados dinamicamente pela data de fechamento.
 * 6. MAPEAMENTO DINÂMICO: Todas as abas são lidas via cabeçalho (sem índices fixos).
 * 7. PROTOCOLO DE ANÁLISE FORÇADA: Análise obrigatória de todos os deals para expor riscos de "CRM Vazio".
 * 
 * ================================================================================
 * ESTRUTURA DO CÓDIGO POR MODO DE ANÁLISE
 * ================================================================================
 * 
 * 📊 PIPELINE (OPEN) - Oportunidades Abertas:
 *    - Foco: Forecast, Governança, Próximas Ações
 *    - Hard Gates: Estagnação, Deal Desk, Governo, Net Zero
 *    - Análise IA: Categorização (COMMIT/UPSIDE/PIPELINE/OMITIDO)
 *    - Output: 44 colunas incluindo MEDDIC, BANT, Ciclo, Change Tracking, Anomalies, Velocity
 *    - Métrica Chave: "Dias Funil" = HOJE - CREATED DATE
 *    - Métrica Secundária: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 *    - Change Tracking: Total mudanças, críticas, close date, stage, valor
 *    - Anomalias: Detecta padrões suspeitos (múltiplos editores, mudanças excessivas, volatilidade)
 * 
 * ✅ GANHOS (WON) - Oportunidades Ganhas:
 *    - Foco: Fatores de Sucesso, Replicabilidade
 *    - Análise IA: Causa Raiz, Qualidade Engajamento, Gestão
 *    - Output: 39 colunas incluindo Lições Aprendidas
 *    - Métrica Chave: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 * 
 * ❌ PERDAS (LOST) - Oportunidades Perdidas:
 *    - Foco: Causas, Evitabilidade, Aprendizados
 *    - Análise IA: Causa Raiz, Sinais Alerta, Momento Crítico
 *    - Output: 39 colunas incluindo Evitável?, Causas Secundárias
 *    - Métrica Chave: "Ciclo (dias)" = CLOSE DATE - CREATED DATE
 * 
 * ================================================================================
 * CAMADAS DA ARQUITETURA
 * ================================================================================
 * 1. UI Layer: Menu do usuário, triggers, health checks
 * 2. Governança e Controle: Tick system, queue management
 * 3. Engine Layer: Processamento batch, hard gates, análise IA
 * 4. Prompt Generators: Construção de prompts específicos por modo
 * 5. Output Builders: Montagem de linhas de output por modo
 * 6. Utilities: Parsers, normalizadores, calculadores
 * 
 * @version 51.1
 */

// ================================================================================================
// --- CONFIGURAÇÕES GLOBAIS E IDENTIDADE DO PROJETO ---
// ================================================================================================


// ================================================================================================
// --- FUNÇÕES DE PROCESSAMENTO E OPERAÇÕES DE SHEET ---
// ================================================================================================

// ══════════════════════════════════════════════════════════════
// MENU MOVIDO PARA MenuOpen.gs
// Centralizado para melhor organização
// ══════════════════════════════════════════════════════════════

/** Wrappers de disparo vinculados ao menu */
function startPipeline() { 
  try {
    logToSheet("INFO", "Menu", "startPipeline() chamado");
    setupTriggerAndStart('OPEN');
  } catch (e) {
    logToSheet("ERROR", "Menu", "Erro em startPipeline: " + e.message + " | Stack: " + e.stack);
    SpreadsheetApp.getUi().alert("❌ Erro ao iniciar pipeline: " + e.message);
    throw e;
  }
}

function startWon() { 
  try {
    logToSheet("INFO", "Menu", "startWon() chamado");
    setupTriggerAndStart('WON');
  } catch (e) {
    logToSheet("ERROR", "Menu", "Erro em startWon: " + e.message);
    SpreadsheetApp.getUi().alert("❌ Erro ao iniciar WON: " + e.message);
    throw e;
  }
}

function startLost() { 
  try {
    logToSheet("INFO", "Menu", "startLost() chamado");
    setupTriggerAndStart('LOST');
  } catch (e) {
    logToSheet("ERROR", "Menu", "Erro em startLost: " + e.message);
    SpreadsheetApp.getUi().alert("❌ Erro ao iniciar LOST: " + e.message);
    throw e;
  }
}

/** Executa teste de sanidade da API */
function runQuickTest() {
  const ui = SpreadsheetApp.getUi();
  const startTime = new Date().getTime();
  ui.showModelessDialog(HtmlService.createHtmlOutput("<b>Diagnóstico:</b> Processando lote de teste..."), "Status");
  try {
    const res = runEngineBatch('OPEN', 0, 1, startTime); 
    ui.alert(`Diagnóstico Finalizado.\nStatus: ${res.status}\nMsg: ${res.message || "OK"}`);
  } catch(e) {
    ui.alert("ERRO NO TESTE: " + e.message);
  }
}

/** Diagnóstico completo do sistema */
function runHealthCheck() {
  const startTime = new Date();
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  
  console.log('🔍 Iniciando Health Check Completo...');
  logToSheet("INFO", "HealthCheck", "═══════════════════════════════════════════════════════");
  logToSheet("INFO", "HealthCheck", "HEALTH CHECK COMPLETO INICIADO");
  logToSheet("INFO", "HealthCheck", `Timestamp: ${startTime.toLocaleString('pt-BR')}`);
  logToSheet("INFO", "HealthCheck", "═══════════════════════════════════════════════════════");
  
  let report = "🔍 HEALTH CHECK - Status do Sistema\n\n";
  let issues = [];
  
  // 1. Verificar abas necessárias
  report += "📋 ABAS NECESSÁRIAS:\n";
  logToSheet("INFO", "HealthCheck", "--- 1. VERIFICAÇÃO DE ABAS ---");
  const requiredSheets = [
    { name: SHEETS.ABERTO, desc: "Pipeline Aberto (OPEN)" },
    { name: SHEETS.GANHAS, desc: "Histórico Ganhas (WON)" },
    { name: SHEETS.PERDIDAS, desc: "Histórico Perdidas (LOST)" },
    { name: SHEETS.ATIVIDADES, desc: "Atividades" },
    { name: SHEETS.ALTERACOES_ABERTO, desc: "Alterações Oportunidade" }
  ];
  
  let missingSheets = [];
  requiredSheets.forEach(item => {
    const exists = ss.getSheetByName(item.name) !== null;
    const status = exists ? "✅" : "❌";
    report += `${status} ${item.desc}: ${item.name}\n`;
    logToSheet(exists ? "INFO" : "ERROR", "HealthCheck", `${status} ${item.desc}: ${item.name}`);
    if (!exists) {
      missingSheets.push(item.name);
      issues.push(`Aba faltando: ${item.name}`);
    }
  });
  
  // 2. Verificar dados nas abas principais
  report += "\n📊 DADOS NAS ABAS:\n";
  logToSheet("INFO", "HealthCheck", "--- 2. VERIFICAÇÃO DE DADOS ---");
  ['ABERTO', 'GANHAS', 'PERDIDAS'].forEach(mode => {
    const config = getModeConfig(mode);
    const sheet = ss.getSheetByName(config.input);
    if (sheet) {
      const rows = sheet.getLastRow() - 1; // -1 para header
      report += `✅ ${config.input}: ${rows} registros\n`;
      logToSheet("INFO", "HealthCheck", `${config.input}: ${rows} registros`);
      if (rows === 0) {
        missingSheets.push(`${config.input} (vazia)`);
        issues.push(`Aba vazia: ${config.input}`);
      }
    }
  });
  
  // 3. Verificar integridade dos dados e correspondências
  report += "\n🔍 VERIFICAÇÃO DE INTEGRIDADE:\n";
  logToSheet("INFO", "HealthCheck", "--- 3. INTEGRIDADE E CORRESPONDÊNCIAS ---");
  
  // Verificar se as colunas essenciais existem (usando mapeamento flexível)
  const abertoSheet = ss.getSheetByName(SHEETS.ABERTO);
  if (abertoSheet) {
    const headers = abertoSheet.getRange(1, 1, 1, abertoSheet.getLastColumn()).getValues()[0];
    const mapping = getColumnMapping(headers);
    
    const requiredMappings = [
      { name: 'Nome da oportunidade', key: 'p_opp' },
      { name: 'Valor', key: 'p_gross' },
      { name: 'Estágio do pipeline', key: 'p_stage' }
    ];
    
    const missingColumns = [];
    
    requiredMappings.forEach(req => {
      const found = mapping[req.key] !== -1;
      const status = found ? "✅" : "❌";
      logToSheet(found ? "INFO" : "WARN", "HealthCheck", `Coluna '${req.name}': ${status}`);
      if (!found) {
        missingColumns.push(req.name);
        issues.push(`Coluna faltando em ${SHEETS.ABERTO}: ${req.name}`);
      }
    });
    
    if (missingColumns.length === 0) {
      report += "✅ Todas as colunas essenciais presentes\n";
    } else {
      report += `⚠️ Colunas não mapeadas: ${missingColumns.join(', ')}\n`;
      report += "💡 Verifique os nomes das colunas no mapeamento\n";
    }
  }
  
  // Verificar correspondências de análises
  const analyzeSheet = ss.getSheetByName(SHEETS.ANALYZE);
  if (analyzeSheet && abertoSheet) {
    const analyzeData = analyzeSheet.getRange(2, 1, analyzeSheet.getLastRow() - 1, 1).getValues();
    const abertoData = abertoSheet.getRange(2, 1, abertoSheet.getLastRow() - 1, 1).getValues();
    
    const analyzeIds = analyzeData.map(r => r[0]).filter(id => id);
    const abertoIds = abertoData.map(r => r[0]).filter(id => id);
    
    const orphanedAnalyses = analyzeIds.filter(id => !abertoIds.includes(id));
    const missingAnalyses = abertoIds.filter(id => !analyzeIds.includes(id));
    
    logToSheet("INFO", "HealthCheck", `Análises: ${analyzeIds.length} total, ${orphanedAnalyses.length} órfãs, ${missingAnalyses.length} faltando`);
    
    if (orphanedAnalyses.length > 0) {
      report += `⚠️ ${orphanedAnalyses.length} análises órfãs (sem oportunidade correspondente)\n`;
      issues.push(`${orphanedAnalyses.length} análises órfãs`);
    } else {
      report += "✅ Nenhuma análise órfã\n";
    }
    
    const coveragePercent = abertoIds.length > 0 ? ((analyzeIds.length / abertoIds.length) * 100).toFixed(1) : 0;
    report += `📈 Cobertura de análises: ${coveragePercent}% (${analyzeIds.length}/${abertoIds.length})\n`;
    logToSheet("INFO", "HealthCheck", `Cobertura: ${coveragePercent}% (${analyzeIds.length}/${abertoIds.length})`);
  }
  
  // 4. Verificar triggers ativos
  report += "\n⚙️ TRIGGERS ATIVOS:\n";
  logToSheet("INFO", "HealthCheck", "--- 4. TRIGGERS ---");
  const triggers = ScriptApp.getProjectTriggers();
  const queueTriggers = triggers.filter(t => 
    t.getHandlerFunction().startsWith('processQueue')
  );
  
  if (queueTriggers.length === 0) {
    report += "⚠️ Nenhum trigger ativo\n";
    logToSheet("WARN", "HealthCheck", "Nenhum trigger ativo");
  } else {
    queueTriggers.forEach(t => {
      report += `✅ ${t.getHandlerFunction()}\n`;
      logToSheet("INFO", "HealthCheck", `Trigger: ${t.getHandlerFunction()}`);
    });
  }
  
  // Verificar AutoSync trigger
  const syncTrigger = triggers.find(t => t.getHandlerFunction() === 'autoSyncPipelineExecution');
  const syncStatus = syncTrigger ? "✅ Ativo" : "❌ Inativo";
  
  report += `AutoSync: ${syncStatus}\n`;
  logToSheet(syncTrigger ? "INFO" : "WARN", "HealthCheck", `AutoSync: ${syncStatus}`);
  
  // 5. Verificar estado de execução e lock
  report += "\n🔄 ESTADO DE EXECUÇÃO:\n";
  logToSheet("INFO", "HealthCheck", "--- 5. ESTADO DE EXECUÇÃO ---");
  ['OPEN', 'WON', 'LOST'].forEach(mode => {
    const running = props.getProperty('IS_RUNNING_' + mode);
    const index = props.getProperty('CURRENT_INDEX_' + mode);
    const runId = props.getProperty('RUN_ID_' + mode);
    
    if (running === 'TRUE') {
      report += `🟢 ${mode}: ATIVO (linha ${index})\n`;
      logToSheet("INFO", "HealthCheck", `${mode}: ATIVO (linha ${index})`);
      if (runId) report += `   RunID: ${runId.substring(0, 19)}\n`;
    } else {
      report += `⚪ ${mode}: INATIVO\n`;
      logToSheet("INFO", "HealthCheck", `${mode}: INATIVO`);
    }
  });
  
  // Verificar lock do AutoSync
  const lockValue = PropertiesService.getScriptProperties().getProperty(AUTO_SYNC_LOCK_KEY);
  if (lockValue) {
    const lockTime = parseInt(lockValue);
    const age = Date.now() - lockTime;
    const ageMinutes = (age / 60000).toFixed(1);
    report += `⚠️ Lock ativo há ${ageMinutes} minutos\n`;
    logToSheet("WARN", "HealthCheck", `Lock ativo há ${ageMinutes} minutos`);
    
    if (age > AUTO_SYNC_LOCK_TIMEOUT) {
      issues.push(`Lock travado (${ageMinutes}min) - necessita limpeza`);
    }
  } else {
    report += "✅ Nenhum lock ativo\n";
    logToSheet("INFO", "HealthCheck", "Nenhum lock ativo");
  }
  
  // 6. Verificar API Key
  report += "\n🔑 CONFIGURAÇÃO:\n";
  logToSheet("INFO", "HealthCheck", "--- 6. CONFIGURAÇÃO ---");
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  report += apiKey ? "✅ API Key configurada\n" : "❌ API Key FALTANDO\n";
  logToSheet(apiKey ? "INFO" : "ERROR", "HealthCheck", `API Key: ${apiKey ? "✅ Configurada" : "❌ FALTANDO"}`);
  if (!apiKey) {
    issues.push("API Key não configurada");
  }
  
  // 7. Resumo final
  report += "\n📝 RESUMO:\n";
  logToSheet("INFO", "HealthCheck", "--- 7. RESUMO ---");
  if (issues.length === 0) {
    report += "✅ SISTEMA SAUDÁVEL - Todas as verificações passaram\n";
    if (!apiKey) {
      report += "⚠️ Configure a API Key em Properties\n";
    } else {
      report += "✅ Sistema pronto para operar\n";
    }
    logToSheet("INFO", "HealthCheck", "✅ SISTEMA SAUDÁVEL");
  } else {
    report += `❌ ${issues.length} PROBLEMA(S) DETECTADO(S):\n`;
    issues.forEach((issue, i) => {
      report += `   ${i + 1}. ${issue}\n`;
    });
    report += "\n⚠️ Sistema pode não operar corretamente!";
    logToSheet("ERROR", "HealthCheck", `❌ ${issues.length} problemas detectados`);
    issues.forEach(issue => {
      logToSheet("ERROR", "HealthCheck", `  • ${issue}`);
    });
  }
  
  logToSheet("INFO", "HealthCheck", "=== FIM DO HEALTH CHECK ===");
  flushLogs_();
  
  ui.alert("Health Check", report, ui.ButtonSet.OK);
}

function stopSpecificTrigger(mode) {
  logToSheet("INFO", "Governança", `stopSpecificTrigger(${mode}) chamado`);
  
  const triggersBefore = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processQueue' + mode).length;
  logToSheet("DEBUG", "Governança", `Triggers encontrados para processQueue${mode}: ${triggersBefore}`);
  
  clearTriggersByHandler_('processQueue' + mode);
  
  const props = PropertiesService.getScriptProperties();
  props.setProperty('IS_RUNNING_' + mode, 'FALSE');
  
  // Força flush das propriedades
  props.getProperties();
  Utilities.sleep(1000);
  
  // Confirma que foi parado
  const confirmed = props.getProperty('IS_RUNNING_' + mode);
  const triggersAfter = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'processQueue' + mode).length;
  
  logToSheet("INFO", "Governança", `Processo ${mode} interrompido. IS_RUNNING_${mode} = ${confirmed}, Triggers removidos: ${triggersBefore - triggersAfter}`);
}

// Funções individuais de parada por workflow
function stopPipeline() {
  logToSheet("INFO", "Menu", "stopPipeline() chamado - parando OPEN");
  stopSpecificTrigger('OPEN');
  safeAlert_("⏹️ Pipeline (OPEN) parado com sucesso.");
}

function stopWon() {
  logToSheet("INFO", "Menu", "stopWon() chamado - parando WON");
  stopSpecificTrigger('WON');
  safeAlert_("⏹️ Análise Ganhos (WON) parada com sucesso.");
}

function stopLost() {
  logToSheet("INFO", "Menu", "stopLost() chamado - parando LOST");
  stopSpecificTrigger('LOST');
  safeAlert_("⏹️ Análise Perdas (LOST) parada com sucesso.");
}

function stopAllProcessing() {
  try {
    logToSheet("INFO", "Menu", "stopAllProcessing() chamado - parando TODOS os workflows");
    
    const allowed = new Set(["processQueueOPEN", "processQueueWON", "processQueueLOST"]);
    const triggers = ScriptApp.getProjectTriggers();
    let count = 0;
    const removed = [];
    
    triggers.forEach(t => {
      const h = t.getHandlerFunction();
      if (allowed.has(h)) {
        ScriptApp.deleteTrigger(t);
        removed.push(h);
        count++;
      }
    });
    
    logToSheet("INFO", "Governança", `Triggers removidos: ${removed.join(", ")}`);
    clearRuntimeState_();
    
    logToSheet("WARN", "Governança", `Interrupção executada. ${count} triggers do motor removidos.`);
    safeAlert_("🛑 Todos os processos parados com sucesso:\\n\\n• Pipeline (OPEN)\\n• Ganhos (WON)\\n• Perdas (LOST)");
  } catch (e) {
    logToSheet("ERROR", "Governança", "Falha ao parar processos: " + e.message);
    safeAlert_("❌ Erro ao parar processos: " + e.message);
  }
}

// Funções individuais de reinicialização por workflow
function restartPipeline() {
  logToSheet("INFO", "Menu", "restartPipeline() chamado");
  stopSpecificTrigger('OPEN');
  Utilities.sleep(2000); // Aguarda 2 segundos para garantir limpeza completa
  startPipeline();
  // Alerta já mostrado por setupTriggerAndStart
}

function restartWon() {
  logToSheet("INFO", "Menu", "restartWon() chamado");
  stopSpecificTrigger('WON');
  Utilities.sleep(2000);
  startWon();
  // Alerta já mostrado por setupTriggerAndStart
}

function restartLost() {
  logToSheet("INFO", "Menu", "restartLost() chamado");
  stopSpecificTrigger('LOST');
  Utilities.sleep(2000);
  startLost();
  // Alerta já mostrado por setupTriggerAndStart
}

function restartAllProcessing() {
  try {
    logToSheet("INFO", "Menu", "restartAllProcessing() chamado - reiniciando TODOS os workflows");
    
    // Para todos os processos
    const allowed = new Set(["processQueueOPEN", "processQueueWON", "processQueueLOST"]);
    const triggers = ScriptApp.getProjectTriggers();
    let stoppedCount = 0;
    triggers.forEach(t => {
      const h = t.getHandlerFunction();
      if (allowed.has(h)) {
        ScriptApp.deleteTrigger(t);
        stoppedCount++;
      }
    });
    
    logToSheet("INFO", "Governança", `${stoppedCount} triggers parados antes de reiniciar`);
    clearRuntimeState_();
    Utilities.sleep(3000); // Aguarda 3 segundos para limpeza completa
    
    // Reinicia todos com delays maiores entre cada um
    logToSheet("INFO", "Governança", "Iniciando PIPELINE (OPEN)...");
    startPipeline();
    Utilities.sleep(2000);
    
    logToSheet("INFO", "Governança", "Iniciando GANHOS (WON)...");
    startWon();
    Utilities.sleep(2000);
    
    logToSheet("INFO", "Governança", "Iniciando PERDAS (LOST)...");
    startLost();
    
    logToSheet("INFO", "Governança", "Todos os 3 processos reiniciados: OPEN, WON, LOST");
    safeAlert_("🔄 Reinicialização completa!\n\n✅ Pipeline (OPEN)\n✅ Ganhos (WON)\n✅ Perdas (LOST)\n\nCada processo mostrará seu alerta de confirmação.");
  } catch (e) {
    logToSheet("ERROR", "Governança", "Falha ao reiniciar processos: " + e.message);
    safeAlert_("❌ Erro ao reiniciar processos: " + e.message);
  }
}

/**
 * 🔧 DIAGNÓSTICO E LIMPEZA DE FLAGS RESIDUAIS
 * Utilidade para diagnosticar e limpar flags que podem ter ficado travadas
 */
function diagnosticarFlags() {
  const props = PropertiesService.getScriptProperties();
  const forceStop = props.getProperty('FORCE_STOP_REQUESTED');
  const lastSync = props.getProperty('LAST_SYNC_TIMESTAMP');
  const now = Date.now();
  
  let diagnostico = '🔍 DIAGNÓSTICO DE FLAGS DO SISTEMA\n\n';
  
  // Check FORCE_STOP
  if (forceStop === 'TRUE') {
    const lastSyncNum = parseInt(lastSync) || 0;
    const timeSince = lastSyncNum > 0 ? ((now - lastSyncNum) / 1000).toFixed(0) : 'desconhecido';
    diagnostico += `⚠️ FORCE_STOP_REQUESTED: ATIVO\n`;
    diagnostico += `   Tempo desde última sync: ${timeSince}s\n`;
    diagnostico += `   Status: ${timeSince !== 'desconhecido' && parseInt(timeSince) > 120 ? '🔴 RESIDUAL (>2min)' : '🟡 Recente'}\n\n`;
  } else {
    diagnostico += `✅ FORCE_STOP_REQUESTED: Limpo\n\n`;
  }
  
  // Check Last Sync
  if (lastSync) {
    const lastSyncDate = new Date(parseInt(lastSync));
    diagnostico += `📅 LAST_SYNC_TIMESTAMP: ${lastSyncDate.toLocaleString('pt-BR')}\n\n`;
  } else {
    diagnostico += `📅 LAST_SYNC_TIMESTAMP: Não definido\n\n`;
  }
  
  // Triggers ativos
  const triggers = ScriptApp.getProjectTriggers();
  const syncTriggers = triggers.filter(t => t.getHandlerFunction() === 'autoSyncPipelineExecution');
  diagnostico += `🔄 Triggers Auto-Sync ativos: ${syncTriggers.length}\n\n`;
  
  diagnostico += '─────────────────────────────\n';
  diagnostico += 'Deseja limpar flags residuais?';
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('Diagnóstico do Sistema', diagnostico, ui.ButtonSet.YES_NO);
  
  if (response === ui.Button.YES) {
    limparFlagsResiduais();
  }
}

/**
 * 🧹 LIMPA FLAGS RESIDUAIS
 * Remove flags que podem estar impedindo a execução normal
 */
function limparFlagsResiduais() {
  const props = PropertiesService.getScriptProperties();
  
  props.deleteProperty('FORCE_STOP_REQUESTED');
  props.deleteProperty('LAST_SYNC_TIMESTAMP');
  
  logToSheet("INFO", "Manutenção", "🧹 Flags residuais limpas manualmente");
  flushLogs_();
  
  SpreadsheetApp.getUi().alert(
    '✅ Limpeza Concluída',
    'Todas as flags residuais foram removidas.\n\n' +
    'O sistema agora está pronto para executar normalmente.\n\n' +
    'Próxima execução do Auto-Sync processará OPEN + WON + LOST.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function clearTriggersByHandler_(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(triggers[i]);
      count++;
    }
  }
  return count;
}

function scheduleNextTick_(mode, delayMs) {
  const functionName = 'processQueue' + mode;
  clearTriggersByHandler_(functionName);
  ScriptApp.newTrigger(functionName).timeBased().after(delayMs || NEXT_TICK_MS).create();
}

function setupTriggerAndStart(mode) {
  try {
    // === LIMPAR LOG DE EXECUÇÃO (RESET MANUAL) ===
    // Quando executado pelo MENU, reinicia o log
    // Quando executado por TRIGGER, o log acumula normalmente
    limparLogExecucao_();
    
    logToSheet("DEBUG", "Setup", `setupTriggerAndStart(${mode}) iniciado`);
    
    // VALIDAÇÃO PRÉVIA: Verifica se aba de entrada existe e tem dados
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getModeConfig(mode);
    const inputSheet = ss.getSheetByName(config.input);
    
    if (!inputSheet) {
      const erro = `❌ Erro: Aba "${config.input}" não encontrada!\n\nPor favor, verifique se a aba existe e contém dados.`;
      safeAlert_(erro);
      logToSheet("ERROR", "Setup", `Aba ${config.input} não encontrada`);
      return;
    }
    
    const lastRow = inputSheet.getLastRow();
    if (lastRow <= 1) {
      const erro = `❌ Erro: Aba "${config.input}" está vazia!\n\nPor favor, importe os dados antes de iniciar a análise.`;
      safeAlert_(erro);
      logToSheet("ERROR", "Setup", `Aba ${config.input} está vazia (${lastRow} linhas)`);
      return;
    }
    
    logToSheet("INFO", "Setup", `Aba ${config.input} validada: ${lastRow - 1} registros encontrados`);
    
    const ui = SpreadsheetApp.getUi();
    const props = PropertiesService.getScriptProperties();
    
    const indexKey = 'CURRENT_INDEX_' + mode;
    const runningKey = 'IS_RUNNING_' + mode;
    const savedIndex = props.getProperty(indexKey) || '0';
    
    logToSheet("DEBUG", "Setup", `Estado atual: runningKey=${props.getProperty(runningKey)}, savedIndex=${savedIndex}`);
    
    if (props.getProperty(runningKey) === 'TRUE') {
      const choice = ui.alert(`⚠️ O Robô ${mode} já consta como ATIVO.`, "Deseja forçar o reinício do ZERO?", ui.ButtonSet.YES_NO);
      if (choice === ui.Button.YES) {
        props.setProperty(indexKey, '0');
        logToSheet("INFO", "Setup", `Usuário optou por reiniciar ${mode} do zero`);
      } else {
        logToSheet("INFO", "Setup", `Usuário cancelou reinício de ${mode}`);
        return;
      }
    } else {
      const response = ui.alert(`Iniciar ${mode}?`, `Início na linha ${savedIndex}.\n(Lote: ${BATCH_SIZE})\nModo: Sistema de Processamento Rápido\n\nDeseja continuar?`, ui.ButtonSet.YES_NO);
      if (response !== ui.Button.YES) {
        logToSheet("INFO", "Setup", `Usuário cancelou início de ${mode}`);
        return;
      }
      logToSheet("INFO", "Setup", `Usuário confirmou início de ${mode}`);
    }

    logToSheet("DEBUG", "Setup", `Parando triggers existentes para ${mode}`);
    // Limpa apenas os triggers, NÃO muda propriedades ainda
    clearTriggersByHandler_('processQueue' + mode);
    Utilities.sleep(2000); // Aguarda persistência da limpeza

    logToSheet("DEBUG", "Setup", `Configurando propriedades para ${mode}`);
    // Define todas as propriedades em sequência
    props.setProperty(runningKey, 'TRUE');
    const runId = new Date().toISOString();
    props.setProperty('RUN_ID_' + mode, runId);
    props.setProperty(indexKey, '2');
    
    // CRÍTICO: Força flush das propriedades (Google Apps Script)
    PropertiesService.getScriptProperties().getProperties();
    
    // Aguarda persistência garantida
    Utilities.sleep(5000);
    
    // Confirma que propriedade foi salva com múltiplas leituras
    let confirmRunning = props.getProperty(runningKey);
    logToSheet("DEBUG", "Setup", `runId=${runId}, IS_RUNNING_${mode} confirmado=${confirmRunning}`);
    
    // Verifica redundante após delay adicional
    Utilities.sleep(2000);
    confirmRunning = props.getProperty(runningKey);
    if (confirmRunning !== 'TRUE') {
      logToSheet("ERROR", "Setup", `FALHA DE PERSISTÊNCIA: IS_RUNNING_${mode} = ${confirmRunning} após salvar TRUE`);
      throw new Error(`Falha ao persistir propriedade IS_RUNNING_${mode}`);
    }
    logToSheet("INFO", "Setup", `✅ Propriedade IS_RUNNING_${mode} = TRUE persistida com sucesso`);

    logToSheet("DEBUG", "Setup", `Configurando aba de análise para ${mode}`);
    setupAnalysisSheet(mode, true);
    
    logToSheet("DEBUG", "Setup", `Config: input=${config.input}, output=${config.output}`);
    
    const resSheet = ss.getSheetByName(config.output);
    if (resSheet && resSheet.getLastRow() > 1) {
      logToSheet("DEBUG", "Setup", `Limpando dados antigos de ${config.output}`);
      resSheet.getRange(2, 1, resSheet.getLastRow() - 1, resSheet.getMaxColumns()).clearContent();
    }
    
    logToSheet("DEBUG", "Setup", `Construindo fila para ${mode}`);
    buildQueueSheet_(mode, runId);
    
    logToSheet("DEBUG", "Setup", `Construindo snapshot para ${mode}`);
    buildAggregationSnapshot_(mode, runId);
    
    // --- ATIVAR RASTREAMENTO AUTOMÁTICO ---
    logToSheet("DEBUG", "Setup", `Ativando rastreamento automático para ${mode}`);
    try {
      ensureSnapshotTrackingActive_(mode);
      logToSheet("INFO", "Setup", `Rastreamento de mudanças ativado para ${mode}`);
    } catch (trackErr) {
      logToSheet("WARN", "Setup", `Falha ao ativar rastreamento: ${trackErr.message}`);
    }
    
    logToSheet("INFO", "Sistema", `Robô ${mode} inicializado (Tick System). RunId: ${runId}`);
    
    // Agenda primeiro tick com delay de 20s para garantir que propriedades sejam salvas
    try {
      // Verifica final antes de criar trigger
      const finalCheck = props.getProperty(runningKey);
      if (finalCheck !== 'TRUE') {
        throw new Error(`IS_RUNNING_${mode} = ${finalCheck} antes de criar trigger! Esperado: TRUE`);
      }
      
      logToSheet("DEBUG", "Setup", `Agendando primeiro tick de processamento para ${mode}`);
      scheduleNextTick_(mode, 20000); // 20 segundos para garantir persistência completa
      logToSheet("INFO", "Setup", `✅ Trigger criado para ${mode}, iniciará em 20 segundos`);
    } catch (triggerErr) {
      logToSheet("ERROR", "Setup", `Falha ao agendar trigger: ${triggerErr.message}`);
      props.setProperty(runningKey, 'FALSE'); // Reverte se falhar
      throw triggerErr;
    }
    
    // Flush logs (protegido com try-catch)
    try {
      flushLogs_();
    } catch (flushErr) {
      logToSheet("WARN", "Setup", "Falha no flush de logs: " + flushErr.message);
    }
    
    // Notifica usuário que processo iniciou
    safeAlert_(`✅ ${mode} Iniciado!\n\n🤖 Análise começará em 20 segundos...\n📊 Confira o progresso na aba "${config.output}"\n⏱️ Processamento automático a cada ${NEXT_TICK_MS/1000}s\n\n💡 O processo roda em segundo plano.\n\n⏰ RunID: ${runId.substring(0, 19)}`);
    
  } catch (e) {
    logToSheet("FATAL", "Setup", `Erro crítico em setupTriggerAndStart(${mode}): ${e.message} | Stack: ${e.stack}`);
    flushLogs_();
    throw e;
  }
}

// Entry Points para os Triggers
function processQueueOPEN() { processQueueGeneric('OPEN'); }

function processQueueWON()  { processQueueGeneric('WON'); }

function processQueueLOST() { processQueueGeneric('LOST'); }

/**
 * Gestor de fila genérico com LockService e Tick System.
 */
function processQueueGeneric(mode) {
  try {
    const executionId = Utilities.getUuid().substring(0, 8);
    logToSheet("DEBUG", "ProcessQueue", `[${executionId}] processQueueGeneric(${mode}) chamado`);
    
    const props = PropertiesService.getScriptProperties();
    
    // Lê múltiplas vezes para garantir valor correto (Google Apps Script issue)
    let runningStatus = props.getProperty('IS_RUNNING_' + mode);
    Utilities.sleep(500);
    const runningStatusCheck = props.getProperty('IS_RUNNING_' + mode);
    
    logToSheet("DEBUG", "ProcessQueue", `[${executionId}] IS_RUNNING_${mode} = ${runningStatus} (check: ${runningStatusCheck})`);
    
    if (runningStatus !== runningStatusCheck) {
      logToSheet("WARN", "ProcessQueue", `[${executionId}] Leitura inconsistente de IS_RUNNING_${mode}: ${runningStatus} vs ${runningStatusCheck}`);
      runningStatus = runningStatusCheck; // Usa segunda leitura
    }
    
    if (runningStatus !== 'TRUE') {
      const runId = props.getProperty('RUN_ID_' + mode);
      const currentIndex = props.getProperty('CURRENT_INDEX_' + mode);
      logToSheet("ERROR", "ProcessQueue", `[${executionId}] FILA NÃO INICIALIZADA: IS_RUNNING_${mode}=${runningStatus}. Abortando processamento.`);
      flushLogs_();
      return false; // Retorna false ao invés de undefined
    }
    
    logToSheet("DEBUG", "ProcessQueue", `Tentando adquirir lock para ${mode}`);
    flushLogs_();

    const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logToSheet("WARN", "Fila", `Ignorando ${mode}: Bloqueio ativo (Concorrência).`);
    flushLogs_();
    scheduleNextTick_(mode, 1000 * 60); 
    return; 
  }

  try {
    logToSheet("DEBUG", "ProcessQueue", `Lock adquirido para ${mode}, iniciando processamento`);
    flushLogs_();
    
    const startTime = new Date().getTime();
    const indexKey = 'CURRENT_INDEX_' + mode; 
    let startIndex = parseInt(props.getProperty(indexKey) || '2');

    logToSheet("DEBUG", "Motor", `Iniciando Lote ${mode} -> Linha: ${startIndex}`);
    flushLogs_();
    
    const result = runEngineBatch(mode, startIndex, BATCH_SIZE, startTime);
    
    logToSheet("DEBUG", "ProcessQueue", `runEngineBatch retornou status: ${result.status}`);
    flushLogs_();

    if (result.status === 'COMPLETED') {
      stopSpecificTrigger(mode);
      cleanupOldQueueSheets_(mode);
      logToSheet("SUCESSO", "Fila", `Pipeline ${mode} finalizado em ${result.totalProcessed} registros.`);
      safeToast_(`✅ Processamento ${mode} concluído`, "Sales AI");
    } else if (result.status === 'ERROR') {
      logToSheet("ERRO", "Motor", `Erro ${mode}: ${result.message}`);
      stopSpecificTrigger(mode); 
    } else if (result.status === 'CONTINUE') {
      props.setProperty(indexKey, result.nextIndex.toString());
      logToSheet("DEBUG", "Motor", `Lote OK. Agendando próximo Tick para linha ${result.nextIndex}.`);
      scheduleNextTick_(mode, NEXT_TICK_MS);
    }
  } catch (e) {
    logToSheet("FATAL", "Fila", `Erro Crítico ${mode}: ${e.message}`);
    stopSpecificTrigger(mode);
  } finally {
    lock.releaseLock();
    flushLogs_(); // Garante que todos os logs sejam salvos
  }
  } catch (outerErr) {
    logToSheet("FATAL", "ProcessQueue", `Erro fatal não capturado: ${outerErr.message} | Stack: ${outerErr.stack}`);
    flushLogs_();
  }
}

function runEngineBatch(mode, startIndex, batchSize, startTime) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // CRÍTICO: Aplicar locale pt_BR GLOBALMENTE ANTES de ler QUALQUER dado
  // Isso garante que Date objects sejam criados corretamente desde o início
  const currentLocale = ss.getSpreadsheetLocale();
  if (currentLocale !== 'pt_BR' && currentLocale !== 'pt-BR') {
    console.log(`🔧 [${mode}] Alterando locale GLOBAL para pt_BR (atual: ${currentLocale})...`);
    ss.setSpreadsheetLocale('pt_BR');
    console.log(`✅ [${mode}] Locale alterado para: ${ss.getSpreadsheetLocale()}`);
    logToSheet("INFO", "Engine", `Locale alterado para pt_BR (era ${currentLocale})`);
    
    // Limpar cache de sheets após mudar locale se a função existir
    if (typeof invalidateSheetCache_ === 'function') {
      invalidateSheetCache_();
      console.log(`🧹 [${mode}] Cache de sheets limpo após mudança de locale`);
    }
    
    // CRÍTICO: Forçar recarga do spreadsheet após mudança de locale
    SpreadsheetApp.flush();
  }
  
  logToSheet("DEBUG", "Engine", `runEngineBatch(${mode}) iniciado - startIndex=${startIndex}, batchSize=${batchSize}`);
  
  const config = getModeConfig(mode);

  const queueSheetName = getQueueSheetName_(mode);
  logToSheet("DEBUG", "Engine", `queueSheetName=${queueSheetName || "NENHUMA"}`);
  
  if (queueSheetName) {
    logToSheet("DEBUG", "Engine", `Usando modo QUEUE para ${mode}`);
    return runEngineBatchFromQueue_(mode, startIndex, batchSize, startTime, queueSheetName);
  }
  
  logToSheet("DEBUG", "Engine", `Usando modo DIRETO para ${mode}, lendo ${config.input}`);
  const mainData = getSheetData(config.input);
  if (!mainData) {
    logToSheet("ERROR", "Engine", `Aba ${config.input} não encontrada!`);
    return { status: 'ERROR', message: `Aba ${config.input} não encontrada.` };
  }
  
  logToSheet("DEBUG", "Engine", `Dados carregados: ${mainData.values.length} linhas`);

  // Usa mapeamento preciso baseado nos Schemas
  const cols = getColumnMapping(mainData.headers);
  const aggregatedData = aggregateOpportunities(mainData.values, cols, mode);
  
  logToSheet("DEBUG", "Engine", `Oportunidades agregadas: ${aggregatedData.length}`);
  
  const totalItems = aggregatedData.length;
  if (startIndex >= totalItems) {
    logToSheet("INFO", "Engine", `Índice ${startIndex} >= totalItems ${totalItems}, finalizando`);
    return { status: 'COMPLETED', nextIndex: startIndex, totalProcessed: totalItems };
  }

  // MODO INCREMENTAL: Nunca apagar dados existentes
  // Sistema sempre processa incrementalmente, identificando e atualizando apenas registros novos/alterados

  // OTIMIZAÇÃO: Lê sheets 1x antes do loop e reutiliza (reduz 50% queries)
  const rawActivities = getSheetData(SHEETS.ATIVIDADES);
  const rawChanges = getSheetData(config.changes);
  const activitiesHeaders = rawActivities ? rawActivities.headers : [];
  const changesHeaders = rawChanges ? rawChanges.headers : [];
  
  const activitiesMap = indexDataByMultiKey_(rawActivities);
  const changesMap = indexDataByMultiKey_(rawChanges);

  const baseClients = getBaseClientsCache();
  const winRateMap = getWinRateByOwner_();
  const runId = getRunId_(mode);

  const outputRows = [];
  let currentIndex = startIndex;
  const hoje = new Date();
  
  while (currentIndex < totalItems && outputRows.length < batchSize) {
    if ((new Date().getTime() - startTime) > TIME_BUDGET_MS) break;

    const item = aggregatedData[currentIndex];
    currentIndex++; 

    const oppLookupKey = normText_(item.oppId || item.oppName);
    const relatedActivities = activitiesMap.get(oppLookupKey) || [];
    const relatedChanges = changesMap.get(oppLookupKey) || [];

    // Aplicar correção de data de fechamento para WON/LOST
    applyClosedDateCorrection_(item, mode, relatedChanges, changesHeaders);

    // Validar consistência temporal
    const dateIssues = validateDealDates_(item, mode, hoje);
    if (dateIssues.length > 0) {
      governanceIssues.push(...dateIssues);
      logToSheet("WARN", "DateValidation", 
        `Problemas temporais detectados: ${dateIssues.join(", ")}`,
        { oportunidade: item.oppName, aba: mode }
      );
    }

    // --- ANÁLISE DETERMINÍSTICA (HARD GATES) ---
    const isBaseClient = baseClients.has(item.accName.toLowerCase());
    const clientProfile = isBaseClient ? ENUMS.LABELS.BASE_CLIENT : ENUMS.LABELS.NEW_CLIENT;
    const fiscal = calculateFiscalQuarterForItem_(item, mode);
    const rulesApplied = [];
    
    // --- VALIDAÇÃO DE TERRITÓRIO ---
    const oppLocation = item.billingState || item.billingCity;
    const opportunityOwner = normText_(item.owner);
    const designatedSeller = getDesignatedSellerForLocation(oppLocation, item);
    
    // Deal Closers podem atuar em qualquer território
    const isDealCloser = ['GABRIELE OLIVEIRA', 'EMILIO GONCALVES'].includes(opportunityOwner);
    
    // Vendedores pré-definidos da equipe
    const predefinedSellers = [
      'GABRIEL LEICK', 'DENILSON GOES', 'CARLOS MOLL', 'LUCIANA FONSECA',
      'EMILIO GONCALVES', 'ALEXSANDRA JUNQUEIRA', 'ALEX ARAUJO',
      'GABRIELE OLIVEIRA', 'FABIO FERREIRA'  // Deal Closers e BDR incluídos
    ];
    
    const isCorrectTerritory = isDealCloser || (designatedSeller === opportunityOwner);
    const needsReassignment = !predefinedSellers.includes(opportunityOwner) && designatedSeller !== "INDEFINIDO";
    
    // OTIMIZAÇÃO: Usa headers cacheados em vez de acessar rawActivities.headers repetidamente
    const activityData = processActivityStatsSmart(relatedActivities, activitiesHeaders, hoje);
    
    // ========================================================================
    // LÓGICA ESPECÍFICA: ANÁLISE DE PIPELINE (OPEN)
    // ========================================================================
    // Pipeline requer análise de estagnação, próximas atividades e governança
    
    // Fallback: Se não tem atividade no log, tenta usar "Inactive Days" do Pipeline Aberto
    let idleDays = calculateIdleDays(activityData.lastDate, hoje);
    if (mode === 'OPEN' && item.inactiveDays > 0 && idleDays === "SEM REGISTRO") {
        idleDays = item.inactiveDays;
    }
    
    // VALIDAÇÃO: Verificar datas invertidas (created > closed)
    // IMPORTANTE: Não "consertar" no parseDate; só tentar correção quando a inconsistência é real.
    if (item.created && item.closed) {
      const createdDate = item.created instanceof Date ? item.created : parseDate(item.created);
      const closedDate = item.closed instanceof Date ? item.closed : parseDate(item.closed);
      
      if (createdDate && closedDate && closedDate < createdDate) {
        const fix = tryFixInvertedDates_(createdDate, closedDate);
        if (fix.fixed) {
          console.warn(`⚠️ ${item.oppName}: Datas invertidas detectadas; correção aplicada via inversão (ciclo=${fix.ciclo})`);
          logToSheet("WARN", "Validação", `Datas invertidas em ${item.oppName} - inversão DD/MM↔MM/DD aplicada`, { oportunidade: item.oppName, aba: mode });
          item.created = fix.created;
          item.closed = fix.closed;
          if (typeof fix.ciclo === 'number') item.ciclo = fix.ciclo;
        } else {
          console.warn(`⚠️ ${item.oppName}: Datas invertidas! Close (${closedDate.toDateString()}) < Created (${createdDate.toDateString()})`);
          logToSheet("WARN", "Validação", `Datas invertidas em ${item.oppName} - sem correção automática`, { oportunidade: item.oppName, aba: mode });
        }
      }
    }
    
    const govInfo = detectGovProcurementStage_((item.desc || "") + " " + (activityData.fullText || ""));
    const meddic = calculateMEDDICScore(item, activityData.fullText);
    // OTIMIZAÇÃO: Usa headers cacheados em vez de acessar rawChanges.headers repetidamente
    const auditSummary = summarizeChangesSmart(relatedChanges, changesHeaders);
    const closeDateChanges = countFieldChanges_(relatedChanges, changesHeaders, ["Close Date", "Fecha de cierre", "Data Fechamento"]);
    const ownerRateInfo = winRateMap.get(item.owner) || null;
    const stageNorm = normalizeStage_(item.stage);
    
    // Calcular métricas detalhadas de mudanças (para todas as análises)
    const detailedChanges = getDetailedChangesAnalysis(relatedChanges, changesHeaders);
    
    // Calcular valor reconhecido no quarter baseado no calendário de faturação
    // IMPORTANTE: Para OPEN, usa closeDate esperado do item; para WON/LOST usa data real
    const expectedCloseDate = item.closed || (fiscal && fiscal.close ? fiscal.close : null);
    const quarterRecognition = calculateQuarterRecognizedValue(item.billingCalendar, item.gross, expectedCloseDate);
    
    // Detectar Stage Drift (declaração adicionada para corrigir bug)
    // OTIMIZAÇÃO: Usa headers cacheados
    const driftInfo = detectStageDrift_(item, activityData, auditSummary, relatedChanges, changesHeaders);

    // Calcular velocity metrics para análise de momentum
    const velocityMetrics = calculateDealVelocity_(item, relatedChanges, activityData, changesHeaders);
    item._velocityMetrics = velocityMetrics;

    // --- REGRAS DE GOVERNANÇA V52 ---
    let overrideForecastCat = null;
    let overrideActionCode = null;
    let governanceIssues = [];
    let inconsistencyCheck = "OK";

    // ========================================================================
    // GOVERNANÇA E HARD GATES: ESPECÍFICO PARA PIPELINE (OPEN)
    // ========================================================================
    
    if (mode === 'OPEN') {
      const segmentNorm = normText_(item.segment);
      const isGovSegment = /GOV|PUBLIC|ESTATAL/.test(segmentNorm);
      const idleThreshold = isGovSegment ? 60 : 45;

      // ============================================================================
      // HARD GATES: Regras Determinísticas para Ações Padronizadas
      // ============================================================================
      const dealAgeDays = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : 0;
      const idleNum = (typeof idleDays === 'number') ? idleDays : 0;

      // HARD GATE 1: Desqualificação Precoce (>90 dias sem engajamento significativo)
      if (dealAgeDays > 90 && activityData.count < 3) {
        overrideActionCode = ENUMS.ACTION_CODE.ARCHIVE;
        rulesApplied.push("HARD GATE: Deal com >90 dias e <3 atividades. Sugerido arquivamento.");
        governanceIssues.push("DESQUALIFICAÇÃO PRECOCE");
      }
      // HARD GATE 2: Estagnação Profunda (>60 dias inativo)
      else if (idleNum > 60) {
        overrideActionCode = ENUMS.ACTION_CODE.REQUALIFY;
        rulesApplied.push("HARD GATE: Deal inativo há >60 dias. Requalificação obrigatória.");
        
        // Diagnóstico da Causa Raiz: Encontra o pilar MEDDIC mais fraco
        const meddicScores = {
          "Metrics": meddic.gaps.includes("Metrics") ? 0 : 1,
          "Buyer": meddic.gaps.includes("Buyer") ? 0 : 1,
          "Criteria": meddic.gaps.includes("Criteria") ? 0 : 1,
          "Process": meddic.gaps.includes("Process") ? 0 : 1,
          "Pain": meddic.gaps.includes("Pain") ? 0 : 1,
          "Champion": meddic.gaps.includes("Champion") ? 0 : 1
        };
        
        let lowestPillar = "Qualificação Geral";
        let lowestScore = 2;
        for (let pillar in meddicScores) {
          if (meddicScores[pillar] < lowestScore) {
            lowestScore = meddicScores[pillar];
            lowestPillar = pillar.toUpperCase();
          }
        }
        
        governanceIssues.push(`ESTAGNADO POR FALTA DE: ${lowestPillar}`);
      }
      // HARD GATE 3: Dados Críticos Ausentes (valor zerado >45 dias)
      else if (item.gross === 0 && dealAgeDays > 45) {
        overrideActionCode = ENUMS.ACTION_CODE.CRM_AUDIT;
        rulesApplied.push("HARD GATE: Deal com valor zerado por >45 dias. Auditoria de dados necessária.");
        governanceIssues.push(ENUMS.LABELS.INCOMPLETE);
      }

      // --- VALIDAÇÃO DE TERRITÓRIO (com exceção para RENOVAÇÕES) ---
      const isRenewal = /RENOV|RENEWAL|RETENÇÃO|RETENTION/i.test(item.oppName) || 
                        /RENOV|RENEWAL|RETENÇÃO/i.test(item.products || "");
      
      if (!isCorrectTerritory && designatedSeller !== "INDEFINIDO" && !isDealCloser && !isRenewal) {
        governanceIssues.push("OPORTUNIDADE FORA DO TERRITÓRIO");
        rulesApplied.push(`RISCO DE TERRITÓRIO: Owner é ${item.owner}, mas deveria ser ${designatedSeller}.`);
      }
      
      // Se for renovação, não aplica alerta de território
      if (isRenewal && !isCorrectTerritory) {
        rulesApplied.push(`RENOVAÇÃO: Owner ${item.owner} é responsável por renovações mesmo fora do território padrão.`);
      }
      
      if (needsReassignment) {
        governanceIssues.push("REQUER REMANEJAMENTO");
        rulesApplied.push(`VENDEDOR NÃO PADRÃO: Owner é ${item.owner}, sugestão: ${designatedSeller}`);
      }
      
      // --- 1. DETECÇÃO DE PROCESSOS GOVERNAMENTAIS ---
      // Processos públicos exigem Deal Desk obrigatório
      if (govInfo.isGov) {
        governanceIssues.push(ENUMS.LABELS.GOV_PROCESS);
        rulesApplied.push("GOVERNO DETECTADO");
        if (govInfo.stages.includes("EMPENHO") || govInfo.stages.includes("HOMOLOGACAO")) {
            overrideForecastCat = ENUMS.FORECAST_IA.COMMIT;
            rulesApplied.push("MARCO GOVERNO: COMMIT");
        }
      }

      // --- VELOCITY & MOMENTUM ANALYSIS ---
      const velocityAlert = [];
      if (velocityMetrics.prediction === "ESTAGNADO") {
        velocityAlert.push("DEAL ESTAGNADO");
        governanceIssues.push(ENUMS.LABELS.STAGNANT);
      }
      if (velocityMetrics.prediction === "DESACELERANDO" && velocityMetrics.riskScore > 70) {
        velocityAlert.push("DESACELERANDO (ALTO RISCO)");
      }
      if (velocityMetrics.valueVelocity < -15) {
        velocityAlert.push("VALOR CAINDO RÁPIDO");
      }
      if (velocityAlert.length > 0) {
        rulesApplied.push("VELOCITY: " + velocityAlert.join(", "));
      }

      // 2. CHECK DEAL DESK
      const isService = /service|professional|consulting/i.test(item.productFamily || "")
                        || /serviço|service|impl|treinamento|consultoria/i.test(item.products);
      const isHighValue = item.gross >= 250000;
      const isHighService = isService && item.gross >= 50000;
      
      if ((isHighValue || isHighService) && stageNorm !== "Fechamento") {
        governanceIssues.push(ENUMS.LABELS.DEAL_DESK);
        rulesApplied.push("DEAL DESK OBRIGATORIO");
        if (["Proposta", "Negociação"].includes(stageNorm)) {
            overrideActionCode = ENUMS.ACTION_CODE.DEAL_DESK;
        }
      }

      // --- 3. DETECÇÃO DE INCONSISTÊNCIAS (7 VALIDAÇÕES) ---
      // Sistema abrangente para identificar problemas de qualidade de dados
      const inconsistencies = [];
      
      // 3.1: Fase avançada sem atividade recente
      if (["Proposta", "Negociação", "Deal Desk"].includes(stageNorm)) {
          if (activityData.count === 0 || idleDays > 20) {
              inconsistencies.push("Fase avançada com inatividade superior a 20 dias");
              governanceIssues.push(ENUMS.LABELS.INCONSISTENT);
              rulesApplied.push("INCOERENCIA FASE x ATIVIDADE");
          }
      }
      
      // 3.2: Probabilidade incompatível com fase
      const expectedProb = STAGE_PROBABILITY[stageNorm];
      if (expectedProb !== undefined && Math.abs(item.probabilidad - expectedProb) > 30) {
          inconsistencies.push(`Divergência: Probabilidade registrada ${item.probabilidad}% vs esperada ${expectedProb}%`);
      }
      
      // 3.3: Data de fechamento no passado (oportunidades abertas não podem ter data vencida)
      if (item.closed && item.closed < hoje) {
          const diasPassados = Math.ceil((hoje - item.closed) / MS_PER_DAY);
          inconsistencies.push(`Data de fechamento vencida há ${diasPassados} dias`);
      }
      
      // 3.4: Valores financeiros inconsistentes
      if (item.gross === 0 && item.net > 0) {
          inconsistencies.push(`Valor bruto zerado mas líquido preenchido (R$ ${item.net.toFixed(2)})`);
      }
      
      // 3.5: Oportunidade estagnada em fase inicial
      // Usa a variável dealAgeDays já calculada na linha 1011
      if (dealAgeDays > 365 && item.probabilidad < 30) {
          inconsistencies.push(`Oportunidade há ${Math.floor(dealAgeDays/30)} meses sem evolução de fase`);
      }
      
      // 3.6: Múltiplas alterações de data prevista
      // Usa a variável closeDateChanges já calculada na linha 975
      if (closeDateChanges >= 4) {
          inconsistencies.push(`Data de fechamento alterada ${closeDateChanges} vezes`);
      }
      
      // 3.7: Informações obrigatórias ausentes
      if (item.gross > 50000 && (!item.products || item.products === "N/A")) {
          inconsistencies.push("Produtos não especificados em oportunidade de alto valor");
      }
      
      inconsistencyCheck = inconsistencies.length > 0 ? inconsistencies.join(" | ") : "OK";
      
      // --- 4. ANÁLISE DE ESTAGNAÇÃO INTELIGENTE (3 CRITÉRIOS) ---
      // Combina: inatividade + idade da oportunidade + mudanças de fase
      // CRITÉRIOS: 60d sem atividade + 90d sem mudança fase + 180d no funil
      
      const stageAgeDays = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : null;
      const noMoveDays = (typeof idleDays === 'number') ? idleDays : null;
      
      // Verifica se teve mudança de fase recente (último campo de alterações)
      const lastStageChange = relatedChanges
        .filter(c => {
          const field = String(c[2] || "").toLowerCase(); // coluna "Field / Event"
          return field.includes("stage") || field.includes("fase") || field.includes("etapa");
        })
        .map(c => parseDate(c[5])) // coluna "Edit Date"
        .filter(d => d instanceof Date)
        .sort((a, b) => b - a)[0]; // Mais recente
      
      const daysSinceStageChange = lastStageChange ? Math.ceil((hoje - lastStageChange) / MS_PER_DAY) : 999;
      
      // CRITÉRIOS DE ESTAGNAÇÃO (todos devem ser verdadeiros):
      // 1. Sem atividade nos últimos 60 dias OU 0 atividades totais
      // 2. Sem mudança de fase nos últimos 90 dias
      // 3. No funil há mais de 180 dias (6 meses)
      const semAtividadeRecente = (noMoveDays !== null && noMoveDays > 60) || activityData.count === 0;
      const semMudancaFaseRecente = daysSinceStageChange > 90;
      const funilAntigo = stageAgeDays !== null && stageAgeDays > 180;
      
      if (semAtividadeRecente && semMudancaFaseRecente && funilAntigo) {
        governanceIssues.push(ENUMS.LABELS.ALERTA_REVISAO_URGENTE);
        const idleText = noMoveDays !== null ? `${noMoveDays}d inativo` : "sem atividades";
        const faseText = daysSinceStageChange < 999 ? `${daysSinceStageChange}d sem mudança fase` : "nunca mudou fase";
        rulesApplied.push(`REVISÃO URGENTE: ${stageAgeDays}d funil, ${idleText}, ${faseText}`);
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.REQUALIFY;
      }

      const nextActDays = (item.nextActivityDate instanceof Date)
        ? Math.ceil((item.nextActivityDate.getTime() - hoje.getTime()) / MS_PER_DAY)
        : null;
      const hasUpcomingActivity = nextActDays !== null && nextActDays >= 0 && nextActDays <= 14;

      if (!hasUpcomingActivity && (activityData.count === 0 || (typeof idleDays === 'number' && idleDays > idleThreshold && !govInfo.isGov))) {
        governanceIssues.push(ENUMS.LABELS.STAGNANT);
        rulesApplied.push("ESTAGNACAO");
        overrideForecastCat = overrideForecastCat || ENUMS.FORECAST_IA.PIPELINE;
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.ENGAGEMENT;
      } else if (hasUpcomingActivity) {
        rulesApplied.push("PROXIMA ATIVIDADE AGENDADA");
      }
      
      // 5. CHECK NET ZERO
      if (item.net <= 0 && item.gross > 0) {
        governanceIssues.push(ENUMS.LABELS.NET_ZERO);
        rulesApplied.push("VALOR LÍQUIDO ZERADO");
      }

      // 6. BANT PRELIMINAR
      if (meddic.gaps.includes("Buyer") && meddic.gaps.includes("Pain")) {
          governanceIssues.push(ENUMS.LABELS.BANT_FAIL);
          rulesApplied.push("QUALIFICAÇÃO BANT AUSENTE");
      }

      if (closeDateChanges >= 3) {
        governanceIssues.push(ENUMS.LABELS.DEAL_STRETCH);
        rulesApplied.push("MÚLTIPLAS ALTERAÇÕES DE DATA DE FECHAMENTO");
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.VALIDATE_DATE;
      }

      // Reutiliza expectedProb já declarado anteriormente (linha 709)
      if (expectedProb !== undefined && (item.probabilidad - expectedProb) > 25) {
        governanceIssues.push(ENUMS.LABELS.PIPELINE_INFLATION);
        rulesApplied.push("INFLAÇÃO DE PROBABILIDADE");
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.CRM_AUDIT;
      }

      if (ownerRateInfo && ownerRateInfo.total >= 5 && ownerRateInfo.rate !== null && ownerRateInfo.rate < 0.2) {
        governanceIssues.push(ENUMS.LABELS.LOW_WIN_RATE);
        rulesApplied.push("VENDEDOR COM BAIXA TAXA DE CONVERSÃO");
      }
      
      if (driftInfo && driftInfo.driftLevel !== "OK") {
        governanceIssues.push(ENUMS.LABELS.STAGE_DRIFT);
        rulesApplied.push(`DERIVA FASE: ${driftInfo.driftReason}`);
        if (driftInfo.driftLevel === "CRITICAL") {
          overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.REQUALIFY;
        }
      }
    }

    // ========================================================================
    // GERAÇÃO DE PROMPTS E ANÁLISE DE IA
    // ========================================================================
    // OPEN: Forecast + Governança + Próximas Ações
    // WON/LOST: Análise Retrospectiva + Causas + Lições Aprendidas
    
    const coldGate = mode === 'OPEN' ? shouldBypassAI_(mode, governanceIssues, item, driftInfo) : { bypass: false };
    
    // Métricas detalhadas de atividades (apenas para WON/LOST)
    const activityBreakdown = (mode === 'WON' || mode === 'LOST')
      ? getDetailedActivityBreakdown(relatedActivities, activitiesHeaders, hoje)
      : null;
    
    // NOVAS VALIDAÇÕES: Personas, Next Step Consistency, Inactivity Gate
    const daysInFunnel = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : 0;
    const personas = mode === 'OPEN' ? extractPersonasFromActivities(activityData.fullText, item.desc) : null;
    const bant = mode === 'OPEN' ? calculateBANTScore_(item, activityData) : null;
    const nextStepCheck = mode === 'OPEN' ? validateNextStepConsistency(item.nextStep || item.stage, activityData.fullText, activityData.lastDate) : null;
    const inactivityGate = mode === 'OPEN' ? checkInactivityGate(idleDays, item.forecast_ia || item.probabilidad > 40 ? (item.probabilidad > 60 ? 'UPSIDE' : 'PIPELINE') : 'PIPELINE', activityData.lastDate, item.stage, daysInFunnel) : null;
    
    // Se inactivityGate detectar bloqueio crítico, adiciona às issues
    if (inactivityGate && inactivityGate.isBlocked) {
      governanceIssues.push("INATIVIDADE-GATE-CRÍTICO");
      rulesApplied.push(inactivityGate.alert);
      
      // Aplica sugestão de confiança do gate se disponível
      if (inactivityGate.suggestedConfidence !== null && inactivityGate.suggestedConfidence !== undefined) {
        // Será usado no override após a chamada de IA
      }
    }
    
    const prompt = (mode === 'OPEN')
      ? getOpenPrompt(item, clientProfile, fiscal, activityData, meddic, bant, personas, nextStepCheck, inactivityGate, auditSummary, idleDays, governanceIssues, inconsistencyCheck, govInfo)
      : getClosedPrompt(mode, item, clientProfile, fiscal, activityData, meddic, auditSummary, idleDays, normalizeLossReason_(item.reason), detailedChanges, activityBreakdown);
    
    let jsonResp = { labels: [], forecast_cat: "PIPELINE" };
    
    if (coldGate.bypass) {
      jsonResp = {
        forecast_cat: "PIPELINE",
        confianca: 15,
        motivo_confianca: "Gate crítico ativo - análise IA pulada",
        justificativa: coldGate.reason,
        acao_code: coldGate.forcedActionCode,
        acao_desc: "Resolução obrigatória por gate de governança",
        perguntas_auditoria: [
          "Por que este deal apresenta gate crítico?",
          "Qual evidência falta para justificar a fase atual?",
          "Quando será possível regularizar esta situação?"
        ],
        gaps_identificados: governanceIssues,
        risco_principal: coldGate.reason,
        labels: [ENUMS.LABELS.COLD_GATE]
      };
      appendEvent_({
        source: "ENGINE",
        sheetName: config.input,
        oppKey: item.oppKey,
        oppName: item.oppName,
        severity: "CRITICAL",
        notes: `COLD_GATE_BYPASS: ${coldGate.reason}`,
        runId: runId,
        mode: mode
      });
    } else {
      try {
        const rawResponse = callGeminiAPI(prompt);
        jsonResp = cleanAndParseJSON(rawResponse);
        
        if (jsonResp.error === "FAIL_PARSER" || jsonResp.error === "NO_JSON_FOUND" || jsonResp.error === "JSON_TRUNCATED") {
          logToSheet("WARN", "AI", `Tentativa 1 falhou para ${item.oppName} (${jsonResp.error}). Retry com maxOutputTokens aumentado...`);
          Utilities.sleep(1000);
          
          // MELHORIA: Para JSON truncado, aumenta tokens dramaticamente
          const maxTokens = (jsonResp.error === "JSON_TRUNCATED") ? 8192 : 4096;
          const retryResponse = callGeminiAPI(prompt, { maxOutputTokens: maxTokens, temperature: 0.05 });
          const retryParsed = cleanAndParseJSON(retryResponse);
          
          if (!retryParsed.error) {
            jsonResp = retryParsed;
            logToSheet("INFO", "AI", `✅ Retry bem-sucedido para ${item.oppName}`);
          } else {
            logToSheet("ERROR", "AI", `❌ Retry falhou para ${item.oppName}: ${retryParsed.error}`);
          }
        }
        
      } catch (e) {
        logToSheet("ERROR", "AI", `Falha na IA para ${item.oppName}: ${e.message}`);
        jsonResp = { justificativa: "Erro de conexão IA (Retry)", acao_code: ENUMS.ACTION_CODE.CRM_AUDIT };
      }
    }

    const finalLabels = normalizeList((jsonResp.labels || []).concat(governanceIssues), ENUMS.LABELS);
    const finalAction = overrideActionCode || jsonResp.acao_code || ENUMS.ACTION_CODE.CRM_AUDIT;

    // Label estratégica GTM:
    // - WON/LOST: Sempre aplicada (são fatos históricos relevantes independente do ano)
    // - OPEN: Apenas se ano fiscal >= ano atual (são previsões futuras)
    if (mode === 'WON' || mode === 'LOST') {
      finalLabels.push(ENUMS.LABELS.GTM_VIP);
    } else if (mode === 'OPEN') {
      const currentYear = new Date().getFullYear();
      if (fiscal.year >= currentYear) finalLabels.push(ENUMS.LABELS.GTM_VIP);
    }

    // ========================================================================
    // GOVERNANÇA DE FORECAST BASEADA EM CONFIANÇA
    // ========================================================================
    // Regras de negócio para categorização de forecast:
    // COMMIT (75-100%): Previsão Forte - altíssima probabilidade de fechamento
    // UPSIDE (50-74%): Pode Entrar, mas com Risco - bem qualificado com alguns gaps
    // PIPELINE (20-49%): Qualificado, mas Distante - estágios iniciais ou riscos significativos
    // OMITIDO (0-19%): Perda Provável - múltiplos problemas críticos
    
    let finalForecastCategory = overrideForecastCat; // Respeita override de hard gates primeiro
    
    if (!finalForecastCategory && mode === 'OPEN') {
      const confidenceScore = jsonResp.confianca || 0;
      
      if (confidenceScore >= 75) {
        finalForecastCategory = ENUMS.FORECAST_IA.COMMIT;
      } else if (confidenceScore >= 50) {
        finalForecastCategory = ENUMS.FORECAST_IA.UPSIDE;
      } else if (confidenceScore >= 20) {
        finalForecastCategory = ENUMS.FORECAST_IA.PIPELINE;
      } else {
        finalForecastCategory = ENUMS.FORECAST_IA.OMITTED;
      }
    }
    // ========================================================================

    // ========================================================================
    // CONSTRUÇÃO DE OUTPUT POR MODO DE ANÁLISE
    // ========================================================================
    // OPEN: 53 colunas incluindo MEDDIC, BANT, Forecast IA, Ciclo, Change Tracking, Anomalies, Velocity, Território, Estado/Cidade, Fonte, Calendário Faturação, Valor Reconhecido Q1/Q2/Q3/Q4
    // WON/LOST: 39 colunas incluindo Análise Retrospectiva, Causas, Lições
    
    const finalRow = (mode === 'OPEN')
      ? buildOpenOutputRow(runId, item, clientProfile, fiscal, activityData, meddic, jsonResp, finalLabels, finalForecastCategory, idleDays, inconsistencyCheck, finalAction, rulesApplied.join(" | "), detailedChanges, isCorrectTerritory, designatedSeller, quarterRecognition)
      : buildClosedOutputRow(runId, mode, item, clientProfile, fiscal, jsonResp, finalLabels, activityData, detailedChanges, activityBreakdown);
    outputRows.push(finalRow);
    
    Utilities.sleep(50); // Reduzido de 100ms para otimização 
  }

  if (outputRows.length > 0) {
    const resSheet = ss.getSheetByName(config.output);
    const writeRow = 2 + startIndex; 
    
    if (resSheet.getMaxRows() < writeRow + outputRows.length) {
        resSheet.insertRowsAfter(resSheet.getMaxRows(), outputRows.length + 20);
    }
    
    resSheet.getRange(writeRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
    
    // Aplica formatação condicional (cores) - protegido para não interromper processamento
    try {
      applyConditionalFormatting_(resSheet, mode, writeRow, outputRows.length);
    } catch (formatErr) {
      logToSheet("WARN", "Format", `Erro na formatação condicional: ${formatErr.message}`);
    }
    
    SpreadsheetApp.flush();
  }

  flushLogs_();
  
  // MELHORIA: Invalida cache para próximo lote ter dados frescos
  invalidateSheetCache_();
  
  if (currentIndex >= totalItems) {
    return { status: 'COMPLETED', nextIndex: currentIndex, totalProcessed: currentIndex };
  }
  return { status: 'CONTINUE', nextIndex: currentIndex, totalProcessed: currentIndex };
}

function runEngineBatchFromQueue_(mode, startIndex, batchSize, startTime, queueSheetName) {
  logToSheet("DEBUG", "QueueEngine", `runEngineBatchFromQueue_(${mode}) iniciado - queue=${queueSheetName}, startIndex=${startIndex}`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  const queueSheet = ss.getSheetByName(queueSheetName);
  
  if (!queueSheet) {
    logToSheet("ERROR", "QueueEngine", `Queue ${queueSheetName} não encontrada!`);
    return { status: 'ERROR', message: `Queue ${queueSheetName} não encontrada.` };
  }

  const lastRow = queueSheet.getLastRow();
  const startRow = Math.max(startIndex || 2, 2);
  
  logToSheet("DEBUG", "QueueEngine", `Queue tem ${lastRow} linhas, startRow=${startRow}`);
  
  if (lastRow < 2 || startRow > lastRow) {
    logToSheet("INFO", "QueueEngine", `Fila vazia ou completada (lastRow=${lastRow}, startRow=${startRow})`);
    return { status: 'COMPLETED', nextIndex: startRow, totalProcessed: 0 };
  }

  const slice = queueSheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
  const pending = [];
  for (let i = 0; i < slice.length && pending.length < batchSize; i++) {
    const status = String(slice[i][4] || "").toUpperCase();
    if (status !== "DONE") {
      pending.push({
        rowIndex: startRow + i,
        key: String(slice[i][0] || ""),
        oppId: String(slice[i][1] || ""),
        oppName: String(slice[i][2] || "")
      });
    }
  }

  logToSheet("DEBUG", "QueueEngine", `${pending.length} itens pendentes encontrados`);

  if (pending.length === 0) {
    logToSheet("INFO", "QueueEngine", `Nenhum item pendente, finalizando`);
    return { status: 'COMPLETED', nextIndex: lastRow + 1, totalProcessed: 0 };
  }

  const snapshotName = PropertiesService.getScriptProperties().getProperty(`AGG_SNAPSHOT_${mode}`);
  let snapshotData = snapshotName ? getSheetData(snapshotName) : null;
  
  // Validar se snapshot tem o formato correto (deve ter 24 colunas)
  if (snapshotData && snapshotData.headers && snapshotData.headers.length < 24) {
    logToSheet("WARN", "QueueEngine", `⚠️ Snapshot antigo detectado (${snapshotData.headers.length} colunas). Recriando agregação...`);
    snapshotData = null; // Força recriação
  }
  
  let aggMap = new Map();
  if (snapshotData) {
    logToSheet("DEBUG", "QueueEngine", `✅ Usando snapshot com ${snapshotData.headers.length} colunas`);
    snapshotData.values.forEach(row => {
      const item = {
        oppKey: row[0], oppId: row[1], oppName: row[2], accName: row[3], owner: row[4],
        gross: row[5], net: row[6], products: row[7], stage: row[8], probabilidad: row[9],
        closed: row[10] instanceof Date ? row[10] : parseDate(row[10]),
        desc: row[11],
        created: row[12] instanceof Date ? row[12] : parseDate(row[12]),
        inactiveDays: row[13], 
        nextActivityDate: row[14] instanceof Date ? row[14] : parseDate(row[14]),
        forecast_sf: row[15], fiscalQ: row[16], ciclo: row[17], reason: row[18],
        portfolio: row[19], segment: row[20], productFamily: row[21],
        billingState: row[22] || "", billingCity: row[23] || "", billingCalendar: row[24] || ""
      };
      if (item.oppKey) aggMap.set(item.oppKey, item);
    });
  } else {
    logToSheet("DEBUG", "QueueEngine", `📊 Recriando agregação do input ${config.input}`);
    const mainData = getSheetData(config.input);
    if (!mainData) return { status: 'ERROR', message: `Aba ${config.input} não encontrada.` };
    const cols = getColumnMapping(mainData.headers);
    const aggregatedData = aggregateOpportunities(mainData.values, cols, mode);
    aggregatedData.forEach(item => {
      if (item.oppKey) aggMap.set(item.oppKey, item);
    });
  }

  // OTIMIZAÇÃO: Lê sheets 1x antes do loop e reutiliza (reduz 50% queries)
  const rawActivities = getSheetData(SHEETS.ATIVIDADES);
  const rawChanges = getSheetData(config.changes);
  const activitiesHeaders = rawActivities ? rawActivities.headers : [];
  const changesHeaders = rawChanges ? rawChanges.headers : [];
  
  const activitiesMap = indexDataByMultiKey_(rawActivities);
  const changesMap = indexDataByMultiKey_(rawChanges);

  const baseClients = getBaseClientsCache();
  const winRateMap = getWinRateByOwner_();
  const runId = getRunId_(mode);

  const outputRows = [];
  const queueUpdates = [];
  let lastProcessedRow = startRow;
  const hoje = new Date();

  for (let i = 0; i < pending.length; i++) {
    if ((new Date().getTime() - startTime) > TIME_BUDGET_MS) break;

    const p = pending[i];
    const item = aggMap.get(p.key);
    if (!item) {
      logToSheet("WARN", "Fila", `Item não encontrado na agregação: ${p.oppName || p.key}`);
      queueUpdates.push({ row: p.rowIndex, status: "DONE" });
      lastProcessedRow = p.rowIndex + 1;
      continue;
    }

    const oppLookupKey = normText_(item.oppId || item.oppName);
    const relatedActivities = activitiesMap.get(oppLookupKey) || [];
    const relatedChanges = changesMap.get(oppLookupKey) || [];

    // Aplicar correção de data de fechamento para WON/LOST
    applyClosedDateCorrection_(item, mode, relatedChanges, changesHeaders);

    // Validar consistência temporal
    const dateIssues = validateDealDates_(item, mode, hoje);
    if (dateIssues.length > 0) {
      governanceIssues.push(...dateIssues);
      logToSheet("WARN", "DateValidation", 
        `Problemas temporais detectados: ${dateIssues.join(", ")}`,
        { oportunidade: item.oppName, aba: mode }
      );
    }

    const isBaseClient = baseClients.has(item.accName.toLowerCase());
    const clientProfile = isBaseClient ? ENUMS.LABELS.BASE_CLIENT : ENUMS.LABELS.NEW_CLIENT;
    const fiscal = calculateFiscalQuarterForItem_(item, mode);
    const rulesApplied = [];

    // --- VALIDAÇÃO DE TERRITÓRIO ---
    const oppLocation = item.billingState || item.billingCity;
    const opportunityOwner = normText_(item.owner);
    const designatedSeller = getDesignatedSellerForLocation(oppLocation, item);
    
    // Deal Closers podem atuar em qualquer território
    const isDealCloser = ['GABRIELE OLIVEIRA', 'EMILIO GONCALVES'].includes(opportunityOwner);
    
    // Vendedores pré-definidos da equipe
    const predefinedSellers = [
      'GABRIEL LEICK', 'DENILSON GOES', 'CARLOS MOLL', 'LUCIANA FONSECA',
      'EMILIO GONCALVES', 'ALEXSANDRA JUNQUEIRA', 'ALEX ARAUJO',
      'GABRIELE OLIVEIRA', 'FABIO FERREIRA'  // Deal Closers e BDR incluídos
    ];
    
    const isCorrectTerritory = isDealCloser || (designatedSeller === opportunityOwner);
    const needsReassignment = !predefinedSellers.includes(opportunityOwner) && designatedSeller !== "INDEFINIDO";

    // OTIMIZAÇÃO: Usa headers cacheados
    const activityData = processActivityStatsSmart(relatedActivities, activitiesHeaders, hoje);

    let idleDays = calculateIdleDays(activityData.lastDate, hoje);
    if (mode === 'OPEN' && item.inactiveDays > 0 && idleDays === "SEM REGISTRO") {
      idleDays = item.inactiveDays;
    }

    const govInfo = detectGovProcurementStage_((item.desc || "") + " " + (activityData.fullText || ""));
    const meddic = calculateMEDDICScore(item, activityData.fullText);
    // OTIMIZAÇÃO: Usa headers cacheados em vez de acessar rawChanges.headers repetidamente
    const auditSummary = summarizeChangesSmart(relatedChanges, changesHeaders);
    const closeDateChanges = countFieldChanges_(relatedChanges, changesHeaders, ["Close Date", "Fecha de cierre", "Data Fechamento"]);
    const ownerRateInfo = winRateMap.get(item.owner) || null;
    const stageNorm = normalizeStage_(item.stage);
    
    // Calcular métricas detalhadas de mudanças (para todas as análises)
    const detailedChanges = getDetailedChangesAnalysis(relatedChanges, changesHeaders);
    
    // Calcular valor reconhecido no quarter baseado no calendário de faturação
    // IMPORTANTE: Para OPEN, usa closeDate esperado do item; para WON/LOST usa data real
    const expectedCloseDate = item.closed || (fiscal && fiscal.close ? fiscal.close : null);
    const quarterRecognition = calculateQuarterRecognizedValue(item.billingCalendar, item.gross, expectedCloseDate);
    
    // Detectar Stage Drift (declaração adicionada para corrigir bug)
    // OTIMIZAÇÃO: Usa headers cacheados
    const driftInfo = detectStageDrift_(item, activityData, auditSummary, relatedChanges, changesHeaders);

    let overrideForecastCat = null;
    let overrideActionCode = null;
    let governanceIssues = [];
    let inconsistencyCheck = "OK";

    if (mode === 'OPEN') {
      const segmentNorm = normText_(item.segment);
      const isGovSegment = /GOV|PUBLIC|ESTATAL/.test(segmentNorm);
      const idleThreshold = isGovSegment ? 60 : 45;

      // ============================================================================
      // HARD GATES: Regras Determinísticas para Ações Padronizadas
      // ============================================================================
      const dealAgeDays = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : 0;
      const idleNum = (typeof idleDays === 'number') ? idleDays : 0;

      // HARD GATE 1: Desqualificação Precoce (>90 dias sem engajamento significativo)
      if (dealAgeDays > 90 && activityData.count < 3) {
        overrideActionCode = ENUMS.ACTION_CODE.ARCHIVE;
        rulesApplied.push("HARD GATE: Deal com >90 dias e <3 atividades. Sugerido arquivamento.");
        governanceIssues.push("DESQUALIFICAÇÃO PRECOCE");
      }
      // HARD GATE 2: Estagnação Profunda (>60 dias inativo)
      else if (idleNum > 60) {
        overrideActionCode = ENUMS.ACTION_CODE.REQUALIFY;
        rulesApplied.push("HARD GATE: Deal inativo há >60 dias. Requalificação obrigatória.");
        
        // Diagnóstico da Causa Raiz: Encontra o pilar MEDDIC mais fraco
        const meddicScores = {
          "Metrics": meddic.gaps.includes("Metrics") ? 0 : 1,
          "Buyer": meddic.gaps.includes("Buyer") ? 0 : 1,
          "Criteria": meddic.gaps.includes("Criteria") ? 0 : 1,
          "Process": meddic.gaps.includes("Process") ? 0 : 1,
          "Pain": meddic.gaps.includes("Pain") ? 0 : 1,
          "Champion": meddic.gaps.includes("Champion") ? 0 : 1
        };
        
        let lowestPillar = "Qualificação Geral";
        let lowestScore = 2;
        for (let pillar in meddicScores) {
          if (meddicScores[pillar] < lowestScore) {
            lowestScore = meddicScores[pillar];
            lowestPillar = pillar.toUpperCase();
          }
        }
        
        governanceIssues.push(`ESTAGNADO POR FALTA DE: ${lowestPillar}`);
      }
      // HARD GATE 3: Dados Críticos Ausentes (valor zerado >45 dias)
      else if (item.gross === 0 && dealAgeDays > 45) {
        overrideActionCode = ENUMS.ACTION_CODE.CRM_AUDIT;
        rulesApplied.push("HARD GATE: Deal com valor zerado por >45 dias. Auditoria de dados necessária.");
        governanceIssues.push(ENUMS.LABELS.INCOMPLETE);
      }

      // --- VALIDAÇÃO DE TERRITÓRIO (com exceção para RENOVAÇÕES) ---
      const isRenewal = /RENOV|RENEWAL|RETENÇÃO|RETENTION/i.test(item.oppName) || 
                        /RENOV|RENEWAL|RETENÇÃO/i.test(item.products || "");
      
      if (!isCorrectTerritory && designatedSeller !== "INDEFINIDO" && !isDealCloser && !isRenewal) {
        governanceIssues.push("OPORTUNIDADE FORA DO TERRITÓRIO");
        rulesApplied.push(`RISCO DE TERRITÓRIO: Owner é ${item.owner}, mas deveria ser ${designatedSeller}.`);
      }
      
      // Se for renovação, não aplica alerta de território
      if (isRenewal && !isCorrectTerritory) {
        rulesApplied.push(`RENOVAÇÃO: Owner ${item.owner} é responsável por renovações mesmo fora do território padrão.`);
      }
      
      if (needsReassignment) {
        governanceIssues.push("REQUER REMANEJAMENTO");
        rulesApplied.push(`VENDEDOR NÃO PADRÃO: Owner é ${item.owner}, sugestão: ${designatedSeller}`);
      }

      if (govInfo.isGov) {
        governanceIssues.push(ENUMS.LABELS.GOV_PROCESS);
        rulesApplied.push("GOVERNO DETECTADO");
        if (govInfo.stages.includes("EMPENHO") || govInfo.stages.includes("HOMOLOGACAO")) {
          overrideForecastCat = ENUMS.FORECAST_IA.COMMIT;
          rulesApplied.push("MARCO GOVERNO: COMMIT");
        }
      }

      const isService = /service|professional|consulting/i.test(item.productFamily || "")
                        || /serviço|service|impl|treinamento|consultoria/i.test(item.products);
      const isHighValue = item.gross >= 250000;
      const isHighService = isService && item.gross >= 50000;

      if ((isHighValue || isHighService) && stageNorm !== "Fechamento") {
        governanceIssues.push(ENUMS.LABELS.DEAL_DESK);
        rulesApplied.push("DEAL DESK OBRIGATORIO");
        if (["Proposta", "Negociação"].includes(stageNorm)) {
          overrideActionCode = ENUMS.ACTION_CODE.DEAL_DESK;
        }
      }

      // 3. CHECK INCOERÊNCIAS AMPLIADO (múltiplos cenários)
      const inconsistencies = [];
      
      // 3.1: Fase avançada sem atividade recente
      if (["Proposta", "Negociação", "Deal Desk"].includes(stageNorm)) {
          if (activityData.count === 0 || idleDays > 20) {
              inconsistencies.push("Fase avançada com inatividade superior a 20 dias");
              governanceIssues.push(ENUMS.LABELS.INCONSISTENT);
              rulesApplied.push("INCOERENCIA FASE x ATIVIDADE");
          }
      }
      
      // 3.2: Probabilidade incompatível com fase
      const expectedProb = STAGE_PROBABILITY[stageNorm];
      if (expectedProb !== undefined && Math.abs(item.probabilidad - expectedProb) > 30) {
          inconsistencies.push(`Divergência: Probabilidade registrada ${item.probabilidad}% vs esperada ${expectedProb}%`);
      }
      
      // 3.3: Data de fechamento no passado (oportunidades abertas não podem ter data vencida)
      if (item.closed && item.closed < hoje) {
          const diasPassados = Math.ceil((hoje - item.closed) / MS_PER_DAY);
          inconsistencies.push(`Data de fechamento vencida há ${diasPassados} dias`);
      }
      
      // 3.4: Valores financeiros inconsistentes
      if (item.gross === 0 && item.net > 0) {
          inconsistencies.push(`Valor bruto zerado mas líquido preenchido (R$ ${item.net.toFixed(2)})`);
      }
      
      // 3.5: Oportunidade estagnada em fase inicial
      // Usa a variável dealAgeDays já calculada na linha 1587
      if (dealAgeDays > 365 && item.probabilidad < 30) {
          inconsistencies.push(`Oportunidade há ${Math.floor(dealAgeDays/30)} meses sem evolução de fase`);
      }
      
      // 3.6: Múltiplas alterações de data prevista
      if (closeDateChanges >= 4) {
          inconsistencies.push(`Data de fechamento alterada ${closeDateChanges} vezes`);
      }
      
      // 3.7: Informações obrigatórias ausentes
      if (item.gross > 50000 && (!item.products || item.products === "N/A")) {
          inconsistencies.push("Produtos não especificados em oportunidade de alto valor");
      }
      
      inconsistencyCheck = inconsistencies.length > 0 ? inconsistencies.join(" | ") : "OK";

      const stageAgeDays = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : null;
      // ============================================================================
      // P2.6: VELOCITY & MOMENTUM ANALYSIS (Time-Series ML)
      // ============================================================================
      const velocityMetrics = calculateDealVelocity_(item, relatedChanges, activityData, changesHeaders);
      
      // Atribui as métricas ao item para uso no output
      item._velocityMetrics = velocityMetrics;
      
      const velocityAlert = [];
      if (velocityMetrics.prediction === "ESTAGNADO") {
        velocityAlert.push("DEAL ESTAGNADO");
        governanceIssues.push(ENUMS.LABELS.STAGNANT);
      }
      if (velocityMetrics.prediction === "DESACELERANDO" && velocityMetrics.riskScore > 70) {
        velocityAlert.push("DESACELERANDO (ALTO RISCO)");
      }
      if (velocityMetrics.valueVelocity < -15) {
        velocityAlert.push("VALOR CAINDO RÁPIDO");
      }
      if (velocityAlert.length > 0) {
        rulesApplied.push("VELOCITY: " + velocityAlert.join(", "));
      }
      logToSheet("DEBUG", "Velocity", `${item.oppName}: ${velocityMetrics.prediction} | Risk: ${velocityMetrics.riskScore}%`);

      // CHECK ESTAGNAÇÃO INTELIGENTE (considera atividades + mudanças de fase)
      const noMoveDays = (typeof idleDays === 'number') ? idleDays : null;
      
      // Verifica se teve mudança de fase recente
      const lastStageChange = relatedChanges
        .filter(c => {
          const field = String(c[2] || "").toLowerCase();
          return field.includes("stage") || field.includes("fase") || field.includes("etapa");
        })
        .map(c => parseDate(c[5]))
        .filter(d => d instanceof Date)
        .sort((a, b) => b - a)[0];
      
      const daysSinceStageChange = lastStageChange ? Math.ceil((hoje - lastStageChange) / MS_PER_DAY) : 999;
      
      // CRITÉRIOS DE ESTAGNAÇÃO: sem atividade recente + sem mudança de fase + funil antigo
      const semAtividadeRecente = (noMoveDays !== null && noMoveDays > 60) || activityData.count === 0;
      const semMudancaFaseRecente = daysSinceStageChange > 90;
      const funilAntigo = stageAgeDays !== null && stageAgeDays > 180;
      
      if (semAtividadeRecente && semMudancaFaseRecente && funilAntigo) {
        governanceIssues.push(ENUMS.LABELS.ALERTA_REVISAO_URGENTE);
        const idleText = noMoveDays !== null ? `${noMoveDays}d inativo` : "sem atividades";
        const faseText = daysSinceStageChange < 999 ? `${daysSinceStageChange}d sem mudança fase` : "nunca mudou fase";
        rulesApplied.push(`REVISÃO URGENTE: ${stageAgeDays}d funil, ${idleText}, ${faseText}`);
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.REQUALIFY;
      }

      const nextActDays = (item.nextActivityDate instanceof Date)
        ? Math.ceil((item.nextActivityDate.getTime() - hoje.getTime()) / MS_PER_DAY)
        : null;
      const hasUpcomingActivity = nextActDays !== null && nextActDays >= 0 && nextActDays <= 14;

      if (!hasUpcomingActivity && (activityData.count === 0 || (typeof idleDays === 'number' && idleDays > idleThreshold && !govInfo.isGov))) {
        governanceIssues.push(ENUMS.LABELS.STAGNANT);
        rulesApplied.push("OPORTUNIDADE ESTAGNADA");
        overrideForecastCat = overrideForecastCat || ENUMS.FORECAST_IA.PIPELINE;
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.ENGAGEMENT;
      } else if (hasUpcomingActivity) {
        rulesApplied.push("PRÓXIMA ATIVIDADE AGENDADA");
      }

      if (item.net <= 0 && item.gross > 0) {
        governanceIssues.push(ENUMS.LABELS.NET_ZERO);
        rulesApplied.push("VALOR LÍQUIDO ZERADO");
      }

      if (meddic.gaps.includes("Buyer") && meddic.gaps.includes("Pain")) {
        governanceIssues.push(ENUMS.LABELS.BANT_FAIL);
        rulesApplied.push("QUALIFICAÇÃO BANT AUSENTE");
      }

      if (closeDateChanges >= 3) {
        governanceIssues.push(ENUMS.LABELS.DEAL_STRETCH);
        rulesApplied.push("MÚLTIPLAS ALTERAÇÕES DE DATA DE FECHAMENTO");
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.VALIDATE_DATE;
      }

      // Reutiliza expectedProb já declarado anteriormente (linha 1122)
      if (expectedProb !== undefined && (item.probabilidad - expectedProb) > 25) {
        governanceIssues.push(ENUMS.LABELS.PIPELINE_INFLATION);
        rulesApplied.push("INFLAÇÃO DE PROBABILIDADE");
        overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.CRM_AUDIT;
      }

      if (ownerRateInfo && ownerRateInfo.total >= 5 && ownerRateInfo.rate !== null && ownerRateInfo.rate < 0.2) {
        governanceIssues.push(ENUMS.LABELS.LOW_WIN_RATE);
        rulesApplied.push("VENDEDOR COM BAIXA TAXA DE CONVERSÃO");
      }
      
      if (driftInfo && driftInfo.driftLevel !== "OK") {
        governanceIssues.push(ENUMS.LABELS.STAGE_DRIFT);
        rulesApplied.push(`DERIVA FASE: ${driftInfo.driftReason}`);
        if (driftInfo.driftLevel === "CRITICAL") {
          overrideActionCode = overrideActionCode || ENUMS.ACTION_CODE.REQUALIFY;
        }
      }
    }

    // ========================================================================
    // GERAÇÃO DE PROMPTS E ANÁLISE DE IA
    // ========================================================================
    // OPEN: Forecast + Governança + Próximas Ações
    // WON/LOST: Análise Retrospectiva + Causas + Lições Aprendidas
    
    const coldGate = mode === 'OPEN' ? shouldBypassAI_(mode, governanceIssues, item, driftInfo) : { bypass: false };
    
    // Métricas detalhadas de atividades (apenas para WON/LOST)
    const activityBreakdown = (mode === 'WON' || mode === 'LOST')
      ? getDetailedActivityBreakdown(relatedActivities, activitiesHeaders, hoje)
      : null;

    // NOVAS VALIDAÇÕES: Personas, Next Step Consistency, Inactivity Gate
    const daysInFunnel = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : 0;
    const personas = mode === 'OPEN' ? extractPersonasFromActivities(activityData.fullText, item.desc) : null;
    const bant = mode === 'OPEN' ? calculateBANTScore_(item, activityData) : null;
    const nextStepCheck = mode === 'OPEN' ? validateNextStepConsistency(item.nextStep || item.stage, activityData.fullText, activityData.lastDate) : null;
    const inactivityGate = mode === 'OPEN' ? checkInactivityGate(idleDays, item.forecast_ia || item.probabilidad > 40 ? (item.probabilidad > 60 ? 'UPSIDE' : 'PIPELINE') : 'PIPELINE', activityData.lastDate, item.stage, daysInFunnel) : null;
    
    // Se inactivityGate detectar bloqueio crítico, adiciona às issues
    if (inactivityGate && inactivityGate.isBlocked) {
      governanceIssues.push("INATIVIDADE-GATE-CRÍTICO");
      rulesApplied.push(inactivityGate.alert);
    }

    const prompt = (mode === 'OPEN')
      ? getOpenPrompt(item, clientProfile, fiscal, activityData, meddic, bant, personas, nextStepCheck, inactivityGate, auditSummary, idleDays, governanceIssues, inconsistencyCheck, govInfo)
      : getClosedPrompt(mode, item, clientProfile, fiscal, activityData, meddic, auditSummary, idleDays, normalizeLossReason_(item.reason), detailedChanges, activityBreakdown);

    let jsonResp = { labels: [], forecast_cat: "PIPELINE" };
    try {
      const rawResponse = callGeminiAPI(prompt);
      jsonResp = cleanAndParseJSON(rawResponse);
    } catch (e) {
      logToSheet("ERROR", "AI", `Falha na IA para ${item.oppName}: ${e.message}`);
      jsonResp = { justificativa: "Erro de conexão IA (Retry)", acao_code: ENUMS.ACTION_CODE.CRM_AUDIT };
    }

    const finalLabels = normalizeList((jsonResp.labels || []).concat(governanceIssues), ENUMS.LABELS);
    const finalAction = overrideActionCode || jsonResp.acao_code || ENUMS.ACTION_CODE.CRM_AUDIT;

    // Label estratégica GTM:
    // - WON/LOST: Sempre aplicada (são fatos históricos relevantes independente do ano)
    // - OPEN: Apenas se ano fiscal >= ano atual (são previsões futuras)
    if (mode === 'WON' || mode === 'LOST') {
      finalLabels.push(ENUMS.LABELS.GTM_VIP);
    } else if (mode === 'OPEN') {
      const currentYear = new Date().getFullYear();
      if (fiscal.year >= currentYear) finalLabels.push(ENUMS.LABELS.GTM_VIP);
    }

    // ========================================================================
    // GOVERNANÇA DE FORECAST BASEADA EM CONFIANÇA
    // ========================================================================
    // Regras de negócio para categorização de forecast:
    // COMMIT (75-100%): Previsão Forte - altíssima probabilidade de fechamento
    // UPSIDE (50-74%): Pode Entrar, mas com Risco - bem qualificado com alguns gaps
    // PIPELINE (20-49%): Qualificado, mas Distante - estágios iniciais ou riscos significativos
    // OMITIDO (0-19%): Perda Provável - múltiplos problemas críticos
    
    let finalForecastCategory = overrideForecastCat; // Respeita override de hard gates primeiro
    
    if (!finalForecastCategory && mode === 'OPEN') {
      const confidenceScore = jsonResp.confianca || 0;
      
      if (confidenceScore >= 75) {
        finalForecastCategory = ENUMS.FORECAST_IA.COMMIT;
      } else if (confidenceScore >= 50) {
        finalForecastCategory = ENUMS.FORECAST_IA.UPSIDE;
      } else if (confidenceScore >= 20) {
        finalForecastCategory = ENUMS.FORECAST_IA.PIPELINE;
      } else {
        finalForecastCategory = ENUMS.FORECAST_IA.OMITTED;
      }
    }
    // ========================================================================

    // ========================================================================
    // CONSTRUÇÃO DE OUTPUT POR MODO DE ANÁLISE
    // ========================================================================
    // OPEN: 53 colunas incluindo MEDDIC, BANT, Forecast IA, Ciclo, Change Tracking, Anomalies, Velocity, Território, Estado/Cidade, Fonte, Calendário Faturação, Valores Q1-Q4
    // WON/LOST: 39 colunas incluindo Análise Retrospectiva, Causas, Lições
    
    const finalRow = (mode === 'OPEN')
      ? buildOpenOutputRow(runId, item, clientProfile, fiscal, activityData, meddic, jsonResp, finalLabels, finalForecastCategory, idleDays, inconsistencyCheck, finalAction, rulesApplied.join(" | "), detailedChanges, isCorrectTerritory, designatedSeller, quarterRecognition)
      : buildClosedOutputRow(runId, mode, item, clientProfile, fiscal, jsonResp, finalLabels, activityData, detailedChanges, activityBreakdown);
    outputRows.push(finalRow);

    queueUpdates.push({ row: p.rowIndex, status: "DONE" });
    lastProcessedRow = p.rowIndex + 1;

    Utilities.sleep(50); // Otimizado: reduzido de 100ms para melhor performance
  }

  if (outputRows.length > 0) {
    const resSheet = ss.getSheetByName(config.output);
    const writeRow = resSheet.getLastRow() + 1;
    if (resSheet.getMaxRows() < writeRow + outputRows.length) {
      resSheet.insertRowsAfter(resSheet.getMaxRows(), outputRows.length + 20);
    }
    resSheet.getRange(writeRow, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
    
    // Aplica formatação condicional (cores) - protegido para não interromper processamento
    try {
      applyConditionalFormatting_(resSheet, mode, writeRow, outputRows.length);
    } catch (formatErr) {
      logToSheet("WARN", "Format", `Erro na formatação condicional: ${formatErr.message}`);
    }
    
    SpreadsheetApp.flush();
  }

  if (queueUpdates.length > 0) {
    queueUpdates.forEach(u => queueSheet.getRange(u.row, 5).setValue(u.status));
  }

  flushLogs_();

  const hasMore = lastProcessedRow <= lastRow;
  return hasMore
    ? { status: 'CONTINUE', nextIndex: lastProcessedRow, totalProcessed: outputRows.length }
    : { status: 'COMPLETED', nextIndex: lastProcessedRow, totalProcessed: outputRows.length };
}

/**
 * Aplica formatação condicional (cores) nas colunas de resultado
 * @param {Sheet} sheet - Aba onde aplicar formatação
 * @param {string} mode - OPEN, WON ou LOST
 * @param {number} startRow - Linha inicial dos dados (geralmente 2)
 * @param {number} numRows - Número de linhas a formatar
 */
function applyConditionalFormatting_(sheet, mode, startRow, numRows) {
  if (numRows <= 0) return;
  
  try {
    logToSheet("DEBUG", "Format", `Aplicando formatação ${mode}: linha ${startRow}, ${numRows} linhas`);
    
    if (mode === 'OPEN') {
      // FORMATAÇÃO DIRETA POR VALORES (mais seguro que regras condicionais)
      
      // Coluna 19: Forecast IA
      const forecastRange = sheet.getRange(startRow, 19, numRows, 1);
      const forecastValues = forecastRange.getValues();
      const forecastBgs = [];
      const forecastFonts = [];
      
      forecastValues.forEach(row => {
        const val = String(row[0]).toUpperCase();
        if (val.includes('COMMIT')) {
          forecastBgs.push(['#d4edda']);
          forecastFonts.push(['#155724']);
        } else if (val.includes('UPSIDE')) {
          forecastBgs.push(['#fff3cd']);
          forecastFonts.push(['#856404']);
        } else if (val.includes('POTENCIAL')) {
          forecastBgs.push(['#ffe5b4']);
          forecastFonts.push(['#8B4513']);
        } else {
          forecastBgs.push(['#f8f9fa']);
          forecastFonts.push(['#495057']);
        }
      });
      
      forecastRange.setBackgrounds(forecastBgs);
      forecastRange.setFontColors(forecastFonts);
      forecastRange.setFontWeight('bold');
      
      // Coluna 20: Confiança %
      const confRange = sheet.getRange(startRow, 20, numRows, 1);
      const confValues = confRange.getValues();
      const confBgs = [];
      const confFonts = [];
      
      confValues.forEach(row => {
        const val = Number(row[0]) || 0;
        if (val >= 70) {
          confBgs.push(['#d4edda']);
          confFonts.push(['#155724']);
        } else if (val >= 40) {
          confBgs.push(['#fff3cd']);
          confFonts.push(['#856404']);
        } else {
          confBgs.push(['#f8d7da']);
          confFonts.push(['#721c24']);
        }
      });
      
      confRange.setBackgrounds(confBgs);
      confRange.setFontColors(confFonts);
      confRange.setFontWeight('bold');
      
      // Coluna 22: MEDDIC Score
      const meddicRange = sheet.getRange(startRow, 22, numRows, 1);
      const meddicValues = meddicRange.getValues();
      const meddicBgs = [];
      const meddicFonts = [];
      
      meddicValues.forEach(row => {
        const val = Number(row[0]) || 0;
        if (val >= 64) {
          meddicBgs.push(['#d4edda']);
          meddicFonts.push(['#155724']);
        } else if (val >= 48) {
          meddicBgs.push(['#fff3cd']);
          meddicFonts.push(['#856404']);
        } else {
          meddicBgs.push(['#f8d7da']);
          meddicFonts.push(['#721c24']);
        }
      });
      
      meddicRange.setBackgrounds(meddicBgs);
      meddicRange.setFontColors(meddicFonts);
      meddicRange.setFontWeight('bold');
      
      // Coluna 25: BANT Score
      const bantRange = sheet.getRange(startRow, 25, numRows, 1);
      const bantValues = bantRange.getValues();
      const bantBgs = [];
      const bantFonts = [];
      
      bantValues.forEach(row => {
        const val = Number(row[0]) || 0;
        if (val >= 75) {
          bantBgs.push(['#d4edda']);
          bantFonts.push(['#155724']);
        } else if (val >= 50) {
          bantBgs.push(['#fff3cd']);
          bantFonts.push(['#856404']);
        } else {
          bantBgs.push(['#f8d7da']);
          bantFonts.push(['#721c24']);
        }
      });
      
      bantRange.setBackgrounds(bantBgs);
      bantRange.setFontColors(bantFonts);
      bantRange.setFontWeight('bold');
      
      // Coluna 34: Cód Ação
      const actionRange = sheet.getRange(startRow, 34, numRows, 1);
      const actionValues = actionRange.getValues();
      const actionBgs = [];
      const actionFonts = [];
      
      actionValues.forEach(row => {
        const val = String(row[0]).toUpperCase();
        if (val.includes('REQUALIFICAR') || val.includes('AUDITORIA')) {
          actionBgs.push(['#f8d7da']);
          actionFonts.push(['#721c24']);
        } else if (val.includes('DEAL-DESK') || val.includes('VALIDAR')) {
          actionBgs.push(['#fff3cd']);
          actionFonts.push(['#856404']);
        } else if (val.includes('AUMENTAR') || val.includes('CHECAR')) {
          actionBgs.push(['#e7f3ff']);
          actionFonts.push(['#004085']);
        } else {
          actionBgs.push(['#ffffff']);
          actionFonts.push(['#000000']);
        }
      });
      
      actionRange.setBackgrounds(actionBgs);
      actionRange.setFontColors(actionFonts);
      actionRange.setFontWeight('bold');
      
      // Coluna 42: Anomalias
      const anomalyRange = sheet.getRange(startRow, 42, numRows, 1);
      const anomalyValues = anomalyRange.getValues();
      const anomalyBgs = [];
      
      anomalyValues.forEach(row => {
        const val = String(row[0]);
        if (val === 'OK' || val === '-') {
          anomalyBgs.push(['#d4edda']);
        } else {
          anomalyBgs.push(['#fff3cd']);
        }
      });
      
      anomalyRange.setBackgrounds(anomalyBgs);
      
      // Coluna 43: Velocity Predição
      const velRange = sheet.getRange(startRow, 43, numRows, 1);
      const velValues = velRange.getValues();
      const velBgs = [];
      const velFonts = [];
      
      velValues.forEach(row => {
        const val = String(row[0]).toUpperCase();
        if (val.includes('ACELERANDO')) {
          velBgs.push(['#d4edda']);
          velFonts.push(['#155724']);
        } else if (val.includes('ESTÁVEL') || val.includes('ESTAVEL')) {
          velBgs.push(['#e7f3ff']);
          velFonts.push(['#004085']);
        } else if (val.includes('ESTAGNADO') || val.includes('DESACELERANDO')) {
          velBgs.push(['#f8d7da']);
          velFonts.push(['#721c24']);
        } else {
          velBgs.push(['#ffffff']);
          velFonts.push(['#000000']);
        }
      });
      
      velRange.setBackgrounds(velBgs);
      velRange.setFontColors(velFonts);
      velRange.setFontWeight('bold');
      
      // Coluna 18: Idle Dias
      const idleRange = sheet.getRange(startRow, 18, numRows, 1);
      const idleValues = idleRange.getValues();
      const idleBgs = [];
      
      idleValues.forEach(row => {
        const val = row[0];
        if (val === 'SEM REGISTRO' || val === 0 || val === '-') {
          idleBgs.push(['#d4edda']);
        } else {
          const days = Number(val) || 0;
          if (days > 60) {
            idleBgs.push(['#f8d7da']);
          } else if (days > 30) {
            idleBgs.push(['#fff3cd']);
          } else {
            idleBgs.push(['#ffffff']);
          }
        }
      });
      
      idleRange.setBackgrounds(idleBgs);
      
      // Coluna 45: Território Correto?
      const territoryRange = sheet.getRange(startRow, 45, numRows, 1);
      const territoryValues = territoryRange.getValues();
      const territoryBgs = [];
      const territoryFonts = [];
      
      territoryValues.forEach(row => {
        const val = String(row[0]).toUpperCase();
        if (val === 'SIM') {
          territoryBgs.push(['#d4edda']);
          territoryFonts.push(['#155724']);
        } else {
          territoryBgs.push(['#f8d7da']);
          territoryFonts.push(['#721c24']);
        }
      });
      
      territoryRange.setBackgrounds(territoryBgs);
      territoryRange.setFontColors(territoryFonts);
      territoryRange.setFontWeight('bold');
      
      // Coluna 46: Vendedor Designado (destaque quando diferente do owner)
      const designatedRange = sheet.getRange(startRow, 46, numRows, 1);
      const ownerRange = sheet.getRange(startRow, 6, numRows, 1); // Coluna 6 é Vendedor
      const designatedValues = designatedRange.getValues();
      const ownerValues = ownerRange.getValues();
      const designatedBgs = [];
      
      for (let i = 0; i < designatedValues.length; i++) {
        const designated = String(designatedValues[i][0]).toUpperCase();
        const owner = String(ownerValues[i][0]).toUpperCase();
        
        if (designated === 'INDEFINIDO') {
          designatedBgs.push(['#e0e0e0']); // Cinza
        } else if (designated !== normText_(owner)) {
          designatedBgs.push(['#fff3cd']); // Amarelo - precisa remanejamento
        } else {
          designatedBgs.push(['#d4edda']); // Verde - correto
        }
      }
      
      designatedRange.setBackgrounds(designatedBgs);
      
      // Coluna 48: Fonte Detecção (CRM vs FALLBACK)
      const sourceRange = sheet.getRange(startRow, 48, numRows, 1);
      const sourceValues = sourceRange.getValues();
      const sourceBgs = [];
      const sourceFonts = [];
      
      sourceValues.forEach(row => {
        const val = String(row[0]).toUpperCase();
        if (val === 'FALLBACK') {
          sourceBgs.push(['#fff3cd']); // Amarelo - dados inferidos
          sourceFonts.push(['#856404']);
        } else if (val === 'CRM') {
          sourceBgs.push(['#d4edda']); // Verde - dados diretos
          sourceFonts.push(['#155724']);
        } else {
          sourceBgs.push(['#ffffff']);
          sourceFonts.push(['#000000']);
        }
      });
      
      sourceRange.setBackgrounds(sourceBgs);
      sourceRange.setFontColors(sourceFonts);
      
      logToSheet("DEBUG", "Format", "Formatação de 11 colunas aplicada (incluindo território e fonte detecção)");
    }
  
    logToSheet("DEBUG", "Format", `Formatação aplicada com sucesso para ${mode}`);
  } catch (err) {
    logToSheet("ERROR", "Format", `Erro ao aplicar formatação: ${err.message}`);
    // Não re-throw - continua execução mesmo se formatação falhar
  }
}

function setupAnalysisSheet(mode, preserve) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  let s = ss.getSheetByName(config.output) || ss.insertSheet(config.output);
  
  if (!preserve) s.clear();
  
  const h = mode === 'OPEN' ? [
    ["Run ID", "Oportunidade", "Conta", "Perfil", "Produtos", "Vendedor", "Gross", "Net", "Fase Atual", "Forecast SF", "Fiscal Q", "Data Prevista", "Ciclo (dias)", "Dias Funil", "Atividades", "Atividades (Peso)", "Mix Atividades", "Idle (Dias)", "Qualidade Engajamento", "Forecast IA", "Confiança (%)", "Motivo Confiança", "MEDDIC Score", "MEDDIC Gaps", "MEDDIC Evidências", "BANT Score", "BANT Gaps", "BANT Evidências", "Justificativa IA", "Regras Aplicadas", "Incoerência Detectada", "Perguntas de Auditoria IA", "Flags de Risco", "Gaps Identificados", "Cód Ação", "Ação Sugerida", "Risco Principal", "# Total Mudanças", "# Mudanças Críticas", "Mudanças Close Date", "Mudanças Stage", "Mudanças Valor", "🚨 Anomalias Detectadas", "Velocity Predição", "Velocity Detalhes", "Território Correto?", "Vendedor Designado", "Estado/Cidade Detectado", "Fonte Detecção", "Calendário Faturação", "Valor Reconhecido Q1", "Valor Reconhecido Q2", "Valor Reconhecido Q3", "Valor Reconhecido Q4", "Data de criação", "Subsegmento de mercado", "Segmento Consolidado", "Portfólio", "Portfolio FDM", "Owner Preventa", "Produtos", "Cidade de cobrança", "Estado/Província de cobrança", "Vertical IA", "Sub-vertical IA", "Sub-sub-vertical IA", "Justificativa IA", "🕐 Última Atualização"]
  ] : mode === 'WON' ? [
    ["Run ID", "Oportunidade", "Conta", "Perfil Cliente", "Vendedor", "Gross", "Net", "Portfólio", "Segmento", "Família Produto", "Status", "Fiscal Q", "Data Fechamento", "Ciclo (dias)", "Produtos", "📝 Resumo Análise", "🎯 Causa Raiz", "✨ Fatores Sucesso", "Tipo Resultado", "Qualidade Engajamento", "Gestão Oportunidade", "-", "💡 Lições Aprendidas", "# Atividades", "Ativ. 7d", "Ativ. 30d", "Distribuição Tipos", "Período Pico", "Cadência Média (dias)", "# Total Mudanças", "# Mudanças Críticas", "Mudanças Close Date", "Mudanças Stage", "Mudanças Valor", "Campos + Alterados", "Padrão Mudanças", "Freq. Mudanças", "# Editores", "🏷️ Labels", "Owner Preventa", "Cidade de cobrança", "Estado/Província de cobrança", "Vertical IA", "Sub-vertical IA", "Sub-sub-vertical IA", "Justificativa IA", "🕐 Última Atualização"]
  ] : [
    ["Run ID", "Oportunidade", "Conta", "Perfil Cliente", "Vendedor", "Gross", "Net", "Portfólio", "Segmento", "Família Produto", "Status", "Fiscal Q", "Data Fechamento", "Ciclo (dias)", "Produtos", "📝 Resumo Análise", "🎯 Causa Raiz", "⚠️ Causas Secundárias", "Tipo Resultado", "Evitável?", "🚨 Sinais Alerta", "Momento Crítico", "💡 Lições Aprendidas", "# Atividades", "Ativ. 7d", "Ativ. 30d", "Distribuição Tipos", "Período Pico", "Cadência Média (dias)", "# Total Mudanças", "# Mudanças Críticas", "Mudanças Close Date", "Mudanças Stage", "Mudanças Valor", "Campos + Alterados", "Padrão Mudanças", "Freq. Mudanças", "# Editores", "🏷️ Labels", "Owner Preventa", "Cidade de cobrança", "Estado/Província de cobrança", "Vertical IA", "Sub-vertical IA", "Sub-sub-vertical IA", "Justificativa IA", "🕐 Última Atualização"]
  ];

  s.getRange(1, 1, 1, h[0].length).setValues(h)
    .setBackground("#134f5c").setFontColor("white").setFontWeight("bold")
    .setWrap(true);
  s.setFrozenRows(1);
  s.setColumnWidth(1, 160);  // Run ID
  s.setColumnWidth(2, 200);  // Oportunidade
  s.setColumnWidth(3, 180);  // Conta
  
  if (mode === 'OPEN') {
    s.setColumnWidth(27, 300); // Justificativa
    s.setColumnWidth(29, 300); // Perguntas
    applyConditionalFormatting_(s, mode);
  } else {
    // WON/LOST - Ajustar colunas importantes
    s.setColumnWidth(16, 350);  // 📝 Resumo Análise
    s.setColumnWidth(17, 200);  // 🎯 Causa Raiz
    s.setColumnWidth(18, 250);  // Fatores Sucesso / Causas Secundárias
    s.setColumnWidth(23, 300);  // 💡 Lições Aprendidas
    s.setColumnWidth(27, 200);  // Distribuição Tipos
    s.setColumnWidth(35, 200);  // Campos + Alterados
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE DEEP ANALYSIS REMOVIDAS (08/02/2026)
// Motivo: Não expostas no menu e não utilizadas no fluxo principal
// Se necessário no futuro, podem ser restauradas do histórico Git
// Removidas: setupDeepAnalysisSheet_() e runDeepAnalysis_() (~280 linhas total)
// ════════════════════════════════════════════════════════════════════════════════════════════════

function resetPanel() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert('🚨 ALERTA GTM', 'Isso apagará TODOS os dados de análise. Confirmar?', ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  try {
    stopAllProcessing();
    clearRuntimeState_();
    CacheService.getScriptCache().remove(BASE_CLIENTS_CACHE_KEY);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    [SHEETS.RESULTADO_PIPELINE, SHEETS.RESULTADO_GANHAS, SHEETS.RESULTADO_PERDIDAS, SHEETS.LOGS].forEach(nome => {
      const s = ss.getSheetByName(nome);
      if (s && s.getLastRow() > 1) {
        s.getRange(2, 1, s.getLastRow() - 1, s.getMaxColumns()).clearContent();
      }
    });

    ui.alert("✅ Limpeza completa realizada.");
  } catch (e) {
    ui.alert("Erro no Reset: " + e.message);
  }
}

function gerarDicionarioDados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEETS.DICIONARIO) || ss.insertSheet(SHEETS.DICIONARIO);
  s.clear();
  const rows = [];
  rows.push(["Seção", "Campo", "Descrição"]);

  rows.push(["Dicionário Analítico", "Forecast IA", "Classificação IA + gates (estagnação, deal desk, governo, incoerência)."]);
  rows.push(["Dicionário Analítico", "Motivo Confiança", "Explicação semântica do score de confiança."]);
  rows.push(["Dicionário Analítico", "Run ID", "Identificador único da execução para auditoria e rastreio."]);
  rows.push(["Dicionário Analítico", "Atividades (Peso)", "Contagem ponderada por canal (meeting/call/email)."]);
  rows.push(["Dicionário Analítico", "Mix Atividades", "Distribuição por tipo de atividade."]);
  rows.push(["Dicionário Analítico", "MEDDIC Score", "Score 0-100. +16 por critério detectado (Metrics, Buyer, Criteria, Process, Pain, Champion)."]);
  rows.push(["Dicionário Analítico", "MEDDIC Gaps", "Critérios sem evidência textual."]);
  rows.push(["Dicionário Analítico", "MEDDIC Evidências", "Critérios detectados no texto."]);
  rows.push(["Dicionário Analítico", "BANT Score", "Score 0-100. +25 por critério detectado (Budget, Authority, Need, Timing)."]);
  rows.push(["Dicionário Analítico", "BANT Gaps", "Critérios sem evidência textual."]);
  rows.push(["Dicionário Analítico", "BANT Evidências", "Critérios detectados no texto."]);
  rows.push(["Dicionário Analítico", "Check Incoerência", "Fase avançada sem atividade recente (>20 dias)."]);
  rows.push(["Dicionário Analítico", "Ação: Deal Desk", "Valor > 250k ou Serviços > 50k requer aprovação prévia."]);
  rows.push(["Dicionário Analítico", "Perguntas Auditoria", "3 perguntas para o 1:1 com o vendedor."]);
  rows.push(["Dicionário Analítico", "Alerta Estagnação", "Oportunidade parada há mais de 45 dias."]);
  rows.push(["Dicionário Analítico", "Conclusão Forecast", "Combina gates + IA; se gate forçado, prevalece."]);
  rows.push(["Dicionário Analítico", "Risco Principal", "Maior gargalo técnico/financeiro/político detectado."]);
  rows.push(["Dicionário Analítico", "Regras Aplicadas", "Resumo curto das regras que impactaram o forecast."]);

  rows.push(["Estrutura de Arquivos", "Pipeline_Aberto", DATA_SCHEMA.PIPELINE_ABERTO.join(", ")]);
  rows.push(["Estrutura de Arquivos", "Atividades", DATA_SCHEMA.ATIVIDADES.join(", ")]);
  rows.push(["Estrutura de Arquivos", "Alteracoes_Oportunidade", DATA_SCHEMA.ALTERACOES.join(", ")]);
  rows.push(["Estrutura de Arquivos", "Historico_Ganhos", DATA_SCHEMA.GANHAS.join(", ")]);
  rows.push(["Estrutura de Arquivos", "Historico_Perdidas", DATA_SCHEMA.PERDIDAS.join(", ")]);

  rows.push(["Racional do Forecast", "Passo 1", "Leitura dos dados e agregação por oportunidade (produtos e valores)."]);
  rows.push(["Racional do Forecast", "Passo 2", "Indexação de atividades e histórico de alterações por oportunidade."]);
  rows.push(["Racional do Forecast", "Passo 3", "Cálculo de inatividade, BANT e MEDDIC com evidências."]);
  rows.push(["Racional do Forecast", "Passo 4", "Aplicação de gates: governo, deal desk, estagnação, incoerência, net zero."]);
  rows.push(["Racional do Forecast", "Passo 5", "IA gera forecast e recomendações com base nos dados."]);
  rows.push(["Racional do Forecast", "Passo 6", "Se houver gate forçado, ele sobrepõe a IA."]);
  rows.push(["Racional do Forecast", "Passo 7", "Escrita do resultado na aba de análise."]);

  s.getRange(1, 1, rows.length, 3).setValues(rows);
  s.getRange(1, 1, 1, 3).setBackground("#e6b8af").setFontWeight("bold");
  s.setColumnWidth(1, 180);
  s.setColumnWidth(2, 220);
  s.setColumnWidth(3, 900);
}

/**
 * Gera relatório de qualidade de dados em nova aba
 * Analisa cabeçalhos, valores nulos, inconsistências
 */
function gerarRelatorioQualidadeDados() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  ui.alert('📋 Relatório de Qualidade de Dados', 
    'Gerando relatório completo...\n\nIsso pode levar alguns segundos.', 
    ui.ButtonSet.OK);
  
  try {
    // Criar ou limpar aba de relatório
    let reportSheet = ss.getSheetByName('📊 Qualidade de Dados');
    if (reportSheet) {
      reportSheet.clear();
    } else {
      reportSheet = ss.insertSheet('📊 Qualidade de Dados');
    }
    
    const rows = [];
    rows.push(['SEÇÃO', 'ABA/CAMPO', 'STATUS', 'DETALHES', 'REGISTROS AFETADOS', 'AÇÃO RECOMENDADA']);
    
    const hoje = new Date();
    const hojeSP = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    
    // ════════════════════════════════════════════════════════════
    // SEÇÃO 1: CABEÇALHOS DAS ABAS
    // ════════════════════════════════════════════════════════════
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    rows.push(['📋 CABEÇALHOS', `Relatório gerado em: ${hojeSP}`, '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    
    const abasParaAnalisar = [
      { nome: SHEETS.ABERTO, tipo: 'BASE' },
      { nome: SHEETS.GANHAS, tipo: 'BASE' },
      { nome: SHEETS.PERDIDAS, tipo: 'BASE' },
      { nome: SHEETS.ATIVIDADES, tipo: 'SUPPORT' },
      { nome: SHEETS.ALTERACOES_ABERTO, tipo: 'SUPPORT' },
      { nome: SHEETS.RESULTADO_PIPELINE, tipo: 'ANÁLISE' },
      { nome: SHEETS.RESULTADO_GANHAS, tipo: 'ANÁLISE' },
      { nome: SHEETS.RESULTADO_PERDIDAS, tipo: 'ANÁLISE' }
    ];
    
    abasParaAnalisar.forEach(abaInfo => {
      const sheet = ss.getSheetByName(abaInfo.nome);
      if (sheet && sheet.getLastRow() > 0) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const headerStr = headers.join(' | ');
        rows.push([
          '📋 CABEÇALHOS',
          abaInfo.nome,
          `✅ ${headers.length} colunas`,
          headerStr,
          `${sheet.getLastRow() - 1} linhas`,
          abaInfo.tipo
        ]);
      } else {
        rows.push([
          '📋 CABEÇALHOS',
          abaInfo.nome,
          '❌ ABA VAZIA',
          'Aba não encontrada ou sem dados',
          '0',
          'Verificar importação'
        ]);
      }
    });
    
    // ════════════════════════════════════════════════════════════
    // SEÇÃO 2: CAMPOS CRÍTICOS AUSENTES
    // ════════════════════════════════════════════════════════════
    rows.push(['', '', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    rows.push(['🔍 CAMPOS CRÍTICOS', 'Verificando campos obrigatórios', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    
    [SHEETS.ABERTO, SHEETS.GANHAS, SHEETS.PERDIDAS].forEach(abaName => {
      const sheet = ss.getSheetByName(abaName);
      if (!sheet || sheet.getLastRow() <= 1) {
        rows.push(['🔍 CAMPOS CRÍTICOS', abaName, '⚠️ ABA VAZIA', 'Sem dados para validar', '0', '']);
        return;
      }
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const cols = getColumnMapping(headers);
      
      // Verificar campos críticos (adaptar por tipo de aba)
      const camposCriticos = [
        { nome: 'Nome da Oportunidade', col: cols.p_opp },
        { nome: 'Nome da Conta', col: cols.p_acc },
        { nome: 'Proprietário', col: cols.p_owner },
        { nome: 'Gross (Total Price)', col: cols.p_gross },
        { nome: 'Net (Margen Total $)', col: cols.p_net },
        { nome: 'Data de Fechamento', col: cols.p_date },
        { nome: 'Data de Criação', col: cols.p_created }
      ];
      
      camposCriticos.forEach(campo => {
        if (campo.col === -1) {
          rows.push([
            '🔍 CAMPOS CRÍTICOS',
            `${abaName} > ${campo.nome}`,
            '❌ NÃO ENCONTRADO',
            'Coluna não existe ou nome diferente',
            'TODOS',
            'Verificar mapeamento de colunas'
          ]);
        } else {
          // Contar quantos registros têm valor nulo/vazio
          let vazios = 0;
          for (let i = 1; i < data.length; i++) {
            const valor = data[i][campo.col];
            if (!valor || String(valor).trim() === '') {
              vazios++;
            }
          }
          
          if (vazios > 0) {
            rows.push([
              '🔍 CAMPOS CRÍTICOS',
              `${abaName} > ${campo.nome}`,
              `⚠️ ${vazios} VAZIOS`,
              `${vazios} registro(s) sem valor`,
              vazios,
              'Preencher valores ausentes'
            ]);
          } else {
            rows.push([
              '🔍 CAMPOS CRÍTICOS',
              `${abaName} > ${campo.nome}`,
              '✅ OK',
              'Todos os registros preenchidos',
              '0',
              ''
            ]);
          }
        }
      });
    });
    
    // ════════════════════════════════════════════════════════════
    // SEÇÃO 3: VALORES SUSPEITOS
    // ════════════════════════════════════════════════════════════
    rows.push(['', '', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    rows.push(['⚠️ VALORES SUSPEITOS', 'Inconsistências nos dados', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    
    [SHEETS.ABERTO, SHEETS.GANHAS, SHEETS.PERDIDAS].forEach(abaName => {
      const sheet = ss.getSheetByName(abaName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const cols = getColumnMapping(headers);
      
      let netZero = 0;
      let grossZero = 0;
      let createdNull = 0;
      let closedNull = 0;
      let datasNegativas = 0;
      
      for (let i = 1; i < data.length; i++) {
        const gross = parseFloat(data[i][cols.p_gross]) || 0;
        const net = parseFloat(data[i][cols.p_net]) || 0;
        const created = cols.p_created > -1 ? data[i][cols.p_created] : null;
        const closed = cols.p_date > -1 ? data[i][cols.p_date] : null;
        
        if (gross === 0) grossZero++;
        if (net === 0) netZero++;
        if (!created) createdNull++;
        if (!closed) closedNull++;
        
        // Verificar datas negativas (Close antes de Created)
        if (created && closed) {
          const createdDate = created instanceof Date ? created : parseDate(created);
          const closedDate = closed instanceof Date ? closed : parseDate(closed);
          if (createdDate && closedDate && closedDate < createdDate) {
            datasNegativas++;
          }
        }
      }
      
      if (netZero > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > NET = 0`, `⚠️ ${netZero} registros`, 'Margen Total $ zerado', netZero, 'Verificar se é correto ou erro de importação']);
      }
      if (grossZero > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > GROSS = 0`, `⚠️ ${grossZero} registros`, 'Total Price zerado', grossZero, 'Verificar se é correto']);
      }
      if (createdNull > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > Created Date NULL`, `❌ ${createdNull} registros`, 'Data de criação ausente', createdNull, 'Preencher datas - impacta Ciclo e Dias Funil']);
      }
      if (closedNull > 0 && abaName !== SHEETS.ABERTO) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > Close Date NULL`, `❌ ${closedNull} registros`, 'Data de fechamento ausente', closedNull, 'Preencher datas - impacta Ciclo']);
      }
      if (datasNegativas > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > Datas Invertidas`, `❌ ${datasNegativas} registros`, 'Close Date < Created Date', datasNegativas, 'CRÍTICO: Corrigir datas - gera Ciclo negativo']);
      }
    });
    
    // ════════════════════════════════════════════════════════════
    // VERIFICAÇÃO DE ANÁLISES (ABAS GERADAS)
    // ════════════════════════════════════════════════════════════
    [SHEETS.RESULTADO_PIPELINE, SHEETS.RESULTADO_GANHAS, SHEETS.RESULTADO_PERDIDAS].forEach(abaName => {
      const sheet = ss.getSheetByName(abaName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Mapear colunas da ANÁLISE
      const colGross = headers.findIndex(h => normText_(String(h)) === normText_('Gross'));
      const colNet = headers.findIndex(h => normText_(String(h)) === normText_('Net'));
      const colCiclo = headers.findIndex(h => normText_(String(h)).includes('CICLO') && normText_(String(h)).includes('DIAS'));
      const colCloseDate = headers.findIndex(h => normText_(String(h)).includes('DATA') && normText_(String(h)).includes('FECHAMENTO'));
      
      let netZero = 0;
      let grossZero = 0;
      let cicloNegativo = 0;
      let closedNull = 0;
      
      for (let i = 1; i < data.length; i++) {
        const gross = colGross > -1 ? (parseFloat(data[i][colGross]) || 0) : 0;
        const net = colNet > -1 ? (parseFloat(data[i][colNet]) || 0) : 0;
        const ciclo = colCiclo > -1 ? (parseInt(data[i][colCiclo]) || 0) : 0;
        const closed = colCloseDate > -1 ? data[i][colCloseDate] : null;
        
        if (gross === 0 && colGross > -1) grossZero++;
        if (net === 0 && colNet > -1) netZero++;
        if (ciclo < 0 && colCiclo > -1) cicloNegativo++;
        if (!closed && colCloseDate > -1) closedNull++;
      }
      
      if (netZero > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > NET = 0`, `⚠️ ${netZero} registros`, 'Margen zerado na análise', netZero, 'Verificar se base tem dados corretos']);
      }
      if (grossZero > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > GROSS = 0`, `⚠️ ${grossZero} registros`, 'Total Price zerado na análise', grossZero, 'Verificar se base tem dados corretos']);
      }
      if (cicloNegativo > 0) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > Ciclo Negativo`, `❌ ${cicloNegativo} registros`, 'Ciclo (dias) < 0', cicloNegativo, 'CRÍTICO: Datas invertidas - reprocessar análise']);
      }
      if (closedNull > 0 && !abaName.includes('Forecast')) {
        rows.push(['⚠️ VALORES SUSPEITOS', `${abaName} > Close Date NULL`, `❌ ${closedNull} registros`, 'Data de fechamento ausente', closedNull, 'CRÍTICO: Dados ausentes na base']);
      }
    });
    
    // ════════════════════════════════════════════════════════════
    // SEÇÃO 4: MAPEAMENTO DE COLUNAS
    // ════════════════════════════════════════════════════════════
    rows.push(['', '', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    rows.push(['🗺️ MAPEAMENTO', 'Colunas encontradas pelo sistema', '', '', '', '']);
    rows.push(['═══════════════════════════════════════════════════════════', '', '', '', '', '']);
    
    [SHEETS.ABERTO, SHEETS.GANHAS, SHEETS.PERDIDAS].forEach(abaName => {
      const sheet = ss.getSheetByName(abaName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const cols = getColumnMapping(headers);
      
      Object.keys(cols).forEach(key => {
        const colIndex = cols[key];
        const status = colIndex > -1 ? `✅ Coluna ${colIndex + 1}` : '❌ NÃO ENCONTRADA';
        const headerName = colIndex > -1 ? headers[colIndex] : 'N/A';
        rows.push([
          '🗺️ MAPEAMENTO',
          `${abaName} > ${key}`,
          status,
          headerName,
          '',
          colIndex === -1 ? 'Adicionar coluna ou atualizar mapeamento' : ''
        ]);
      });
    });
    
    // Escrever relatório
    reportSheet.getRange(1, 1, rows.length, 6).setValues(rows);
    
    // Formatação
    reportSheet.getRange(1, 1, 1, 6).setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');
    reportSheet.setFrozenRows(1);
    reportSheet.setColumnWidth(1, 200);
    reportSheet.setColumnWidth(2, 250);
    reportSheet.setColumnWidth(3, 150);
    reportSheet.setColumnWidth(4, 400);
    reportSheet.setColumnWidth(5, 120);
    reportSheet.setColumnWidth(6, 250);
    
    // Aplicar cores condicionais
    for (let i = 2; i <= rows.length; i++) {
      const statusCell = reportSheet.getRange(i, 3);
      const status = statusCell.getValue();
      
      if (String(status).includes('❌')) {
        reportSheet.getRange(i, 1, 1, 6).setBackground('#f4cccc');
      } else if (String(status).includes('⚠️')) {
        reportSheet.getRange(i, 1, 1, 6).setBackground('#fff2cc');
      } else if (String(status).includes('✅')) {
        reportSheet.getRange(i, 1, 1, 6).setBackground('#d9ead3');
      } else if (String(status).includes('═══')) {
        reportSheet.getRange(i, 1, 1, 6).setBackground('#e6e6e6').setFontWeight('bold');
      }
    }
    
    ss.setActiveSheet(reportSheet);
    
    ui.alert('✅ Relatório Gerado', 
      `Relatório de qualidade de dados gerado com sucesso!\n\nAba: 📊 Qualidade de Dados\n\nTotal de linhas: ${rows.length}`, 
      ui.ButtonSet.OK);
    
    logToSheet('INFO', 'QualidadeDados', `Relatório gerado com ${rows.length} linhas`);
    
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    logToSheet('ERROR', 'QualidadeDados', `Erro: ${error.message}`);
    ui.alert('❌ Erro', `Erro ao gerar relatório:\n\n${error.message}`, ui.ButtonSet.OK);
  }
}

function buildQueueSheet_(mode, runId) {
  try {
    logToSheet("DEBUG", "Queue", `buildQueueSheet_ iniciado para ${mode}`);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getModeConfig(mode);
    
    logToSheet("DEBUG", "Queue", `Buscando dados de ${config.input}`);
    const mainData = getSheetData(config.input);
    
    if (!mainData) {
      const erro = `Aba ${config.input} não encontrada ou vazia.`;
      logToSheet("ERROR", "Queue", erro);
      throw new Error(erro);
    }
    
    logToSheet("DEBUG", "Queue", `Dados encontrados: ${mainData.values.length} linhas`);

    const cols = getColumnMapping(mainData.headers);
    flushLogs_(); // Força flush para ver logs de mapeamento
    
    logToSheet("DEBUG", "Queue", `Mapeamento de colunas OK`);
    
    const aggregatedData = aggregateOpportunities(mainData.values, cols, mode);
    flushLogs_(); // Força flush para ver logs de agregação
    
    logToSheet("DEBUG", "Queue", `${aggregatedData.length} oportunidades agregadas`);
    
    const queueName = `_QUEUE_${mode}_${runId}`;

    const existing = ss.getSheetByName(queueName);
    if (existing) {
      logToSheet("DEBUG", "Queue", `Removendo aba existente: ${queueName}`);
      ss.deleteSheet(existing);
    }

    logToSheet("DEBUG", "Queue", `Criando nova aba: ${queueName}`);
    const queueSheet = ss.insertSheet(queueName);
    queueSheet.getRange(1, 1, 1, 5).setValues([["OppKey", "OppId", "OppName", "Account", "Status"]]);

    if (aggregatedData.length > 0) {
      const rows = aggregatedData.map(item => [
        item.oppKey || "",
        item.oppId || "",
        item.oppName || "",
        item.accName || "",
        "PENDING"
      ]);
      queueSheet.getRange(2, 1, rows.length, 5).setValues(rows);
      logToSheet("DEBUG", "Queue", `${rows.length} linhas escritas na fila`);
    }

    queueSheet.hideSheet();
    PropertiesService.getScriptProperties().setProperty(`QUEUE_SHEET_${mode}`, queueName);
    logToSheet("INFO", "Queue", `Fila ${queueName} criada com sucesso`);
    
  } catch (e) {
    logToSheet("FATAL", "Queue", `Erro em buildQueueSheet_(${mode}): ${e.message} | Stack: ${e.stack}`);
    throw e;
  }
}

function getQueueSheetName_(mode) {
  return PropertiesService.getScriptProperties().getProperty(`QUEUE_SHEET_${mode}`) || "";
}

function buildAggregationSnapshot_(mode, runId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  const mainData = getSheetData(config.input);
  if (!mainData) {
    logToSheet("WARN", "Snapshot", `Aba ${config.input} não encontrada para snapshot.`);
    return;
  }
  
  const cols = getColumnMapping(mainData.headers);
  const aggregatedData = aggregateOpportunities(mainData.values, cols, mode);
  
  const snapshotName = `_AGG_${mode}_${runId}`;
  const existing = ss.getSheetByName(snapshotName);
  if (existing) ss.deleteSheet(existing);
  
  const snapshot = ss.insertSheet(snapshotName);
  const headers = ["oppKey", "oppId", "oppName", "accName", "owner", "gross", "net", 
                   "products", "stage", "probabilidad", "closed", "desc", "created", 
                   "inactiveDays", "nextActivityDate", "forecast_sf", "fiscalQ", "ciclo", "reason", 
                   "portfolio", "segment", "productFamily", "billingState", "billingCity", "billingCalendar"];
  snapshot.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  if (aggregatedData.length > 0) {
    const rows = aggregatedData.map(item => [
      item.oppKey || "", item.oppId || "", item.oppName || "", item.accName || "", item.owner || "",
      item.gross || 0, item.net || 0, item.products || "", item.stage || "", item.probabilidad || 0,
      item.closed || "", item.desc || "", item.created || "", item.inactiveDays || 0,
      item.nextActivityDate || "", item.forecast_sf || "", item.fiscalQ || "", item.ciclo || 0, item.reason || "",
      item.portfolio || "", item.segment || "", item.productFamily || "",
      item.billingState || "", item.billingCity || "", item.billingCalendar || ""
    ]);
    snapshot.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  snapshot.hideSheet();
  PropertiesService.getScriptProperties().setProperty(`AGG_SNAPSHOT_${mode}`, snapshotName);
  logToSheet("INFO", "Snapshot", `Agregação cacheada: ${aggregatedData.length} itens em ${snapshotName}.`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FUNÇÃO DO INSPECTOR REMOVIDA (08/02/2026)
// Motivo: Não exposta no menu, funcionalidade coberta por runHealthCheck()
// Removidas: setupInspector() e runInspector()
// Se necessário no futuro, pode ser restaurada do histórico Git
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Garante que a aba de Event Log existe e está protegida
 */
function ensureEventLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEETS.EVENT_LOG);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.EVENT_LOG);
    const headers = [[
      "ID Evento", "Timestamp", "Ator", "Origem", "Aba", "Range", "Linha", "Coluna",
      "Campo", "Valor Anterior", "Valor Novo", "Hash Linha Antes", "Hash Linha Depois",
      "Hash Evento Anterior", "Hash Evento", "Run ID", "Modo", "Severidade", "Notas"
    ]];
    sheet.getRange(1, 1, 1, 19).setValues(headers)
      .setBackground("#8e7cc3").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
    
    try {
      const protection = sheet.protect().setDescription("Event Log Imutável - Apenas Leitura");
      protection.setWarningOnly(true);
    } catch (e) {
      logToSheet("WARN", "EventLog", "Não foi possível proteger a aba: " + e.message);
    }
  }
  
  return sheet;
}

/**
 * Adiciona evento ao Event Log (append-only)
 */
function appendEvent_(eventObj) {
  try {
    const sheet = ensureEventLogSheet_();
    const props = PropertiesService.getScriptProperties();
    
    const eventId = Utilities.getUuid();
    const timestamp = new Date().toISOString();
    const actor = getActorEmail_();
    const prevHash = props.getProperty("EVENT_LOG_LAST_HASH") || "";
    
    const payloadStr = JSON.stringify({
      id: eventId,
      ts: timestamp,
      actor: actor,
      source: eventObj.source || "SYSTEM",
      sheetName: eventObj.sheetName || "-",
      range: eventObj.range || "-",
      row: eventObj.rowIndex || 0,
      col: eventObj.colIndex || 0,
      field: eventObj.fieldName || "-",
      oldVal: eventObj.oldValue || "-",
      newVal: eventObj.newValue || "-",
      hashBefore: eventObj.rowHashBefore || "-",
      hashAfter: eventObj.rowHashAfter || "-",
      runId: eventObj.runId || "-",
      mode: eventObj.mode || "-",
      severity: eventObj.severity || "INFO",
      notes: eventObj.notes || "-",
      oppKey: eventObj.oppKey || "-",
      oppName: eventObj.oppName || "-"
    });
    
    const eventHash = computeSHA256_(payloadStr + prevHash);
    
    const row = [
      eventId, timestamp, actor, eventObj.source || "SYSTEM",
      eventObj.sheetName || "-", eventObj.range || "-",
      eventObj.rowIndex || 0, eventObj.colIndex || 0,
      eventObj.fieldName || "-", eventObj.oldValue || "-", eventObj.newValue || "-",
      eventObj.rowHashBefore || "-", eventObj.rowHashAfter || "-",
      prevHash, eventHash,
      eventObj.runId || "-", eventObj.mode || "-",
      eventObj.severity || "INFO", eventObj.notes || "-"
    ];
    
    sheet.appendRow(row);
    props.setProperty("EVENT_LOG_LAST_HASH", eventHash);
    
  } catch (e) {
    console.error("Falha ao registrar evento: " + e.message);
  }
}

/**
 * Garante aba de Snapshot de Integridade
 */
function ensureIntegritySnapshot_(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = mode === 'OPEN' ? SHEETS.INTEGRITY_OPEN : `🔐 Snapshot Integridade ${mode}`;
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [["Chave Oportunidade", "Hash Integridade", "Timestamp Atualização", "Run ID"]];
    sheet.getRange(1, 1, 1, 4).setValues(headers)
      .setBackground("#6aa84f").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  
  return sheet;
}

/**
 * Salva snapshot de hashes após processamento
 */
function saveIntegritySnapshot_(mode, aggregatedData, runId) {
  if (mode !== 'OPEN') return;
  
  const sheet = ensureIntegritySnapshot_(mode);
  const timestamp = new Date().toISOString();
  const rows = aggregatedData.map(item => [
    item.oppKey || "",
    computeOppIntegrityHash_(item),
    timestamp,
    runId
  ]);
  
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).clearContent();
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  
  logToSheet("INFO", "Integrity", `Snapshot salvo: ${rows.length} itens`);
}

/**
 * Carrega hashes anteriores
 */
function loadPreviousHashes_(mode) {
  if (mode !== 'OPEN') return new Map();
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INTEGRITY_OPEN);
  if (!sheet || sheet.getLastRow() < 2) return new Map();
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const map = new Map();
  data.forEach(row => {
    if (row[0]) map.set(String(row[0]), String(row[1]));
  });
  
  return map;
}

/**
 * NOVO: Change Tracking via Snapshot Comparison (funciona com Sales Connector)
 * Ao invés de onEdit (que só captura edições manuais), compara snapshots periódicos
 */
function setupSnapshotTracking() {
  const ui = SpreadsheetApp.getUi();
  const choice = ui.alert(
    "🔄 Snapshot Tracking",
    "Este sistema captura mudanças via comparação de snapshots (funciona com Sales Connector).\n\n" +
    "Diferença do onEdit: Não precisa de edições manuais - compara estado anterior vs. atual.\n\n" +
    "Ativar?",
    ui.ButtonSet.YES_NO
  );
  
  if (choice !== ui.Button.YES) return;
  
  ensureSnapshotTrackingActive_('ALL');
  
  safeAlert_("✅ Snapshot Tracking ativado! Sistema monitorará mudanças a cada 1 hora (compatível com Sales Connector).");
  logToSheet("INFO", "SnapshotTracking", "Sistema ativado - primeira captura realizada");
}

/**
 * Ativa rastreamento automático (chamado ao iniciar workflows)
 * @param {string} mode - 'OPEN', 'WON', 'LOST' ou 'ALL'
 */
function ensureSnapshotTrackingActive_(mode) {
  // Remove triggers antigos onEdit (incompatíveis com Sales Connector)
  clearTriggersByHandler_('onEditInstallable');
  
  // Verifica se já existe trigger ativo
  const existingTriggers = ScriptApp.getProjectTriggers();
  const hasTracking = existingTriggers.some(t => t.getHandlerFunction() === 'detectChangesBySnapshot');
  
  if (!hasTracking) {
    // Cria trigger time-based para rodar a cada 1 hora
    ScriptApp.newTrigger('detectChangesBySnapshot')
      .timeBased()
      .everyHours(1)
      .create();
    logToSheet("INFO", "SnapshotTracking", `Trigger criado para detectChangesBySnapshot`);
  }
  
  PropertiesService.getScriptProperties().setProperty('SNAPSHOT_TRACKING_ACTIVE', 'TRUE');
  // Não cria abas de tracking aqui para não distrair o usuário durante inicialização
  // ensureChangePatternSheet_(); // Será criado apenas quando houver mudanças
  ensureSnapshotArchive_();
  
  // Captura snapshot inicial se não existir
  const props = PropertiesService.getScriptProperties();
  const lastSnapshot = props.getProperty('LAST_SNAPSHOT_TIME');
  if (!lastSnapshot) {
    captureCurrentSnapshot_();
    logToSheet("INFO", "SnapshotTracking", "Snapshot inicial capturado");
  }
}

/**
 * Pausa snapshot tracking
 */
function pauseSnapshotTracking() {
  clearTriggersByHandler_('detectChangesBySnapshot');
  PropertiesService.getScriptProperties().setProperty('SNAPSHOT_TRACKING_ACTIVE', 'FALSE');
  safeAlert_("⏸️ Snapshot Tracking pausado.");
  logToSheet("INFO", "SnapshotTracking", "Sistema pausado");
}

/**
 * Cria aba para armazenar snapshots históricos
 */
function ensureSnapshotArchive_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("🗄️ Snapshot Archive");
  if (!sheet) {
    sheet = ss.insertSheet("🗄️ Snapshot Archive");
    sheet.getRange("A1:H1").setValues([[
      "Timestamp", "Aba", "Opp Key", "Opp Name", "Campo", "Valor", "Hash Campo", "Snapshot ID"
    ]])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Captura snapshot atual das abas monitoradas
 */
function captureCurrentSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const monitoredSheets = [
    SHEETS.ABERTO,
    SHEETS.GANHAS,
    SHEETS.PERDIDAS,
    SHEETS.ALTERACOES_ABERTO,
    SHEETS.ATIVIDADES
  ];
  
  const snapshotId = `SNAP_${new Date().getTime()}`;
  const archiveSheet = ensureSnapshotArchive_();
  const rows = [];
  
  monitoredSheets.forEach(sheetName => {
    const data = getSheetData(sheetName);
    if (!data || !data.values || data.values.length === 0) return;
    
    const headers = data.headers;
    
    // Identificar colunas-chave para tracking
    const oppNameCol = findCol_(headers, ["Opportunity Name", "Nombre de oportunidad", "Nome da Oportunidade"]);
    const oppIdCol = findCol_(headers, ["Opportunity ID", "ID"]);
    const accNameCol = findCol_(headers, ["Account Name", "Nombre de cuenta", "Nome da Conta"]);
    
    // Campos críticos para monitorar mudanças
    const criticalFields = [
      "Stage", "Fase", "Etapa",
      "Close Date", "Data Fechamento", "Fecha de cierre",
      "Amount", "Valor", "Importe",
      "Probability", "Probabilidad", "Probabilidade",
      "Forecast Category", "Categoria Forecast",
      "Next Step", "Próximo Passo", "Próxima etapa",
      "Owner Name", "Nombre del propietario", "Proprietário"
    ];
    
    data.values.forEach(row => {
      const oppName = oppNameCol >= 0 ? String(row[oppNameCol] || "") : "";
      const oppId = oppIdCol >= 0 ? String(row[oppIdCol] || "") : "";
      const accName = accNameCol >= 0 ? String(row[accNameCol] || "") : "";
      
      if (!oppName && !oppId) return; // Pula linhas sem identificador
      
      const oppKey = buildOppKey_(accName, oppName, null);
      
      // Captura cada campo crítico
      headers.forEach((header, idx) => {
        const headerNorm = normText_(header);
        const isCritical = criticalFields.some(cf => normText_(cf) === headerNorm);
        
        if (isCritical || headerNorm.includes("net") || headerNorm.includes("gross")) {
          const value = String(row[idx] || "");
          const fieldHash = computeSHA256_(`${oppKey}|${header}|${value}`);
          
          rows.push([
            new Date(),
            sheetName,
            oppKey,
            oppName,
            header,
            value,
            fieldHash,
            snapshotId
          ]);
        }
      });
    });
  });
  
  if (rows.length > 0) {
    const lastRow = archiveSheet.getLastRow();
    archiveSheet.getRange(lastRow + 1, 1, rows.length, 8).setValues(rows);
    logToSheet("DEBUG", "Snapshot", `Capturado: ${rows.length} campos em ${snapshotId}`);
  }
  
  // Salva metadata do snapshot
  PropertiesService.getScriptProperties().setProperty('LAST_SNAPSHOT_ID', snapshotId);
  PropertiesService.getScriptProperties().setProperty('LAST_SNAPSHOT_TIME', new Date().toISOString());
}

/**
 * Função executada por trigger - detecta mudanças comparando snapshots
 */
function detectChangesBySnapshot() {
  if (PropertiesService.getScriptProperties().getProperty('SNAPSHOT_TRACKING_ACTIVE') !== 'TRUE') {
    return;
  }
  
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logToSheet("WARN", "Snapshot", "Lock não disponível - pulando ciclo");
    return;
  }
  
  try {
    const lastSnapshotId = PropertiesService.getScriptProperties().getProperty('LAST_SNAPSHOT_ID');
    
    if (!lastSnapshotId) {
      // Primeiro snapshot
      captureCurrentSnapshot_();
      return;
    }
    
    // Carrega snapshot anterior
    const archiveSheet = ensureSnapshotArchive_();
    const allData = archiveSheet.getDataRange().getValues();
    const headers = allData[0];
    
    const previousSnapshot = new Map(); // fieldHash -> [timestamp, aba, oppKey, oppName, campo, valor]
    
    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      const snapshotId = row[7];
      if (snapshotId === lastSnapshotId) {
        const fieldHash = row[6];
        previousSnapshot.set(fieldHash, row);
      }
    }
    
    // Captura snapshot atual
    const currentSnapshotId = `SNAP_${new Date().getTime()}`;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const monitoredSheets = [SHEETS.ABERTO, SHEETS.GANHAS, SHEETS.PERDIDAS];
    
    const currentSnapshot = new Map();
    const changesDetected = [];
    
    monitoredSheets.forEach(sheetName => {
      const data = getSheetData(sheetName);
      if (!data || !data.values || data.values.length === 0) return;
      
      const headers = data.headers;
      const oppNameCol = findCol_(headers, ["Opportunity Name", "Nome da Oportunidade"]);
      const accNameCol = findCol_(headers, ["Account Name", "Nome da Conta"]);
      
      const criticalFields = [
        "Stage", "Close Date", "Amount", "Probability", "Forecast Category", "Next Step", "Owner Name"
      ];
      
      data.values.forEach(row => {
        const oppName = oppNameCol >= 0 ? String(row[oppNameCol] || "") : "";
        const accName = accNameCol >= 0 ? String(row[accNameCol] || "") : "";
        if (!oppName) return;
        
        const oppKey = buildOppKey_(accName, oppName, null);
        
        headers.forEach((header, idx) => {
          const headerNorm = normText_(header);
          const isCritical = criticalFields.some(cf => normText_(cf) === headerNorm);
          
          if (isCritical) {
            const value = String(row[idx] || "");
            const fieldHash = computeSHA256_(`${oppKey}|${header}|${value}`);
            currentSnapshot.set(fieldHash, { sheetName, oppKey, oppName, header, value });
            
            // Verifica se mudou
            if (!previousSnapshot.has(fieldHash)) {
              // Busca valor anterior para este campo
              let oldValue = "";
              for (let [prevHash, prevRow] of previousSnapshot.entries()) {
                if (prevRow[2] === oppKey && prevRow[4] === header) {
                  oldValue = prevRow[5];
                  break;
                }
              }
              
              if (oldValue !== value && oldValue !== "") {
                // Mudança detectada!
                const severity = categorizeChangeSeverity_(sheetName, header, oldValue, value);
                
                changesDetected.push({
                  timestamp: new Date(),
                  sheetName: sheetName,
                  oppKey: oppKey,
                  oppName: oppName,
                  field: header,
                  oldValue: oldValue,
                  newValue: value,
                  severity: severity
                });
                
                // Atualiza padrões
                updateChangePattern_(sheetName, header, oppName, oldValue, value);
                
                // Log no Event Log
                appendEvent_({
                  source: "SNAPSHOT_TRACKING",
                  sheetName: sheetName,
                  oppKey: oppKey,
                  oppName: oppName,
                  fieldName: header,
                  oldValue: oldValue,
                  newValue: value,
                  severity: severity,
                  notes: `Detectado via snapshot comparison (${lastSnapshotId} → ${currentSnapshotId})`
                });
              }
            }
          }
        });
      });
    });
    
    // Salva novo snapshot
    const archiveRows = [];
    for (let [hash, data] of currentSnapshot.entries()) {
      archiveRows.push([
        new Date(),
        data.sheetName,
        data.oppKey,
        data.oppName,
        data.header,
        data.value,
        hash,
        currentSnapshotId
      ]);
    }
    
    if (archiveRows.length > 0) {
      const lastRow = archiveSheet.getLastRow();
      archiveSheet.getRange(lastRow + 1, 1, archiveRows.length, 8).setValues(archiveRows);
    }
    
    PropertiesService.getScriptProperties().setProperty('LAST_SNAPSHOT_ID', currentSnapshotId);
    PropertiesService.getScriptProperties().setProperty('LAST_SNAPSHOT_TIME', new Date().toISOString());
    
    if (changesDetected.length > 0) {
      logToSheet("INFO", "Snapshot", `${changesDetected.length} mudanças detectadas entre ${lastSnapshotId} e ${currentSnapshotId}`);
      
      // Envia resumo se houver mudanças críticas
      const criticalChanges = changesDetected.filter(c => c.severity === "CRITICAL");
      if (criticalChanges.length > 0) {
        logToSheet("WARN", "Snapshot", `⚠️ ${criticalChanges.length} mudanças CRÍTICAS detectadas!`);
      }
    } else {
      logToSheet("DEBUG", "Snapshot", `Nenhuma mudança entre ${lastSnapshotId} e ${currentSnapshotId}`);
    }
    
    // Limpeza: Remove snapshots antigos (>30 dias)
    cleanupOldSnapshots_();
    
  } catch (e) {
    logToSheet("ERROR", "Snapshot", `Erro ao detectar mudanças: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove snapshots com mais de 30 dias para economizar espaço
 */
function cleanupOldSnapshots_() {
  const archiveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("🗄️ Snapshot Archive");
  if (!archiveSheet) return;
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);
  
  const allData = archiveSheet.getDataRange().getValues();
  const rowsToKeep = [allData[0]]; // Mantém header
  
  for (let i = 1; i < allData.length; i++) {
    const timestamp = allData[i][0];
    if (timestamp instanceof Date && timestamp > cutoffDate) {
      rowsToKeep.push(allData[i]);
    }
  }
  
  if (rowsToKeep.length < allData.length) {
    archiveSheet.clear();
    archiveSheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
    logToSheet("INFO", "Snapshot", `Limpeza: ${allData.length - rowsToKeep.length} snapshots antigos removidos`);
  }
}

/**
 * Análise manual de mudanças (pode ser chamada sob demanda)
 */
function analyzeRecentChanges() {
  const ui = SpreadsheetApp.getUi();
  const eventLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EVENT_LOG);
  if (!eventLog || eventLog.getLastRow() < 2) {
    ui.alert("📋 Nenhum evento registrado ainda.");
    return;
  }
  
  const allData = eventLog.getDataRange().getValues();
  const headers = allData[0];
  
  // Últimas 24 horas
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  
  let criticalCount = 0;
  let warnCount = 0;
  let infoCount = 0;
  const dealChanges = new Map(); // oppName -> count
  
  for (let i = 1; i < allData.length; i++) {
    const timestamp = allData[i][0];
    const severity = allData[i][4];
    const oppName = allData[i][8];
    const source = allData[i][1];
    
    if (timestamp instanceof Date && timestamp > cutoff && source === "SNAPSHOT_TRACKING") {
      if (severity === "CRITICAL") criticalCount++;
      else if (severity === "WARN") warnCount++;
      else infoCount++;
      
      if (oppName) {
        dealChanges.set(oppName, (dealChanges.get(oppName) || 0) + 1);
      }
    }
  }
  
  let report = `📊 MUDANÇAS NAS ÚLTIMAS 24H (via Snapshot Tracking)\n\n`;
  report += `🔴 Críticas: ${criticalCount}\n`;
  report += `⚠️ Avisos: ${warnCount}\n`;
  report += `ℹ️ Informativas: ${infoCount}\n\n`;
  
  if (dealChanges.size > 0) {
    report += `🎯 Deals com mais mudanças:\n`;
    const sorted = Array.from(dealChanges.entries()).sort((a, b) => b[1] - a[1]);
    sorted.slice(0, 10).forEach(([name, count]) => {
      report += `  • ${name}: ${count} mudanças\n`;
    });
  }
  
  ui.alert("Análise de Mudanças", report, ui.ButtonSet.OK);
  logToSheet("INFO", "Snapshot", "Análise manual executada");
}

/**
 * Detecta anomalias avançadas usando análise estatística multi-dimensional
 */
function detectAdvancedAnomalies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventLog = ss.getSheetByName(SHEETS.EVENT_LOG);
  
  if (!eventLog || eventLog.getLastRow() < 10) {
    safeAlert_("Dados insuficientes para análise estatística (mínimo 10 eventos).");
    return;
  }

  const data = eventLog.getDataRange().getValues();
  const headers = data[0];
  const events = data.slice(1);

  // Preparar datasets por tipo de mudança
  const valueChanges = [];
  const probabilityChanges = [];
  const stageChanges = [];
  const activityGaps = [];

  events.forEach(row => {
    const field = normText_(row[8] || "");
    const oldVal = row[9];
    const newVal = row[10];
    const timestamp = new Date(row[1]);

    if (field.includes("valor") || field.includes("gross") || field.includes("amount")) {
      const oldMoney = parseMoney(oldVal);
      const newMoney = parseMoney(newVal);
      if (oldMoney > 0) {
        const pctChange = ((newMoney - oldMoney) / oldMoney) * 100;
        valueChanges.push({ timestamp, value: pctChange, opp: row[5] });
      }
    }

    if (field.includes("probabilidad") || field.includes("probability")) {
      const oldProb = parsePercentage(oldVal);
      const newProb = parsePercentage(newVal);
      const diff = newProb - oldProb;
      probabilityChanges.push({ timestamp, value: diff, opp: row[5] });
    }

    if (field.includes("fase") || field.includes("stage")) {
      stageChanges.push({ timestamp, opp: row[5], old: oldVal, new: newVal });
    }
  });

  // Análise estatística
  const anomalies = [];

  // 1. VALUE CHANGES - detectar mudanças extremas
  if (valueChanges.length >= 5) {
    const valueStats = calculateStatistics_(valueChanges.map(v => v.value));
    valueChanges.forEach(change => {
      const anomaly = detectAnomaly_(change.value, valueStats);
      if (anomaly.isAnomaly) {
        anomalies.push({
          type: "VALUE_ANOMALY",
          severity: anomaly.severity,
          opp: change.opp,
          message: `Mudança de valor ${change.value > 0 ? '+' : ''}${Math.round(change.value)}% (Z-score: ${anomaly.zScore})`,
          timestamp: change.timestamp
        });
      }
    });
  }

  // 2. PROBABILITY CHANGES - detectar reversões anormais
  if (probabilityChanges.length >= 5) {
    const probStats = calculateStatistics_(probabilityChanges.map(p => p.value));
    probabilityChanges.forEach(change => {
      if (change.value < -20) { // Queda brusca de probabilidade
        const anomaly = detectAnomaly_(change.value, probStats);
        if (anomaly.isAnomaly || change.value < -30) {
          anomalies.push({
            type: "PROBABILITY_DROP",
            severity: change.value < -40 ? "CRITICAL" : "HIGH",
            opp: change.opp,
            message: `Probabilidade caiu ${Math.round(change.value)}% (Z-score: ${anomaly.zScore})`,
            timestamp: change.timestamp
          });
        }
      }
    });
  }

  // 3. STAGE REGRESSION - mudança de fase para trás
  const stageOrder = ["prospeccao", "qualificacao", "proposta", "negociacao", "fechamento"];
  stageChanges.forEach(change => {
    const oldIdx = stageOrder.findIndex(s => normText_(change.old).includes(s));
    const newIdx = stageOrder.findIndex(s => normText_(change.new).includes(s));
    if (oldIdx > -1 && newIdx > -1 && newIdx < oldIdx) {
      anomalies.push({
        type: "STAGE_REGRESSION",
        severity: "HIGH",
        opp: change.opp,
        message: `Fase regrediu: ${change.old} → ${change.new}`,
        timestamp: change.timestamp
      });
    }
  });

  // 4. TIME-SERIES FORECAST para detecção de tendências
  if (valueChanges.length >= 5) {
    const forecast = forecastTimeSeries_(valueChanges.slice(-10));
    if (forecast.trend === "DECLINING" && forecast.confidence > 60) {
      anomalies.push({
        type: "TREND_ALERT",
        severity: "MEDIUM",
        opp: "PORTFOLIO",
        message: `Tendência de QUEDA detectada em valores (confiança: ${forecast.confidence}%)`,
        timestamp: new Date()
      });
    }
  }

  // Criar relatório
  const reportSheet = ss.getSheetByName("🔍 Anomalias Estatísticas") || 
    ss.insertSheet("🔍 Anomalias Estatísticas");
  
  reportSheet.clear();
  reportSheet.getRange(1, 1, 1, 6).setValues([[
    "Timestamp", "Tipo", "Severidade", "Oportunidade", "Mensagem", "Z-Score/Método"
  ]]).setFontWeight("bold").setBackground("#1a73e8").setFontColor("white");

  if (anomalies.length > 0) {
    const sorted = anomalies.sort((a, b) => {
      const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

    const rows = sorted.map(a => [
      formatDateRobust(a.timestamp),
      a.type,
      a.severity,
      a.opp,
      a.message,
      a.method || "-"
    ]);

    reportSheet.getRange(2, 1, rows.length, 6).setValues(rows);
    
    // Formatação condicional
    reportSheet.getRange(2, 3, rows.length, 1).applyRowBanding();
    
    safeAlert_(`🔍 ${anomalies.length} anomalias detectadas!\n\nVerifique a aba "🔍 Anomalias Estatísticas".`);
  } else {
    reportSheet.getRange(2, 1, 1, 6).setValues([[
      formatDateRobust(new Date()),
      "INFO",
      "NORMAL",
      "-",
      "✅ Nenhuma anomalia estatística detectada",
      "-"
    ]]);
    safeAlert_("✅ Análise concluída: nenhuma anomalia detectada.");
  }

  logToSheet("INFO", "Anomaly", `Análise estatística detectou ${anomalies.length} anomalias`);
}

/**
 * Garante aba de padrões de mudança
 */
function ensureChangePatternSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("📊 Padrões de Mudança");
  
  if (!sheet) {
    sheet = ss.insertSheet("📊 Padrões de Mudança");
    const headers = [[
      "Aba", "Campo", "Oportunidade", "Qtd Mudanças", "Última Mudança",
      "Valor Anterior", "Valor Atual", "Padrão Detectado", "Score Risco"
    ]];
    sheet.getRange(1, 1, 1, 9).setValues(headers)
      .setBackground("#674ea7").setFontColor("white").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * Atualiza padrão de mudança (agregação incremental)
 */
function updateChangePattern_(sheetName, fieldName, oppName, oldValue, newValue) {
  try {
    const sheet = ensureChangePatternSheet_();
    const data = sheet.getDataRange().getValues();
    
    const key = `${sheetName}|${fieldName}|${oppName}`;
    let found = false;
    let rowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      const rowKey = `${data[i][0]}|${data[i][1]}|${data[i][2]}`;
      if (rowKey === key) {
        found = true;
        rowIndex = i + 1;
        break;
      }
    }
    
    const now = new Date();
    const pattern = detectPattern_(fieldName, oldValue, newValue, found ? data[rowIndex - 1][3] : 0);
    const riskScore = calculateRiskScore_(fieldName, pattern, found ? data[rowIndex - 1][3] + 1 : 1);
    
    if (found) {
      const currentCount = data[rowIndex - 1][3] || 0;
      sheet.getRange(rowIndex, 4, 1, 6).setValues([[
        currentCount + 1,
        now,
        String(oldValue).substring(0, 100),
        String(newValue).substring(0, 100),
        pattern,
        riskScore
      ]]);
    } else {
      sheet.appendRow([
        sheetName,
        fieldName,
        oppName,
        1,
        now,
        String(oldValue).substring(0, 100),
        String(newValue).substring(0, 100),
        pattern,
        riskScore
      ]);
    }
    
  } catch (e) {
    logToSheet("ERROR", "Pattern", e.message);
  }
}

/**
 * Analisa padrões de mudança e gera insights
 */
function analyzeChangePatterns() {
  const sheet = ensureChangePatternSheet_();
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    safeAlert_("Nenhum padrão de mudança registrado ainda.");
    return;
  }
  
  const insights = [];
  const highRiskDeals = [];
  const recurrentChanges = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const riskScore = row[8] || 0;
    const changeCount = row[3] || 0;
    const pattern = row[7] || "";
    
    if (riskScore >= 50) {
      highRiskDeals.push({
        opp: row[2],
        field: row[1],
        pattern: pattern,
        score: riskScore
      });
    }
    
    if (changeCount >= 5) {
      recurrentChanges.push({
        opp: row[2],
        field: row[1],
        count: changeCount
      });
    }
  }
  
  insights.push(`📊 Total de padrões monitorados: ${data.length - 1}`);
  insights.push(`🔴 Deals de alto risco: ${highRiskDeals.length}`);
  insights.push(`🔄 Campos com mudanças recorrentes: ${recurrentChanges.length}`);
  
  if (highRiskDeals.length > 0) {
    insights.push("\n🚨 TOP DEALS DE RISCO:");
    highRiskDeals.slice(0, 5).forEach(d => {
      insights.push(`  • ${d.opp} - ${d.field}: ${d.pattern} (Score: ${d.score})`);
    });
  }
  
  const ui = SpreadsheetApp.getUi();
  ui.alert("📊 Análise de Padrões de Mudança", insights.join("\n"), ui.ButtonSet.OK);
  
  logToSheet("INFO", "Patterns", `Análise: ${highRiskDeals.length} alto risco, ${recurrentChanges.length} recorrentes`);
}

/**
 * Detecta anomalias em tempo real
 */
function detectChangeAnomalies() {
  const eventLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EVENT_LOG);
  if (!eventLog || eventLog.getLastRow() < 2) {
    safeAlert_("Nenhum evento para analisar.");
    return;
  }
  
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600 * 1000);
  
  const data = eventLog.getDataRange().getValues();
  const recentEvents = data.slice(1).filter(row => {
    const ts = new Date(row[1]);
    return ts >= last24h;
  });
  
  const anomalies = [];
  const criticalEvents = recentEvents.filter(e => e[17] === "CRITICAL");
  
  if (criticalEvents.length > 10) {
    anomalies.push(`⚠️ ${criticalEvents.length} eventos CRITICAL nas últimas 24h`);
  }
  
  const fieldChanges = {};
  recentEvents.forEach(e => {
    const field = e[8];
    fieldChanges[field] = (fieldChanges[field] || 0) + 1;
  });
  
  Object.keys(fieldChanges).forEach(field => {
    if (fieldChanges[field] > 20) {
      anomalies.push(`🔄 Campo "${field}" alterado ${fieldChanges[field]}x (possível edição em massa)`);
    }
  });
  
  if (anomalies.length === 0) {
    safeAlert_("✅ Nenhuma anomalia detectada nas últimas 24h.");
  } else {
    const ui = SpreadsheetApp.getUi();
    ui.alert("🚨 Anomalias Detectadas", anomalies.join("\n\n"), ui.ButtonSet.OK);
  }
  
  logToSheet("INFO", "Anomalies", `${anomalies.length} anomalias detectadas`);
}

/**
 * Analisa mudanças registradas pelo sales connector (INCREMENTAL - só processa linhas novas)
 * Processa 3 abas: Alteracoes_Oportunidade, Historico_Ganhos, Historico_Perdidas
 */
function analyzeConnectorChanges() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  
  ensureChangePatternSheet_();
  
  const sheetConfigs = [
    { name: 'Alteracoes_Oportunidade', mode: 'OPEN', propKey: 'LAST_PROCESSED_ROW_ALTERACOES' },
    { name: 'Historico_Ganhos', mode: 'WON', propKey: 'LAST_PROCESSED_ROW_GANHOS' },
    { name: 'Historico_Perdidas', mode: 'LOST', propKey: 'LAST_PROCESSED_ROW_PERDIDAS' }
  ];
  
  let totalProcessed = 0;
  let totalNew = 0;
  const allChanges = {};
  
  for (const config of sheetConfigs) {
    const sheet = ss.getSheetByName(config.name);
    
    if (!sheet) {
      logToSheet('WARN', 'ChangeTrack', `Aba ${config.name} não encontrada`);
      continue;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) continue;
    
    const lastProcessed = parseInt(props.getProperty(config.propKey) || '1');
    
    if (lastRow <= lastProcessed) {
      logToSheet('INFO', 'ChangeTrack', `${config.name}: nenhuma linha nova (última: ${lastProcessed})`);
      continue;
    }
    
    const newRowsCount = lastRow - lastProcessed;
    const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = data[0];
    
    const oppNameIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPORTUNIDADE') || norm.includes('OPPORTUNITY') || norm.includes('NOME');
    });
    
    const fieldIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('CAMPO') || norm.includes('FIELD') || norm.includes('ALTERADO');
    });
    
    const oldValIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('ANTERIOR') || norm.includes('OLD') || norm.includes('FROM');
    });
    
    const newValIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('NOVO') || norm.includes('NEW') || norm.includes('TO');
    });
    
    const dateIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('DATA') || norm.includes('DATE') || norm.includes('TIMESTAMP');
    });
    
    if (oppNameIdx === -1) {
      logToSheet('ERROR', 'ChangeTrack', `${config.name}: coluna OPORTUNIDADE não encontrada`);
      continue;
    }
    
    // Processa apenas linhas novas
    for (let i = lastProcessed; i < lastRow; i++) {
      const row = data[i];
      const oppName = row[oppNameIdx];
      
      if (!oppName) continue;
      
      const field = fieldIdx !== -1 ? row[fieldIdx] : 'Campo Desconhecido';
      const oldVal = oldValIdx !== -1 ? row[oldValIdx] : '';
      const newVal = newValIdx !== -1 ? row[newValIdx] : '';
      const date = dateIdx !== -1 ? row[dateIdx] : new Date();
      
      if (!allChanges[oppName]) {
        allChanges[oppName] = {
          mode: config.mode,
          fields: {},
          totalChanges: 0,
          critical: 0,
          high: 0,
          lastChange: date,
          sources: new Set()
        };
      }
      
      allChanges[oppName].sources.add(config.name);
      
      const severity = categorizeChangeSeverity_(config.name, field, oldVal, newVal);
      
      allChanges[oppName].totalChanges++;
      if (severity === 'CRITICAL') allChanges[oppName].critical++;
      if (severity === 'WARN') allChanges[oppName].high++;
      
      allChanges[oppName].fields[field] = (allChanges[oppName].fields[field] || 0) + 1;
      
      if (new Date(date) > new Date(allChanges[oppName].lastChange)) {
        allChanges[oppName].lastChange = date;
      }
      
      totalNew++;
    }
    
    props.setProperty(config.propKey, lastRow.toString());
    totalProcessed += newRowsCount;
    
    logToSheet('INFO', 'ChangeTrack', `${config.name}: processadas ${newRowsCount} linhas novas (${lastProcessed} → ${lastRow})`);
  }
  
  if (totalNew === 0) {
    safeAlert_('ℹ️ Nenhuma mudança nova encontrada.\n\nTodas as abas estão atualizadas.');
    return;
  }
  
  // Converte Set para Array antes de atualizar
  Object.keys(allChanges).forEach(key => {
    allChanges[key].sources = Array.from(allChanges[key].sources);
  });
  
  updateChangePatternSheetFromConnector_(allChanges);
  
  const highRisk = Object.keys(allChanges).filter(k => allChanges[k].critical >= 2).length;
  
  safeAlert_(`✅ Processamento incremental concluído!\n\n📊 ${totalNew} mudanças novas processadas\n🔍 ${Object.keys(allChanges).length} oportunidades afetadas\n⚠️ ${highRisk} com mudanças críticas\n\nVerifique a aba "📊 Padrões de Mudança".`);
  
  logToSheet('INFO', 'ChangeTrack', `Incremental: ${totalNew} mudanças, ${Object.keys(allChanges).length} opps, ${highRisk} alto risco`);
}

/**
 * Atualiza aba de padrões com dados do connector (3 abas: OPEN, WON, LOST)
 */
function updateChangePatternSheetFromConnector_(changeMap) {
  const sheet = ensureChangePatternSheet_();
  
  // Limpa dados antigos (exceto header)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  const rows = [];
  
  for (let oppName in changeMap) {
    const data = changeMap[oppName];
    const mostChanged = Object.keys(data.fields).reduce((a, b) => 
      data.fields[a] > data.fields[b] ? a : b, Object.keys(data.fields)[0] || 'N/A'
    );
    
    const riskScore = calculateRiskScore_(mostChanged, 'AUTO', data.totalChanges);
    const pattern = detectPattern_(mostChanged, '', '', data.totalChanges);
    
    const alert = data.critical >= 2 ? `⚠️ ${data.critical} mudanças críticas` : '';
    
    // Fontes: quais abas registraram mudanças
    const sources = Array.isArray(data.sources) ? data.sources.join(', ') : (data.sources || 'N/A');
    
    // Emoji por modo
    const modeEmoji = data.mode === 'OPEN' ? '🔵' : (data.mode === 'WON' ? '🟢' : '🔴');
    
    rows.push([
      sources,
      mostChanged,
      `${modeEmoji} ${oppName}`,
      data.totalChanges,
      data.lastChange,
      `-`,
      `-`,
      pattern,
      riskScore
    ]);
  }
  
  if (rows.length > 0) {
    rows.sort((a, b) => b[8] - a[8]); // Ordena por risk score
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    
    // Aplica formatação condicional
    const riskScoreRange = sheet.getRange(2, 9, rows.length, 1);
    riskScoreRange.setNumberFormat("0");
    
    // Destaca alto risco (score >= 50)
    rows.forEach((row, idx) => {
      if (row[8] >= 50) {
        sheet.getRange(idx + 2, 1, 1, 9).setBackground("#f4cccc");
      } else if (row[8] >= 30) {
        sheet.getRange(idx + 2, 1, 1, 9).setBackground("#fff2cc");
      }
    });
  }
}

/**
 * Reseta contadores de processamento incremental (processa tudo novamente)
 */
function resetChangeTrackingCounters() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '⚠️ Resetar Processamento Incremental?',
    'Isso fará com que TODAS as linhas das abas de mudanças sejam reprocessadas na próxima execução.\n\nDeseja continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('LAST_PROCESSED_ROW_ALTERACOES');
  props.deleteProperty('LAST_PROCESSED_ROW_GANHOS');
  props.deleteProperty('LAST_PROCESSED_ROW_PERDIDAS');
  
  safeAlert_('✅ Contadores resetados!\n\nNa próxima execução, todas as mudanças serão reprocessadas.');
  logToSheet('INFO', 'ChangeTrack', 'Contadores incrementais resetados');
}

/**
 * Exibe informações sobre o sistema de Change Tracking
 */
function showChangeTrackingInfo() {
  const msg = `ℹ️ CHANGE TRACKING - Como Funciona

📌 IMPORTANTE: Sistema INCREMENTAL redesenhado para SALES CONNECTOR.

🔄 Como usar:
1. Menu > Change Tracking > "Analisar Mudanças do Connector"
2. O sistema lê 3 abas de histórico:
   • Alteracoes_Oportunidade (Pipeline OPEN)
   • Historico_Ganhos (Deals WON)
   • Historico_Perdidas (Deals LOST)
3. Processa APENAS linhas novas (incremental)
4. Gera análise na aba "📊 Padrões de Mudança"

🎯 Processamento Incremental:
• Sistema salva última linha processada
• Próximas execuções só processam novos registros
• Para reprocessar tudo: Menu > Reset Contadores

📊 O que é analisado:
• 🔵 OPEN: Mudanças em Fase, Data, Valor, Probabilidade
• 🟢 WON: Padrões de vitória, motivos, ciclo
• 🔴 LOST: Padrões de perda, causas raiz

⚠️ Classificação de Risco:
• CRITICAL: Mudanças de fase, valor >25%, data >30 dias
• HIGH: Troca de responsável, valor >10%, data >7 dias
• MEDIUM/LOW: Outras alterações

📈 Funcionalidades:
• Ver Padrões: Resumo executivo de mudanças
• Detectar Anomalias: Identifica comportamentos atípicos
• Reset Contadores: Reprocessa tudo do zero

⚙️ Requisitos:
✅ 3 abas configuradas no sales connector
✅ Colunas esperadas: OPORTUNIDADE, CAMPO, VALOR_ANTERIOR, VALOR_NOVO, DATA`;

  safeAlert_(msg);
}

/**
 * ATIVAR AUTO-SYNC UNIVERSAL
 * Monitora mudanças em TODAS as análises (Open, Won, Lost) e reprocessa automaticamente
 */
function ativarAutoSync() {
  const ui = SpreadsheetApp.getUi();
  
  // Força criação da aba de logs no início
  logToSheet("INFO", "Sistema", "Iniciando ativação Auto-Sync");
  flushLogs_();
  
  const response = ui.alert(
    '🤖 Ativar Sistema Auto-Sync',
    'Este sistema monitora automaticamente:\n\n' +
    '✅ Pipeline (Open) - Novas oportunidades e mudanças\n' +
    '✅ Ganhos (Won) - Histórico de vitórias\n' +
    '✅ Perdas (Lost) - Histórico de perdas\n' +
    '✅ Atividades e Alterações de todas as fontes\n\n' +
    '⚡ Frequência: A cada 30 minutos\n' +
    'Processamento: Apenas dados novos (incremental)\n' +
    'Proteção: Lock anti-concorrência\n' +
    'Nunca apaga dados existentes\n\n' +
    'Deseja ativar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  try {
    // Remove triggers antigos (proteção contra duplicatas)
    const triggers = ScriptApp.getProjectTriggers();
    let removedSync = 0;
    
    triggers.forEach(trigger => {
      const funcName = trigger.getHandlerFunction();
      if (funcName === 'autoSyncPipelineExecution') {
        ScriptApp.deleteTrigger(trigger);
        removedSync++;
      }
    });
    
    console.log(`🗑️ Removidos ${removedSync} trigger(s) de sync`);
    
    // Cria trigger: 30 minutos para sync
    ScriptApp.newTrigger('autoSyncPipelineExecution')
      .timeBased()
      .everyMinutes(30)
      .create();
    
    console.log('✅ Trigger criado: Sync a cada 30 min');
    
    // Salva configuração
    const props = PropertiesService.getScriptProperties();
    props.setProperty('AUTO_SYNC_ENABLED', 'TRUE');
    props.setProperty('AUTO_SYNC_ACTIVATED_AT', new Date().toISOString());
    
    // Executa primeira sincronização e pré-processamento
    ui.alert(
      '⏳ Primeira Sincronização',
      'Executando:\n• Verificação de dados\n\nIsso pode levar alguns segundos.',
      ui.ButtonSet.OK
    );
    
    // Executa sync
    autoSyncPipelineExecution();
    
    ui.alert(
      '✅ Sistema Ativado com Sucesso!',
      '🤖 Auto-Sync configurado!\n\n' +
      '⚡ Sincronização: A cada 30 MINUTOS\n' +
      '🔍 Monitora: Open + Won + Lost + Cache\n' +
      '🔒 Proteção anti-concorrência: ATIVA\n' +
      '⚡ Modo incremental (nunca apaga dados)\n\n' +
      'Use "Verificar Status" para monitorar.',
      ui.ButtonSet.OK
    );
    
    logToSheet("INFO", "Sistema", "Auto-Sync ATIVADO (30min)");
    flushLogs_(); // Força escrita imediata
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      'Falha ao ativar auto-sync:\n\n' + error.message,
      ui.ButtonSet.OK
    );
    logToSheet("ERROR", "AutoSync", "Falha ao ativar: " + error.message);
    flushLogs_(); // Força escrita imediata
  }
}

/**
 * DESATIVAR SISTEMA (AUTO-SYNC)
 */
function desativarAutoSync() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '🛑 Desativar Sistema Completo',
    'Isso removerá:\n' +
    '• Sincronização automática (Open/Won/Lost)\n' +
    '• Forçará parada de execuções ativas\n' +
    '• Liberará todos os locks\n\n' +
    'Você poderá reprocessar manualmente quando necessário.\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  // 1. REMOVER TODOS OS TRIGGERS
  const triggers = ScriptApp.getProjectTriggers();
  let removedSync = 0;
  
  triggers.forEach(trigger => {
    const funcName = trigger.getHandlerFunction();
    if (funcName === 'autoSyncPipelineExecution') {
      ScriptApp.deleteTrigger(trigger);
      removedSync++;
    }
  });
  
  // 2. FORÇAR LIBERAÇÃO DE TODOS OS LOCKS
  const props = PropertiesService.getScriptProperties();
  const lockService = LockService.getScriptLock();
  
  // Verificar se há lock ativo
  const hadLock = props.getProperty(AUTO_SYNC_LOCK_KEY) !== null;
  
  // Forçar liberação de lock (mesmo se houver execução ativa)
  props.deleteProperty(AUTO_SYNC_LOCK_KEY);
  
  // Tentar liberar lock do LockService também
  try {
    lockService.releaseLock();
  } catch (e) {
    // Lock já estava liberado ou não pertencia a esta execução
  }
  
  // 3. MARCAR SISTEMA COMO DESATIVADO
  props.setProperty('AUTO_SYNC_ENABLED', 'FALSE');
  props.setProperty('AUTO_SYNC_DEACTIVATED_AT', new Date().toISOString());
  props.setProperty('FORCE_STOP_REQUESTED', 'TRUE'); // Flag para execuções ativas pararem
  
  const totalRemoved = removedSync;
  
  ui.alert(
    '✅ Sistema Desativado',
    (totalRemoved > 0 
      ? `${removedSync} trigger(s) de sync removido(s)\n`
      : 'Nenhum trigger estava ativo.\n') +
    (hadLock 
      ? '🔓 Lock ativo foi FORÇADAMENTE liberado.\n' 
      : '🔓 Nenhum lock estava ativo.\n') +
    '\n⚠️ Execuções ativas serão interrompidas.\n' +
    '\nSistema DESATIVADO.',
    ui.ButtonSet.OK
  );
  
  logToSheet("INFO", "Sistema", `Desativado: ${removedSync} sync | Lock forçado: ${hadLock ? 'SIM' : 'NÃO'}`);
}

/**
 * VERIFICAR STATUS DO SISTEMA (AUTO-SYNC)
 */
function verificarStatusAutoSync() {
  const triggers = ScriptApp.getProjectTriggers();
  const syncTriggers = triggers.filter(t => t.getHandlerFunction() === 'autoSyncPipelineExecution');
  const props = PropertiesService.getScriptProperties();
  
  let mensagem = '';
  
  const totalTriggers = syncTriggers.length;
  
  if (totalTriggers === 0) {
    mensagem = '❌ SISTEMA INATIVO\n\n' +
               'Não há triggers configurados.\n\n' +
               '💡 Use "Ativar Sistema" para configurar Auto-Sync.';
  } else {
    const lastSync = props.getProperty('AUTO_SYNC_LAST_RUN') || 'Nunca';
    const activatedAt = props.getProperty('AUTO_SYNC_ACTIVATED_AT') || 'Desconhecido';
    mensagem = `✅ SISTEMA ATIVO\n\n` +
               `📊 TRIGGERS CONFIGURADOS:\n` +
               `   • ${syncTriggers.length} Auto-Sync (Open/Won/Lost)\n\n` +
               `⚡ Frequência: A cada 30 MINUTOS\n` +
               `🔒 Proteção anti-concorrência: ATIVA\n\n` +
               `📅 Ativado em: ${new Date(activatedAt).toLocaleString('pt-BR')}\n` +
               `🔄 Última execução: ${lastSync !== 'Nunca' ? new Date(lastSync).toLocaleString('pt-BR') : lastSync}\n`;
  }
  
  SpreadsheetApp.getUi().alert('⏰ Status do Sistema', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * VER ÚLTIMA SINCRONIZAÇÃO (detalhes)
 */
function verUltimaSincronizacao() {
  const props = PropertiesService.getScriptProperties();
  const lastSync = props.getProperty('AUTO_SYNC_LAST_RUN');
  
  if (!lastSync) {
    SpreadsheetApp.getUi().alert(
      'ℹ️ Sem Histórico',
      'Nenhuma sincronização foi executada ainda.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }
  
  const lastChanges = props.getProperty('AUTO_SYNC_LAST_CHANGES') || '0';
  const lastNewOpps = props.getProperty('AUTO_SYNC_LAST_NEW_OPPS') || '0';
  const lastNewActivities = props.getProperty('AUTO_SYNC_LAST_NEW_ACTIVITIES') || '0';
  const lastDuration = props.getProperty('AUTO_SYNC_LAST_DURATION') || '0';
  const lastProcessed = props.getProperty('AUTO_SYNC_LAST_PROCESSED') || '0';
  
  const mensagem = `📊 ÚLTIMA SINCRONIZAÇÃO\n\n` +
                   `🕐 Executada em: ${new Date(lastSync).toLocaleString('pt-BR')}\n` +
                   `⏱️ Duração: ${lastDuration}s\n\n` +
                   `📈 DADOS PROCESSADOS:\n` +
                   `   • ${lastNewOpps} novas oportunidades\n` +
                   `   • ${lastNewActivities} novas atividades\n` +
                   `   • ${lastChanges} mudanças detectadas\n` +
                   `   • ${lastProcessed} registros reprocessados\n\n` +
                   `✅ Sistema funcionando normalmente`;
  
  SpreadsheetApp.getUi().alert('📊 Última Sincronização', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * PROCESSAR MUDANÇAS MANUALMENTE
 */
function processarMudancasManual() {
  const ui = SpreadsheetApp.getUi();
  
  ui.alert(
    '⏳ Processando Mudanças',
    'Sincronizando BASE → ANÁLISE...\n\nCriando análises faltantes e atualizando existentes.\n\nIsso pode levar alguns segundos.',
    ui.ButtonSet.OK
  );
  
  try {
    const result = autoSyncPipelineExecution();
    
    ui.alert(
      '✅ Sincronização BASE → ANÁLISE Concluída',
      `📊 Resultados:\n\n` +
      `OPEN (Pipeline → Análises_Abertas):\n` +
      `  • ${result.open.created} criadas\n` +
      `  • ${result.open.updated} atualizadas\n\n` +
      `WON (Ganhas → Análises_Ganhas):\n` +
      `  • ${result.won.created} criadas\n` +
      `  • ${result.won.updated} atualizadas\n\n` +
      `LOST (Perdidas → Análises_Perdidas):\n` +
      `  • ${result.lost.created} criadas\n` +
      `  • ${result.lost.updated} atualizadas\n\n` +
      `SALES SPECIALIST:\n` +
      `  • ${result.salesSpec ? result.salesSpec.created : 0} criadas\n` +
      `  • ${result.salesSpec ? result.salesSpec.updated : 0} atualizadas\n\n` +
      `📊 Total: ${result.totalCreated} criadas, ${result.totalUpdated} atualizadas\n` +
      `⏱️ Duração: ${result.duration}s`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      'Falha ao processar mudanças:\n\n' + error.message,
      ui.ButtonSet.OK
    );
  }
}

/**
 * LIMPAR LOCK TRAVADO (Utilitário de Manutenção)
 * Remove locks que podem ter ficado travados por erros ou timeouts
 */
function limparLockAutoSync() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  
  const lockTimestamp = props.getProperty(AUTO_SYNC_LOCK_KEY);
  
  if (!lockTimestamp) {
    ui.alert(
      'ℹ️ Sem Lock Ativo',
      'Não há nenhum lock travado no momento.\n\nO sistema está operando normalmente.',
      ui.ButtonSet.OK
    );
    return;
  }
  
  const lockAge = new Date().getTime() - parseInt(lockTimestamp);
  const lockAgeMin = Math.round(lockAge / 60000);
  
  const response = ui.alert(
    '🔓 Limpar Lock Travado',
    `Detectado lock ativo há ${lockAgeMin} minuto(s).\n\n` +
    `Isso pode indicar que uma sincronização anterior:\n` +
    `• Foi interrompida por timeout\n` +
    `• Encontrou um erro fatal\n` +
    `• Ainda está rodando\n\n` +
    `Deseja FORÇAR a limpeza do lock?`,
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    props.deleteProperty(AUTO_SYNC_LOCK_KEY);
    ui.alert(
      '✅ Lock Limpo',
      `Lock removido com sucesso!\n\n` +
      `O auto-sync poderá executar normalmente na próxima rodada.`,
      ui.ButtonSet.OK
    );
    logToSheet("INFO", "AutoSync", `Lock manual limpo após ${lockAgeMin}min`);
  }
}

/**
 * CORREÇÃO DE CHANGE TRACKING PARA DEALS FECHADOS (WON/LOST)
 * Recalcula campos de mudanças lendo do histórico correto
 */
function corrigirChangeTrackingClosedDeals() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '🔧 Corrigir Change Tracking',
    'Esta função irá recalcular os campos de mudanças (# Total Mudanças, # Mudanças Críticas, etc.) ' +
    'para TODAS as análises de Ganhas e Perdidas.\n\n' +
    'Isso pode levar alguns minutos.\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  try {
    ui.alert(
      '⏳ Processando...',
      'Recalculando change tracking para Ganhas e Perdidas.\n\nAguarde...',
      ui.ButtonSet.OK
    );
    
    const result = recalcularChangeTrackingClosedDeals_();
    
    ui.alert(
      '✅ Correção Concluída',
      `Change tracking recalculado com sucesso!\n\n` +
      `Ganhas: ${result.wonUpdated} linhas atualizadas\n` +
      `Perdidas: ${result.lostUpdated} linhas atualizadas\n\n` +
      `Total: ${result.wonUpdated + result.lostUpdated} análises corrigidas`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      'Falha ao corrigir change tracking:\n\n' + error.message,
      ui.ButtonSet.OK
    );
  }
}

/**
 * CORRIGIR DATAS DE FECHAMENTO (WON/LOST)
 * Atualiza as datas de fechamento para usar a data da última mudança de fase
 */
function corrigirDatasFechamentoClosedDeals() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '📅 Corrigir Datas de Fechamento',
    'Esta função irá atualizar as datas de fechamento de Ganhas e Perdidas ' +
    'para usar a data REAL da última mudança de fase.\n\n' +
    'Processará TODAS as linhas das abas de análise.\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  try {
    ui.alert(
      '⏳ Processando...',
      'Recalculando datas de fechamento para Ganhas e Perdidas.\n\nAguarde...',
      ui.ButtonSet.OK
    );
    
    const result = recalcularDatasFechamento_();
    
    ui.alert(
      '✅ Correção Concluída',
      `Datas de fechamento atualizadas com sucesso!\n\n` +
      `Ganhas: ${result.wonUpdated} datas corrigidas\n` +
      `Perdidas: ${result.lostUpdated} datas corrigidas\n` +
      `Sem mudanças: ${result.skipped} (sem histórico de fase)\n\n` +
      `Ciclos também foram recalculados automaticamente!\n\n` +
      `Total processado: ${result.wonUpdated + result.lostUpdated + result.skipped}\n\n` +
      `⚠️ Verifique os logs (View > Logs) para diagnóstico se tiver muitos skips.`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      'Falha ao corrigir datas:\n\n' + error.message,
      ui.ButtonSet.OK
    );
  }
}

/**
 * ATUALIZAR TIMESTAMPS MANUALMENTE
 * Preenche timestamps vazios com data retroativa
 */
function atualizarTimestampsManual() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '⏰ Atualizar Timestamps',
    'Esta função irá:\n\n' +
    '1. Detectar células vazias na coluna "🕐 Última Atualização"\n' +
    '2. Preencher com data retroativa (30/01/2026 19:00)\n' +
    '3. Processar TODAS as abas de análise (Open, Ganhas, Perdidas)\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  try {
    let totalUpdated = 0;
    const retroDate = new Date(2026, 0, 30, 19, 0, 0);
    
    // Processar cada modo
    const modes = ['OPEN', 'WON', 'LOST'];
    const results = {};
    
    for (const mode of modes) {
      const updated = adicionarTimestampRetroativo_(mode, retroDate);
      results[mode] = updated;
      totalUpdated += updated;
    }
    
    ui.alert(
      '✅ Timestamps Atualizados',
      `Timestamps retroativos adicionados com sucesso!\n\n` +
      `📊 Open (Pipeline): ${results.OPEN} células\n` +
      `✅ Ganhas: ${results.WON} células\n` +
      `❌ Perdidas: ${results.LOST} células\n\n` +
      `Total: ${totalUpdated} timestamps adicionados\n` +
      `Data: 30/01/2026 19:00:00`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      'Falha ao atualizar timestamps:\n\n' + error.message,
      ui.ButtonSet.OK
    );
  }
}

/**
 * DIAGNÓSTICO: Verificar alterações para oportunidades perdidas
 * Execute esta função diretamente no Editor do Apps Script
 */
function diagnosticarAlteracoesPerdidasDEBUG() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  console.log('=== DIAGNÓSTICO: ALTERAÇÕES DE OPORTUNIDADES PERDIDAS ===\n');
  
  // 1. Verificar aba de Análise Perdidas
  const perdidasSheet = ss.getSheetByName('📉 Análise Perdidas');
  if (!perdidasSheet) {
    console.log('❌ Aba "📉 Análise Perdidas" NÃO ENCONTRADA');
    return;
  }
  
  const perdidasRows = perdidasSheet.getLastRow();
  console.log(`✅ Aba "📉 Análise Perdidas": ${perdidasRows} linhas (incluindo header)`);
  
  if (perdidasRows < 2) {
    console.log('⚠️ Aba vazia (só header)');
    return;
  }
  
  // 2. Verificar aba de Alterações
  const alteracoesSheet = ss.getSheetByName('Alteracoes_Oportunidade');
  if (!alteracoesSheet) {
    console.log('❌ Aba "Alteracoes_Oportunidade" NÃO ENCONTRADA');
    return;
  }
  
  const alteracoesRows = alteracoesSheet.getLastRow();
  console.log(`✅ Aba "Alteracoes_Oportunidade": ${alteracoesRows} linhas (incluindo header)\n`);
  
  if (alteracoesRows < 2) {
    console.log('⚠️ Aba de alterações vazia (só header)');
    return;
  }
  
  // 3. Carregar headers e dados
  const perdidasData = perdidasSheet.getDataRange().getValues();
  const perdidasHeaders = perdidasData[0];
  
  const alteracoesData = alteracoesSheet.getDataRange().getValues();
  const alteracoesHeaders = alteracoesData[0];
  
  console.log('📋 Headers de Análise Perdidas:');
  console.log('   ' + perdidasHeaders.slice(0, 5).join(' | '));
  
  console.log('\n📋 Headers de Alteracoes_Oportunidade:');
  console.log('   ' + alteracoesHeaders.join(' | '));
  
  // 4. Encontrar coluna de oportunidade
  const perdidasOppIdx = perdidasHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
  console.log(`\n🔍 Coluna "Oportunidade" em Perdidas: índice ${perdidasOppIdx} (${perdidasHeaders[perdidasOppIdx] || 'NÃO ENCONTRADO'})`);
  
  let alteracoesOppIdx = alteracoesHeaders.findIndex(h => {
    const norm = normText_(String(h));
    return norm.includes('OPPORTUNITY') && norm.includes('NAME');
  });
  
  if (alteracoesOppIdx === -1) {
    alteracoesOppIdx = alteracoesHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
  }
  
  console.log(`🔍 Coluna "Oportunidade" em Alterações: índice ${alteracoesOppIdx} (${alteracoesHeaders[alteracoesOppIdx] || 'NÃO ENCONTRADO'})`);
  
  if (perdidasOppIdx === -1 || alteracoesOppIdx === -1) {
    console.log('\n❌ ERRO: Não foi possível encontrar a coluna de oportunidade em uma das abas');
    return;
  }
  
  // 5. Indexar alterações por oportunidade
  const alteracoesMap = new Map();
  for (let i = 1; i < alteracoesData.length; i++) {
    const oppName = normText_(String(alteracoesData[i][alteracoesOppIdx] || ''));
    if (oppName) {
      if (!alteracoesMap.has(oppName)) {
        alteracoesMap.set(oppName, []);
      }
      alteracoesMap.get(oppName).push(alteracoesData[i]);
    }
  }
  
  console.log(`\n📦 Total de oportunidades únicas em Alterações: ${alteracoesMap.size}`);
  
  // Mostrar 5 exemplos
  console.log('\n📝 Exemplos de oportunidades em Alterações:');
  const sampleKeys = Array.from(alteracoesMap.keys()).slice(0, 5);
  sampleKeys.forEach((key, idx) => {
    console.log(`   ${idx + 1}. "${key}" (${alteracoesMap.get(key).length} alterações)`);
  });
  
  // 6. Processar oportunidades perdidas
  let comAlteracoes = 0;
  let semAlteracoes = 0;
  
  console.log('\n🔍 Processando oportunidades perdidas...\n');
  
  for (let i = 1; i < Math.min(perdidasData.length, 11); i++) { // Mostrar até 10 primeiras
    const oppNameRaw = String(perdidasData[i][perdidasOppIdx] || '');
    const oppName = normText_(oppNameRaw);
    const alteracoes = alteracoesMap.get(oppName) || [];
    
    console.log(`${i}. "${oppNameRaw}"`);
    console.log(`   Normalizado: "${oppName}"`);
    console.log(`   Alterações encontradas: ${alteracoes.length}`);
    
    if (alteracoes.length > 0) {
      comAlteracoes++;
    } else {
      semAlteracoes++;
    }
  }
  
  // 7. Estatísticas completas
  console.log('\n📊 ESTATÍSTICAS COMPLETAS:');
  
  let totalComAlteracoes = 0;
  let totalSemAlteracoes = 0;
  
  for (let i = 1; i < perdidasData.length; i++) {
    const oppName = normText_(String(perdidasData[i][perdidasOppIdx] || ''));
    const alteracoes = alteracoesMap.get(oppName) || [];
    
    if (alteracoes.length > 0) {
      totalComAlteracoes++;
    } else {
      totalSemAlteracoes++;
    }
  }
  
  console.log(`   Total de oportunidades perdidas: ${perdidasData.length - 1}`);
  console.log(`   ✅ Com alterações: ${totalComAlteracoes}`);
  console.log(`   ❌ Sem alterações: ${totalSemAlteracoes}`);
  console.log(`   📈 Taxa de cobertura: ${((totalComAlteracoes / (perdidasData.length - 1)) * 100).toFixed(1)}%`);
  
  console.log('\n=== FIM DO DIAGNÓSTICO ===');
}

/**
 * SIMULADOR DE ALTERAÇÕES DE OPORTUNIDADE
 * Permite testar o sistema de detecção de mudanças sem esperar pelo Sales Connector
 */
function simularAlteracaoOportunidade() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Selecionar análise
  const analiseResponse = ui.alert(
    '🧪 Simulador de Alterações',
    'Qual análise deseja testar?\n\n' +
    '• OPEN - Pipeline de oportunidades abertas\n' +
    '• WON - Histórico de ganhos\n' +
    '• LOST - Histórico de perdas\n\n' +
    'Digite: OPEN, WON ou LOST',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (analiseResponse !== ui.Button.OK) return;
  
  const analise = ui.prompt(
    'Tipo de Análise',
    'Digite OPEN, WON ou LOST:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (analise.getSelectedButton() !== ui.Button.OK) return;
  
  const tipo = analise.getResponseText().toUpperCase().trim();
  
  if (!['OPEN', 'WON', 'LOST'].includes(tipo)) {
    ui.alert('❌ Tipo inválido. Use OPEN, WON ou LOST');
    return;
  }
  
  // 2. Obter sheet correspondente
  const sheetNames = {
    'OPEN': SHEETS.ABERTO,
    'WON': SHEETS.GANHAS,
    'LOST': SHEETS.PERDIDAS
  };
  
  const sourceSheet = ss.getSheetByName(sheetNames[tipo]);
  
  if (!sourceSheet || sourceSheet.getLastRow() < 2) {
    ui.alert('❌ Nenhuma oportunidade encontrada nesta análise');
    return;
  }
  
  // 3. Listar primeiras 10 oportunidades
  const data = sourceSheet.getRange(2, 1, Math.min(10, sourceSheet.getLastRow() - 1), sourceSheet.getLastColumn()).getValues();
  const headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
  const oppNameIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY') || normText_(String(h)).includes('OPORTUNIDADE'));
  
  if (oppNameIdx === -1) {
    ui.alert('❌ Coluna de nome de oportunidade não encontrada');
    return;
  }
  
  const oppsList = data.map((row, idx) => `${idx + 1}. ${row[oppNameIdx]}`).join('\n');
  
  const oppChoice = ui.prompt(
    'Selecionar Oportunidade',
    `Primeiras oportunidades disponíveis:\n\n${oppsList}\n\nDigite o número da oportunidade:`,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (oppChoice.getSelectedButton() !== ui.Button.OK) return;
  
  const oppIndex = parseInt(oppChoice.getResponseText()) - 1;
  
  if (oppIndex < 0 || oppIndex >= data.length) {
    ui.alert('❌ Número inválido');
    return;
  }
  
  const selectedOpp = String(data[oppIndex][oppNameIdx]);
  
  // 4. Simular detecção de mudança
  ui.alert(
    '🔄 Simulando Alteração',
    `Oportunidade: ${selectedOpp}\nTipo: ${tipo}\n\nO sistema irá reprocessar esta oportunidade como se tivesse sido alterada.`,
    ui.ButtonSet.OK
  );
  
  try {
    const affectedOpps = new Set([normText_(selectedOpp)]);
    let reprocessed = 0;
    
    if (tipo === 'OPEN') {
      reprocessed = reprocessarOportunidades_(affectedOpps);
    } else if (tipo === 'WON') {
      reprocessed = reprocessarOportunidadesWon_(affectedOpps);
    } else if (tipo === 'LOST') {
      reprocessed = reprocessarOportunidadesLost_(affectedOpps);
    }
    
    if (reprocessed > 0) {
      ui.alert(
        '✅ Simulação Concluída',
        `Oportunidade reprocessada com sucesso!\n\n` +
        `Nome: ${selectedOpp}\n` +
        `Tipo: ${tipo}\n` +
        `Status: Atualizado\n\n` +
        `Verifique a aba de análise para ver os resultados.`,
        ui.ButtonSet.OK
      );
      logToSheet("INFO", "Simulador", `Oportunidade ${selectedOpp} (${tipo}) reprocessada via simulador`);
    } else {
      ui.alert(
        '⚠️ Aviso',
        `A oportunidade não foi encontrada na aba de análise.\n\n` +
        `Isso pode significar que ela ainda não foi processada inicialmente.`,
        ui.ButtonSet.OK
      );
    }
    
  } catch (error) {
    ui.alert(
      '❌ Erro',
      `Falha ao simular alteração:\n\n${error.message}`,
      ui.ButtonSet.OK
    );
    logToSheet("ERROR", "Simulador", `Erro ao simular ${selectedOpp}: ${error.message}`);
  }
}

/**
 * FUNÇÃO EXECUTADA PELO TRIGGER AUTO-SYNC (A cada 30 minutos)
 * LÓGICA CORRETA: 
 * 1. Compara BASE vs ANÁLISE (por nome de oportunidade)
 * 2. Cria análises completas para oportunidades não processadas
 * 3. Atualiza análises quando há novas atividades/mudanças relevantes
 */
function autoSyncPipelineExecution() {
  const startTime = new Date();
  const executionId = `EXEC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  // === 1. ADQUIRIR LOCK ATÔMICO IMEDIATAMENTE (Anti-concorrência) ===
  // CRÍTICO: Lock DEVE ser a primeira operação antes de qualquer outra ação
  const lock = LockService.getScriptLock();
  
  try {
    // Tenta adquirir lock por 3 segundos (se outra execução está rodando, aborta rápido)
    const lockStartTime = Date.now();
    const lockAcquired = lock.tryLock(3000);
    const lockWaitTime = Date.now() - lockStartTime;
    
    if (!lockAcquired) {
      const msg = `⏸️ [${executionId}] BLOQUEADO após ${lockWaitTime}ms - Outra execução em andamento`;
      console.log(msg);
      logToSheet("WARN", "AutoSync", msg);
      flushLogs_();
      
      return { 
        skipped: true, 
        reason: 'locked',
        executionId: executionId,
        lockWaitTime: lockWaitTime,
        open: { created: 0, updated: 0 },
        won: { created: 0, updated: 0 },
        lost: { created: 0, updated: 0 },
        totalCreated: 0,
        totalUpdated: 0,
        duration: 0
      };
    }
    
    // === LOCK ADQUIRIDO - Execução pode prosseguir ===
    console.log(`🔒 [${executionId}] Lock adquirido em ${lockWaitTime}ms - Execução exclusiva garantida`);
    logToSheet("INFO", "AutoSync", `🔒 [${executionId}] Lock adquirido`);
    
    // === CRÍTICO: APLICAR LOCALE pt_BR ANTES DE QUALQUER PROCESSAMENTO ===
    // Isso garante que datas sejam interpretadas corretamente (DD/MM em vez de MM/DD)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const currentLocale = ss.getSpreadsheetLocale();
    if (currentLocale !== 'pt_BR' && currentLocale !== 'pt-BR') {
      console.log(`🔧 [${executionId}] Alterando locale GLOBAL para pt_BR (atual: ${currentLocale})...`);
      ss.setSpreadsheetLocale('pt_BR');
      console.log(`✅ [${executionId}] Locale alterado para: ${ss.getSpreadsheetLocale()}`);
      logToSheet("INFO", "AutoSync", `Locale alterado para pt_BR (era ${currentLocale})`);
      
      // Limpar cache de sheets após mudar locale
      if (typeof invalidateSheetCache_ === 'function') {
        invalidateSheetCache_();
        console.log(`🧹 [${executionId}] Cache de sheets limpo após mudança de locale`);
      }
      
      // Forçar recarga do spreadsheet
      SpreadsheetApp.flush();
    }
    
    // === 2. VERIFICAR FLAGS E CONFIGURAÇÃO ===
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    
    // DETECÇÃO DE LOCK TRAVADO (se última execução começou há mais de 10 minutos)
    const lastExecutionId = props.getProperty('LAST_EXECUTION_ID');
    const lastSyncTimestamp = props.getProperty('LAST_SYNC_TIMESTAMP');
    
    if (lastSyncTimestamp) {
      const timeSinceLastSync = (now - parseInt(lastSyncTimestamp)) / 1000; // segundos
      if (timeSinceLastSync > 600) { // 10 minutos
        console.log(`⚠️ [${executionId}] Execução anterior (${lastExecutionId}) iniciou há ${Math.floor(timeSinceLastSync/60)}min - possível travamento detectado`);
        logToSheet("WARN", "AutoSync", `[${executionId}] Possível travamento detectado: última execução há ${Math.floor(timeSinceLastSync/60)}min`);
      }
    }
    
    // LIMPA FLAGS RESIDUAIS (de execuções anteriores que podem ter ficado travadas)
    const forceStopValue = props.getProperty('FORCE_STOP_REQUESTED');
    
    // Se o FORCE_STOP foi setado há mais de 2 minutos, considera residual e limpa
    if (forceStopValue === 'TRUE') {
      const lastSync = parseInt(lastSyncTimestamp) || 0;
      const timeSinceLastSync = (now - lastSync) / 1000; // em segundos
      
      if (timeSinceLastSync > 120) { // 2 minutos
        console.log(`⚠️ FORCE_STOP_REQUESTED detectado como RESIDUAL (${timeSinceLastSync.toFixed(0)}s desde última sync) - LIMPANDO`);
        logToSheet("WARN", "AutoSync", `Flag FORCE_STOP residual detectada (${timeSinceLastSync.toFixed(0)}s) - Limpando e prosseguindo`);
        props.deleteProperty('FORCE_STOP_REQUESTED');
      } else {
        const msg = '🛑 EXECUÇÃO ABORTADA - Sistema foi desativado manualmente (recente)';
        console.log(msg);
        logToSheet("WARN", "AutoSync", msg);
        props.deleteProperty('FORCE_STOP_REQUESTED');
        lock.releaseLock(); // LIBERAR LOCK ANTES DE RETORNAR
        flushLogs_();
        
        return { 
          skipped: true, 
          reason: 'force_stopped',
          open: { created: 0, updated: 0 },
          won: { created: 0, updated: 0 },
          lost: { created: 0, updated: 0 },
          totalCreated: 0,
          totalUpdated: 0,
          duration: 0
        };
      }
    }
    
    // Atualiza timestamp da última sync
    props.setProperty('LAST_SYNC_TIMESTAMP', now.toString());
    props.setProperty('LAST_EXECUTION_ID', executionId);
    
    // LOG FORÇADO NO INÍCIO - garantir rastreamento
    logToSheet("INFO", "AutoSync", `▶️▶️▶️ [${executionId}] EXECUÇÃO INICIADA ▶️▶️▶️`);
    console.log(`🔄 [${executionId}] Iniciando Auto-Sync Universal (BASE → ANÁLISE)...`);
    console.log(`⏰ Timestamp: ${startTime.toISOString()}`);
    flushLogs_(); // Força escrita imediata
    
    let totalCreated = 0;
    let totalUpdated = 0;
    
    // === ORDEM DE PROCESSAMENTO: OPEN → LOST → WON ===
    // PRIORIDADE: Processar pipeline ativo (OPEN) primeiro para análise em tempo real
    
    // === PROCESSAMENTO OPEN (PIPELINE) - PRIORIDADE 1 ===
    console.log('\n📊 1. PROCESSANDO PIPELINE (OPEN) - PRIORIDADE...');
    logToSheet("INFO", "AutoSync", "▶️ Iniciando OPEN (Pipeline) - Sincronizando Pipeline Aberto");
    const openResult = syncBaseToAnalysis_('OPEN');
    totalCreated += openResult.created;
    totalUpdated += openResult.updated;
    console.log(`  ✅ Open: ${openResult.created} criadas, ${openResult.updated} atualizadas`);
    logToSheet("INFO", "AutoSync", `OPEN: ${openResult.created} criadas, ${openResult.updated} atualizadas`);
    flushLogs_();
    
    // VERIFICAR SE FOI SOLICITADO STOP
    if (props.getProperty('FORCE_STOP_REQUESTED') === 'TRUE') {
      console.log('🛑 STOP solicitado - interrompendo antes de LOST');
      logToSheet("WARN", "AutoSync", "🛑 Execução interrompida manualmente após OPEN");
      props.deleteProperty('FORCE_STOP_REQUESTED');
      lock.releaseLock();
      flushLogs_();
      return { skipped: true, reason: 'force_stopped_mid', open: openResult, totalCreated, totalUpdated, duration: 0 };
    }
    
    // === PROCESSAMENTO LOST (PERDIDAS) - PRIORIDADE 2 ===
    console.log('\n❌ 2. PROCESSANDO PERDIDAS (LOST)...');
    logToSheet("INFO", "AutoSync", "▶️ Iniciando LOST (Perdidas) - Sincronizando Histórico Perdidas");
    const lostResult = syncBaseToAnalysis_('LOST');
    totalCreated += lostResult.created;
    totalUpdated += lostResult.updated;
    console.log(`  ✅ Lost: ${lostResult.created} criadas, ${lostResult.updated} atualizadas`);
    logToSheet("INFO", "AutoSync", `LOST: ${lostResult.created} criadas, ${lostResult.updated} atualizadas`);
    flushLogs_();
    
    // VERIFICAR SE FOI SOLICITADO STOP
    if (props.getProperty('FORCE_STOP_REQUESTED') === 'TRUE') {
      console.log('🛑 STOP solicitado - interrompendo antes de WON');
      logToSheet("WARN", "AutoSync", "🛑 Execução interrompida manualmente após LOST");
      props.deleteProperty('FORCE_STOP_REQUESTED');
      lock.releaseLock();
      flushLogs_();
      return { skipped: true, reason: 'force_stopped_mid', open: openResult, lost: lostResult, totalCreated, totalUpdated, duration: 0 };
    }
    
    // === PROCESSAMENTO WON (GANHAS) - PRIORIDADE 3 ===
    console.log('\n🏆 3. PROCESSANDO GANHAS (WON)...');
    logToSheet("INFO", "AutoSync", "▶️ Iniciando WON (Ganhas) - Sincronizando Histórico Ganhos");
    const wonResult = syncBaseToAnalysis_('WON');
    totalCreated += wonResult.created;
    totalUpdated += wonResult.updated;
    console.log(`  ✅ Won: ${wonResult.created} criadas, ${wonResult.updated} atualizadas`);
    logToSheet("INFO", "AutoSync", `WON: ${wonResult.created} criadas, ${wonResult.updated} atualizadas`);
    flushLogs_();
    
    // VERIFICAR SE FOI SOLICITADO STOP
    if (props.getProperty('FORCE_STOP_REQUESTED') === 'TRUE') {
      console.log('🛑 STOP solicitado - interrompendo antes de Sales Specialist');
      logToSheet("WARN", "AutoSync", "Execução interrompida manualmente após OPEN");
      props.deleteProperty('FORCE_STOP_REQUESTED');
      lock.releaseLock();
      return { skipped: true, reason: 'force_stopped_mid', lost: lostResult, won: wonResult, open: openResult, totalCreated, totalUpdated, duration: 0 };
    }
    
    // === PROCESSAMENTO SALES SPECIALIST ===
    console.log('\n📊 4. PROCESSANDO SALES SPECIALIST...');
    logToSheet("INFO", "AutoSync", "Iniciando Sales Specialist");
    const salesSpecResult = processarAnaliseSalesSpecialist();
    totalCreated += salesSpecResult.created;
    totalUpdated += salesSpecResult.updated;
    console.log(`  ✅ Sales Specialist: ${salesSpecResult.created} criadas, ${salesSpecResult.updated} atualizadas`);
    logToSheet("INFO", "AutoSync", `Sales Specialist: ${salesSpecResult.created} criadas, ${salesSpecResult.updated} atualizadas`);
    
    // === LOG DE EXECUÇÃO ===
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n✅ ═══════════════════════════════════════════════════');
    console.log('✅ AUTO-SYNC UNIVERSAL CONCLUÍDO COM SUCESSO');
    console.log('✅ ═══════════════════════════════════════════════════');
    console.log(`⏱️  Duração Total: ${duration}s`);
    console.log(`📊 Pipeline (OPEN):  ${openResult.created} criadas | ${openResult.updated} atualizadas`);
    console.log(`❌ Perdidas (LOST):  ${lostResult.created} criadas | ${lostResult.updated} atualizadas`);
    console.log(`🏆 Ganhas (WON):     ${wonResult.created} criadas | ${wonResult.updated} atualizadas`);
    console.log(`📈 Sales Specialist: ${salesSpecResult.created} criadas | ${salesSpecResult.updated} atualizadas`);
    console.log(`🆕 TOTAL CRIADAS:    ${totalCreated}`);
    console.log(`🔄 TOTAL ATUALIZADAS: ${totalUpdated}`);
    console.log('✅ ═══════════════════════════════════════════════════\n');
    
    logToSheet("INFO", "AutoSync", `✅ [${executionId}] CONCLUÍDO em ${duration}s | Criadas: ${totalCreated} | Atualizadas: ${totalUpdated} | OPEN(${openResult.created}/${openResult.updated}) LOST(${lostResult.created}/${lostResult.updated}) WON(${wonResult.created}/${wonResult.updated})`);
    flushLogs_();
    
    // === LIMPEZA AUTOMÁTICA DE LOGS ===
    try {
      limparLogsAntigos();
    } catch (logCleanupError) {
      console.warn('⚠️ Erro na limpeza de logs:', logCleanupError.message);
    }
    
    return {
      lost: { created: lostResult.created, updated: lostResult.updated },
      won: { created: wonResult.created, updated: wonResult.updated },
      open: { created: openResult.created, updated: openResult.updated },
      salesSpec: { created: salesSpecResult.created, updated: salesSpecResult.updated },
      totalCreated,
      totalUpdated,
      duration
    };
    
  } catch (error) {
    console.error(`❌ [${executionId}] ERRO no Auto-Sync:`, error);
    console.error('Stack:', error.stack);
    logToSheet("ERROR", "AutoSync", `[${executionId}] Falha: ${error.message}`);
    flushLogs_();
    
    return {
      error: true,
      executionId: executionId,
      message: error.message,
      open: { created: 0, updated: 0 },
      won: { created: 0, updated: 0 },
      lost: { created: 0, updated: 0 },
      totalCreated: 0,
      totalUpdated: 0,
      duration: 0
    };
  } finally {
    // === LIBERAR LOCK (SEMPRE) ===
    try {
      const lockReleaseTime = Date.now();
      lock.releaseLock();
      const releaseDuration = Date.now() - lockReleaseTime;
      console.log(`🔓 [${executionId}] Lock liberado (${releaseDuration}ms)`);
      logToSheet("INFO", "AutoSync", `🔓 [${executionId}] Lock liberado`);
    } catch (lockError) {
      console.error(`⚠️ [${executionId}] Falha ao liberar lock:`, lockError);
      logToSheet("ERROR", "AutoSync", `[${executionId}] Falha ao liberar lock: ${lockError.message}`);
    }
  }
}

/**
 * Sincroniza BASE → ANÁLISE para um modo específico (OPEN/WON/LOST)
 * LÓGICA: 
 * 1. Carrega todas as oportunidades da BASE (agrupadas por nome)
 * 2. Carrega todas as análises existentes
 * 3. Identifica quais faltam (criar) e quais existem (verificar atualização)
 * 4. Cria análises completas para oportunidades não processadas
 * 5. Atualiza análises quando há novas atividades/mudanças
 * @private
 */
function syncBaseToAnalysis_(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  
  console.log(`\n🔍 Sincronizando ${mode}: ${config.input} → ${config.output}`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    // === 1. CARREGAR BASE (fonte primária) ===
    console.log('  📥 Carregando dados da base...');
    const baseSheet = ss.getSheetByName(config.input);
    
    if (!baseSheet) {
      console.warn(`  ⚠️ Aba ${config.input} não encontrada`);
      return { created: 0, updated: 0, skipped: 0, errors: 0 };
    }
    
    const baseData = baseSheet.getDataRange().getValues();
    const baseHeaders = baseData[0];
    
    // Encontrar coluna de nome da oportunidade
    const oppNameIdx = baseHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE') || norm.includes('NAME');
    });
    
    if (oppNameIdx === -1) {
      console.error(`  ❌ Coluna de nome de oportunidade não encontrada em ${config.input}`);
      return { created: 0, updated: 0, skipped: 0, errors: 1 };
    }
    
    // Encontrar coluna de Close Date / Fiscal Year
    const closeDateIdx = baseHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return (norm.includes('CLOSE') && norm.includes('DATE')) || 
             (norm.includes('DATA') && norm.includes('FECHAMENTO')) ||
             (norm.includes('FECHA') && norm.includes('CIERRE'));
    });
    
    // Agrupar oportunidades por nome (como já é feito)
    const baseOpps = new Map();
    for (let i = 1; i < baseData.length; i++) {
      const oppName = String(baseData[i][oppNameIdx] || '').trim();
      if (oppName) {
        const normName = normText_(oppName);
        if (!baseOpps.has(normName)) {
          // Capturar data de fechamento para ordenação posterior
          let closeDate = null;
          if (closeDateIdx > -1) {
            const closeDateRaw = baseData[i][closeDateIdx];
            if (closeDateRaw instanceof Date) {
              closeDate = closeDateRaw;
            } else if (closeDateRaw) {
              closeDate = parseDate(closeDateRaw);
            }
          }
          
          baseOpps.set(normName, { 
            name: oppName, 
            firstRow: i + 1,
            closeDate: closeDate,
            fiscalYear: closeDate ? closeDate.getFullYear() : 0
          });
        }
      }
    }
    
    console.log(`  📊 Base: ${baseOpps.size} oportunidades únicas`);
    
    // === 2. CARREGAR ANÁLISES EXISTENTES ===
    console.log('  📥 Carregando análises existentes...');
    const analysisSheet = ss.getSheetByName(config.output);
    const existingAnalyses = new Map();
    
    if (analysisSheet && analysisSheet.getLastRow() > 1) {
      const analysisData = analysisSheet.getDataRange().getValues();
      const analysisHeaders = analysisData[0];
      
      const analysisOppIdx = analysisHeaders.findIndex(h => {
        const norm = normText_(String(h));
        return norm.includes('OPORTUNIDADE');
      });
      
      // Encontrar coluna de timestamp (se existir)
      const timestampIdx = analysisHeaders.findIndex(h => {
        const norm = normText_(String(h));
        return norm.includes('ULTIMA') && norm.includes('ATUALIZACAO');
      });
      
      if (analysisOppIdx > -1) {
        for (let i = 1; i < analysisData.length; i++) {
          const oppName = String(analysisData[i][analysisOppIdx] || '').trim();
          if (oppName) {
            const normName = normText_(oppName);
            
            // GUARDAR PRIMEIRA OCORRÊNCIA (para uso posterior)
            if (!existingAnalyses.has(normName)) {
              const lastUpdate = timestampIdx > -1 ? analysisData[i][timestampIdx] : null;
              existingAnalyses.set(normName, {
                row: i + 1,
                lastUpdate: lastUpdate
              });
            }
          }
        }
      }
      
      // CONTAR quantas análises NÃO têm timestamp (nunca foram processadas com IA)
      let withoutTimestamp = 0;
      existingAnalyses.forEach(data => {
        if (!data.lastUpdate) withoutTimestamp++;
      });
      
      console.log(`  📊 Análises: ${existingAnalyses.size} oportunidades únicas carregadas`);
      if (withoutTimestamp > 0) {
        console.log(`  ⚠️ ${withoutTimestamp} análises SEM TIMESTAMP (nunca processadas com IA)`);
        logToSheet("WARN", "AutoSync", `[${mode}] ${withoutTimestamp} análises sem timestamp detectadas`);
      }
    } else {
      console.log(`  📊 Análises: 0 existentes (aba vazia ou inexistente)`);
    }
    
    // === 3. DETECTAR DUPLICATAS E ÓRFÃS ===
    console.log('  🔍 Verificando duplicatas e órfãs...');
    
    // 3.1. Detectar duplicatas na análise (VARREDURA COMPLETA)
    const duplicatesInAnalysis = [];
    const allAnalysisRows = new Map(); // Rastrear TODAS as linhas
    
    // Re-varrer a aba para detectar duplicatas
    if (analysisSheet && analysisSheet.getLastRow() > 1) {
      const analysisData = analysisSheet.getDataRange().getValues();
      const analysisHeaders = analysisData[0];
      const analysisOppIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
      
      if (analysisOppIdx > -1) {
        for (let i = 1; i < analysisData.length; i++) {
          const oppName = String(analysisData[i][analysisOppIdx] || '').trim();
          if (oppName) {
            const normName = normText_(oppName);
            
            if (!allAnalysisRows.has(normName)) {
              allAnalysisRows.set(normName, []);
            }
            allAnalysisRows.get(normName).push(i + 1); // Guardar TODAS as linhas
          }
        }
        
        // Identificar duplicatas (oportunidades com mais de 1 linha)
        allAnalysisRows.forEach((rows, normName) => {
          if (rows.length > 1) {
            // Manter primeira linha, marcar demais como duplicatas
            for (let j = 1; j < rows.length; j++) {
              duplicatesInAnalysis.push({ normName, row: rows[j] });
            }
          }
        });
      }
    }
    
    if (duplicatesInAnalysis.length > 0) {
      console.log(`  🔴 ${duplicatesInAnalysis.length} DUPLICATAS detectadas na análise! Removendo...`);
      logToSheet("WARN", "AutoSync", `${duplicatesInAnalysis.length} duplicatas detectadas em ${config.output}`);
      
      // Remover duplicatas (manter primeira, deletar demais)
      const analysisSheet = ss.getSheetByName(config.output);
      if (analysisSheet) {
        // Ordenar por linha decrescente para não afetar índices
        duplicatesInAnalysis.sort((a, b) => b.row - a.row);
        
        for (const dup of duplicatesInAnalysis) {
          analysisSheet.deleteRow(dup.row);
          console.log(`    ❌ Removida duplicata na linha ${dup.row}`);
        }
        
        logToSheet("INFO", "AutoSync", `✅ ${duplicatesInAnalysis.length} duplicatas removidas de ${config.output}`);
        
        // Re-carregar análises após remoção
        existingAnalyses.clear();
        const updatedData = analysisSheet.getDataRange().getValues();
        const analysisOppIdx = updatedData[0].findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
        
        // Encontrar coluna de timestamp para re-carregar timestamps corretos
        const timestampIdxAfterDup = updatedData[0].findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('ULTIMA') && norm.includes('ATUALIZACAO');
        });
        
        if (analysisOppIdx > -1) {
          for (let i = 1; i < updatedData.length; i++) {
            const oppName = String(updatedData[i][analysisOppIdx] || '').trim();
            if (oppName) {
              const normName = normText_(oppName);
              const lastUpdate = timestampIdxAfterDup > -1 ? updatedData[i][timestampIdxAfterDup] : null;
              existingAnalyses.set(normName, { row: i + 1, lastUpdate: lastUpdate });
            }
          }
        }
      }
    }
    
    // 3.2. Detectar órfãs (análises sem oportunidade na base)
    const orphanedAnalyses = [];
    existingAnalyses.forEach((data, normName) => {
      if (!baseOpps.has(normName)) {
        orphanedAnalyses.push({ normName, row: data.row });
      }
    });
    
    if (orphanedAnalyses.length > 0) {
      console.log(`  ⚠️ ${orphanedAnalyses.length} ÓRFÃS detectadas (não existem mais na pipeline)! Removendo...`);
      logToSheet("WARN", "AutoSync", `${orphanedAnalyses.length} análises órfãs detectadas em ${config.output}`);
      
      const analysisSheet = ss.getSheetByName(config.output);
      if (analysisSheet) {
        // Ordenar por linha decrescente
        orphanedAnalyses.sort((a, b) => b.row - a.row);
        
        for (const orphan of orphanedAnalyses) {
          analysisSheet.deleteRow(orphan.row);
          console.log(`    🗑️ Removida órfã na linha ${orphan.row}`);
        }
        
        logToSheet("INFO", "AutoSync", `✅ ${orphanedAnalyses.length} órfãs removidas de ${config.output}`);
        
        // Re-carregar após remoção
        existingAnalyses.clear();
        const updatedData = analysisSheet.getDataRange().getValues();
        const analysisOppIdx = updatedData[0].findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
        
        // Encontrar coluna de timestamp para re-carregar timestamps corretos
        const timestampIdxAfterOrph = updatedData[0].findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('ULTIMA') && norm.includes('ATUALIZACAO');
        });
        
        if (analysisOppIdx > -1) {
          for (let i = 1; i < updatedData.length; i++) {
            const oppName = String(updatedData[i][analysisOppIdx] || '').trim();
            if (oppName) {
              const normName = normText_(oppName);
              const lastUpdate = timestampIdxAfterOrph > -1 ? updatedData[i][timestampIdxAfterOrph] : null;
              existingAnalyses.set(normName, { row: i + 1, lastUpdate: lastUpdate });
            }
          }
        }
      }
    }
    
    // === 4. IDENTIFICAR GAPS (oportunidades sem análise) ===
    const missingAnalyses = [];
    const existingButMayNeedUpdate = [];
    
    baseOpps.forEach((oppData, normName) => {
      if (!existingAnalyses.has(normName)) {
        missingAnalyses.push({ normName, ...oppData });
      } else {
        existingButMayNeedUpdate.push({ 
          normName, 
          ...oppData, 
          analysisRow: existingAnalyses.get(normName).row,
          lastUpdate: existingAnalyses.get(normName).lastUpdate
        });
      }
    });
    
    console.log(`  🆕 Para criar: ${missingAnalyses.length}`);
    console.log(`  🔄 Para verificar: ${existingButMayNeedUpdate.length}`);
    
    // LOG DETALHADO PARA DEBUG
    if (mode === 'LOST') {
      console.log(`\n  📊 [${mode}] DIAGNÓSTICO DETALHADO:`);
      console.log(`     • Base: ${baseOpps.size} oportunidades únicas`);
      console.log(`     • Análises existentes: ${existingAnalyses.size}`);
      console.log(`     • Faltando análise: ${missingAnalyses.length}`);
      console.log(`     • Com análise: ${existingButMayNeedUpdate.length}`);
      console.log(`     • GAP: ${baseOpps.size} - ${existingAnalyses.size} = ${baseOpps.size - existingAnalyses.size}`);
      
      logToSheet("DEBUG", "AutoSync", `[${mode}] Base: ${baseOpps.size} | Análises: ${existingAnalyses.size} | Gap: ${missingAnalyses.length}`);
    }
    
    // === 4.5. CHECKUP RÁPIDO: ATUALIZAR CAMPOS SEM IA ===
    console.log(`\n  ⚡ Executando atualização rápida de campos (SEM IA)...`);
    logToSheet("INFO", "AutoSync", `[${mode}] Checkup rápido: atualizando campos não-IA`);
    
    if (analysisSheet && analysisSheet.getLastRow() > 1 && existingButMayNeedUpdate.length > 0) {
      const analysisData = analysisSheet.getDataRange().getValues();
      const analysisHeaders = analysisData[0];
      
      // Mapear colunas da ANÁLISE (incluindo campos calculados)
      const colMap = {
        opp: analysisHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE')),
        gross: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Gross')),
        net: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Net')),
        status: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Status')),
        stage: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Stage') || normText_(String(h)).includes('FASE')),
        fiscalQ: analysisHeaders.findIndex(h => normText_(String(h)).includes('FISCAL') && normText_(String(h)).includes('Q')),
        closeDate: analysisHeaders.findIndex(h => normText_(String(h)).includes('DATA') && normText_(String(h)).includes('FECHAMENTO')),
        predictedDate: analysisHeaders.findIndex(h => normText_(String(h)).includes('DATA') && normText_(String(h)).includes('PREVISTA')),
        createdDate: analysisHeaders.findIndex(h => normText_(String(h)).includes('DATA') && normText_(String(h)).includes('CRIACAO')),
        owner: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Vendedor')),
        account: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Conta')),
        products: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Produtos')),
        ownerPreventa: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Owner Preventa')),
        billingCity: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Cidade de cobrança')),
        billingState: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Estado/Província de cobrança')),
        verticalIA: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Vertical IA')),
        subVerticalIA: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Sub-vertical IA')),
        subSubVerticalIA: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Sub-sub-vertical IA')),
        justificativaIAFinal: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Justificativa IA')),
        portfolio: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Portfólio')),
        segment: analysisHeaders.findIndex(h => normText_(String(h)) === normText_('Segmento')),
        forecast: analysisHeaders.findIndex(h => normText_(String(h)).includes('FORECAST') && normText_(String(h)).includes('SF')),
        ciclo: analysisHeaders.findIndex(h => normText_(String(h)).includes('CICLO') && normText_(String(h)).includes('DIAS')),
        diasFunil: analysisHeaders.findIndex(h => normText_(String(h)).includes('DIAS') && normText_(String(h)).includes('FUNIL')),
        diasIdle: analysisHeaders.findIndex(h => normText_(String(h)).includes('DIAS') && normText_(String(h)).includes('IDLE'))
      };
      
      // LOG: Mostrar quais colunas foram encontradas (apenas para debug)
      console.log(`  📋 ColMap ${mode}: Gross=${colMap.gross}, Net=${colMap.net}, Ciclo=${colMap.ciclo}, Status=${colMap.status}`);
      
      // Mapear colunas da BASE
      const cols = getColumnMapping(baseHeaders);
      
      // DATA ATUAL (timezone São Paulo/Brasil)
      const hoje = new Date();
      const hojeSP = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
      console.log(`  🕐 Data atual (São Paulo): ${hojeSP}`);

      // Contexto de atividades para recálculo de Idle no quick update
      const rawActivities = getSheetData(SHEETS.ATIVIDADES);
      const activitiesHeaders = rawActivities ? rawActivities.headers : [];
      const activitiesMap = indexDataByMultiKey_(rawActivities);
      
      // Agregar dados da BASE por oportunidade
      const baseAggregated = new Map();
      for (let i = 1; i < baseData.length; i++) {
        const oppName = String(baseData[i][cols.p_opp] || '').trim();
        if (!oppName) continue;
        
        const normName = normText_(oppName);
        const gross = parseFloat(baseData[i][cols.p_gross]) || 0;
        const net = parseFloat(baseData[i][cols.p_net]) || 0;
        const product = String(baseData[i][cols.p_prod] || '').trim();
        
        if (!baseAggregated.has(normName)) {
          // === PADRONIZAÇÃO FORÇADA DE DATAS PARA DD/MM/AAAA ===
          // Capturar data de criação da BASE
          const createdDateRaw = cols.p_created > -1 ? baseData[i][cols.p_created] : null;
          const closeDateRaw = baseData[i][cols.p_date];
          const predictedDateRaw = cols.p_predicted_date > -1 ? baseData[i][cols.p_predicted_date] : null;
          const fiscalQRaw = cols.p_fiscal_q > -1 ? String(baseData[i][cols.p_fiscal_q] || '').trim() : '';
          const fiscalQParsed = (typeof parsePipelineFiscalQuarter_ === 'function') ? parsePipelineFiscalQuarter_(fiscalQRaw) : null;
          
          // PADRONIZAR: Converter TODAS as datas para string DD/MM/AAAA
          // Isso evita que Google Sheets interprete como MM/DD/AAAA
          const createdDateStd = createdDateRaw ? formatDateRobust(createdDateRaw) : null;
          const closeDateStd = closeDateRaw ? formatDateRobust(closeDateRaw) : null;
          const predictedDateStd = predictedDateRaw ? formatDateRobust(predictedDateRaw) : null;
          
          // LOG DEBUG: mostrar RAW → PADRONIZADO (apenas primeiros 3)
          if (baseAggregated.size < 3) {
            console.log(`  📅 PADRONIZAÇÃO ${oppName}:`);
            if (createdDateRaw) console.log(`     Created: "${createdDateRaw}" → "${createdDateStd}"`);
            if (closeDateRaw) console.log(`     Close: "${closeDateRaw}" → "${closeDateStd}"`);
            if (predictedDateRaw) console.log(`     Predicted: "${predictedDateRaw}" → "${predictedDateStd}"`);
          }
          
          baseAggregated.set(normName, {
            name: oppName,
            oppId: cols.p_id > -1 ? String(baseData[i][cols.p_id] || '').trim() : '',
            gross: 0,
            net: 0,
            products: [],
            status: String(baseData[i][cols.p_stage] || '').trim(),
            closeDate: closeDateStd,  // ✅ PADRONIZADO DD/MM/AAAA
            predictedDate: predictedDateStd,  // ✅ PADRONIZADO DD/MM/AAAA
            createdDate: createdDateStd,  // ✅ PADRONIZADO DD/MM/AAAA
            fiscalQ: (fiscalQParsed && fiscalQParsed.label) ? fiscalQParsed.label : fiscalQRaw,
            owner: String(baseData[i][cols.p_owner] || '').trim(),
            ownerPreventa: cols.p_owner_preventa > -1 ? String(baseData[i][cols.p_owner_preventa] || '').trim() : '',
            account: String(baseData[i][cols.p_acc] || '').trim(),
            portfolio: String(baseData[i][cols.p_portfolio] || '').trim(),
            segment: String(baseData[i][cols.p_segment] || '').trim(),
            billingCity: cols.p_billing_city > -1 ? String(baseData[i][cols.p_billing_city] || '').trim() : '',
            billingState: cols.p_billing_state > -1 ? String(baseData[i][cols.p_billing_state] || '').trim() : '',
            forecast: cols.p_forecast > -1 ? String(baseData[i][cols.p_forecast] || '').trim() : '',
            inactiveDays: cols.p_inactive > -1 ? (parseInt(baseData[i][cols.p_inactive], 10) || 0) : 0
          });
        }
        
        const agg = baseAggregated.get(normName);
        agg.gross += gross;
        agg.net += net;
        if (product && !agg.products.includes(product)) {
          agg.products.push(product);
        }
      }
      
      console.log(`  📊 BASE agregada: ${baseAggregated.size} oportunidades`);
      
      // Atualizar campos na ANÁLISE
      let quickUpdates = 0;
      const updatesToWrite = [];
      
      for (let i = 1; i < analysisData.length; i++) {
        const analysisOppName = String(analysisData[i][colMap.opp] || '').trim();
        if (!analysisOppName) continue;
        
        const normName = normText_(analysisOppName);
        const baseData_opp = baseAggregated.get(normName);
        
        if (!baseData_opp) continue; // Oportunidade não existe mais na base (órfã - já foi removida)
        
        let hasChanges = false;
        const changes = [];
        
        // Verificar e atualizar GROSS
        if (colMap.gross > -1) {
          const currentGross = parseFloat(analysisData[i][colMap.gross]) || 0;
          if (Math.abs(currentGross - baseData_opp.gross) > 0.01) {
            analysisData[i][colMap.gross] = baseData_opp.gross;
            changes.push(`Gross: ${currentGross.toFixed(2)} → ${baseData_opp.gross.toFixed(2)}`);
            hasChanges = true;
          }
        }
        
        // Verificar e atualizar NET (com proteção contra zeros espúrios)
        if (colMap.net > -1) {
          const currentNet = parseFloat(analysisData[i][colMap.net]) || 0;
          const newNet = baseData_opp.net;
          
          // PROTEÇÃO: Se base tem NET=0 mas análise tem valor, NÃO sobrescrever
          if (newNet === 0 && currentNet > 0) {
            console.warn(`  ⚠️ ${analysisOppName}: NET da base é ZERO mas análise tem $${currentNet.toFixed(2)} - MANTENDO valor da análise`);
            logToSheet("WARN", "QuickUpdate", `NET zerado na base - mantendo análise: ${analysisOppName} ($${currentNet.toFixed(2)})`);
          } else if (Math.abs(currentNet - newNet) > 0.01) {
            analysisData[i][colMap.net] = newNet;
            changes.push(`Net: ${currentNet.toFixed(2)} → ${newNet.toFixed(2)}`);
            hasChanges = true;
          }
        }
        
        // Atualizar STATUS/STAGE
        if (colMap.status > -1 && baseData_opp.status) {
          const currentStatus = String(analysisData[i][colMap.status] || '').trim();
          if (currentStatus !== baseData_opp.status) {
            analysisData[i][colMap.status] = baseData_opp.status;
            changes.push(`Status: "${currentStatus}" → "${baseData_opp.status}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar VENDEDOR (OWNER)
        if (colMap.owner > -1 && baseData_opp.owner) {
          const currentOwner = String(analysisData[i][colMap.owner] || '').trim();
          if (currentOwner !== baseData_opp.owner) {
            analysisData[i][colMap.owner] = baseData_opp.owner;
            changes.push(`Vendedor: "${currentOwner}" → "${baseData_opp.owner}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar CONTA (ACCOUNT)
        if (colMap.account > -1 && baseData_opp.account) {
          const currentAccount = String(analysisData[i][colMap.account] || '').trim();
          if (currentAccount !== baseData_opp.account) {
            analysisData[i][colMap.account] = baseData_opp.account;
            changes.push(`Conta: "${currentAccount}" → "${baseData_opp.account}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar PORTFÓLIO
        if (colMap.portfolio > -1 && baseData_opp.portfolio) {
          const currentPortfolio = String(analysisData[i][colMap.portfolio] || '').trim();
          if (currentPortfolio !== baseData_opp.portfolio) {
            analysisData[i][colMap.portfolio] = baseData_opp.portfolio;
            changes.push(`Portfólio: "${currentPortfolio}" → "${baseData_opp.portfolio}"`);
            hasChanges = true;
          }
        }

        // Atualizar OWNER PREVENTA
        if (colMap.ownerPreventa > -1 && baseData_opp.ownerPreventa) {
          const currentOwnerPreventa = String(analysisData[i][colMap.ownerPreventa] || '').trim();
          if (currentOwnerPreventa !== baseData_opp.ownerPreventa) {
            analysisData[i][colMap.ownerPreventa] = baseData_opp.ownerPreventa;
            changes.push(`Owner Preventa: "${currentOwnerPreventa}" → "${baseData_opp.ownerPreventa}"`);
            hasChanges = true;
          }
        }

        // Atualizar CIDADE DE COBRANÇA
        if (colMap.billingCity > -1 && baseData_opp.billingCity) {
          const currentBillingCity = String(analysisData[i][colMap.billingCity] || '').trim();
          if (currentBillingCity !== baseData_opp.billingCity) {
            analysisData[i][colMap.billingCity] = baseData_opp.billingCity;
            changes.push(`Cidade cobrança: "${currentBillingCity}" → "${baseData_opp.billingCity}"`);
            hasChanges = true;
          }
        }

        // Atualizar ESTADO/PROVÍNCIA DE COBRANÇA
        if (colMap.billingState > -1 && baseData_opp.billingState) {
          const currentBillingState = String(analysisData[i][colMap.billingState] || '').trim();
          if (currentBillingState !== baseData_opp.billingState) {
            analysisData[i][colMap.billingState] = baseData_opp.billingState;
            changes.push(`Estado cobrança: "${currentBillingState}" → "${baseData_opp.billingState}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar SEGMENTO
        if (colMap.segment > -1 && baseData_opp.segment) {
          const currentSegment = String(analysisData[i][colMap.segment] || '').trim();
          if (currentSegment !== baseData_opp.segment) {
            analysisData[i][colMap.segment] = baseData_opp.segment;
            changes.push(`Segmento: "${currentSegment}" → "${baseData_opp.segment}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar DATA FECHAMENTO
        if (colMap.closeDate > -1 && baseData_opp.closeDate) {
          const currentCloseDate = formatDateRobust(analysisData[i][colMap.closeDate]);
          const nextCloseDate = formatDateRobust(baseData_opp.closeDate);
          if (nextCloseDate && currentCloseDate !== nextCloseDate) {
            analysisData[i][colMap.closeDate] = nextCloseDate;
            changes.push(`Data Fechamento: "${currentCloseDate || '-'}" → "${nextCloseDate}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar DATA PREVISTA
        // Regra: Data de Fechamento é a fonte de verdade para Data Prevista no sync rápido.
        // Se Close Date existir, espelha em Data Prevista; fallback para Predicted da base apenas se Close estiver vazio.
        const targetPredictedDate = baseData_opp.closeDate || baseData_opp.predictedDate;
        if (colMap.predictedDate > -1 && targetPredictedDate) {
          const currentPredictedDate = formatDateRobust(analysisData[i][colMap.predictedDate]);
          const nextPredictedDate = formatDateRobust(targetPredictedDate);
          if (nextPredictedDate && currentPredictedDate !== nextPredictedDate) {
            analysisData[i][colMap.predictedDate] = nextPredictedDate;
            changes.push(`Data Prevista: "${currentPredictedDate || '-'}" → "${nextPredictedDate}"`);
            hasChanges = true;
          }
        }

        // Atualizar FISCAL Q
        if (colMap.fiscalQ > -1 && baseData_opp.fiscalQ) {
          const currentFiscalQ = String(analysisData[i][colMap.fiscalQ] || '').trim();
          if (currentFiscalQ !== baseData_opp.fiscalQ) {
            analysisData[i][colMap.fiscalQ] = baseData_opp.fiscalQ;
            changes.push(`Fiscal Q: "${currentFiscalQ}" → "${baseData_opp.fiscalQ}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar FORECAST SF
        if (colMap.forecast > -1 && baseData_opp.forecast) {
          const currentForecast = String(analysisData[i][colMap.forecast] || '').trim();
          if (currentForecast !== baseData_opp.forecast) {
            analysisData[i][colMap.forecast] = baseData_opp.forecast;
            changes.push(`Forecast SF: "${currentForecast}" → "${baseData_opp.forecast}"`);
            hasChanges = true;
          }
        }
        
        // Atualizar PRODUTOS
        if (colMap.products > -1 && baseData_opp.products.length > 0) {
          const newProducts = baseData_opp.products.join(' | ');
          const currentProducts = String(analysisData[i][colMap.products] || '').trim();
          if (currentProducts !== newProducts) {
            analysisData[i][colMap.products] = newProducts;
            hasChanges = true;
          }
        }
        
        // ============================================================
        // ATUALIZAR CAMPOS CALCULADOS (dependentes de data atual)
        // ============================================================
        
        // CICLO (dias) = CLOSE DATE - CREATED DATE
        if (colMap.ciclo > -1 && baseData_opp.closeDate && baseData_opp.createdDate) {
          const closeDateParsed = baseData_opp.closeDate instanceof Date ? baseData_opp.closeDate : parseDate(baseData_opp.closeDate);
          const createdDateParsed = baseData_opp.createdDate instanceof Date ? baseData_opp.createdDate : parseDate(baseData_opp.createdDate);
          
          if (closeDateParsed && createdDateParsed) {
            const rawCiclo = Math.ceil((closeDateParsed - createdDateParsed) / MS_PER_DAY);
            const newCiclo = Math.max(0, rawCiclo); // NÃO PERMITIR NEGATIVOS
            const currentCiclo = parseInt(analysisData[i][colMap.ciclo]) || 0;
            
            if (rawCiclo < 0) {
              const closeDateStr = Utilities.formatDate(closeDateParsed, 'America/Sao_Paulo', 'dd/MM/yyyy');
              const createdDateStr = Utilities.formatDate(createdDateParsed, 'America/Sao_Paulo', 'dd/MM/yyyy');
              console.warn(`  ⚠️ ${analysisOppName}: Ciclo negativo (${rawCiclo}d) - Close (${closeDateStr}) < Created (${createdDateStr})`);
              logToSheet("WARN", "QuickUpdate", `Ciclo negativo: ${analysisOppName} (${rawCiclo}d) - Close: ${closeDateStr} | Created: ${createdDateStr}`);
            }
            
            if (currentCiclo !== newCiclo && newCiclo >= 0) {
              analysisData[i][colMap.ciclo] = newCiclo;
              changes.push(`Ciclo: ${currentCiclo}d → ${newCiclo}d`);
              hasChanges = true;
            }
          }
        }
        
        // DIAS FUNIL = HOJE - CREATED DATE (apenas para OPEN)
        if (mode === 'OPEN' && colMap.diasFunil > -1 && baseData_opp.createdDate) {
          const createdDateForFunil = baseData_opp.createdDate instanceof Date ? baseData_opp.createdDate : parseDate(baseData_opp.createdDate);
          if (!createdDateForFunil) {
            continue;
          }
          const rawDiasFunil = Math.ceil((hoje - createdDateForFunil) / MS_PER_DAY);
          const newDiasFunil = Math.max(0, rawDiasFunil); // NÃO PERMITIR NEGATIVOS
          const currentDiasFunil = parseInt(analysisData[i][colMap.diasFunil]) || 0;
          
          if (rawDiasFunil < 0) {
            const createdDateStr = Utilities.formatDate(baseData_opp.createdDate, 'America/Sao_Paulo', 'dd/MM/yyyy');
            const hojeStr = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'dd/MM/yyyy');
            console.warn(`  ⚠️ ${analysisOppName}: Dias Funil negativo (${rawDiasFunil}d) - Hoje (${hojeStr}) < Created (${createdDateStr})`);
            logToSheet("WARN", "QuickUpdate", `Dias Funil negativo: ${analysisOppName} (${rawDiasFunil}d) - Hoje: ${hojeStr} | Created: ${createdDateStr}`);
          }
          
          // Só atualiza se mudou (evita updates desnecessários)
          if (currentDiasFunil !== newDiasFunil && newDiasFunil >= 0) {
            analysisData[i][colMap.diasFunil] = newDiasFunil;
            changes.push(`Dias Funil: ${currentDiasFunil}d → ${newDiasFunil}d`);
            hasChanges = true;
          }
        }

        // IDLE (Dias) = hoje - data da última atividade
        // Fonte de vínculo com atividades:
        // 1) Opportunity ID (quando disponível)
        // 2) Nome da oportunidade (fallback)
        if (mode === 'OPEN' && colMap.diasIdle > -1) {
          const activityKeyById = baseData_opp.oppId ? normText_(baseData_opp.oppId) : '';
          const activityKeyByName = normText_(baseData_opp.name || analysisOppName);
          const relatedActivities =
            (activityKeyById && activitiesMap.get(activityKeyById)) ||
            activitiesMap.get(activityKeyByName) ||
            [];

          const activityStats = processActivityStatsSmart(relatedActivities, activitiesHeaders, hoje);
          let newIdle = calculateIdleDays(activityStats.lastDate, hoje);

          // Mesmo fallback do motor principal para OPEN sem atividade registrada
          if (newIdle === 'SEM REGISTRO' && baseData_opp.inactiveDays > 0) {
            newIdle = baseData_opp.inactiveDays;
          }

          const currentIdleRaw = analysisData[i][colMap.diasIdle];
          const currentIdle = (currentIdleRaw === null || currentIdleRaw === undefined || currentIdleRaw === '')
            ? ''
            : String(currentIdleRaw).trim();
          const nextIdle = (newIdle === null || newIdle === undefined) ? '' : String(newIdle).trim();

          if (currentIdle !== nextIdle) {
            analysisData[i][colMap.diasIdle] = (typeof newIdle === 'number') ? newIdle : nextIdle;
            changes.push(`Idle (Dias): "${currentIdle || '-'}" → "${nextIdle || '-'}"`);
            hasChanges = true;
          }
        }
        
        if (hasChanges) {
          quickUpdates++;
          updatesToWrite.push({ row: i + 1, changes });
          console.log(`  ⚡ ${analysisOppName}: ${changes.join(', ')}`);
        }
      }
      
      // Escrever atualizações de volta
      if (quickUpdates > 0) {
        analysisSheet.getDataRange().setValues(analysisData);
        console.log(`  ✅ ${quickUpdates} oportunidade(s) atualizadas rapidamente (SEM IA)`);
        logToSheet("INFO", "AutoSync", `[${mode}] ${quickUpdates} análises atualizadas rapidamente`);
        
        updatesToWrite.forEach(upd => {
          logToSheet("DEBUG", "QuickUpdate", `${upd.changes.join(', ')}`, {
            aba: config.output,
            linha: upd.row
          });
        });
      } else {
        console.log(`  ✅ Todos os campos não-IA estão atualizados`);
      }
    }
    
    // === 5. CRIAR ANÁLISES FALTANTES (PROCESSAMENTO DIRETO 1 POR VEZ) ===
    if (missingAnalyses.length > 0) {
      // ORDENAÇÃO POR ANO FISCAL: Ano atual primeiro, depois retroagindo (para WON/LOST)
      if (mode === 'WON' || mode === 'LOST') {
        console.log(`  📅 Ordenando ${mode} por ano fiscal (mais recente → passado)...`);
        missingAnalyses.sort((a, b) => {
          const yearA = baseOpps.get(normText_(a.name))?.fiscalYear || 0;
          const yearB = baseOpps.get(normText_(b.name))?.fiscalYear || 0;
          return yearB - yearA; // Decrescente: 2027, 2026, 2025, 2024...
        });
        
        const yearCounts = {};
        missingAnalyses.forEach(opp => {
          const year = baseOpps.get(normText_(opp.name))?.fiscalYear || 'Sem data';
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        });
        console.log(`  📊 Distribuição por ano:`, JSON.stringify(yearCounts));
        logToSheet("INFO", "AutoSync", `${mode} ordenado por ano: ${JSON.stringify(yearCounts)}`);
      }
      
      console.log(`\n  🚀 Criando ${missingAnalyses.length} análises completas (PROCESSAMENTO DIRETO)...`);
      logToSheet("INFO", "AutoSync", `[${mode}] Iniciando criação de ${missingAnalyses.length} análises`);

      for (let i = 0; i < missingAnalyses.length; i++) {
        const opp = missingAnalyses[i];
        console.log(`    [${i+1}/${missingAnalyses.length}] 🆕 Processando: ${opp.name}`);
        logToSheet("DEBUG", "AutoSync", `[${mode}] [${i+1}/${missingAnalyses.length}] Criando: ${opp.name}`);
        
        try {
          // PROCESSAMENTO DIRETO: Chama o motor IA imediatamente (SEM FILA)
          processarAnaliseCompleta_(opp.name, mode, config);
          console.log(`      ✅ Análise criada com sucesso`);
          logToSheet("INFO", "AutoSync", `[${mode}] ✅ Criada: ${opp.name}`);
          created++;
          
          // Flush logs a cada 10 análises
          if ((i + 1) % 10 === 0) {
            flushLogs_();
          }
        } catch (e) {
          console.error(`      ❌ Erro ao processar: ${e.message}`);
          logToSheet("ERROR", "AutoSync", `[${mode}] ❌ Falha ao criar ${opp.name}: ${e.message}`);
          errors++;
        }
        
        // Pequeno delay para não sobrecarregar API
        if (i < missingAnalyses.length - 1) {
          Utilities.sleep(500);
        }
      }
      
      flushLogs_();
    }
    
    // === 6. VERIFICAR E ATUALIZAR ANÁLISES EXISTENTES (1 POR VEZ) ===
    if (existingButMayNeedUpdate.length > 0) {
      // ORDENAÇÃO POR ANO FISCAL: Ano atual primeiro (para WON/LOST)
      if (mode === 'WON' || mode === 'LOST') {
        console.log(`  📅 Ordenando ${mode} para reprocessamento por ano fiscal (mais recente → passado)...`);
        existingButMayNeedUpdate.sort((a, b) => {
          const yearA = baseOpps.get(normText_(a.name))?.fiscalYear || 0;
          const yearB = baseOpps.get(normText_(b.name))?.fiscalYear || 0;
          return yearB - yearA; // Decrescente: ano mais recente primeiro
        });
      }
      
      console.log(`\n  🔍 Verificando ${existingButMayNeedUpdate.length} análises existentes...`);
      
      // LOG DA NOVA POLÍTICA DE STALENESS
      if (mode === 'OPEN') {
        console.log(`  📋 Política OPEN: Reprocessar IA apenas se:`);
        console.log(`     • Novas atividades registradas OU`);
        console.log(`     • Mudanças em campos críticos (Stage, Valor, Close Date, Forecast, Description) OU`);
        console.log(`     • Última atualização > 3 dias`);
        console.log(`  ⚡ Campos calculados (Dias Funil, Ciclo) são atualizados SEM IA no QuickUpdate`);
      } else if (mode === 'WON' || mode === 'LOST') {
        console.log(`  🔒 Política ${mode}: Snapshots finais - NÃO reprocessar`);
        console.log(`     • Apenas se houver correção manual detectada no histórico de alterações`);
      }
      
      logToSheet("INFO", "AutoSync", `[${mode}] Verificando staleness de ${existingButMayNeedUpdate.length} análises`);
      
      let needsUpdateCount = 0;
      let withoutTimestampCount = 0;
      
      for (let i = 0; i < existingButMayNeedUpdate.length; i++) {
        const opp = existingButMayNeedUpdate[i];
        
        // CONTAR oportunidades sem timestamp
        if (!opp.lastUpdate) {
          withoutTimestampCount++;
        }
        
        try {
          // Verificar se há novas atividades ou mudanças que requerem IA
          const needsUpdate = checkIfNeedsUpdate_(opp.name, mode, config, opp.lastUpdate);
          
          if (needsUpdate) {
            needsUpdateCount++;
            console.log(`    [${i+1}/${existingButMayNeedUpdate.length}] 🔄 Reprocessando com IA: ${opp.name}`);
            logToSheet("DEBUG", "AutoSync", `[${mode}] [${i+1}/${existingButMayNeedUpdate.length}] Reprocessando: ${opp.name}`);
            
            // GUARDRAIL: processarAnaliseCompleta_ já vai SUBSTITUIR a linha existente
            // Não precisa deletar antes - a função detecta e substitui automaticamente
            processarAnaliseCompleta_(opp.name, mode, config);
            console.log(`      ✅ Análise reprocessada com sucesso`);
            logToSheet("INFO", "AutoSync", `[${mode}] ✅ ${opp.name}`);
            updated++;
            
            // Flush logs a cada 10 atualizações
            if (updated % 10 === 0) {
              flushLogs_();
            }
            
            Utilities.sleep(500);
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`    ❌ Erro ao verificar ${opp.name}:`, error.message);
          logToSheet("ERROR", "AutoSync", `[${mode}] ❌ Erro: ${opp.name} - ${error.message}`);
          errors++;
        }
      }
      
      flushLogs_();
      
      // === RESUMO DA OTIMIZAÇÃO DE STALENESS ===
      console.log(`\n  📊 Resumo da Verificação de Staleness (${mode}):`);
      console.log(`     • Total verificadas: ${existingButMayNeedUpdate.length}`);
      console.log(`     • SEM TIMESTAMP: ${withoutTimestampCount}`);
      console.log(`     • NECESSITAM IA: ${needsUpdateCount} (${((needsUpdateCount/existingButMayNeedUpdate.length)*100).toFixed(1)}%)`);
      console.log(`     • Reprocessadas com IA: ${updated} (${((updated/existingButMayNeedUpdate.length)*100).toFixed(1)}%)`);;
      console.log(`     • Mantidas sem mudanças: ${skipped} (${((skipped/existingButMayNeedUpdate.length)*100).toFixed(1)}%)`);
      console.log(`     • ⚡ Economia de chamadas IA: ${skipped} análises`);
      
      if (mode === 'OPEN') {
        logToSheet("INFO", "AutoSync", `${mode}: ${updated} reprocessadas | ${skipped} mantidas (economia: ${skipped} chamadas IA)`);
      } else {
        logToSheet("INFO", "AutoSync", `${mode}: ${updated} reprocessadas | ${skipped} snapshots preservados`);
      }
    }
    
    // === 7. ADICIONAR TIMESTAMP RETROATIVO em análises sem timestamp ===
    console.log(`\n  🕐 Adicionando timestamps retroativos...`);
    const timestampsAdded = adicionarTimestampRetroativo_(mode, new Date(2026, 0, 30, 19, 0, 0));
    if (timestampsAdded > 0) {
      console.log(`  ✅ ${timestampsAdded} timestamps retroativos adicionados (30/01/2026 19:00)`);
      logToSheet("INFO", "AutoSync", `[${mode}] ${timestampsAdded} timestamps retroativos adicionados`);
    }
    
    console.log(`\n  ✅ Resumo: ${created} criadas, ${updated} atualizadas, ${skipped} sem alteração, ${errors} erros`);
    
    return { created, updated, skipped, errors };
    
  } catch (error) {
    console.error(`  ❌ ERRO CRÍTICO em syncBaseToAnalysis_(${mode}):`, error);
    console.error('  Stack:', error.stack);
    logToSheet("ERROR", "AutoSync", `❌ ERRO CRÍTICO em ${mode}: ${error.message}`);
    logToSheet("ERROR", "AutoSync", `Stack: ${error.stack}`);
    flushLogs_();
    return { created, updated, skipped, errors: errors + 1 };
  }
}

// ================================================================================
// CONSTRUTORES DE OUTPUT: FUNÇÕES DO MOTOR DE ANÁLISE IA
// ================================================================================
// Estas funções montam as linhas completas de análise com IA, MEDDIC, BANT, etc.
// Importadas do forecastai.gs original para manter compatibilidade total

/**
 * Constrói linha de output para OPEN (53 colunas)
 * Inclui: MEDDIC, BANT, Forecast IA, Velocity, Anomalias, Território, Q1-Q4
 */
// ════════════════════════════════════════════════════════════════════════════════════════════════
// buildOpenOutputRow() e buildClosedOutputRow() estão definidas em ShareCode.gs
// NÃO CRIAR DUPLICATAS AQUI - usar as funções centralizadas de ShareCode.gs
// Historicamente, houve duplicação que causou inconsistências (corrigido em 08/02/2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════

// ================================================================================
// FUNÇÕES AUTOSYNC: INTEGRAÇÃO COM MOTOR DE ANÁLISE IA
// ================================================================================

/**
 * Recalcula change tracking para análises WON e LOST
 * Lê do histórico correto e atualiza as colunas de mudanças
 * @private
 */
function recalcularChangeTrackingClosedDeals_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const configs = [
    { mode: 'WON', analysisSheet: SHEETS.RESULTADO_GANHAS, changesSheet: 'Historico_Alteracoes_Ganhos' },
    { mode: 'LOST', analysisSheet: SHEETS.RESULTADO_PERDIDAS, changesSheet: 'Alteracoes_Oportunidade' }
  ];
  
  let wonUpdated = 0;
  let lostUpdated = 0;
  
  for (const config of configs) {
    console.log(`\n🔍 Processando ${config.mode}...`);
    const analysisSheet = ss.getSheetByName(config.analysisSheet);
    const changesSheet = ss.getSheetByName(config.changesSheet);
    
    if (!analysisSheet) {
      console.log(`❌ Aba ${config.analysisSheet} NÃO EXISTE`);
      continue;
    }
    
    if (!changesSheet) {
      console.log(`❌ Aba ${config.changesSheet} NÃO EXISTE`);
      continue;
    }
    
    const analysisRows = analysisSheet.getLastRow();
    const changesRows = changesSheet.getLastRow();
    
    console.log(`📊 Aba análise: ${analysisRows} linhas`);
    console.log(`📊 Aba mudanças: ${changesRows} linhas`);
    
    if (analysisRows < 2) {
      console.log(`⚠️ Aba ${config.analysisSheet} vazia (só header)`);
      continue;
    }
    
    if (changesRows < 2) {
      console.log(`⚠️ Aba ${config.changesSheet} vazia (só header)`);
      continue;
    }
    
    // Carregar headers e dados
    const analysisData = analysisSheet.getDataRange().getValues();
    const analysisHeaders = analysisData[0];
    
    const changesData = changesSheet.getDataRange().getValues();
    const changesHeaders = changesData[0];
    
    console.log(`🔍 Headers de ${config.changesSheet}: ${changesHeaders.slice(0, 5).join(', ')}...`);
    
    // Encontrar colunas de oportunidade
    const oppIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
    
    // Ambos (WON e LOST) usam "Alteracoes_Oportunidade" mas com headers diferentes
    // WON: Historico_Alteracoes_Ganhos tem "Opportunity Name"
    // LOST: Alteracoes_Oportunidade tem "Oportunidade"
    let changesOppIdx = changesHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPPORTUNITY') && norm.includes('NAME');
    });
    
    // Se não encontrou "Opportunity Name", tenta só "Oportunidade" (caso de LOST)
    if (changesOppIdx === -1) {
      changesOppIdx = changesHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
    }
    
    console.log(`🔍 Índice coluna Oportunidade (análise): ${oppIdx} (${analysisHeaders[oppIdx] || 'NÃO ENCONTRADO'})`);
    console.log(`🔍 Índice coluna Oportunidade (mudanças): ${changesOppIdx} (${changesHeaders[changesOppIdx] || 'NÃO ENCONTRADO'})`);
    
    if (oppIdx === -1) {
      console.log(`❌ Coluna OPORTUNIDADE não encontrada em ${config.analysisSheet}`);
      console.log(`   Headers disponíveis: ${analysisHeaders.slice(0, 10).join(', ')}`);
      continue;
    }
    
    if (changesOppIdx === -1) {
      console.log(`❌ Coluna OPORTUNIDADE não encontrada em ${config.changesSheet}`);
      console.log(`   Headers disponíveis: ${changesHeaders.join(', ')}`);
      continue;
    }
    
    // Indexar mudanças por oportunidade
    const changesMap = new Map();
    for (let i = 1; i < changesData.length; i++) {
      const oppName = normText_(String(changesData[i][changesOppIdx] || ''));
      if (oppName) {
        if (!changesMap.has(oppName)) {
          changesMap.set(oppName, []);
        }
        changesMap.get(oppName).push(changesData[i]);
      }
    }
    
    console.log(`📦 Indexado ${changesMap.size} oportunidades únicas no histórico`);
    
    // Mostrar amostra
    if (changesMap.size > 0) {
      const sampleKeys = Array.from(changesMap.keys()).slice(0, 3);
      console.log(`   Exemplo: ${sampleKeys.join(', ')}`);
    }
    
    // Encontrar colunas de change tracking na análise
    const totalChangesIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('TOTAL') && normText_(String(h)).includes('MUDANCAS'));
    const criticalChangesIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('MUDANCAS') && normText_(String(h)).includes('CRITICAS'));
    const closeDateChangesIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('MUDANCAS') && normText_(String(h)).includes('CLOSE'));
    const stageChangesIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('MUDANCAS') && normText_(String(h)).includes('STAGE'));
    const valueChangesIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('MUDANCAS') && normText_(String(h)).includes('VALOR'));
    const topFieldsIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('CAMPOS') && normText_(String(h)).includes('ALTERADOS'));
    const patternIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('PADRAO') && normText_(String(h)).includes('MUDANCAS'));
    const freqIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('FREQ') && normText_(String(h)).includes('MUDANCAS'));
    const editorsIdx = analysisHeaders.findIndex(h => normText_(String(h)).includes('EDITORES'));
    
    console.log(`🔍 Colunas de tracking: total=${totalChangesIdx}, critical=${criticalChangesIdx}, closeDate=${closeDateChangesIdx}, stage=${stageChangesIdx}, value=${valueChangesIdx}`);
    
    if (totalChangesIdx === -1) {
      console.log(`⚠️ ATENÇÃO: Coluna "# Total Mudanças" não encontrada!`);
    }
    
    // Processar cada linha de análise
    let updated = 0;
    let skipped = 0;
    for (let i = 1; i < analysisData.length; i++) {
      const oppNameRaw = String(analysisData[i][oppIdx] || '');
      const oppName = normText_(oppNameRaw);
      const relatedChanges = changesMap.get(oppName) || [];
      
      if (i <= 3) {
        console.log(`   Linha ${i+1}: "${oppNameRaw}" (norm: "${oppName}") → ${relatedChanges.length} mudanças`);
      }
      
      if (relatedChanges.length === 0) {
        skipped++;
        continue;
      }
      
      // Recalcular change tracking
      const detailedChanges = getDetailedChangesAnalysis(relatedChanges, changesHeaders);
      
      // Atualizar células
      const row = i + 1;
      if (totalChangesIdx > -1) analysisSheet.getRange(row, totalChangesIdx + 1).setValue(detailedChanges.totalChanges);
      if (criticalChangesIdx > -1) analysisSheet.getRange(row, criticalChangesIdx + 1).setValue(detailedChanges.criticalChanges);
      if (closeDateChangesIdx > -1) analysisSheet.getRange(row, closeDateChangesIdx + 1).setValue(detailedChanges.closeDateChanges);
      if (stageChangesIdx > -1) analysisSheet.getRange(row, stageChangesIdx + 1).setValue(detailedChanges.stageChanges);
      if (valueChangesIdx > -1) analysisSheet.getRange(row, valueChangesIdx + 1).setValue(detailedChanges.valueChanges);
      if (topFieldsIdx > -1) analysisSheet.getRange(row, topFieldsIdx + 1).setValue(detailedChanges.topFields || "-");
      if (patternIdx > -1) analysisSheet.getRange(row, patternIdx + 1).setValue(detailedChanges.changePattern || "-");
      if (freqIdx > -1) analysisSheet.getRange(row, freqIdx + 1).setValue(detailedChanges.changeFrequency || "-");
      if (editorsIdx > -1) analysisSheet.getRange(row, editorsIdx + 1).setValue(detailedChanges.uniqueEditors || 0);
      
      updated++;
    }
    
    console.log(`✅ ${config.mode}: ${updated} atualizadas, ${skipped} sem mudanças`);
    
    if (config.mode === 'WON') wonUpdated = updated;
    else lostUpdated = updated;
  }
  
  return { wonUpdated, lostUpdated };
}

/**
 * Obtém o Run ID da execução atual (criando se não existir)
 * @private
 */
function getRunId_(mode) {
  const props = PropertiesService.getScriptProperties();
  const key = `RUN_ID_${mode}`;
  let runId = props.getProperty(key);
  if (!runId) {
    runId = new Date().toISOString();
    props.setProperty(key, runId);
  }
  return runId;
}

/**
 * Recalcula datas de fechamento para deals Won/Lost usando data da última mudança de fase
 * @private
 */
function recalcularDatasFechamento_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const modes = [
    { mode: 'WON', config: getModeConfig('WON') },
    { mode: 'LOST', config: getModeConfig('LOST') }
  ];
  
  let wonUpdated = 0;
  let lostUpdated = 0;
  let skipped = 0;
  
  for (const { mode, config } of modes) {
    const analysisSheet = ss.getSheetByName(config.output);
    if (!analysisSheet || analysisSheet.getLastRow() < 2) {
      console.log(`Aba ${config.output} vazia ou inexistente, pulando`);
      continue;
    }
    
    // Carregar dados do histórico (Historico_Ganhos ou Historico_Perdidas)
    const rawHistorico = getSheetData(config.input);
    if (!rawHistorico || !rawHistorico.values || rawHistorico.values.length === 0) {
      console.log(`Sem dados de histórico para ${mode}, pulando`);
      continue;
    }
    
    const historicoHeaders = rawHistorico.headers;
    const historicoData = rawHistorico.values;
    
    // Encontrar colunas no histórico
    const histOppIdx = historicoHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE');
    });
    
    const histLastStageDateIdx = historicoHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('DATA') && norm.includes('ULTIMA') && norm.includes('MUDANCA') && norm.includes('FASE');
    });

    const histCreatedIdx = historicoHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('CREATED') || norm.includes('CRIAC') || norm.includes('CREAC');
    });
    
    if (histOppIdx === -1 || histLastStageDateIdx === -1) {
      console.log(`⚠️ Colunas não encontradas no histórico para ${mode}: oppIdx=${histOppIdx}, lastStageDateIdx=${histLastStageDateIdx}`);
      continue;
    }
    
    // Criar mapa: oportunidade(normalizada) → { lastStageDate, createdDate }
    const historicoMap = new Map();
    for (let i = 0; i < historicoData.length; i++) {
      const oppName = String(historicoData[i][histOppIdx] || '').trim();
      const oppKey = normText_(oppName);
      const lastStageDate = historicoData[i][histLastStageDateIdx];
      if (!oppName) continue;

      const createdRaw = histCreatedIdx > -1 ? historicoData[i][histCreatedIdx] : null;
      const createdParsed = createdRaw ? (createdRaw instanceof Date ? createdRaw : parseDate(createdRaw)) : null;
      const lastStageParsed = lastStageDate ? (lastStageDate instanceof Date ? lastStageDate : parseDate(lastStageDate)) : null;

      // Mesmo que falte um dos dois, guarda o que tiver (ajuda em diagnóstico)
      if (lastStageParsed || createdParsed) {
        historicoMap.set(oppKey, { lastStageDate: lastStageParsed, createdDate: createdParsed });
      }
    }
    
    const analysisData = analysisSheet.getDataRange().getValues();
    const analysisHeaders = analysisData[0];
    
    // Encontrar colunas relevantes
    const oppIdx = analysisHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE');
    });
    
    const closeDateIdx = analysisHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return (norm.includes('FECHA') && norm.includes('CIERRE')) || 
             (norm.includes('DATA') && norm.includes('FECHAMENTO'));
    });
    
    const cicloIdx = analysisHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('CICLO') && norm.includes('DIAS');
    });
    
    const createdIdx = analysisHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('CRIADO') || norm.includes('CREATED');
    });
    
    if (oppIdx === -1 || closeDateIdx === -1) {
      console.log(`⚠️ Colunas não encontradas em ${config.output}: oppIdx=${oppIdx}, closeDateIdx=${closeDateIdx}`);
      continue;
    }
    
    console.log(`📅 Processando ${mode}: oppIdx=${oppIdx}, closeDateIdx=${closeDateIdx}, cicloIdx=${cicloIdx}, createdIdx=${createdIdx}`);
    
    // DEBUG: Verificar primeiras 5 chaves do historicoMap
    console.log(`🔍 Primeiras 5 chaves no historicoMap:`);
    let debugCount = 0;
    for (let key of historicoMap.keys()) {
      if (debugCount++ < 5) {
        console.log(`   - "${key}" → Data: ${formatDateRobust(historicoMap.get(key))}`);
      } else break;
    }
    
    // Processar cada linha
    let updated = 0;
    const updatesToWrite = [];
    
    for (let i = 1; i < analysisData.length; i++) {
      const oppNameRaw = String(analysisData[i][oppIdx] || '').trim();
      const oppKey = normText_(oppNameRaw);
      const histEntry = historicoMap.get(oppKey);
      const lastStageDate = histEntry ? histEntry.lastStageDate : null;
      
      // DEBUG: Log primeiras 5 buscas
      if (i <= 5) {
        console.log(`   Linha ${i}: "${oppNameRaw}" → ${lastStageDate ? formatDateRobust(lastStageDate) : 'NÃO ENCONTRADO'}`);
      }
      
      if (!lastStageDate) {
        skipped++;
        continue;
      }
      
      // Verificar se a data atual é diferente
      const currentDate = analysisData[i][closeDateIdx];
      const currentDateParsed = currentDate instanceof Date ? currentDate : parseDate(currentDate);
      
      // Determinar target close date e ciclo (com correção estilo CorrigirFiscalQ apenas se inconsistente)
      let targetCloseDate = lastStageDate;
      let targetCiclo = null;

      if (cicloIdx > -1) {
        // Created date: preferir a coluna na análise; se não existir, usar histórico
        let createdDateParsed = null;
        if (createdIdx > -1) {
          const createdDateCell = analysisData[i][createdIdx];
          createdDateParsed = createdDateCell instanceof Date ? createdDateCell : parseDate(createdDateCell);
        }
        if (!createdDateParsed && histEntry && histEntry.createdDate) {
          createdDateParsed = histEntry.createdDate instanceof Date ? histEntry.createdDate : parseDate(histEntry.createdDate);
        }

        if (createdDateParsed) {
          const computed = Math.ceil((targetCloseDate - createdDateParsed) / MS_PER_DAY);
          if (computed < 0) {
            const fix = tryFixInvertedDates_(createdDateParsed, targetCloseDate);
            if (fix.fixed) {
              targetCloseDate = fix.closed;
              targetCiclo = fix.ciclo;
              logToSheet(
                'WARN',
                'DateFix',
                `Ciclo negativo detectado em recalcularDatasFechamento_; inversão aplicada (ciclo=${computed} → ${fix.ciclo})`,
                { oportunidade: oppNameRaw, aba: mode }
              );
            } else {
              logToSheet(
                'WARN',
                'DateFix',
                `Ciclo negativo detectado em recalcularDatasFechamento_; sem correção automática (ciclo=${computed})`,
                { oportunidade: oppNameRaw, aba: mode }
              );
              targetCiclo = computed;
            }
          } else {
            targetCiclo = computed;
          }
        }
      }

      // Só atualiza Close Date se for diferente
      if (!currentDateParsed || Math.abs(targetCloseDate - currentDateParsed) > MS_PER_DAY) { // Diferença > 1 dia
        updatesToWrite.push({
          row: i + 1,
          col: closeDateIdx + 1,
          value: formatDateRobust(targetCloseDate),
          oppName: oppNameRaw
        });

        if (cicloIdx > -1 && typeof targetCiclo === 'number' && isFinite(targetCiclo)) {
          updatesToWrite.push({
            row: i + 1,
            col: cicloIdx + 1,
            value: targetCiclo,
            oppName: oppNameRaw,
            isCiclo: true
          });
        }

        updated++;

        if (updated <= 3) {
          console.log(`   📅 ${oppNameRaw}: ${currentDate ? formatDateRobust(currentDate) : 'vazio'} → ${formatDateRobust(targetCloseDate)}`);
        }
      }
    }
    
    // Aplicar atualizações em batch
    if (updatesToWrite.length > 0) {
      console.log(`📝 Escrevendo ${updatesToWrite.length} atualizações em ${config.output}...`);
      updatesToWrite.forEach(update => {
        analysisSheet.getRange(update.row, update.col).setValue(update.value);
        if (update.isCiclo) {
          console.log(`   🔄 Ciclo recalculado para ${update.oppName}: ${update.value} dias`);
        }
      });
    }
    
    if (mode === 'WON') wonUpdated = updated;
    else if (mode === 'LOST') lostUpdated = updated;
    
    console.log(`✅ ${mode}: ${updated} datas atualizadas`);
  }
  
  return { wonUpdated, lostUpdated, skipped };
}

/**
 * Obtém o nome da sheet da fila de processamento para o modo especificado
 * @private
 */
/**
 * Adiciona timestamp retroativo em análises que não têm
 * @param {string} mode - OPEN, WON ou LOST
 * @param {Date} retroDate - Data retroativa
 * @private
 */
function adicionarTimestampRetroativo_(mode, retroDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  const analysisSheet = ss.getSheetByName(config.output);
  
  if (!analysisSheet || analysisSheet.getLastRow() < 2) {
    logToSheet("DEBUG", "Timestamp", `Aba ${config.output} vazia ou inexistente, pulando timestamp retroativo`);
    return 0;
  }
  
  const defaultDate = retroDate || new Date(2026, 0, 30, 19, 0, 0);
  const lastRow = analysisSheet.getLastRow();
  const lastCol = analysisSheet.getLastColumn();
  const headers = analysisSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  logToSheet("DEBUG", "Timestamp", `Buscando coluna timestamp em ${config.output}, ${lastCol} colunas totais`);
  
  const timestampIdx = headers.findIndex(h => {
    const norm = normText_(String(h));
    return norm.includes('ULTIMA') && norm.includes('ATUALIZACAO');
  });
  
  if (timestampIdx === -1) {
    // Coluna não encontrada - precisa adicionar manualmente ou recriar headers
    logToSheet("WARN", "Timestamp", `Coluna "🕐 Última Atualização" NÃO ENCONTRADA em ${config.output}. Headers: ${headers.slice(-5).join(', ')}`);
    
    // Adicionar coluna se não existir
    const timestampHeader = "🕐 Última Atualização";
    analysisSheet.getRange(1, lastCol + 1).setValue(timestampHeader);
    const newTimestampCol = lastCol + 1;
    
    // Preencher com data retroativa
    if (lastRow > 1) {
      const values = Array(lastRow - 1).fill([defaultDate]);
      analysisSheet.getRange(2, newTimestampCol, lastRow - 1, 1).setValues(values);
      logToSheet("INFO", "Timestamp", `Coluna timestamp CRIADA e preenchida com ${lastRow - 1} datas retroativas`);
      return lastRow - 1;
    }
    return 0;
  }
  
  const timestampCol = timestampIdx + 1;
  logToSheet("DEBUG", "Timestamp", `Coluna timestamp encontrada no índice ${timestampCol}`);
  
  const data = analysisSheet.getRange(2, timestampCol, lastRow - 1, 1).getValues();
  let updated = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (!data[i][0] || data[i][0] === '' || data[i][0] === '-') {
      analysisSheet.getRange(i + 2, timestampCol).setValue(defaultDate);
      updated++;
    }
  }
  
  if (updated > 0) {
    logToSheet("DEBUG", "Timestamp", `${updated} linhas receberam timestamp retroativo`);
  }
  
  return updated;
}

/**
 * Processa análise completa DIRETAMENTE (sem fila, 1 por vez)
 * @param {string} oppName - Nome da oportunidade
 * @param {string} mode - OPEN, WON ou LOST
 * @param {Object} config - Configuração do modo
 * @private
 */
function processarAnaliseCompleta_(oppName, mode, config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(config.input);
  
  if (!baseSheet) throw new Error(`Aba ${config.input} não encontrada`);
  
  const baseData = baseSheet.getDataRange().getValues();
  const baseHeaders = baseData[0];
  const cols = getColumnMapping(baseHeaders);
  
  const oppRows = [];
  for (let i = 1; i < baseData.length; i++) {
    const rowOppName = String(baseData[i][cols.p_opp] || '').trim();
    if (normText_(rowOppName) === normText_(oppName)) {
      oppRows.push(baseData[i]);
    }
  }
  
  if (oppRows.length === 0) throw new Error(`${oppName} não encontrada`);
  
  const aggregatedData = aggregateOpportunities(oppRows, cols, mode);
  if (aggregatedData.length === 0) throw new Error(`Falha ao agregar ${oppName}`);
  
  const item = aggregatedData[0];
  
  const rawActivities = getSheetData(SHEETS.ATIVIDADES);
  const rawChanges = getSheetData(config.changes);
  const activitiesHeaders = rawActivities ? rawActivities.headers : [];
  const changesHeaders = rawChanges ? rawChanges.headers : [];
  
  const activitiesMap = indexDataByMultiKey_(rawActivities);
  const changesMap = indexDataByMultiKey_(rawChanges);
  
  const oppLookupKey = normText_(item.oppId || item.oppName);
  const relatedActivities = activitiesMap.get(oppLookupKey) || [];
  const relatedChanges = changesMap.get(oppLookupKey) || [];
  
  // CRÍTICO: Aplicar correção de data de fechamento (usa data da última mudança de fase para WON/LOST)
  // IMPORTANTE: applyClosedDateCorrection_ também recalcula o ciclo automaticamente
  applyClosedDateCorrection_(item, mode, relatedChanges, changesHeaders);
  
  const baseClients = getBaseClientsCache();
  const isBaseClient = baseClients.has(item.accName.toLowerCase());
  const clientProfile = isBaseClient ? ENUMS.LABELS.BASE_CLIENT : ENUMS.LABELS.NEW_CLIENT;
  const fiscal = calculateFiscalQuarterForItem_(item, mode);
  const hoje = new Date();
  const runId = getRunId_(mode);
  
  const activityData = processActivityStatsSmart(relatedActivities, activitiesHeaders, hoje);
  
  let idleDays = calculateIdleDays(activityData.lastDate, hoje);
  if (mode === 'OPEN' && item.inactiveDays > 0 && idleDays === "SEM REGISTRO") {
    idleDays = item.inactiveDays;
  }
  
  const meddic = calculateMEDDICScore(item, activityData.fullText);
  const auditSummary = summarizeChangesSmart(relatedChanges, changesHeaders);
  const detailedChanges = getDetailedChangesAnalysis(relatedChanges, changesHeaders);
  
  let finalRow;
  
  if (mode === 'OPEN') {
    const govInfo = detectGovProcurementStage_((item.desc || "") + " " + (activityData.fullText || ""));
    const closeDateChanges = countFieldChanges_(relatedChanges, changesHeaders, ["Close Date"]);
    const stageNorm = normalizeStage_(item.stage);
    const expectedCloseDate = item.closed || (fiscal && fiscal.close ? fiscal.close : null);
    const quarterRecognition = calculateQuarterRecognizedValue(item.billingCalendar, item.gross, expectedCloseDate);
    const driftInfo = detectStageDrift_(item, activityData, auditSummary, relatedChanges, changesHeaders);
    const velocityMetrics = calculateDealVelocity_(item, relatedChanges, activityData, changesHeaders);
    item._velocityMetrics = velocityMetrics;
    
    const oppLocation = item.billingState || item.billingCity;
    const opportunityOwner = normText_(item.owner);
    const designatedSeller = getDesignatedSellerForLocation(oppLocation, item);
    const isDealCloser = ['GABRIELE OLIVEIRA', 'EMILIO GONCALVES'].includes(opportunityOwner);
    const isCorrectTerritory = isDealCloser || (designatedSeller === opportunityOwner);
    
    let governanceIssues = [];
    let inconsistencyCheck = "OK";
    let rulesApplied = [];
    let overrideForecastCat = null;
    let overrideActionCode = null;
    
    if (govInfo.isGov) {
      governanceIssues.push(ENUMS.LABELS.GOV_PROCESS);
      rulesApplied.push("GOVERNO");
    }
    if (item.net <= 0 && item.gross > 0) {
      governanceIssues.push(ENUMS.LABELS.NET_ZERO);
      rulesApplied.push("NET ZERO");
    }
    
    // NOVAS VALIDAÇÕES: Personas, Next Step Consistency, Inactivity Gate
    const daysInFunnel = item.created ? Math.ceil((hoje - item.created) / MS_PER_DAY) : 0;
    const personas = extractPersonasFromActivities(activityData.fullText, item.desc);
    const bant = calculateBANTScore_(item, activityData);
    const nextStepCheck = validateNextStepConsistency(item.nextStep || item.stage, activityData.fullText, activityData.lastDate);
    const inactivityGate = checkInactivityGate(idleDays, item.forecast_ia || item.probabilidad > 40 ? (item.probabilidad > 60 ? 'UPSIDE' : 'PIPELINE') : 'PIPELINE', activityData.lastDate, item.stage, daysInFunnel);
    
    if (inactivityGate && inactivityGate.isBlocked) {
      governanceIssues.push("INATIVIDADE-GATE-CRÍTICO");
      rulesApplied.push(inactivityGate.alert);
    }
    
    const prompt = getOpenPrompt(item, clientProfile, fiscal, activityData, meddic, bant, personas, nextStepCheck, inactivityGate, auditSummary, idleDays, governanceIssues, inconsistencyCheck, govInfo);
    let jsonResp = { labels: [], forecast_cat: "PIPELINE" };
    
    try {
      const rawResponse = callGeminiAPI(prompt);
      jsonResp = cleanAndParseJSON(rawResponse);
    } catch (e) {
      logToSheet("ERROR", "IA", `Falha IA: ${e.message}`);
      jsonResp = { justificativa: "Erro IA", acao_code: ENUMS.ACTION_CODE.CRM_AUDIT };
    }
    
    const finalLabels = normalizeList((jsonResp.labels || []).concat(governanceIssues), ENUMS.LABELS);
    const finalAction = overrideActionCode || jsonResp.acao_code || ENUMS.ACTION_CODE.CRM_AUDIT;
    const finalForecastCategory = overrideForecastCat || jsonResp.forecast_cat || ENUMS.FORECAST_IA.PIPELINE;
    
    finalRow = buildOpenOutputRow(runId, item, clientProfile, fiscal, activityData, meddic, jsonResp, finalLabels, finalForecastCategory, idleDays, inconsistencyCheck, finalAction, rulesApplied.join(" | "), detailedChanges, isCorrectTerritory, designatedSeller, quarterRecognition);
  } else {
    const activityBreakdown = getDetailedActivityBreakdown(relatedActivities, activitiesHeaders, hoje);
    const prompt = getClosedPrompt(mode, item, clientProfile, fiscal, activityData, meddic, auditSummary, idleDays, normalizeLossReason_(item.reason), detailedChanges, activityBreakdown);
    
    let jsonResp = { labels: [] };
    try {
      const rawResponse = callGeminiAPI(prompt);
      jsonResp = cleanAndParseJSON(rawResponse);
    } catch (e) {
      logToSheet("ERROR", "IA", `Falha IA: ${e.message}`);
    }
    
    const finalLabels = normalizeList(jsonResp.labels || [], ENUMS.LABELS);
    finalRow = buildClosedOutputRow(runId, mode, item, clientProfile, fiscal, jsonResp, finalLabels, activityData, detailedChanges, activityBreakdown);
  }
  
  let resSheet = ss.getSheetByName(config.output);
  if (!resSheet) {
    setupAnalysisSheet(mode, true);
    resSheet = ss.getSheetByName(config.output);
  }
  
  // === GUARDRAIL: VERIFICAR SE JÁ EXISTE (NUNCA DUPLICAR) ===
  // Se a oportunidade já foi processada, SUBSTITUIR a linha existente
  // Se não existe, ADICIONAR nova linha
  let writeRow = null;
  let isUpdate = false;
  
  if (resSheet.getLastRow() > 1) {
    const existingData = resSheet.getDataRange().getValues();
    const existingHeaders = existingData[0];
    const oppColIdx = existingHeaders.findIndex(h => normText_(String(h)).includes('OPORTUNIDADE'));
    
    if (oppColIdx > -1) {
      const normOppName = normText_(item.oppName);
      
      // Buscar se já existe linha com essa oportunidade
      for (let i = 1; i < existingData.length; i++) {
        const existingOppName = String(existingData[i][oppColIdx] || '').trim();
        if (normText_(existingOppName) === normOppName) {
          writeRow = i + 1; // Linha encontrada (1-indexed)
          isUpdate = true;
          console.log(`🔄 GUARDRAIL: Oportunidade "${item.oppName}" já existe na linha ${writeRow} - SUBSTITUINDO`);
          logToSheet("INFO", "Guardrail", `Substituindo análise existente: ${item.oppName} (linha ${writeRow})`);
          break;
        }
      }
    }
  }
  
  // Se não encontrou, adicionar no final
  if (!writeRow) {
    writeRow = resSheet.getLastRow() + 1;
    console.log(`🆕 GUARDRAIL: Nova oportunidade "${item.oppName}" - ADICIONANDO na linha ${writeRow}`);
    logToSheet("INFO", "Guardrail", `Criando nova análise: ${item.oppName} (linha ${writeRow})`);
  }
  
  // Garantir que há linhas suficientes
  if (resSheet.getMaxRows() < writeRow) {
    resSheet.insertRowsAfter(resSheet.getMaxRows(), 20);
  }
  
  // Log para debug: verificar se timestamp está presente
  const timestampValue = finalRow[finalRow.length - 1];
  const action = isUpdate ? 'SUBSTITUINDO' : 'ADICIONANDO';
  console.log(`📝 ${action} análise: ${item.oppName} | Linha: ${writeRow} | Timestamp: ${timestampValue} | Colunas: ${finalRow.length}`);
  
  resSheet.getRange(writeRow, 1, 1, finalRow.length).setValues([finalRow]);
  SpreadsheetApp.flush();
  
  return true;
}

/**
 * Inicializa processamento da fila para um modo específico
 * @private
 */
function initializeQueueProcessing_(mode) {
  const props = PropertiesService.getScriptProperties();
  const runId = getRunId_(mode);
  
  // Verificar se há itens na fila
  const queueSheetName = getQueueSheetName_(mode);
  if (!queueSheetName) {
    const msg = `Fila ${mode} não configurada - impossível processar`;
    console.error(`  ❌ ${msg}`);
    logToSheet("ERROR", "AutoSync", msg);
    return false;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queueSheet = ss.getSheetByName(queueSheetName);
  
  if (!queueSheet) {
    const msg = `Sheet da fila ${mode} (${queueSheetName}) não encontrada`;
    console.error(`  ❌ ${msg}`);
    logToSheet("ERROR", "AutoSync", msg);
    return false;
  }
  
  if (queueSheet.getLastRow() <= 1) {
    console.log(`  ⚠️ Fila ${mode} vazia - nada para processar`);
    return true; // Sucesso, mas sem trabalho
  }
  
  // Configurar estado de execução
  props.setProperty(`IS_RUNNING_${mode}`, 'TRUE');
  props.setProperty(`RUN_ID_${mode}`, runId);
  props.setProperty(`CURRENT_INDEX_${mode}`, '0');
  
  console.log(`  ✅ Fila ${mode} inicializada (${queueSheet.getLastRow() - 1} itens)`);
  
  // Processar primeiro batch imediatamente
  try {
    const result = processQueueGeneric(mode);
    if (result === false) {
      const msg = `Processamento da fila ${mode} falhou - verifique IS_RUNNING_${mode}`;
      console.error(`  ❌ ${msg}`);
      logToSheet("ERROR", "AutoSync", msg);
      flushLogs();
      return false;
    }
    return true;
  } catch (error) {
    console.error(`  ❌ Erro ao processar fila ${mode}:`, error.message);
    logToSheet("ERROR", "AutoSync", `Erro ao processar fila ${mode}: ${error.message}`);
    flushLogs_();
    props.setProperty(`IS_RUNNING_${mode}`, 'FALSE');
    return false;
  }
}

/**
 * Adiciona oportunidade na fila de processamento para análise completa com IA
 * Retorna true se adicionado com sucesso
 * @private
 */
function createCompleteAnalysis_(oppName, mode, config) {
  console.log(`    🆕 Adicionando à fila IA: ${oppName}`);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const runId = getRunId_(mode);
    
    // Buscar/criar sheet da fila
    let queueSheetName = getQueueSheetName_(mode);
    if (!queueSheetName) {
      // Gerar nome da fila baseado no modo
      queueSheetName = `🔄 Fila ${mode}`;
      PropertiesService.getScriptProperties().setProperty(`QUEUE_SHEET_${mode}`, queueSheetName);
    }
    
    let queueSheet = ss.getSheetByName(queueSheetName);
    if (!queueSheet) {
      // Criar sheet da fila
      queueSheet = ss.insertSheet(queueSheetName);
      queueSheet.getRange(1, 1, 1, 3).setValues([['Oportunidade', 'Status', 'Data']]);
      queueSheet.setFrozenRows(1);
    }
    
    // Adicionar à fila
    const lastRow = queueSheet.getLastRow();
    queueSheet.getRange(lastRow + 1, 1, 1, 3).setValues([[oppName, 'PENDING', new Date()]]);
    
    console.log(`      ✅ Adicionado à fila (será processado pelo motor IA)`);
    logToSheet("INFO", "AutoSync", "Adicionado à fila IA", {oportunidade: oppName, aba: queueSheetName});
    return true;
    
  } catch (error) {
    console.error(`      ❌ ERRO CRÍTICO ao adicionar à fila: ${error.message}`);
    logToSheet("ERROR", "AutoSync", `FALHA CRÍTICA ao adicionar à fila: ${error.message}`, {oportunidade: oppName});
    flushLogs_();
    throw error; // Propaga erro para parar execução
  }
}

/**
 * Verifica se análise precisa ser recalculada
 * Critérios: novas atividades OU mudanças críticas OU sem timestamp
 * @private
 */
function checkIfNeedsUpdate_(oppName, mode, config, lastUpdate) {
  // Se não tem timestamp, sempre atualizar
  if (!lastUpdate) {
    console.log(`      ⏰ ${oppName}: Sem timestamp - REPROCESSAR`);
    return true;
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lastUpdateDate = new Date(lastUpdate);
    const normOppName = normText_(oppName);
    const hoje = new Date();
    const daysSinceLastUpdate = Math.ceil((hoje - lastUpdateDate) / MS_PER_DAY);
    
    // =================================================================================
    // 🎯 LÓGICA INTELIGENTE DE STALENESS - VERSÃO OTIMIZADA (v2.0)
    // =================================================================================
    // PROBLEMA RESOLVIDO: Evitar reprocessamento IA desnecessário devido a campos 
    // calculados (Dias Funil, Ciclo) que mudam naturalmente com a passagem do tempo.
    // 
    // FILOSOFIA:
    // - WON/LOST são snapshots finais → NÃO atualizar (a menos que correção manual)
    // - OPEN é dinâmico → atualizar APENAS quando há mudanças REAIS ou após 3 dias
    // 
    // GATILHOS DE IA (caros):
    // 1. Novas Atividades registradas
    // 2. Mudanças em Campos Críticos (Stage, Valor, Close Date, Forecast, Description)
    // 3. Regra de Validade: Última análise > 3 dias (OPEN) ou NUNCA (WON/LOST)
    // 
    // CAMPOS IGNORADOS (atualizados em QuickUpdate sem IA):
    // - Dias Funil (calculado diariamente)
    // - Ciclo (dias) (recalculado se Close Date mudar - mas Close Date já é gatilho)
    // - Gross/Net (atualizados em QuickUpdate)
    // =================================================================================
    
    // --- WON e LOST: Análises FECHADAS (snapshots finais - NÃO atualizar) ---
    if (mode === 'WON' || mode === 'LOST') {
      // 🔒 NOVA POLÍTICA: WON/LOST são registros históricos que NÃO devem ser alterados
      // após a análise inicial, exceto em casos excepcionais de correção manual.
      
      // ÚNICA EXCEÇÃO: Verificar se houve mudanças manuais na BASE (correção de dados)
      const baseSheet = ss.getSheetByName(config.input);
      if (baseSheet && baseSheet.getLastRow() > 1) {
        const data = baseSheet.getDataRange().getValues();
        const headers = data[0];
        const oppIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE');
        });
        
        if (oppIdx > -1) {
          // Buscar a oportunidade na base
          for (let i = 1; i < data.length; i++) {
            const rowOpp = normText_(String(data[i][oppIdx] || ''));
            if (rowOpp === normOppName) {
              // Verificar se há mudanças no histórico de alterações APÓS última atualização
              const chgSheet = ss.getSheetByName(config.changes);
              if (chgSheet && chgSheet.getLastRow() > 1) {
                const chgData = chgSheet.getDataRange().getValues();
                const chgHeaders = chgData[0];
                const chgOppIdx = chgHeaders.findIndex(h => {
                  const norm = normText_(String(h));
                  return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE');
                });
                const chgDateIdx = chgHeaders.findIndex(h => {
                  const norm = normText_(String(h));
                  return norm.includes('EDIT') || (norm.includes('DATE') && !norm.includes('CLOSE'));
                });
                
                if (chgOppIdx > -1 && chgDateIdx > -1) {
                  for (let j = 1; j < chgData.length; j++) {
                    const chgRowOpp = normText_(String(chgData[j][chgOppIdx] || ''));
                    const chgDate = parseDate(chgData[j][chgDateIdx]);
                    
                    if (chgRowOpp === normOppName && chgDate && chgDate > lastUpdateDate) {
                      console.log(`      🔄 ${oppName}: Correção manual detectada (${mode}) - REPROCESSAR`);
                      logToSheet("INFO", "StalenessCheck", `${oppName}: Correção manual em ${mode} - reprocessando`);
                      return true;
                    }
                  }
                }
              }
              break;
            }
          }
        }
      }
      
      // 🔒 NENHUMA MUDANÇA = NÃO REPROCESSAR (mesmo após vários dias)
      console.log(`      ✅ ${oppName}: ${mode} inalterado (${daysSinceLastUpdate}d) - snapshot preservado`);
      return false;
    }
    
    // --- OPEN: Pipeline ATIVO (atualizar apenas com mudanças REAIS) ---
    if (mode === 'OPEN') {
      let hasRealChanges = false;
      const changeReasons = [];
      
      // ========================================================================
      // GATILHO 1: NOVAS ATIVIDADES
      // ========================================================================
      // Verifica se há atividades registradas APÓS a última atualização da análise
      const actSheet = ss.getSheetByName(SHEETS.ATIVIDADES);
      if (actSheet && actSheet.getLastRow() > 1) {
        const data = actSheet.getDataRange().getValues();
        const headers = data[0];
        const oppIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY'));
        const dateIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return (norm.includes('DATE') || norm.includes('DATA')) && 
                 !norm.includes('CREATED') && 
                 !norm.includes('CRIACAO');
        });
        
        if (oppIdx > -1 && dateIdx > -1) {
          let newActivitiesCount = 0;
          for (let i = 1; i < data.length; i++) {
            const rowOpp = normText_(String(data[i][oppIdx] || ''));
            const actDate = parseDate(data[i][dateIdx]);
            if (rowOpp === normOppName && actDate && actDate > lastUpdateDate) {
              newActivitiesCount++;
            }
          }
          
          if (newActivitiesCount > 0) {
            hasRealChanges = true;
            changeReasons.push(`${newActivitiesCount} nova(s) atividade(s)`);
          }
        }
      }
      
      // ========================================================================
      // GATILHO 2: MUDANÇAS EM CAMPOS CRÍTICOS
      // ========================================================================
      // Campos críticos que justificam reprocessamento IA:
      // - Stage/Fase: mudança de estágio no funil
      // - Amount/Valor: mudança no valor total ou net
      // - Close Date: mudança na data prevista de fechamento
      // - Forecast Category: mudança na categoria de previsão (Commit/Upside/etc)
      // - Description: mudança na descrição (pode afetar MEDDIC/BANT)
      const chgSheet = ss.getSheetByName(config.changes);
      if (chgSheet && chgSheet.getLastRow() > 1) {
        const data = chgSheet.getDataRange().getValues();
        const headers = data[0];
        const oppIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY'));
        const dateIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('EDIT') || (norm.includes('DATE') && !norm.includes('CLOSE'));
        });
        const fieldIdx = headers.findIndex(h => normText_(String(h)).includes('FIELD'));
        
        if (oppIdx > -1 && dateIdx > -1 && fieldIdx > -1) {
          // Lista expandida de campos críticos (em múltiplos idiomas)
          const criticalFields = [
            'STAGE', 'FASE', 'ETAPA',                    // Mudança de estágio
            'AMOUNT', 'VALOR', 'TOTAL', 'PRICE',         // Mudança de valor
            'CLOSE', 'FECHA', 'FECHAMENTO', 'CIERRE',    // Data de fechamento
            'FORECAST', 'PREVISION', 'PREVISAO',         // Categoria forecast
            'DESCRIPTION', 'DESCRICAO', 'DESCRIPCION'    // Descrição (afeta análise)
          ];
          
          const criticalChanges = new Map(); // field -> count
          
          for (let i = 1; i < data.length; i++) {
            const rowOpp = normText_(String(data[i][oppIdx] || ''));
            const chgDate = parseDate(data[i][dateIdx]);
            const field = normText_(String(data[i][fieldIdx] || ''));
            
            if (rowOpp === normOppName && chgDate && chgDate > lastUpdateDate) {
              if (criticalFields.some(c => field.includes(c))) {
                hasRealChanges = true;
                const fieldName = field.substring(0, 30); // Truncar para log
                criticalChanges.set(fieldName, (criticalChanges.get(fieldName) || 0) + 1);
              }
            }
          }
          
          if (criticalChanges.size > 0) {
            const changesStr = Array.from(criticalChanges.entries())
              .map(([f, c]) => `${f}(${c}x)`)
              .join(', ');
            changeReasons.push(`Mudanças críticas: ${changesStr}`);
          }
        }
      }
      
      // ========================================================================
      // GATILHO 3: REGRA DE VALIDADE (3 DIAS) - APENAS PIPELINE
      // ========================================================================
      // ATENÇÃO: Reprocessamento periódico APENAS para PIPELINE (OPEN)
      // GANHOS e PERDIDAS são snapshots históricos - não precisam reprocessamento temporal
      // 
      // Para PIPELINE, reprocessar após 3 dias para:
      // - Atualizar métricas de tempo (Dias Idle, velocidade)
      // - Re-avaliar risco com base em inatividade crescente
      // - Manter insights da IA atualizados com contexto temporal
      if (mode === 'OPEN' && daysSinceLastUpdate >= 3) {
        hasRealChanges = true;
        changeReasons.push(`Validade expirada (${daysSinceLastUpdate}d)`);
      }
      
      // ========================================================================
      // DECISÃO FINAL
      // ========================================================================
      if (hasRealChanges) {
        const reasonsStr = changeReasons.join(' | ');
        console.log(`      🔄 ${oppName}: ${reasonsStr} - REPROCESSAR`);
        logToSheet("INFO", "StalenessCheck", `[${mode}] ${oppName}: ${reasonsStr}`);
        return true;
      } else {
        console.log(`      ✅ ${oppName}: Atualizado (${daysSinceLastUpdate}d, sem mudanças reais)`);
        return false;
      }
    }
    
    // Fallback: atualizar por segurança (modo desconhecido)
    console.log(`      ⚠️ ${oppName}: Modo desconhecido (${mode}) - REPROCESSAR por segurança`);
    return true;
    
  } catch (error) {
    console.error(`      ❌ Erro verificando ${oppName}: ${error.message}`);
    logToSheet("ERROR", "StalenessCheck", `Erro em ${oppName}: ${error.message}`);
    return true; // Atualizar por segurança em caso de erro
  }
}

/**
 * Recalcula análise existente (REPROCESSA TUDO com IA)
 * @private
 */
function updateExistingAnalysis_(oppName, mode, config, analysisRow) {
  console.log(`    🔄 Adicionando à fila IA para recálculo: ${oppName}`);
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const analysisSheet = ss.getSheetByName(config.output);
    
    if (!analysisSheet) {
      console.error(`      ❌ Aba ${config.output} não encontrada`);
      return false;
    }
    
    // DELETAR linha antiga (será recriada pela fila)
    analysisSheet.deleteRow(analysisRow);
    console.log(`      🗑️ Linha ${analysisRow} removida`);
    
    // ADICIONAR à fila para reprocessamento
    const added = createCompleteAnalysis_(oppName, mode, config);
    
    if (added) {
      console.log(`      ✅ Adicionado à fila para recálculo com IA`);
      logToSheet("INFO", "AutoSync", "Análise agendada para recálculo", {aba: config.output, linha: analysisRow, oportunidade: oppName});
    }
    
    return added;
    
  } catch (error) {
    console.error(`      ❌ Erro ao recalcular: ${error.message}`);
    console.error(`      Stack: ${error.stack}`);
    return false;
  }
}

/**
 * Identifica quais oportunidades foram afetadas pelas mudanças
 * @private
 */
function identificarOportunidadesAfetadas_(newOpps, newActivities, newChanges, lastPipelineRow, lastActivitiesRow, lastChangesRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affectedOpps = new Set();
  
  // 1. Novas oportunidades (últimas N linhas)
  if (newOpps > 0) {
    const pipelineSheet = ss.getSheetByName(SHEETS.ABERTO);
    if (pipelineSheet) {
      const currentRow = pipelineSheet.getLastRow();
      const startRow = Math.max(2, lastPipelineRow + 1);
      if (startRow <= currentRow) {
        const data = pipelineSheet.getRange(startRow, 1, currentRow - startRow + 1, pipelineSheet.getLastColumn()).getValues();
        const headers = pipelineSheet.getRange(1, 1, 1, pipelineSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY'));
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  // 2. Novas atividades (identifica opp owner)
  if (newActivities > 0) {
    const activitiesSheet = ss.getSheetByName(SHEETS.ATIVIDADES);
    if (activitiesSheet) {
      const currentRow = activitiesSheet.getLastRow();
      const startRow = Math.max(2, lastActivitiesRow + 1);
      if (startRow <= currentRow) {
        const data = activitiesSheet.getRange(startRow, 1, currentRow - startRow + 1, activitiesSheet.getLastColumn()).getValues();
        const headers = activitiesSheet.getRange(1, 1, 1, activitiesSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE');
        });
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  // 3. Mudanças (campo alterado)
  if (newChanges > 0) {
    const changesSheet = ss.getSheetByName(SHEETS.ALTERACOES_ABERTO);
    if (changesSheet) {
      const currentRow = changesSheet.getLastRow();
      const startRow = Math.max(2, lastChangesRow + 1);
      if (startRow <= currentRow) {
        const data = changesSheet.getRange(startRow, 1, currentRow - startRow + 1, changesSheet.getLastColumn()).getValues();
        const headers = changesSheet.getRange(1, 1, 1, changesSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE') || norm.includes('NOME');
        });
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  return affectedOpps;
}

/**
 * Identifica oportunidades afetadas em WON (Ganhas)
 * @private
 */
function identificarOportunidadesAfetadasWon_(newOpps, newChanges, lastGanhasRow, lastChangesRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affectedOpps = new Set();
  
  // 1. Novas oportunidades Won
  if (newOpps > 0) {
    const ganhasSheet = ss.getSheetByName(SHEETS.GANHAS);
    if (ganhasSheet) {
      const currentRow = ganhasSheet.getLastRow();
      const startRow = Math.max(2, lastGanhasRow + 1);
      if (startRow <= currentRow) {
        const data = ganhasSheet.getRange(startRow, 1, currentRow - startRow + 1, ganhasSheet.getLastColumn()).getValues();
        const headers = ganhasSheet.getRange(1, 1, 1, ganhasSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY') || normText_(String(h)).includes('OPORTUNIDADE'));
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  // 2. Mudanças em Won
  if (newChanges > 0) {
    const changesSheet = ss.getSheetByName('Historico_Alteracoes_Ganhos');
    if (changesSheet) {
      const currentRow = changesSheet.getLastRow();
      const startRow = Math.max(2, lastChangesRow + 1);
      if (startRow <= currentRow) {
        const data = changesSheet.getRange(startRow, 1, currentRow - startRow + 1, changesSheet.getLastColumn()).getValues();
        const headers = changesSheet.getRange(1, 1, 1, changesSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE') || norm.includes('NOME');
        });
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  return affectedOpps;
}

/**
 * Identifica oportunidades afetadas em LOST (Perdidas)
 * @private
 */
function identificarOportunidadesAfetadasLost_(newOpps, newChanges, lastPerdidasRow, lastChangesRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affectedOpps = new Set();
  
  // 1. Novas oportunidades Lost
  if (newOpps > 0) {
    const perdidasSheet = ss.getSheetByName(SHEETS.PERDIDAS);
    if (perdidasSheet) {
      const currentRow = perdidasSheet.getLastRow();
      const startRow = Math.max(2, lastPerdidasRow + 1);
      if (startRow <= currentRow) {
        const data = perdidasSheet.getRange(startRow, 1, currentRow - startRow + 1, perdidasSheet.getLastColumn()).getValues();
        const headers = perdidasSheet.getRange(1, 1, 1, perdidasSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY') || normText_(String(h)).includes('OPORTUNIDADE'));
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  // 2. Mudanças em Lost
  if (newChanges > 0) {
    const changesSheet = ss.getSheetByName('Historico_Alteracoes_Perdidas');
    if (changesSheet) {
      const currentRow = changesSheet.getLastRow();
      const startRow = Math.max(2, lastChangesRow + 1);
      if (startRow <= currentRow) {
        const data = changesSheet.getRange(startRow, 1, currentRow - startRow + 1, changesSheet.getLastColumn()).getValues();
        const headers = changesSheet.getRange(1, 1, 1, changesSheet.getLastColumn()).getValues()[0];
        const oppNameIdx = headers.findIndex(h => {
          const norm = normText_(String(h));
          return norm.includes('OPPORTUNITY') || norm.includes('OPORTUNIDADE') || norm.includes('NOME');
        });
        
        data.forEach(row => {
          if (oppNameIdx > -1 && row[oppNameIdx]) {
            affectedOpps.add(normText_(String(row[oppNameIdx])));
          }
        });
      }
    }
  }
  
  return affectedOpps;
}

/**
 * Reprocessa apenas as oportunidades afetadas (OPEN/PIPELINE)
 * @private
 */
function reprocessarOportunidades_(affectedOpps) {
  console.log(`🔄 Reprocessando ${affectedOpps.size} oportunidades...`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let reprocessed = 0;
  let errors = 0;
  
  // Detectar qual workflow baseado nas oportunidades
  // (se temos apenas pipeline, ou ganhas, ou perdidas)
  const pipelineSheet = ss.getSheetByName(SHEETS.ABERTO);
  const ganhasSheet = ss.getSheetByName(SHEETS.GANHAS);
  const perdidasSheet = ss.getSheetByName(SHEETS.PERDIDAS);
  
  affectedOpps.forEach(oppName => {
    try {
      console.log(`  • Processando: ${oppName}`);
      
      // Tentar encontrar a oportunidade em cada aba
      let found = false;
      
      // 1. Verificar OPEN/Pipeline
      if (pipelineSheet && reprocessSingleOpp_(oppName, 'OPEN', pipelineSheet)) {
        reprocessed++;
        found = true;
      }
      
      // 2. Verificar GANHAS
      if (!found && ganhasSheet && reprocessSingleOpp_(oppName, 'WON', ganhasSheet)) {
        reprocessed++;
        found = true;
      }
      
      // 3. Verificar PERDIDAS  
      if (!found && perdidasSheet && reprocessSingleOpp_(oppName, 'LOST', perdidasSheet)) {
        reprocessed++;
        found = true;
      }
      
      if (!found) {
        console.warn(`  ⚠️ Oportunidade não encontrada: ${oppName}`);
        errors++;
      }
      
    } catch (error) {
      console.error(`  ❌ Erro ao reprocessar "${oppName}":`, error);
      logToSheet("ERROR", "Reprocessamento", `${oppName}: ${error.message}`);
      errors++;
    }
  });
  
  console.log(`✅ Reprocessamento concluído: ${reprocessed} sucesso, ${errors} erros`);
  logToSheet("INFO", "Reprocessamento", `${reprocessed} oportunidades reprocessadas, ${errors} erros`);
  
  return reprocessed;
}

/**
 * Reprocessa oportunidades afetadas em WON
 * @private
 */
function reprocessarOportunidadesWon_(affectedOpps) {
  console.log(`🔄 Reprocessando ${affectedOpps.size} oportunidades WON...`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ganhasSheet = ss.getSheetByName(SHEETS.GANHAS);
  
  if (!ganhasSheet) {
    console.warn('Aba de Ganhas não encontrada');
    return 0;
  }
  
  let reprocessed = 0;
  let errors = 0;
  
  affectedOpps.forEach(oppName => {
    try {
      if (reprocessSingleOpp_(oppName, 'WON', ganhasSheet)) {
        reprocessed++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`  ❌ Erro ao reprocessar WON "${oppName}":`, error);
      logToSheet("ERROR", "Reprocessamento", `WON ${oppName}: ${error.message}`);
      errors++;
    }
  });
  
  console.log(`✅ WON: ${reprocessed} sucesso, ${errors} erros`);
  logToSheet("INFO", "Reprocessamento", `WON: ${reprocessed} oportunidades, ${errors} erros`);
  
  return reprocessed;
}

/**
 * Reprocessa oportunidades afetadas em LOST
 * @private
 */
function reprocessarOportunidadesLost_(affectedOpps) {
  console.log(`🔄 Reprocessando ${affectedOpps.size} oportunidades LOST...`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const perdidasSheet = ss.getSheetByName(SHEETS.PERDIDAS);
  
  if (!perdidasSheet) {
    console.warn('Aba de Perdidas não encontrada');
    return 0;
  }
  
  let reprocessed = 0;
  let errors = 0;
  
  affectedOpps.forEach(oppName => {
    try {
      if (reprocessSingleOpp_(oppName, 'LOST', perdidasSheet)) {
        reprocessed++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`  ❌ Erro ao reprocessar LOST "${oppName}":`, error);
      logToSheet("ERROR", "Reprocessamento", `LOST ${oppName}: ${error.message}`);
      errors++;
    }
  });
  
  console.log(`✅ LOST: ${reprocessed} sucesso, ${errors} erros`);
  logToSheet("INFO", "Reprocessamento", `LOST: ${reprocessed} oportunidades, ${errors} erros`);
  
  return reprocessed;
}

/**
 * Reprocessa uma única oportunidade
 * @private
 */
function reprocessSingleOpp_(oppName, mode, sourceSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getModeConfig(mode);
  const analysisSheet = ss.getSheetByName(config.output);
  
  if (!analysisSheet) {
    console.warn(`Aba de análise não encontrada: ${config.output}`);
    return false;
  }
  
  // 1. Encontrar a linha da oportunidade na aba fonte
  const sourceData = sourceSheet.getDataRange().getValues();
  const sourceHeaders = sourceData[0];
  
  const oppNameIdx = sourceHeaders.findIndex(h => {
    const norm = normText_(String(h));
    return norm.includes('OPPORTUNITY') || norm.includes('NAME') || norm.includes('OPORTUNIDADE');
  });
  
  if (oppNameIdx === -1) {
    console.warn(`Coluna de nome não encontrada em ${sourceSheet.getName()}`);
    return false;
  }
  
  const normalizedOppName = normText_(oppName);
  let sourceRow = -1;
  
  for (let i = 1; i < sourceData.length; i++) {
    if (normText_(String(sourceData[i][oppNameIdx])) === normalizedOppName) {
      sourceRow = i;
      break;
    }
  }
  
  if (sourceRow === -1) {
    return false; // Não encontrado nesta aba
  }
  
  console.log(`  ✓ Encontrado na linha ${sourceRow + 1} de ${sourceSheet.getName()}`);
  
  // 2. Carregar dados contextuais (atividades, mudanças)
  const rawActivities = getSheetData(SHEETS.ATIVIDADES);
  const rawChanges = getSheetData(config.changes);
  
  const activitiesMap = indexDataByMultiKey_(rawActivities);
  const changesMap = indexDataByMultiKey_(rawChanges);
  
  const oppLookupKey = normalizedOppName;
  const relatedActivities = activitiesMap.get(oppLookupKey) || [];
  const relatedChanges = changesMap.get(oppLookupKey) || [];
  
  console.log(`  📊 Contexto: ${relatedActivities.length} atividades, ${relatedChanges.length} mudanças`);
  
  // 3. Recalcular análise detalhada de mudanças
  const activitiesHeaders = rawActivities ? rawActivities.headers : [];
  const changesHeaders = rawChanges ? rawChanges.headers : [];
  
  const detailedChanges = getDetailedChangesAnalysis(relatedChanges, changesHeaders);
  
  console.log(`  📈 Análise: ${detailedChanges.totalChanges} mudanças, ${detailedChanges.criticalChanges} críticas`);
  
  // 4. Encontrar a linha correspondente na aba de análise
  const analysisData = analysisSheet.getDataRange().getValues();
  const analysisHeaders = analysisData[0];
  
  const analysisOppIdx = analysisHeaders.findIndex(h => {
    const norm = normText_(String(h));
    return norm.includes('OPORTUNIDADE');
  });
  
  if (analysisOppIdx === -1) {
    console.warn(`Coluna de oportunidade não encontrada em ${analysisSheet.getName()}`);
    return false;
  }
  
  let analysisRow = -1;
  for (let i = 1; i < analysisData.length; i++) {
    if (normText_(String(analysisData[i][analysisOppIdx])) === normalizedOppName) {
      analysisRow = i;
      break;
    }
  }
  
  if (analysisRow === -1) {
    console.warn(`Oportunidade não encontrada em análise: ${oppName}`);
    return false;
  }
  
  // 5. Atualizar colunas de mudanças na aba de análise
  const updateColumns = {
    "# Total Mudanças": detailedChanges.totalChanges,
    "# Mudanças Críticas": detailedChanges.criticalChanges,
    "Mudanças Close Date": detailedChanges.closeDateChanges,
    "Mudanças Stage": detailedChanges.stageChanges,
    "Mudanças Valor": detailedChanges.valueChanges,
    "Campos + Alterados": detailedChanges.topFields,
    "Padrão Mudanças": detailedChanges.changePattern,
    "Freq. Mudanças": detailedChanges.changeFrequency,
    "# Editores": detailedChanges.uniqueEditors
  };
  
  let updatedCount = 0;
  Object.entries(updateColumns).forEach(([colName, value]) => {
    const colIdx = analysisHeaders.findIndex(h => String(h).includes(colName));
    if (colIdx > -1) {
      const cell = analysisSheet.getRange(analysisRow + 1, colIdx + 1);
      cell.setValue(value);
      updatedCount++;
    }
  });
  
  console.log(`  ✅ ${updatedCount} colunas atualizadas na linha ${analysisRow + 1}`);
  
  return true;
}

/**
 * DIAGNÓSTICO COMPLETO DE MUDANÇAS
 * Verifica por que as colunas de mudanças retornam zero
 */
function diagnosticarMudancas() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let report = '🔍 DIAGNÓSTICO DE MUDANÇAS\n\n';
  
  // 1. Verificar abas de alterações
  report += '📊 1. VERIFICAÇÃO DAS ABAS DE ALTERAÇÕES\n';
  const abasAlteracoes = [
    { nome: SHEETS.ALTERACOES_ABERTO, desc: 'Pipeline Open' },
    { nome: 'Historico_Alteracoes_Ganhos', desc: 'Ganhas' },
    { nome: 'Historico_Alteracoes_Perdidas', desc: 'Perdidas' }
  ];
  
  abasAlteracoes.forEach(aba => {
    const sheet = ss.getSheetByName(aba.nome);
    if (!sheet) {
      report += `  ❌ ${aba.desc}: ABA NÃO EXISTE (${aba.nome})\n`;
    } else {
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      report += `  ✅ ${aba.desc}:\n`;
      report += `     • Linhas: ${lastRow}\n`;
      report += `     • Colunas: ${lastCol}\n`;
      
      if (lastRow > 0) {
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        report += `     • Cabeçalhos (${headers.length}):\n`;
        
        // Verificar se tem os campos críticos
        const camposCriticos = [
          { nomes: ['Field / Event', 'Campo/Compromisso', 'Campo'], desc: 'Campo Alterado' },
          { nomes: ['Opportunity Name', 'Nome da oportunidade', 'Oportunidade'], desc: 'Nome Oportunidade' },
          { nomes: ['Old Value', 'Valor antigo'], desc: 'Valor Antigo' },
          { nomes: ['New Value', 'Novo valor'], desc: 'Novo Valor' },
          { nomes: ['Edit Date', 'Data de edição'], desc: 'Data Edição' }
        ];
        
        camposCriticos.forEach(campo => {
          const found = headers.find(h => {
            const norm = normText_(String(h));
            return campo.nomes.some(n => norm.includes(normText_(n)));
          });
          
          if (found) {
            report += `       ✅ ${campo.desc}: "${found}"\n`;
          } else {
            report += `       ❌ ${campo.desc}: NÃO ENCONTRADO\n`;
            report += `          Buscado: ${campo.nomes.join(', ')}\n`;
          }
        });
        
        // Mostrar primeiros 5 cabeçalhos
        report += `     • Primeiros cabeçalhos: ${headers.slice(0, 5).join(' | ')}\n`;
      }
    }
    report += '\n';
  });
  
  // 2. Testar indexação de dados
  report += '\n📋 2. TESTE DE INDEXAÇÃO\n';
  const rawChanges = getSheetData(SHEETS.ALTERACOES_ABERTO);
  
  if (!rawChanges) {
    report += '  ❌ getSheetData() retornou NULL\n';
  } else if (!rawChanges.values || rawChanges.values.length === 0) {
    report += '  ❌ getSheetData() retornou vazio\n';
  } else {
    report += `  ✅ Dados carregados: ${rawChanges.values.length} linhas\n`;
    report += `  ✅ Headers: ${rawChanges.headers.length} colunas\n`;
    
    const changesMap = indexDataByMultiKey_(rawChanges);
    report += `  ✅ Mapa criado: ${changesMap.size} chaves únicas\n`;
    
    // Mostrar primeiras 3 chaves
    let count = 0;
    for (let [key, values] of changesMap.entries()) {
      if (count < 3) {
        report += `     • "${key}" → ${values.length} mudança(s)\n`;
        count++;
      }
    }
  }
  
  // 3. Testar com oportunidade real
  report += '\n🎯 3. TESTE COM OPORTUNIDADE REAL\n';
  const pipelineSheet = ss.getSheetByName(SHEETS.ABERTO);
  
  if (pipelineSheet && pipelineSheet.getLastRow() > 1) {
    const pipelineData = pipelineSheet.getRange(1, 1, Math.min(3, pipelineSheet.getLastRow()), pipelineSheet.getLastColumn()).getValues();
    const pipelineHeaders = pipelineData[0];
    
    const oppNameIdx = pipelineHeaders.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('OPPORTUNITY') || norm.includes('NAME') || norm.includes('OPORTUNIDADE');
    });
    
    if (oppNameIdx > -1 && pipelineData[1]) {
      const testOppName = String(pipelineData[1][oppNameIdx] || '');
      const testOppKey = normText_(testOppName);
      
      report += `  📌 Oportunidade teste: "${testOppName}"\n`;
      report += `  📌 Chave normalizada: "${testOppKey}"\n`;
      
      if (rawChanges) {
        const changesMap = indexDataByMultiKey_(rawChanges);
        const relatedChanges = changesMap.get(testOppKey) || [];
        
        report += `  📊 Mudanças encontradas: ${relatedChanges.length}\n`;
        
        if (relatedChanges.length > 0) {
          // Testar análise detalhada
          const detailedAnalysis = getDetailedChangesAnalysis(relatedChanges, rawChanges.headers);
          
          report += `\n  📈 ANÁLISE DETALHADA:\n`;
          report += `     • Total Mudanças: ${detailedAnalysis.totalChanges}\n`;
          report += `     • Mudanças Críticas: ${detailedAnalysis.criticalChanges}\n`;
          report += `     • Mudanças Close Date: ${detailedAnalysis.closeDateChanges}\n`;
          report += `     • Mudanças Stage: ${detailedAnalysis.stageChanges}\n`;
          report += `     • Mudanças Valor: ${detailedAnalysis.valueChanges}\n`;
          report += `     • Top Campos: ${detailedAnalysis.topFields}\n`;
          report += `     • Padrão: ${detailedAnalysis.changePattern}\n`;
          report += `     • Frequência: ${detailedAnalysis.changeFrequency}\n`;
          report += `     • Editores: ${detailedAnalysis.uniqueEditors}\n`;
          
          // Mostrar primeira mudança como exemplo
          if (relatedChanges[0]) {
            report += `\n  🔍 EXEMPLO DE MUDANÇA (primeira linha):\n`;
            rawChanges.headers.slice(0, 8).forEach((h, idx) => {
              report += `     • ${h}: "${String(relatedChanges[0][idx] || '')}"\n`;
            });
          }
        } else {
          report += `  ⚠️ NENHUMA mudança encontrada para esta oportunidade\n`;
          report += `     Possíveis causas:\n`;
          report += `     1. Nome não confere exatamente\n`;
          report += `     2. Aba de alterações vazia\n`;
          report += `     3. Problema no mapeamento de colunas\n`;
        }
      }
    }
  }
  
  // 4. Verificar análises existentes
  report += '\n\n📊 4. VERIFICAÇÃO DE ANÁLISES EXISTENTES\n';
  const analises = [
    { nome: SHEETS.ANALISE_PIPELINE, desc: 'Pipeline' },
    { nome: SHEETS.ANALISE_GANHAS, desc: 'Ganhas' },
    { nome: SHEETS.ANALISE_PERDIDAS, desc: 'Perdidas' }
  ];
  
  analises.forEach(analise => {
    const sheet = ss.getSheetByName(analise.nome);
    if (sheet && sheet.getLastRow() > 1) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      // Procurar coluna "# Total Mudanças"
      const mudancasIdx = headers.findIndex(h => String(h).includes('Total Mudanças'));
      
      if (mudancasIdx > -1) {
        // Verificar valores em algumas linhas
        const sampleSize = Math.min(5, sheet.getLastRow() - 1);
        const valores = sheet.getRange(2, mudancasIdx + 1, sampleSize, 1).getValues();
        const zerosCount = valores.filter(v => v[0] === 0 || v[0] === '').length;
        
        report += `  ${analise.desc}:\n`;
        report += `     • Linhas analisadas: ${sampleSize}\n`;
        report += `     • Zeros/Vazios: ${zerosCount}/${sampleSize}\n`;
        report += `     • Valores: ${valores.map(v => v[0]).join(', ')}\n`;
      }
    }
  });
  
  // Salvar relatório em log
  logToSheet('INFO', 'Diagnóstico', report.substring(0, 500));
  
  // Mostrar relatório
  const htmlOutput = HtmlService.createHtmlOutput(
    `<pre style="font-family: monospace; font-size: 11px; white-space: pre-wrap;">${report}</pre>`
  ).setWidth(800).setHeight(600);
  
  ui.showModalDialog(htmlOutput, '🔍 Diagnóstico de Mudanças');
}

/**
 * VALIDAR DADOS PROCESSADOS
 * Verifica quais linhas têm problemas nos dados processados
 */
function validarDadosProcessados() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const response = ui.alert(
    '✅ Validar Dados Processados',
    'Esta função irá:\n\n' +
    '1. Verificar todas as análises\n' +
    '2. Identificar linhas com zeros incorretos\n' +
    '3. Marcar oportunidades para reprocessamento\n\n' +
    'Continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  let report = '✅ VALIDAÇÃO DE DADOS PROCESSADOS\n\n';
  const problemOpps = new Set();
  
  const analises = [
    { nome: SHEETS.ANALISE_PIPELINE, changesSheet: SHEETS.ALTERACOES_ABERTO, desc: 'Pipeline' },
    { nome: SHEETS.ANALISE_GANHAS, changesSheet: 'Historico_Alteracoes_Ganhos', desc: 'Ganhas' },
    { nome: SHEETS.ANALISE_PERDIDAS, changesSheet: 'Historico_Alteracoes_Perdidas', desc: 'Perdidas' }
  ];
  
  analises.forEach(analise => {
    const sheet = ss.getSheetByName(analise.nome);
    const changesSheet = ss.getSheetByName(analise.changesSheet);
    
    if (!sheet || sheet.getLastRow() <= 1) {
      report += `⚠️ ${analise.desc}: Sem dados\n`;
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const oppIdx = headers.findIndex(h => String(h).includes('Oportunidade'));
    const totalMudIdx = headers.findIndex(h => String(h).includes('Total Mudanças'));
    const criMudIdx = headers.findIndex(h => String(h).includes('Mudanças Críticas'));
    
    if (oppIdx === -1 || totalMudIdx === -1) {
      report += `⚠️ ${analise.desc}: Colunas não encontradas\n`;
      return;
    }
    
    let problemCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const oppName = String(row[oppIdx] || '');
      const totalMud = row[totalMudIdx];
      
      // Se tem dados de mudanças disponíveis mas análise mostra zero
      if (changesSheet && changesSheet.getLastRow() > 1) {
        const changesData = getSheetData(analise.changesSheet);
        if (changesData) {
          const changesMap = indexDataByMultiKey_(changesData);
          const oppKey = normText_(oppName);
          const expectedChanges = changesMap.get(oppKey)?.length || 0;
          
          // Se esperamos mudanças mas análise mostra zero
          if (expectedChanges > 0 && (totalMud === 0 || totalMud === '')) {
            problemOpps.add(oppName);
            problemCount++;
            
            if (problemCount <= 3) {
              report += `  ⚠️ "${oppName}": esperado ${expectedChanges}, encontrado ${totalMud}\n`;
            }
          }
        }
      }
    }
    
    report += `${analise.desc}: ${problemCount} oportunidades com problema\n`;
  });
  
  report += `\n\n📊 RESUMO:\n`;
  report += `Total de oportunidades com problemas: ${problemOpps.size}\n\n`;
  
  if (problemOpps.size > 0) {
    report += 'Use "Reprocessar Oportunidades com Erro" para corrigir.\n';
    
    // Salvar lista para reprocessamento
    PropertiesService.getScriptProperties().setProperty(
      'PROBLEM_OPPS',
      JSON.stringify(Array.from(problemOpps))
    );
  }
  
  ui.alert('✅ Validação Concluída', report, ui.ButtonSet.OK);
  logToSheet('INFO', 'Validação', `${problemOpps.size} oportunidades com problemas detectados`);
}

/**
 * REPROCESSAR OPORTUNIDADES COM ERRO
 * Reprocessa apenas as oportunidades identificadas com problemas
 */
function reprocessarComErro() {
  const ui = SpreadsheetApp.getUi();
  
  const problemOppsJson = PropertiesService.getScriptProperties().getProperty('PROBLEM_OPPS');
  
  if (!problemOppsJson) {
    ui.alert(
      'ℹ️ Nenhuma Oportunidade Marcada',
      'Execute "Validar Dados Processados" primeiro para identificar problemas.',
      ui.ButtonSet.OK
    );
    return;
  }
  
  const problemOpps = new Set(JSON.parse(problemOppsJson));
  
  const response = ui.alert(
    '🔄 Reprocessar Oportunidades',
    `Encontradas ${problemOpps.size} oportunidades com problemas.\n\n` +
    'Deseja reprocessá-las agora?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) return;
  
  const reprocessed = reprocessarOportunidades_(problemOpps);
  
  ui.alert(
    '✅ Reprocessamento Concluído',
    `${reprocessed} oportunidades reprocessadas com sucesso!`,
    ui.ButtonSet.OK
  );
  
  // Limpar lista
  PropertiesService.getScriptProperties().deleteProperty('PROBLEM_OPPS');
}

// ================================================================================================
// --- ANÁLISE SALES SPECIALIST ---
// ================================================================================================

/**
 * Processa a aba "Análise Sales Specialist" e adiciona a coluna ANÁLISE DE IA
 * Esta função lê a aba manual e adiciona análise IA ao final sem alterar dados existentes
 */
function processarAnaliseSalesSpecialist() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Análise Sales Specialist";
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    console.warn(`⚠️ Aba "${sheetName}" não encontrada`);
    logToSheet("WARN", "SalesSpecialist", `Aba não encontrada: ${sheetName}`);
    return { created: 0, updated: 0, skipped: 0 };
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    console.log(`ℹ️ Aba "${sheetName}" está vazia ou só tem cabeçalho`);
    return { created: 0, updated: 0, skipped: 0 };
  }
  
  const headers = data[0];
  
  // Mapear colunas importantes
  const colMap = {
    accountName: headers.findIndex(h => normText_(String(h)).includes('ACCOUNT')),
    perfil: headers.findIndex(h => normText_(String(h)).includes('PERFIL')),
    oppName: headers.findIndex(h => normText_(String(h)).includes('OPPORTUNITY')),
    mesesFat: headers.findIndex(h => normText_(String(h)).includes('MESES') && normText_(String(h)).includes('FAT')),
    gtm2026: headers.findIndex(h => normText_(String(h)).includes('GTM') && normText_(String(h)).includes('2026')),
    bookingGross: headers.findIndex(h => normText_(String(h)).includes('BOOKING') && normText_(String(h)).includes('GROSS')),
    bookingNet: headers.findIndex(h => normText_(String(h)).includes('BOOKING') && normText_(String(h)).includes('NET')),
    status: headers.findIndex(h => normText_(String(h)).includes('STATUS')),
    closedDate: headers.findIndex(h => normText_(String(h)).includes('CLOSED') || normText_(String(h)).includes('FECHAMENTO')),
    analiseIA: headers.findIndex(h => normText_(String(h)).includes('ANALISE') && normText_(String(h)).includes('IA'))
  };
  
  // Se não existe coluna ANÁLISE DE IA, adicionar
  if (colMap.analiseIA === -1) {
    console.log('➕ Adicionando coluna ANÁLISE DE IA');
    colMap.analiseIA = headers.length;
    headers.push('ANÁLISE DE IA');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  // Processar cada linha
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // Verificar se já tem análise
    if (row[colMap.analiseIA] && String(row[colMap.analiseIA]).trim().length > 10) {
      skipped++;
      continue;
    }
    
    // Coletar dados da oportunidade
    const oppName = String(row[colMap.oppName] || '').trim();
    if (!oppName) {
      skipped++;
      continue;
    }
    
    const account = String(row[colMap.accountName] || '').trim();
    const perfil = String(row[colMap.perfil] || '').trim();
    const gross = parseFloat(row[colMap.bookingGross]) || 0;
    const net = parseFloat(row[colMap.bookingNet]) || 0;
    const status = String(row[colMap.status] || '').trim();
    const closedDate = row[colMap.closedDate] || '';
    
    // Buscar atividades da aba de atividades (similar ao processo principal)
    const activities = buscarAtividades_(oppName);
    
    // Gerar análise IA
    const analiseIA = gerarAnaliseSalesSpecialist_({
      oppName,
      account,
      perfil,
      gross,
      net,
      status,
      closedDate,
      activities
    });
    
    // Escrever análise na planilha
    sheet.getRange(i + 1, colMap.analiseIA + 1).setValue(analiseIA);
    
    if (!row[colMap.analiseIA]) {
      created++;
    } else {
      updated++;
    }
    
    // Log a cada 5 oportunidades
    if ((created + updated) % 5 === 0) {
      console.log(`📊 Processadas: ${created} criadas, ${updated} atualizadas`);
    }
  }
  
  logToSheet("INFO", "SalesSpecialist", `Processadas: ${created} criadas, ${updated} atualizadas, ${skipped} ignoradas`);
  
  return { created, updated, skipped };
}

/**
 * Gera análise IA para uma oportunidade da aba Sales Specialist
 * @private
 */
function gerarAnaliseSalesSpecialist_(oppData) {
  const prompt = `
Você é um especialista em análise de pipeline de vendas B2B/B2G.

DADOS DA OPORTUNIDADE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 Conta: ${oppData.account}
👤 Perfil: ${oppData.perfil} (New Client ou Base Instalada)
💼 Nome: ${oppData.oppName}
💰 Booking Gross: USD $${oppData.gross.toLocaleString()}
💵 Booking Net: USD $${oppData.net.toLocaleString()}
📊 Status Atual: ${oppData.status}
📅 Data Prevista: ${oppData.closedDate}
🎯 Total Atividades: ${oppData.activities.count}

ATIVIDADES RECENTES (últimas 5):
${oppData.activities.recent.slice(0, 5).map(a => `• ${a.type}: ${a.subject}`).join('\n') || '• Sem atividades registradas'}

ANÁLISE REQUERIDA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Retorne JSON puro (sem markdown, sem \`\`\`json) com:

{
  "categoria": "COMMIT|UPSIDE|PIPELINE|OMITIDO",
  "confianca": 0-100,
  "resumo": "Análise em 2-3 linhas do status e probabilidade",
  "riscos": ["Risco 1", "Risco 2", "Risco 3"],
  "gaps_meddic": ["Gap 1", "Gap 2"],
  "proximos_passos": ["Ação 1", "Ação 2", "Ação 3"],
  "alerta_critico": "Sim/Não - se houver risco iminente de perda"
}

CRITÉRIOS DE CATEGORIZAÇÃO:
• COMMIT (75-100%): Deal desk aprovado, documentação completa, orçamento confirmado, timeline claro
• UPSIDE (50-74%): Bem qualificado mas com 1-2 gaps MEDDIC, engajamento ativo
• PIPELINE (20-49%): Qualificação inicial, múltiplos gaps, timeline incerto
• OMITIDO (0-19%): Estagnado, sem atividades >30 dias, ou dados críticos ausentes

CONSIDERE:
1. Perfil "${oppData.perfil}": Base instalada tem >70% win rate, New precisa mais qualificação
2. Atividades: ${oppData.activities.count} atividades (0-2=baixo, 3-10=médio, >10=alto)
3. Status "${oppData.status}": Commit/Upside indica validação prévia do specialist
4. Valor: $${oppData.gross.toLocaleString()} (alto valor requer mais governança)
`;

  try {
    const rawResponse = callGeminiAPI(prompt, { maxOutputTokens: 1024, temperature: 0.3 });
    const response = cleanAndParseJSON(rawResponse);
    
    // Extrair campos estruturados com fallbacks
    const categoria = response.categoria || 'PIPELINE';
    const confianca = response.confianca || 50;
    const resumo = response.resumo || 'Análise indisponível';
    const riscos = Array.isArray(response.riscos) ? response.riscos.join(', ') : (response.riscos || 'N/A');
    const gaps = Array.isArray(response.gaps_meddic) ? response.gaps_meddic.join(', ') : (response.gaps_meddic || 'N/A');
    const acoes = Array.isArray(response.proximos_passos) ? response.proximos_passos.join(', ') : (response.proximos_passos || 'N/A');
    const alerta = response.alerta_critico || 'Não';
    
    // Formato expandido multi-linha com todos os insights
    const alertaEmoji = alerta === 'Sim' ? '⚠️ ' : '';
    return `${alertaEmoji}[${categoria}] ${confianca}%\n\n📝 ${resumo}\n\n⚠️ RISCOS: ${riscos}\n\n📊 GAPS MEDDIC: ${gaps}\n\n✅ AÇÕES: ${acoes}`;
    
  } catch (error) {
    console.error(`❌ Erro ao gerar análise para ${oppData.oppName}:`, error);
    return `❌ Erro na análise: ${error.message}`;
  }
}

/**
 * Busca atividades relacionadas a uma oportunidade
 * @private
 */
function buscarAtividades_(oppName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actSheet = ss.getSheetByName(SHEETS.ATIVIDADES);
    
    if (!actSheet) {
      return { count: 0, recent: [] };
    }
    
    const actData = actSheet.getDataRange().getValues();
    const actHeaders = actData[0];
    
    const oppIdx = actHeaders.findIndex(h => normText_(String(h)).includes('OPPORTUNITY'));
    const typeIdx = actHeaders.findIndex(h => normText_(String(h)).includes('TYPE'));
    const subjectIdx = actHeaders.findIndex(h => normText_(String(h)).includes('SUBJECT'));
    const dateIdx = actHeaders.findIndex(h => normText_(String(h)).includes('DATE') || normText_(String(h)).includes('DATA'));
    
    if (oppIdx === -1) {
      return { count: 0, recent: [] };
    }
    
    const normOppName = normText_(oppName);
    const activities = [];
    
    for (let i = 1; i < actData.length; i++) {
      const row = actData[i];
      const rowOpp = normText_(String(row[oppIdx] || ''));
      
      if (rowOpp === normOppName) {
        activities.push({
          type: String(row[typeIdx] || 'Atividade'),
          subject: String(row[subjectIdx] || ''),
          date: row[dateIdx] || new Date()
        });
      }
    }
    
    // Ordenar por data (mais recente primeiro)
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return {
      count: activities.length,
      recent: activities.slice(0, 10)
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar atividades:', error);
    return { count: 0, recent: [] };
  }
}

// ================================================================================================
// --- GERENCIAMENTO DE TRIGGERS E LIMPEZA AUTOMÁTICA ---
// ================================================================================================

/**
 * Configura trigger automático para auditoria a cada 15 minutos
 */
function configurarAuditoriaAutomatica() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Remover triggers existentes de auditoria
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'executarAuditoriaAutomatica') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Criar novo trigger de 15 minutos
    ScriptApp.newTrigger('executarAuditoriaAutomatica')
      .timeBased()
      .everyMinutes(15)
      .create();
    
    logToSheet_('INFO', 'Auditoria', '✅ Trigger automático configurado: a cada 15 minutos');
    
    ui.alert(
      '✅ Auditoria Automática Ativada!',
      'A auditoria será executada automaticamente a cada 15 minutos.\n\n' +
      'Você pode desativar a qualquer momento usando:\n' +
      'Ferramentas & Diagnóstico > Desativar Auditoria Automática',
      ui.ButtonSet.OK
    );
    
  } catch (e) {
    logToSheet_('ERROR', 'Auditoria', 'Erro ao configurar trigger: ' + e.message);
    throw e;
  }
}

/**
 * Desativa trigger automático de auditoria
 */
function desativarAuditoriaAutomatica() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Remover triggers de auditoria
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'executarAuditoriaAutomatica') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
      }
    });
    
    logToSheet_('INFO', 'Auditoria', `✅ Auditoria automática desativada (${removidos} triggers removidos)`);
    
    ui.alert(
      '✅ Auditoria Desativada',
      `Auditoria automática foi desativada.\n${removidos} trigger(s) removido(s).`,
      ui.ButtonSet.OK
    );
    
  } catch (e) {
    logToSheet_('ERROR', 'Auditoria', 'Erro ao desativar trigger: ' + e.message);
    throw e;
  }
}

/**
 * Executa auditoria automaticamente (chamada pelo trigger)
 */
function executarAuditoriaAutomatica() {
  try {
    logToSheet_('INFO', 'Auditoria', '🔄 Iniciando auditoria automática...');
    
    // Chamar função de auditoria do outro arquivo
    if (typeof auditarBaseVsAnalise === 'function') {
      auditarBaseVsAnalise();
      logToSheet_('INFO', 'Auditoria', '✅ Auditoria automática concluída');
    } else {
      logToSheet_('ERROR', 'Auditoria', 'Função auditarBaseVsAnalise não encontrada');
    }
    
    // Limpar logs se necessário
    limparLogsAntigos();
    
  } catch (e) {
    logToSheet_('ERROR', 'Auditoria', 'Erro na auditoria automática: ' + e.message);
  }
}

/**
 * Limpa logs antigos quando ultrapassar 10.000 linhas
 * Mantém apenas as últimas 5.000 linhas mais recentes
 */
function limparLogsAntigos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('Auto Refresh Execution Log');
    
    if (!logSheet) {
      console.warn('Aba de log não encontrada');
      return;
    }
    
    const lastRow = logSheet.getLastRow();
    const LIMITE_MAXIMO = 10000;
    const MANTER_LINHAS = 5000;
    
    // Se passar de 10k linhas, deletar as mais antigas
    if (lastRow > LIMITE_MAXIMO) {
      const linhasParaDeletar = lastRow - MANTER_LINHAS - 1; // -1 porque linha 1 é cabeçalho
      
      if (linhasParaDeletar > 0) {
        logToSheet_('INFO', 'LogCleanup', `🗑️ Limpando logs: ${lastRow} linhas -> ${MANTER_LINHAS} linhas`);
        
        // Deletar linhas antigas (começando da linha 2, logo após o header)
        logSheet.deleteRows(2, linhasParaDeletar);
        
        logToSheet_('INFO', 'LogCleanup', `✅ ${linhasParaDeletar} linhas antigas removidas`);
      }
    }
    
  } catch (e) {
    console.error('Erro ao limpar logs: ' + e.message);
    logToSheet_('ERROR', 'LogCleanup', 'Erro ao limpar logs: ' + e.message);
  }
}

/**
 * Força limpeza manual de logs (via menu)
 */
function limparLogsManualmente() {
  const ui = SpreadsheetApp.getUi();
  
  const resposta = ui.alert(
    '🗑️ Limpar Logs?',
    'Deseja limpar logs antigos mantendo apenas as últimas 5.000 linhas?\n\n' +
    'Esta ação não pode ser desfeita.',
    ui.ButtonSet.YES_NO
  );
  
  if (resposta === ui.Button.YES) {
    try {
      limparLogsAntigos();
      ui.alert(
        '✅ Limpeza Concluída!',
        'Logs antigos foram removidos com sucesso.',
        ui.ButtonSet.OK
      );
    } catch (e) {
      ui.alert('❌ Erro', 'Erro ao limpar logs: ' + e.message, ui.ButtonSet.OK);
    }
  }
}
