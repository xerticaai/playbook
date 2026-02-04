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
 * 5. TAXONOMIA FISCAL: Rótulos FY26 automáticos sincronizados com o calendário GTM 2026.
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

// URL da Cloud Function (configurar após deploy)
const CLOUD_FUNCTION_URL = 'https://us-central1-operaciones-br.cloudfunctions.net/sales-intelligence-engine';
const USE_CLOUD_FUNCTION = true; // ✅ ATIVADO! Usa Cloud Function Python para análises

// ================================================================================================
// --- INTEGRAÇÃO COM CLOUD FUNCTION ---
// ================================================================================================

/**
 * Chama a Cloud Function Python para análise pesada de dados
 * @param {Object} data - Dados brutos das abas (pipeline, ganhas, perdidas)
 * @param {Object} filters - Filtros do dashboard (quarter, seller, minValue)
 * @returns {Object} - Análise completa processada pela Cloud Function
 */
function callCloudFunction(data, filters) {
  console.log('🚀 Chamando Cloud Function para análise...');
  
  try {
    // ✅ FIX: Cloud Function espera {pipeline, won, lost, filters} direto no root
    // NÃO {data: {pipeline, won, lost}, filters}
    const payload = {
      pipeline: data.pipeline || [],
      won: data.won || [],
      lost: data.lost || [],
      filters: filters || {}
    };
    
    // 🔍 DEBUG: Verificar tamanho dos dados antes de enviar
    console.log(`📊 Payload preparado:`);
    console.log(`   • Pipeline: ${payload.pipeline.length} deals`);
    console.log(`   • Won: ${payload.won.length} deals`);
    console.log(`   • Lost: ${payload.lost.length} deals`);
    if (payload.pipeline.length > 0) {
      console.log(`   • Primeira coluna pipeline: ${Object.keys(payload.pipeline[0])[0]}`);
      console.log(`   • Total colunas pipeline: ${Object.keys(payload.pipeline[0]).length}`);
    }
    
    // ✅ Tentar serializar payload e capturar erros
    let payloadString;
    try {
      payloadString = JSON.stringify(payload);
      console.log(`   • Payload serializado: ${(payloadString.length / 1024).toFixed(2)} KB`);
    } catch (e) {
      console.error('❌ Erro ao serializar payload:', e.message);
      console.error('   • Pipeline deals:', payload.pipeline.length);
      console.error('   • Won deals:', payload.won.length);
      console.error('   • Lost deals:', payload.lost.length);
      return null;
    }
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: payloadString,
      muteHttpExceptions: true,
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getIdentityToken()
      }
    };
    
    const response = UrlFetchApp.fetch(CLOUD_FUNCTION_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      console.error('❌ Erro na Cloud Function:', responseCode);
      console.error('Response:', response.getContentText());
      return null;
    }
    
    const result = JSON.parse(response.getContentText());
    console.log('✅ Cloud Function executada com sucesso');
    console.log('   • Tempo processamento:', result.processing_time_seconds, 's');
    console.log('   • Deals processados:', result.summary?.total_deals || 0);
    
    return result;
    
  } catch (error) {
    console.error('❌ Erro ao chamar Cloud Function:', error);
    return null;
  }
}

/**
 * Prepara dados brutos das abas para enviar à Cloud Function
 * @returns {Object} - {pipeline: [], won: [], lost: []}
 */
/**
 * Prepara dados brutos das abas de análise para enviar à Cloud Function
 * IMPORTANTE: As abas de análise usam nomes em PT, mas mantemos os nomes originais
 * @returns {Object} Objeto com arrays pipeline, won, lost
 */
/**
 * Sanitiza valor para serialização JSON
 * Converte Date para ISO string, remove null/undefined
 */
function sanitizeValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function prepareRawDataForCloudFunction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  console.log('📊 Carregando dados brutos das abas de análise...');
  
  // Carregar abas de análise (com IA)
  const pipelineSheet = ss.getSheetByName('🎯 Análise Forecast IA');
  const wonSheet = ss.getSheetByName('📈 Análise Ganhas');
  const lostSheet = ss.getSheetByName('📉 Análise Perdidas');
  
  const data = {
    pipeline: [],
    won: [],
    lost: []
  };
  
  // Pipeline
  if (pipelineSheet && pipelineSheet.getLastRow() > 1) {
    const pipelineData = pipelineSheet.getDataRange().getValues();
    const headers = pipelineData[0];
    data.pipeline = pipelineData.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        // ✅ Sanitizar valores para JSON (Date → ISO string, null → null)
        obj[header] = sanitizeValue(row[idx]);
      });
      return obj;
    });
    console.log('   • Pipeline:', data.pipeline.length, 'deals');
  }
  
  // Ganhas
  if (wonSheet && wonSheet.getLastRow() > 1) {
    const wonData = wonSheet.getDataRange().getValues();
    const headers = wonData[0];
    data.won = wonData.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = sanitizeValue(row[idx]);
      });
      return obj;
    });
    console.log('   • Ganhas:', data.won.length, 'deals');
  }
  
  // Perdidas
  if (lostSheet && lostSheet.getLastRow() > 1) {
    const lostData = lostSheet.getDataRange().getValues();
    const headers = lostData[0];
    data.lost = lostData.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = sanitizeValue(row[idx]);
      });
      return obj;
    });
    console.log('   • Perdidas:', data.lost.length, 'deals');
  }
  
  return data;
}

// ================================================================================================
// --- FUNÇÕES MODULARES POR ABA DO DASHBOARD ---
// ================================================================================================

/**
 * Prepara dados para a aba Visão Executiva (L10)
 */
function prepareVisaoExecutivaData() {
  const rawData = prepareRawDataForCloudFunction();
  const hoje = new Date();
  const lastWeekStart = new Date(hoje);
  lastWeekStart.setDate(hoje.getDate() - 7);
  
  return {
    data: rawData,
    filters: {
      quarter: null,
      seller: null,
      min_value: 0,
      date_range: { start: lastWeekStart.toISOString(), end: hoje.toISOString() }
    }
  };
}

/**
 * Prepara dados para a aba Pipeline (Weekly Agenda)
 */
function preparePipelineData(quarterFilter) {
  const rawData = prepareRawDataForCloudFunction();
  return {
    data: { pipeline: rawData.pipeline, won: [], lost: [] },
    filters: { quarter: quarterFilter, seller: null, min_value: 0, status: 'open' }
  };
}

/**
 * Prepara dados para a aba Vendedores (FSR Scorecard)
 */
function prepareVendedoresData(sellerFilter) {
  const rawData = prepareRawDataForCloudFunction();
  return {
    data: rawData,
    filters: { quarter: null, seller: sellerFilter, min_value: 0 }
  };
}

/**
 * Prepara dados para a aba Análises (AI Insights)
 */
function prepareAnalisesData() {
  const rawData = prepareRawDataForCloudFunction();
  return {
    data: { pipeline: [], won: rawData.won, lost: rawData.lost },
    filters: { quarter: null, seller: null, min_value: 0, status: 'closed' }
  };
}

/**
 * Prepara dados para War Targets (Deals Críticos)
 */
function prepareWarTargetsData() {
  const rawData = prepareRawDataForCloudFunction();
  return {
    data: { pipeline: rawData.pipeline, won: [], lost: [] },
    filters: { quarter: null, seller: null, min_value: 50000, status: 'open' }
  };
}

// ================================================================================================
// --- FUNÇÕES DO DASHBOARD WEB APP ---
// ================================================================================================

/**
 * Função principal de atualização do Dashboard Forecast
 * Orquestra todas as análises e atualiza a planilha
 * Chamada automaticamente pelo trigger a cada 15 minutos
 */
/**
 * Atualiza dashboard em PLANILHA (legado - diferente do Web App)
 * Para atualizar o Web App, use atualizarDashboardAutomatico()
 */
function updateForecastDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheetName = "🎯 Análise Forecast IA";
  const dashboardSheetName = "📊 Dashboard Forecast";

  // Etapa 1: Obter os dados da análise da IA
  const sourceSheet = ss.getSheetByName(sourceSheetName);
  if (!sourceSheet || sourceSheet.getLastRow() <= 1) {
    logToSheet("WARN", "Dashboard", "Aba de análise da IA não encontrada ou vazia. Abortando dashboard.");
    return;
  }
  
  const sourceData = sourceSheet.getDataRange().getValues();
  logToSheet("INFO", "Dashboard", `Iniciando atualização do dashboard com ${sourceData.length - 1} registros`);

  // Etapa 2: Preparar a aba do Dashboard
  let dashboardSheet = ss.getSheetByName(dashboardSheetName);
  if (dashboardSheet) {
    dashboardSheet.clear();
  } else {
    dashboardSheet = ss.insertSheet(dashboardSheetName);
  }
  
  // Etapa 3: Executar as análises e obter os resultados
  const analysis1_Data = _analyzeBySellerAndProfile(sourceData);
  const analysis2_Data = _analyzeByFiscalQuarter(sourceData);
  const analysis3_Data = _analyzeBySellerAndQuarter(sourceData);
  const analysis4_Data = _analyzeByForecastCategory(sourceData);
  
  // Etapa 4: Escrever os resultados no Dashboard
  let currentRow = 1;
  currentRow = _writeSectionToSheet(dashboardSheet, currentRow, "🎯 Análise por Categoria de Forecast (COMMIT/UPSIDE/PIPELINE/OMITIDO)", analysis4_Data);
  currentRow = _writeSectionToSheet(dashboardSheet, currentRow, "📊 Análise por Vendedor e Perfil de Cliente", analysis1_Data);
  currentRow = _writeSectionToSheet(dashboardSheet, currentRow, "📅 Análise por Quarter Fiscal", analysis2_Data);
  currentRow = _writeSectionToSheet(dashboardSheet, currentRow, "👤 Análise por Vendedor e Quarter", analysis3_Data);
  
  // Etapa 5: Formatação final da aba
  _formatDashboardSheet(dashboardSheet);

  logToSheet("INFO", "Dashboard", "Dashboard de Forecast atualizado com sucesso");
  SpreadsheetApp.getActiveSpreadsheet().toast('Dashboard de Forecast foi atualizado!', '✅ Sucesso!', 5);
}

/**
 * Análise 1: Agregação por Vendedor e Perfil de Cliente
 * Retorna array 2D com cabeçalhos e dados agregados
 */
function _analyzeBySellerAndProfile(data) {
  const headers = data[0];
  const rows = data.slice(1);
  
  // Encontrar índices das colunas necessárias
  const sellerIdx = headers.indexOf("Vendedor");
  const profileIdx = headers.indexOf("Perfil");
  const grossIdx = headers.indexOf("Gross");
  const netIdx = headers.indexOf("Net");
  const confiancaIdx = headers.indexOf("Confiança (%)");
  
  if (sellerIdx === -1 || profileIdx === -1 || grossIdx === -1 || netIdx === -1 || confiancaIdx === -1) {
    logToSheet("ERROR", "Dashboard", "Colunas necessárias não encontradas na análise");
    return [["ERRO: Colunas não encontradas"]];
  }
  
  const aggregation = {}; // { "Vendedor|Perfil": { totalGross, totalNet, forecastGross, forecastNet, count } }
  
  for (const row of rows) {
    const seller = row[sellerIdx] || "SEM VENDEDOR";
    const profile = row[profileIdx] || "SEM PERFIL";
    const gross = parseFloat(row[grossIdx]) || 0;
    const net = parseFloat(row[netIdx]) || 0;
    const confidence = parseFloat(row[confiancaIdx]) || 0;
    
    const key = `${seller}|${profile}`;
    
    if (!aggregation[key]) {
      aggregation[key] = {
        seller: seller,
        profile: profile,
        totalGross: 0,
        totalNet: 0,
        forecastGross: 0,
        forecastNet: 0,
        count: 0
      };
    }
    
    aggregation[key].totalGross += gross;
    aggregation[key].totalNet += net;
    aggregation[key].forecastGross += gross * (confidence / 100);
    aggregation[key].forecastNet += net * (confidence / 100);
    aggregation[key].count += 1;
  }
  
  // Construir resultado ordenado
  const result = [["Vendedor", "Perfil", "# Deals", "Total Gross", "Previsão Gross", "Total Net", "Previsão Net"]];
  
  const sortedKeys = Object.keys(aggregation).sort((a, b) => {
    return aggregation[b].forecastGross - aggregation[a].forecastGross; // Ordenar por previsão gross desc
  });
  
  for (const key of sortedKeys) {
    const agg = aggregation[key];
    result.push([
      agg.seller,
      agg.profile,
      agg.count,
      agg.totalGross,
      agg.forecastGross,
      agg.totalNet,
      agg.forecastNet
    ]);
  }
  
  return result;
}

/**
 * Análise 2: Agregação por Quarter Fiscal
 * Retorna array 2D com cabeçalhos e dados agregados
 */
function _analyzeByFiscalQuarter(data) {
  const headers = data[0];
  const rows = data.slice(1);
  
  // Encontrar índices das colunas necessárias
  const quarterIdx = headers.indexOf("Fiscal Q");
  const grossIdx = headers.indexOf("Gross");
  const netIdx = headers.indexOf("Net");
  const confiancaIdx = headers.indexOf("Confiança (%)");
  
  if (quarterIdx === -1 || grossIdx === -1 || netIdx === -1 || confiancaIdx === -1) {
    logToSheet("ERROR", "Dashboard", "Colunas necessárias não encontradas na análise");
    return [["ERRO: Colunas não encontradas"]];
  }
  
  const aggregation = {}; // { "Q1 FY26": { totalGross, totalNet, forecastGross, forecastNet, count } }
  
  for (const row of rows) {
    const quarter = row[quarterIdx] || "SEM QUARTER";
    const gross = parseFloat(row[grossIdx]) || 0;
    const net = parseFloat(row[netIdx]) || 0;
    const confidence = parseFloat(row[confiancaIdx]) || 0;
    
    if (!aggregation[quarter]) {
      aggregation[quarter] = {
        quarter: quarter,
        totalGross: 0,
        totalNet: 0,
        forecastGross: 0,
        forecastNet: 0,
        count: 0
      };
    }
    
    aggregation[quarter].totalGross += gross;
    aggregation[quarter].totalNet += net;
    aggregation[quarter].forecastGross += gross * (confidence / 100);
    aggregation[quarter].forecastNet += net * (confidence / 100);
    aggregation[quarter].count += 1;
  }
  
  // Construir resultado ordenado por quarter
  const result = [["Quarter Fiscal", "# Deals", "Total Gross", "Previsão Gross", "Total Net", "Previsão Net"]];
  
  // Ordenar por quarter (Q1, Q2, Q3, Q4)
  const quarterOrder = ["Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26", "Q1 FY27", "Q2 FY27", "Q3 FY27", "Q4 FY27"];
  const sortedKeys = Object.keys(aggregation).sort((a, b) => {
    const indexA = quarterOrder.indexOf(a);
    const indexB = quarterOrder.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  for (const key of sortedKeys) {
    const agg = aggregation[key];
    result.push([
      agg.quarter,
      agg.count,
      agg.totalGross,
      agg.forecastGross,
      agg.totalNet,
      agg.forecastNet
    ]);
  }
  
  return result;
}

/**
 * Análise 3: Agregação por Vendedor e Quarter
 * Retorna array 2D com cabeçalhos e dados agregados
 */
function _analyzeBySellerAndQuarter(data) {
  const headers = data[0];
  const rows = data.slice(1);
  
  // Encontrar índices das colunas necessárias
  const sellerIdx = headers.indexOf("Vendedor");
  const quarterIdx = headers.indexOf("Fiscal Q");
  const grossIdx = headers.indexOf("Gross");
  const netIdx = headers.indexOf("Net");
  const confiancaIdx = headers.indexOf("Confiança (%)");
  
  if (sellerIdx === -1 || quarterIdx === -1 || grossIdx === -1 || netIdx === -1 || confiancaIdx === -1) {
    logToSheet("ERROR", "Dashboard", "Colunas necessárias não encontradas na análise");
    return [["ERRO: Colunas não encontradas"]];
  }
  
  const aggregation = {}; // { "Vendedor|Quarter": { totalGross, totalNet, forecastGross, forecastNet, count } }
  
  for (const row of rows) {
    const seller = row[sellerIdx] || "SEM VENDEDOR";
    const quarter = row[quarterIdx] || "SEM QUARTER";
    const gross = parseFloat(row[grossIdx]) || 0;
    const net = parseFloat(row[netIdx]) || 0;
    const confidence = parseFloat(row[confiancaIdx]) || 0;
    
    const key = `${seller}|${quarter}`;
    
    if (!aggregation[key]) {
      aggregation[key] = {
        seller: seller,
        quarter: quarter,
        totalGross: 0,
        totalNet: 0,
        forecastGross: 0,
        forecastNet: 0,
        count: 0
      };
    }
    
    aggregation[key].totalGross += gross;
    aggregation[key].totalNet += net;
    aggregation[key].forecastGross += gross * (confidence / 100);
    aggregation[key].forecastNet += net * (confidence / 100);
    aggregation[key].count += 1;
  }
  
  // Construir resultado ordenado
  const result = [["Vendedor", "Quarter", "# Deals", "Total Gross", "Previsão Gross", "Total Net", "Previsão Net"]];
  
  const sortedKeys = Object.keys(aggregation).sort((a, b) => {
    const [sellerA, quarterA] = a.split("|");
    const [sellerB, quarterB] = b.split("|");
    
    // Ordenar primeiro por vendedor, depois por quarter
    if (sellerA !== sellerB) {
      return sellerA.localeCompare(sellerB);
    }
    
    const quarterOrder = ["Q1 FY26", "Q2 FY26", "Q3 FY26", "Q4 FY26", "Q1 FY27", "Q2 FY27", "Q3 FY27", "Q4 FY27"];
    const indexA = quarterOrder.indexOf(quarterA);
    const indexB = quarterOrder.indexOf(quarterB);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  for (const key of sortedKeys) {
    const agg = aggregation[key];
    result.push([
      agg.seller,
      agg.quarter,
      agg.count,
      agg.totalGross,
      agg.forecastGross,
      agg.totalNet,
      agg.forecastNet
    ]);
  }
  
  return result;
}

/**
 * Análise 4: Agregação por Categoria de Forecast
 * Mostra a distribuição entre COMMIT, UPSIDE, PIPELINE e OMITIDO
 * Retorna array 2D com cabeçalhos e dados agregados
 */
function _analyzeByForecastCategory(data) {
  const headers = data[0];
  const rows = data.slice(1);
  
  // Encontrar índices das colunas necessárias
  const forecastCatIdx = headers.indexOf("Forecast IA");
  const grossIdx = headers.indexOf("Gross");
  const netIdx = headers.indexOf("Net");
  const confiancaIdx = headers.indexOf("Confiança (%)");
  const q1Idx = headers.indexOf("Valor Reconhecido Q1");
  const q2Idx = headers.indexOf("Valor Reconhecido Q2");
  const q3Idx = headers.indexOf("Valor Reconhecido Q3");
  const q4Idx = headers.indexOf("Valor Reconhecido Q4");
  
  if (forecastCatIdx === -1 || grossIdx === -1 || netIdx === -1 || confiancaIdx === -1) {
    logToSheet("ERROR", "Dashboard", "Colunas necessárias não encontradas na análise");
    return [["ERRO: Colunas não encontradas"]];
  }
  
  const aggregation = {}; // { "COMMIT": { totalGross, totalNet, forecastGross, forecastNet, q1-q4, count, avgConfidence } }
  
  for (const row of rows) {
    const category = row[forecastCatIdx] || "SEM CATEGORIA";
    const gross = parseFloat(row[grossIdx]) || 0;
    const net = parseFloat(row[netIdx]) || 0;
    const confidence = parseFloat(row[confiancaIdx]) || 0;
    const q1 = parseFloat(row[q1Idx]) || 0;
    const q2 = parseFloat(row[q2Idx]) || 0;
    const q3 = parseFloat(row[q3Idx]) || 0;
    const q4 = parseFloat(row[q4Idx]) || 0;
    
    if (!aggregation[category]) {
      aggregation[category] = {
        category: category,
        totalGross: 0,
        totalNet: 0,
        forecastGross: 0,
        forecastNet: 0,
        q1Total: 0,
        q2Total: 0,
        q3Total: 0,
        q4Total: 0,
        count: 0,
        totalConfidence: 0
      };
    }
    
    aggregation[category].totalGross += gross;
    aggregation[category].totalNet += net;
    aggregation[category].forecastGross += gross * (confidence / 100);
    aggregation[category].forecastNet += net * (confidence / 100);
    aggregation[category].q1Total += q1;
    aggregation[category].q2Total += q2;
    aggregation[category].q3Total += q3;
    aggregation[category].q4Total += q4;
    aggregation[category].count += 1;
    aggregation[category].totalConfidence += confidence;
  }
  
  // Construir resultado ordenado por prioridade de categoria
  const result = [["Categoria", "# Deals", "Confiança Média (%)", "Total Gross", "Previsão Gross", "Total Net", "Previsão Net", "% do Pipeline", "Reconh. Q1", "Reconh. Q2", "Reconh. Q3", "Reconh. Q4"]];
  
  // Ordem de prioridade: COMMIT > UPSIDE > PIPELINE > OMITIDO
  const categoryOrder = ["COMMIT", "POTENCIAL", "UPSIDE", "PIPELINE", "OMITIDO"];
  const sortedKeys = Object.keys(aggregation).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  
  // Calcular total para percentual
  let totalGross = 0;
  for (const key of sortedKeys) {
    totalGross += aggregation[key].totalGross;
  }
  
  for (const key of sortedKeys) {
    const agg = aggregation[key];
    const avgConfidence = agg.count > 0 ? (agg.totalConfidence / agg.count) / 100 : 0; // Divide por 100 para formato %
    const percentPipeline = totalGross > 0 ? (agg.totalGross / totalGross) : 0; // Já em decimal (0-1) para formato %
    
    result.push([
      agg.category,
      agg.count,
      avgConfidence,
      agg.totalGross,
      agg.forecastGross,
      agg.totalNet,
      agg.forecastNet,
      percentPipeline,
      agg.q1Total,
      agg.q2Total,
      agg.q3Total,
      agg.q4Total
    ]);
  }
  
  // Adicionar linha de TOTAL
  const totals = {
    totalGross: 0,
    forecastGross: 0,
    totalNet: 0,
    forecastNet: 0,
    q1Total: 0,
    q2Total: 0,
    q3Total: 0,
    q4Total: 0,
    count: 0,
    totalConfidence: 0
  };
  
  for (const key of sortedKeys) {
    const agg = aggregation[key];
    totals.totalGross += agg.totalGross;
    totals.forecastGross += agg.forecastGross;
    totals.totalNet += agg.totalNet;
    totals.forecastNet += agg.forecastNet;
    totals.q1Total += agg.q1Total;
    totals.q2Total += agg.q2Total;
    totals.q3Total += agg.q3Total;
    totals.q4Total += agg.q4Total;
    totals.count += agg.count;
    totals.totalConfidence += agg.totalConfidence;
  }
  
  const avgConfidenceTotal = totals.count > 0 ? (totals.totalConfidence / totals.count) / 100 : 0; // Divide por 100 para formato %
  
  result.push([
    "📊 TOTAL",
    totals.count,
    avgConfidenceTotal,
    totals.totalGross,
    totals.forecastGross,
    totals.totalNet,
    totals.forecastNet,
    1.0, // 100% em decimal para formato %
    totals.q1Total,
    totals.q2Total,
    totals.q3Total,
    totals.q4Total
  ]);
  
  return result;
}

/**
 * Escreve uma seção no dashboard
 * Retorna a próxima linha disponível
 */
function _writeSectionToSheet(sheet, startRow, title, data) {
  if (!data || data.length === 0) {
    return startRow;
  }
  
  // Escrever título
  sheet.getRange(startRow, 1).setValue(title);
  sheet.getRange(startRow, 1).setFontWeight("bold").setFontSize(12).setBackground("#4A90E2").setFontColor("#FFFFFF");
  startRow++;
  
  // Escrever cabeçalho
  const headers = data[0];
  sheet.getRange(startRow, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(startRow, 1, 1, headers.length).setFontWeight("bold").setBackground("#E8F0FE").setHorizontalAlignment("center");
  startRow++;
  
  // Escrever dados
  const dataRows = data.slice(1);
  if (dataRows.length > 0) {
    sheet.getRange(startRow, 1, dataRows.length, headers.length).setValues(dataRows);
    
    // Formatar valores numéricos
    for (let col = 1; col <= headers.length; col++) {
      const header = headers[col - 1];
      if (header.includes("Gross") || header.includes("Net") || header.includes("Previsão")) {
        sheet.getRange(startRow, col, dataRows.length, 1).setNumberFormat("#,##0.00");
      } else if (header.includes("%") || header.includes("Confiança Média")) {
        sheet.getRange(startRow, col, dataRows.length, 1).setNumberFormat("0.00%");
      }
    }
    
    startRow += dataRows.length;
  }
  
  // Espaço entre seções
  startRow += 2;
  
  return startRow;
}

/**
 * Aplica formatação final ao dashboard
 */
function _formatDashboardSheet(sheet) {
  // Auto-resize de colunas
  const maxCols = sheet.getMaxColumns();
  for (let col = 1; col <= Math.min(maxCols, 10); col++) {
    sheet.autoResizeColumn(col);
  }
  
  // Congelar primeira linha de cada seção não é prático, então apenas congela a primeira linha
  sheet.setFrozenRows(1);
  
  // Adicionar timestamp da última atualização
  const lastRow = sheet.getLastRow() + 2;
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  sheet.getRange(lastRow, 1).setValue(`Última atualização: ${timestamp}`);
  sheet.getRange(lastRow, 1).setFontStyle("italic").setFontColor("#666666");
}

/**
 * Configura o trigger de atualização automática a cada 15 minutos
 */
/**
 * DEPRECATED - Use ativarTriggerAutomatico() no lugar
 * Mantido para compatibilidade com código existente
 */
function setupDashboardTrigger() {
  ativarTriggerAutomatico();
}

/**
 * DEPRECATED - Use desativarTriggerAutomatico() no lugar
 * Mantido para compatibilidade com código existente
 */
function removeDashboardTrigger() {
  desativarTriggerAutomatico();
}

/**
 * MOSTRA URL DO WEB APP DASHBOARD
 */
function showWebAppURL() {
  const ui = SpreadsheetApp.getUi();
  
  const instructions = `📊 WEB APP DASHBOARD - INSTRUÇÕES DE DEPLOY

Para ativar o Dashboard Web App, siga estes passos:

1️⃣ No menu superior: Extensões → Apps Script
2️⃣ No editor de código: Implantar → Nova implantação
3️⃣ Tipo: "Aplicativo da Web"
4️⃣ Descrição: "Sales Dashboard"
5️⃣ Executar como: "Eu"
6️⃣ Quem tem acesso:
   • "Qualquer pessoa" - Acesso público (use validação programática)
   • "Qualquer pessoa em xertica.com" - Apenas domínio (recomendado)
   • "Apenas eu" - Somente proprietário
7️⃣ Clique em "Implantar"
8️⃣ Copie a URL gerada

🔐 AUTENTICAÇÃO (2 camadas):
1️⃣ Nível Google: Escolha "Qualquer pessoa em xertica.com" no deploy
2️⃣ Nível Código: Configure DASHBOARD_AUTH (linha ~110)
   - enabled: true/false
   - allowedEmails: lista de emails
   - allowedDomain: domínio permitido

💡 RECOMENDADO PARA PRODUÇÃO:
✓ Deploy: "Qualquer pessoa em xertica.com"
✓ Código: enabled=true + lista de emails específicos (CRO, CEO, etc)

🔄 Menu disponível:
- "🔐 Gerenciar Autenticação" - Ver status e configuração
- "🗑️ Limpar Cache Web App" - Forçar atualização
- "🐛 Debug Dashboard Data" - Verificar dados`;

  ui.alert("🌐 Web App Dashboard", instructions, ui.ButtonSet.OK);
  logToSheet("INFO", "WebApp", "Instruções de deploy exibidas");
}

/**
 * Valida se o usuário tem acesso ao dashboard
 * @returns {Object} { authorized: boolean, email: string, reason: string }
 */
function checkDashboardAccess_() {
  // Se autenticação está desabilitada, permite todos
  if (!DASHBOARD_AUTH.enabled) {
    return { authorized: true, email: 'anonymous', reason: 'Auth disabled' };
  }
  
  try {
    const userEmail = Session.getActiveUser().getEmail();
    
    // Se não conseguir obter email (usuário anônimo)
    if (!userEmail) {
      return { 
        authorized: false, 
        email: 'anonymous', 
        reason: 'Usuário não autenticado. Faça login no Google.' 
      };
    }
    
    const emailLower = userEmail.toLowerCase();
    
    // Verifica lista de emails permitidos
    const isInAllowedList = DASHBOARD_AUTH.allowedEmails
      .map(e => e.toLowerCase())
      .includes(emailLower);
    
    if (isInAllowedList) {
      return { authorized: true, email: userEmail, reason: 'Email in whitelist' };
    }
    
    // Verifica domínio permitido
    if (DASHBOARD_AUTH.allowedDomain) {
      const emailDomain = emailLower.split('@')[1];
      if (emailDomain === DASHBOARD_AUTH.allowedDomain.toLowerCase()) {
        return { authorized: true, email: userEmail, reason: 'Domain match' };
      }
    }
    
    // Se chegou aqui, acesso negado
    return { 
      authorized: false, 
      email: userEmail, 
      reason: 'Email/domain not authorized' 
    };
    
  } catch(e) {
    console.error('Erro ao verificar acesso:', e);
    return { 
      authorized: false, 
      email: 'error', 
      reason: 'Error checking access: ' + e.message 
    };
  }
}

/**
 * Serve o HTML do Dashboard com Cache de 15 minutos
 */
function doGet(e) {
  // Verifica autenticação
  const accessCheck = checkDashboardAccess_();
  
  if (!accessCheck.authorized) {
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Acesso Negado | Xertica</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background: linear-gradient(135deg, #1c2b3e 0%, #2a3f5f 100%);
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .access-denied {
              background: rgba(255, 255, 255, 0.1);
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 16px;
              padding: 40px;
              max-width: 500px;
              text-align: center;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 {
              color: #E14849;
              margin: 0 0 10px 0;
              font-size: 24px;
            }
            p {
              color: #b0b8c4;
              line-height: 1.6;
              margin: 15px 0;
            }
            .user-info {
              background: rgba(0, 0, 0, 0.2);
              padding: 10px;
              border-radius: 8px;
              margin: 20px 0;
              font-size: 14px;
              color: #00BEFF;
            }
            .contact {
              margin-top: 30px;
              font-size: 12px;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="access-denied">
            <div class="icon">🔒</div>
            <h1>Acesso Negado</h1>
            <p>${DASHBOARD_AUTH.errorMessage}</p>
            
            ${accessCheck.email !== 'anonymous' && accessCheck.email !== 'error' ? 
              `<div class="user-info">
                Usuário: <strong>${accessCheck.email}</strong><br>
                Motivo: ${accessCheck.reason}
              </div>` : 
              `<p style="color: #E14849;">⚠️ ${accessCheck.reason}</p>`
            }
            
            <div class="contact">
              Para solicitar acesso, entre em contato com:<br>
              <strong>ti@xertica.com</strong> ou <strong>cro@xertica.com</strong>
            </div>
          </div>
        </body>
      </html>
    `)
    .setTitle('Acesso Negado | Xertica')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  // Log de acesso autorizado
  console.log(`✅ Acesso autorizado: ${accessCheck.email} (${accessCheck.reason})`);
  
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'DASHBOARD_HTML_V59';
  
  // Se parâmetro nocache está presente, limpa cache e força regeneração
  const forceRefresh = e && e.parameter && e.parameter.nocache;
  if (forceRefresh) {
    cache.remove(CACHE_KEY);
    cache.remove(AI_ANALYSIS_CACHE_KEY);
    console.log('🔄 Cache limpo via botão de refresh');
  }
  
  let cached = !forceRefresh ? cache.get(CACHE_KEY) : null;

  if (cached) {
    return HtmlService.createHtmlOutput(cached);
  }

  // Gera os dados frescos (getDashboardPayload já salva no cache com DASHBOARD_CACHE_KEY)
  const data = getDashboardPayload();
  
  console.log('✅ Dashboard payload gerado e salvo em cache via getDashboardPayload()');
  
  const template = HtmlService.createTemplateFromFile('Dashboard');
  // NÃO passa payload - o HTML vai buscar do cache
  template.payload = ''; // String vazia para não quebrar o template
  
  const htmlOutput = template.evaluate()
    .setTitle('GTM Intelligence | Xertica')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  
  // NÃO cachear HTML (muito grande) - apenas o payload de dados já foi cacheado acima
  console.log('✅ HTML gerado com sucesso (não cacheado devido ao tamanho)');
  
  return htmlOutput;
}

/**
 * Função chamada pelo HTML para buscar os dados do cache
 * Evita passar dados grandes pelo template
 */
function getDashboardDataFromCache() {
  const cache = CacheService.getScriptCache();
  // USA A MESMA CHAVE definida em SharedCode.gs
  const cached = cache.get(DASHBOARD_CACHE_KEY);
  
  if (cached) {
    console.log('✅ Retornando payload do cache para o HTML');
    return cached; // Retorna como string JSON
  }
  
  console.warn('⚠️ Cache não encontrado, gerando dados novamente...');
  const data = getDashboardPayload();
  
  // Otimiza antes de retornar
  const optimizedData = {
    l10: data.l10,
    fsrMetrics: data.fsrMetrics,
    fsrScorecard: (data.fsrScorecard || []).map(rep => ({
      name: rep.name,
      isActive: rep.isActive,
      winRate: rep.winRate,
      totalWon: rep.totalWon,
      totalLost: rep.totalLost,
      avgWinCycle: rep.avgWinCycle,
      avgLossCycle: rep.avgLossCycle,
      avgGross: rep.avgGross,
      revenue: rep.revenue,
      avgActivitiesWin: rep.avgActivitiesWin,
      avgActivitiesLoss: rep.avgActivitiesLoss,
      topLossCause: rep.topLossCause ? String(rep.topLossCause).substring(0, 80) : 'N/A',
      topWinFactor: rep.topWinFactor ? String(rep.topWinFactor).substring(0, 80) : 'N/A',
      ipv: rep.ipv || 0,
      ipvBreakdown: rep.ipvBreakdown || {}
      // REMOVIDO: winTypes, lossTypes, winLabels, lossLabels (já estão em wordClouds global)
    })),
    insights: {
      topWinFactors: (data.insights?.topWinFactors || []).slice(0, 8).map(f => ({
        factor: String(f.factor || 'N/A').substring(0, 100),
        count: f.count
      })),
      topLossCauses: (data.insights?.topLossCauses || []).slice(0, 8).map(c => ({
        cause: String(c.cause || 'N/A').substring(0, 100),
        count: c.count
      }))
    },
    aiAnalysis: {
      executive: (data.aiAnalysis?.executive || '').substring(0, 1500),
      croCommentary: (data.aiAnalysis?.croCommentary || '').substring(0, 1500),
      winsInsights: (data.aiAnalysis?.winsInsights || '').substring(0, 1200),
      lossInsights: (data.aiAnalysis?.lossInsights || '').substring(0, 1200),
      topOpportunitiesAnalysis: (data.aiAnalysis?.topOpportunitiesAnalysis || '').substring(0, 1500),
      forecastAnalysis: (data.aiAnalysis?.forecastAnalysis || '').substring(0, 1200)
    },
    weeklyAgenda: Object.keys(data.weeklyAgenda || {}).reduce((acc, quarter) => {
      const deals = data.weeklyAgenda[quarter] || [];
      acc[quarter] = deals.slice(0, 5).map(d => ({
        name: String(d.name || 'N/A').substring(0, 80),
        account: String(d.account || d.accountName || 'N/A').substring(0, 60),
        val: d.val,
        owner: String(d.owner || 'N/A').substring(0, 40),
        stage: String(d.stage || 'N/A').substring(0, 40),
        confidence: d.confidence || 0,
        forecastCategory: String(d.forecastCategory || '').substring(0, 20),
        fiscalQ: String(d.fiscalQ || '').substring(0, 15),
        closeDate: d.closeDate,
        daysToClose: d.daysToClose || 0,
        idleDays: d.idleDays || 0,
        meddicScore: d.meddicScore || 0,
        bantScore: d.bantScore || 0,
        engagementQuality: String(d.engagementQuality || '').substring(0, 40),
        activityMix: String(d.activityMix || '').substring(0, 60),
        activities7d: d.activities7d || 0,
        activities30d: d.activities30d || 0,
        pipelineAnalysis: String(d.pipelineAnalysis || '').substring(0, 150),  // REDUZIDO: 300→150
        flags: String(d.flags || '').substring(0, 80),  // REDUZIDO: 100→80
        riskFlags: String(d.riskFlags || '').substring(0, 100),  // REDUZIDO: 150→100
        codAcao: String(d.codAcao || '').substring(0, 40),  // REDUZIDO: 50→40
        auditQuestions: String(d.auditQuestions || '').substring(0, 150),  // REDUZIDO: 200→150
        nextActivity: d.nextActivity ? String(d.nextActivity).substring(0, 60) : null  // REDUZIDO: 80→60
      }));
      return acc;
    }, {}),
    // NOVO: Arrays para word clouds
    wordClouds: data.wordClouds || {
      winTypes: [],
      winLabels: [],
      lossTypes: [],
      lossLabels: []
    },
    updatedAt: data.updatedAt,
    quarterLabel: data.quarterLabel
  };
  
  const payload = JSON.stringify(optimizedData);
  const payloadSizeKB = (payload.length / 1024).toFixed(2);
  console.log(`📦 Payload otimizado para HTML: ${payloadSizeKB} KB`);
  
  // Verifica se payload está muito grande (limite do cache é ~100KB)
  if (payload.length > 95000) {
    console.warn(`⚠️ Payload muito grande (${payloadSizeKB} KB), aplicando otimização adicional...`);
    // Remove análises de IA mais longas se necessário
    optimizedData.aiAnalysis.topOpportunitiesAnalysis = optimizedData.aiAnalysis.topOpportunitiesAnalysis.substring(0, 800);
    optimizedData.aiAnalysis.croCommentary = optimizedData.aiAnalysis.croCommentary.substring(0, 1000);
    const reducedPayload = JSON.stringify(optimizedData);
    console.log(`📦 Payload reduzido para: ${(reducedPayload.length / 1024).toFixed(2)} KB`);
    cache.put(DASHBOARD_CACHE_KEY, reducedPayload, 300); // 5 minutos
    return reducedPayload;
  }
  
  cache.put(DASHBOARD_CACHE_KEY, payload, 300); // 5 minutos
  
  return payload;
}

/**
 * Limpa o cache do dashboard
 * Chamado pelo botão de atualizar no HTML
 */
function clearCache() {
  const cache = CacheService.getScriptCache();
  const keys = [
    'DASHBOARD_PAYLOAD_FOR_HTML_V1',
    'DASHBOARD_DATA_PREPROCESSED_V2',
    'AI_ANALYSIS_CACHE_V1',
    DASHBOARD_CACHE_KEY  // Adiciona a chave atual do cache
  ];
  
  keys.forEach(key => {
    cache.remove(key);
  });
  
  console.log('✅ Cache limpo com sucesso (incluindo DASHBOARD_CACHE_KEY)');
  return true;
}

/**
 * ⚡ PRÉ-PROCESSAMENTO DE DASHBOARD
 * Acelera o carregamento do web app gerando cache
 * @param {boolean} silent - Se true, não mostra alertas (para trigger automático)
 */
function preprocessDashboardData(silent) {
  console.log('🚀 Iniciando pré-processamento de dados do dashboard...');
  const startTime = new Date().getTime();
  
  try {
    // Gera e salva o payload completo em cache
    const data = getDashboardPayload();
    
    // Salva no cache por 1 hora (3600 segundos)
    const cache = CacheService.getScriptCache();
    
    cache.put(DASHBOARD_CACHE_KEY, JSON.stringify(data), 300); // 5 minutos
    
    const endTime = new Date().getTime();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Pré-processamento concluído em ${duration}s`);
    console.log(`📦 Dados salvos em cache por 1 hora`);
    
    // Atualiza aba de status (somente quando não é silencioso)
    if (!silent) {
      updateCacheStatusSheet_(duration, data);
    }
    
    // Log simplificado
    logToSheet("INFO", "Dashboard", `Cache atualizado em ${duration}s`);
    
    // Alerta somente quando executado manualmente
    if (!silent && typeof SpreadsheetApp !== 'undefined') {
      try {
        SpreadsheetApp.getUi().alert(
          '✅ Sucesso!',
          `Dashboard pré-processado em ${duration}s.\n\n` +
          `Os dados foram salvos em cache por 1 hora.\n` +
          `Agora o Web App vai carregar muito mais rápido!`,
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      } catch (uiError) {
        // Ignorar erro de UI quando rodando via trigger
      }
    }
    
    return data; // ✅ Agora retorna o payload
  } catch(e) {
    console.error('❌ Erro no pré-processamento:', e);
    logToSheet("ERROR", "Dashboard", `Erro no pré-processamento: ${e.message}`);
    
    // Alerta de erro somente quando manual
    if (!silent && typeof SpreadsheetApp !== 'undefined') {
      try {
        SpreadsheetApp.getUi().alert(
          '❌ Erro',
          `Erro ao pré-processar: ${e.message}`,
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      } catch (uiError) {
        // Ignorar erro de UI
      }
    }
    return null; // ✅ Retorna null em caso de erro
  }
}

/**
 * Wrapper para execução automática via trigger (modo silencioso)
 */
function preprocessDashboardDataAutomatic() {
  preprocessDashboardData(true); // silent = true
}

/**
 * Atualiza aba de status do cache (visibilidade para o usuário)
 */
function updateCacheStatusSheet_(duration, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('📊 Cache Status');
  
  // Cria a aba se não existir
  if (!sheet) {
    sheet = ss.insertSheet('📊 Cache Status');
    
    // Formata cabeçalho
    sheet.getRange('A1:B1').setBackground('#00BEFF').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setColumnWidth(1, 250);
    sheet.setColumnWidth(2, 400);
    
    // Header
    sheet.getRange('A1').setValue('📊 DASHBOARD CACHE STATUS');
    sheet.getRange('A1:B1').merge();
  }
  
  // Limpa conteúdo anterior
  if (sheet.getMaxRows() > 2) {
    sheet.deleteRows(3, sheet.getMaxRows() - 2);
  }
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600000); // +1 hora
  
  // Preenche dados
  const statusData = [
    ['', ''],
    ['🟢 Status', 'CACHE ATIVO'],
    ['⏰ Processado em', now.toLocaleString('pt-BR')],
    ['⏳ Expira em', expiresAt.toLocaleString('pt-BR')],
    ['⚡ Tempo de processamento', duration + ' segundos'],
    ['', ''],
    ['📊 RESUMO DOS DADOS SALVOS', ''],
    ['Vendedores ativos', (data.fsrScorecard || []).filter(r => r.isActive).length],
    ['Total de deals (ganhos)', (data.fsrScorecard || []).reduce((s, r) => s + (r.totalWon || 0), 0)],
    ['Total de deals (perdas)', (data.fsrScorecard || []).reduce((s, r) => s + (r.totalLost || 0), 0)],
    ['Oportunidades em pauta', Object.values(data.weeklyAgenda || {}).reduce((s, deals) => s + deals.length, 0)],
    ['', ''],
    ['ℹ️ COMO USAR', ''],
    ['1. Este cache expira em 1 hora', ''],
    ['2. Após expirar, o Web App processa do zero (mais lento)', ''],
    ['3. Execute novamente "PRÉ-PROCESSAR" quando quiser atualizar', ''],
    ['4. Ideal: pré-processar após cada sync do Pipedrive', '']
  ];
  
  sheet.getRange(3, 1, statusData.length, 2).setValues(statusData);
  
  // Formata células especiais
  sheet.getRange('B3').setFontColor('#00FF00').setFontWeight('bold'); // Status verde
  sheet.getRange('A7').setBackground('#24344d').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange('A13').setBackground('#24344d').setFontColor('#FFFFFF').setFontWeight('bold');
  
  console.log('✅ Aba de status do cache atualizada');
}

/**
 * Verifica status do cache sem processar novamente
 */
function checkCacheStatus() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(DASHBOARD_CACHE_KEY);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('📊 Cache Status');
  
  if (!cached) {
    // Cache vazio
    SpreadsheetApp.getUi().alert(
      '⚠️ Cache Vazio',
      'Não há dados pré-processados no momento.\n\n' +
      'Execute "⚡ PRÉ-PROCESSAR Dashboard" para criar o cache.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    // Atualiza aba se existir
    if (sheet) {
      sheet.getRange('B3').setValue('CACHE VAZIO').setFontColor('#FF0000');
      sheet.getRange('B4').setValue('-');
      sheet.getRange('B5').setValue('-');
    }
    
    return;
  }
  
  // Cache existe
  try {
    const data = JSON.parse(cached);
    const dataSize = (cached.length / 1024).toFixed(2);
    
    SpreadsheetApp.getUi().alert(
      '✅ Cache Ativo',
      `O cache está ativo e funcionando!\n\n` +
      `Tamanho: ${dataSize} KB\n` +
      `Vendedores ativos: ${(data.fsrScorecard || []).filter(r => r.isActive).length}\n\n` +
      `O Web App está carregando rapidamente.\n` +
      `Veja a aba "📊 Cache Status" para mais detalhes.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    // Seleciona a aba de status
    if (sheet) {
      ss.setActiveSheet(sheet);
    }
    
  } catch(e) {
    SpreadsheetApp.getUi().alert(
      '❌ Erro',
      `Cache corrompido: ${e.message}\n\n` +
      'Execute novamente "⚡ PRÉ-PROCESSAR Dashboard".',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Orquestrador de Dados: Reutiliza a Engine Layer existente
 * MODIFICADO: Tenta usar dados pré-processados primeiro
 */
function getDashboardPayload() {
  // Tenta usar dados pré-processados (muito mais rápido!)
  const cache = CacheService.getScriptCache();
  const cached = cache.get(DASHBOARD_CACHE_KEY);
  
  if (cached) {
    console.log('⚡ Usando dados PRÉ-PROCESSADOS do cache (super rápido!)');
    try {
      const parsedCache = JSON.parse(cached);
      console.log(`📅 Última atualização: ${parsedCache.updatedAt || 'N/A'}`);
      return parsedCache;
    } catch(e) {
      console.warn('⚠️ Erro ao parsear cache, regenerando...', e);
    }
  }
  
  console.log('🔄 Cache não encontrado ou expirado, processando dados (pode demorar...)');
  console.log('💡 Dica: Execute instalarTriggerAutomatico() para atualização automática a cada 30min');
  
  // ============================================================================
  // FONTE DE DADOS DO DASHBOARD
  // ============================================================================
  // O Dashboard consome as PLANILHAS DE ANÁLISE (geradas), NÃO as planilhas BASE
  // 
  // ❌ NÃO USA (Base/Fonte):
  //    - Historico_Ganhos
  //    - Historico_Perdidas
  //    - Pipeline_Aberto
  //
  // ✅ USA (Análises Geradas com IA):
  //    - 🎯 Análise Forecast IA  (SHEETS.RESULTADO_PIPELINE)
  //    - 📈 Análise Ganhas       (SHEETS.RESULTADO_GANHAS)
  //    - 📉 Análise Perdidas     (SHEETS.RESULTADO_PERDIDAS)
  //
  // ----------------------------------------------------------------------------
  // MAPEAMENTO DE CAMPOS DAS PLANILHAS DE ANÁLISE
  // ----------------------------------------------------------------------------
  //
  // 📉 ANÁLISE PERDIDAS (39 colunas):
  // 0.  Run ID
  // 1.  Oportunidade
  // 2.  Conta
  // 3.  Perfil Cliente
  // 4.  Vendedor
  // 5.  Gross
  // 6.  Net
  // 7.  Portfólio
  // 8.  Segmento
  // 9.  Família Produto
  // 10. Status
  // 11. Fiscal Q
  // 12. Data Fechamento
  // 13. Ciclo (dias)
  // 14. Produtos
  // 15. 📝 Resumo Análise
  // 16. 🎯 Causa Raiz
  // 17. ⚠️ Causas Secundárias
  // 18. Tipo Resultado
  // 19. Evitável?
  // 20. 🚨 Sinais Alerta
  // 21. Momento Crítico
  // 22. 💡 Lições Aprendidas
  // 23. # Atividades
  // 24. Ativ. 7d
  // 25. Ativ. 30d
  // 26. Distribuição Tipos
  // 27. Período Pico
  // 28. Cadência Média (dias)
  // 29. # Total Mudanças
  // 30. # Mudanças Críticas
  // 31. Mudanças Close Date
  // 32. Mudanças Stage
  // 33. Mudanças Valor
  // 34. Campos + Alterados
  // 35. Padrão Mudanças
  // 36. Freq. Mudanças
  // 37. # Editores
  // 38. 🏷️ Labels
  //
  // 📈 ANÁLISE GANHAS (39 colunas):
  // 0.  Run ID
  // 1.  Oportunidade
  // 2.  Conta
  // 3.  Perfil Cliente
  // 4.  Vendedor
  // 5.  Gross
  // 6.  Net
  // 7.  Portfólio
  // 8.  Segmento
  // 9.  Família Produto
  // 10. Status
  // 11. Fiscal Q
  // 12. Data Fechamento
  // 13. Ciclo (dias)
  // 14. Produtos
  // 15. 📝 Resumo Análise
  // 16. 🎯 Causa Raiz
  // 17. ✨ Fatores Sucesso
  // 18. Tipo Resultado
  // 19. Qualidade Engajamento
  // 20. Gestão Oportunidade
  // 21. - (coluna vazia)
  // 22. 💡 Lições Aprendidas
  // 23. # Atividades
  // 24. Ativ. 7d
  // 25. Ativ. 30d
  // 26. Distribuição Tipos
  // 27. Período Pico
  // 28. Cadência Média (dias)
  // 29. # Total Mudanças
  // 30. # Mudanças Críticas
  // 31. Mudanças Close Date
  // 32. Mudanças Stage
  // 33. Mudanças Valor
  // 34. Campos + Alterados
  // 35. Padrão Mudanças
  // 36. Freq. Mudanças
  // 37. # Editores
  // 38. 🏷️ Labels
  //
  // 🎯 ANÁLISE FORECAST IA (53 colunas):
  // 0.  Run ID
  // 1.  Oportunidade
  // 2.  Conta
  // 3.  Perfil
  // 4.  Produtos
  // 5.  Vendedor
  // 6.  Gross
  // 7.  Net
  // 8.  Fase Atual
  // 9.  Forecast SF
  // 10. Fiscal Q
  // 11. Data Prevista
  // 12. Ciclo (dias)
  // 13. Dias Funil
  // 14. Atividades
  // 15. Atividades (Peso)
  // 16. Mix Atividades
  // 17. Idle (Dias)
  // 18. Qualidade Engajamento
  // 19. Forecast IA
  // 20. Confiança (%)
  // 21. Motivo Confiança
  // 22. MEDDIC Score
  // 23. MEDDIC Gaps
  // 24. MEDDIC Evidências
  // 25. BANT Score
  // 26. BANT Gaps
  // 27. BANT Evidências
  // 28. Justificativa IA
  // 29. Regras Aplicadas
  // 30. Incoerência Detectada
  // 31. Perguntas de Auditoria IA
  // 32. Flags de Risco
  // 33. Gaps Identificados
  // 34. Cód Ação
  // 35. Ação Sugerida
  // 36. Risco Principal
  // 37. # Total Mudanças
  // 38. # Mudanças Críticas
  // 39. Mudanças Close Date
  // 40. Mudanças Stage
  // 41. Mudanças Valor
  // 42. 🚨 Anomalias Detectadas
  // 43. Velocity Predição
  // 44. Velocity Detalhes
  // 45. Território Correto?
  // 46. Vendedor Designado
  // 47. Estado/Cidade Detectado
  // 48. Fonte Detecção
  // 49. Calendário Faturação
  // 50. Valor Reconhecido Q1
  // 51. Valor Reconhecido Q2
  // 52. Valor Reconhecido Q3
  // 53. Valor Reconhecido Q4
  //
  // Benefícios:
  // - Dados já têm análise IA, atividades, flags, insights
  // - Campos padronizados (Gross, Net, Fiscal Q, # Atividades, etc.)
  // - Não precisa reprocessar ou chamar IA novamente
  // ============================================================================
  
  const openRaw = getSheetData(SHEETS.RESULTADO_PIPELINE);    // 🎯 Análise Forecast IA
  const wonRaw = getSheetData(SHEETS.RESULTADO_GANHAS);       // 📈 Análise Ganhas
  const lostRaw = getSheetData(SHEETS.RESULTADO_PERDIDAS);    // 📉 Análise Perdidas
  
  // NOVO: Dados da aba Sales Specialist
  const salesSpecRaw = getSalesSpecialistData_();
  
  // ============================================================================
  // CLOUD FUNCTION: Análise pesada via Python/Pandas
  // ============================================================================
  // Se USE_CLOUD_FUNCTION = true, delega análise para a Cloud Function
  // Retorna análise completa e adiciona ao payload
  let cloudAnalysis = null;
  if (USE_CLOUD_FUNCTION) {
    console.log('☁️ Modo Cloud Function ativado, preparando dados...');
    const rawData = prepareRawDataForCloudFunction();
    cloudAnalysis = callCloudFunction(rawData, {
      quarter: null,  // null = todos os quarters
      seller: null,   // null = todos os vendedores
      min_value: 0    // 0 = sem filtro de valor mínimo
    });
    
    if (cloudAnalysis) {
      console.log('✅ Análise da Cloud Function recebida');
      console.log('   • Closed deals:', cloudAnalysis.closed_analysis?.total_deals || 0);
      console.log('   • Pipeline deals:', cloudAnalysis.pipeline_analysis?.total_deals || 0);
      console.log('   • Sellers analisados:', cloudAnalysis.seller_scorecard?.length || 0);
    } else {
      console.warn('⚠️ Cloud Function falhou, continuando com análise local');
    }
  }

  // 2. Mapeia e Agrega (Usa sua função aggregateOpportunities)
  // Passa mode para cada tipo de análise:
  // - OPEN: Pipeline aberto (NET=0 é suspeito)
  // - WON: Ganhas (NET=0 pode ocorrer em renovações orgânicas)
  // - LOST: Perdidas (NET=0 é normal, deals perdidos não têm margem)
  const openAgg = aggregateOpportunities(openRaw.values, getColumnMapping(openRaw.headers), 'OPEN');
  const wonAgg = aggregateOpportunities(wonRaw.values, getColumnMapping(wonRaw.headers), 'WON');
  const lostAgg = aggregateOpportunities(lostRaw.values, getColumnMapping(lostRaw.headers), 'LOST');

  // 3. Define Janelas de Tempo
  const today = new Date();
  const lastMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 6);
  const lastFriday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 2);
  const nextMonday = new Date(today); 
  nextMonday.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7);
  const nextFriday = new Date(nextMonday); 
  nextFriday.setDate(nextMonday.getDate() + 4);
  
  // Quarter atual - detecta baseado na data de hoje
  const currentQuarter = calculateFiscalQuarter(today);
  
  // ============================================================================
  // VALIDAÇÃO CRÍTICA: Garantir que currentQuarter é válido
  // ============================================================================
  if (!currentQuarter || !currentQuarter.label || currentQuarter.label === 'N/A') {
    logToSheet('ERROR', 'Dashboard', `❌ ERRO CRÍTICO: currentQuarter inválido! Valor: ${JSON.stringify(currentQuarter)}`);
    logToSheet('ERROR', 'Dashboard', `   today = ${today}, type = ${typeof today}, isDate = ${today instanceof Date}`);
    // Força fallback para FY26-Q1
    currentQuarter.label = 'FY26-Q1';
    currentQuarter.year = 2026;
    currentQuarter.q = 1;
    currentQuarter.start = new Date(2026, 0, 1);
    currentQuarter.end = new Date(2026, 2, 31);
    logToSheet('WARN', 'Dashboard', `⚠️ Usando fallback: ${currentQuarter.label}`);
  }
  
  const currentQuarterLabel = currentQuarter.label; // Ex: "FY26-Q1"
  console.log(`📅 Quarter atual detectado: ${currentQuarterLabel}`);
  
  // Debug: Contagem de deals por ano fiscal
  const fy26Count = openAgg.filter(i => (i.fiscalQ || '').startsWith('FY26-')).length;
  const fy25Count = openAgg.filter(i => (i.fiscalQ || '').startsWith('FY25-')).length;
  const fy27Count = openAgg.filter(i => (i.fiscalQ || '').startsWith('FY27-')).length;
  const noFiscalQCount = openAgg.filter(i => !i.fiscalQ || i.fiscalQ.trim() === '').length;
  console.log(`📊 Pipeline por Ano Fiscal: FY26=${fy26Count}, FY25=${fy25Count}, FY27=${fy27Count}, Sem FiscalQ=${noFiscalQCount}, Total=${openAgg.length}`);
  
  // Helper para verificar se é Incremental (Não Renovação)
  const isIncremental = (item) => {
    const text = (item.products + " " + item.oppName + " " + item.desc).toUpperCase();
    return !/RENOV|RENEWAL|ORG[ÁA]NICO|BACKLOG/.test(text);
  };

  // Helper para categorizar produtos
  const getCategory = (products) => {
    const p = products.toUpperCase();
    if (/CONSULTORIA|SERVICO|SERVICE|PROFESSIONAL/.test(p)) return 'Serviços';
    if (/PLATAFORMA|PLATFORM|SAAS|SOFTWARE/.test(p)) return 'Plataformas';
    return 'Soluções';
  };

  // 4. Calcula Indicadores L10 (7 KPIs Completos)
  const lastWeekWins = wonAgg.filter(i => isIncremental(i) && i.closed >= lastMonday && i.closed <= lastFriday);
  
  const l10 = {
    // Indicador 1: Net Revenue Incremental
    netRevenue: lastWeekWins.reduce((sum, i) => sum + i.net, 0),
    
    // Indicador 2: Bookings Incremental
    bookingsGross: lastWeekWins.reduce((sum, i) => sum + i.gross, 0),
    bookingsCount: lastWeekWins.length,

    // Indicador 3: Pipeline Próxima Semana
    pipelineNextWeek: openAgg
      .filter(i => {
        const d = new Date(i.closed);
        return d >= nextMonday && d <= nextFriday;
      })
      .reduce((sum, i) => sum + i.gross, 0),
    
    // Indicador 4: Pipeline Trimestre Atual (Stage >= Proposta)
    pipelineQuarter: openAgg
      .filter(i => {
        const stageOk = /PROPOSTA|NEGOC|CONTRACT|CLOSED/.test(i.stage.toUpperCase());
        return stageOk && i.fiscalQ === currentQuarterLabel;
      })
      .reduce((sum, i) => sum + i.gross, 0),

    // Indicador 5: Aging Pipeline (>90 dias)
    agingPipeline: openAgg.filter(i => {
      const daysSinceCreated = i.inactiveDays || calculateIdleDays(i.created, today);
      return daysSinceCreated > 90;
    }).length,
    
    // Indicador 6: Previsibilidade por Confiança (Previsão Ponderada)
    predictableRevenue: openAgg.reduce((sum, i) => {
      const confidence = parseFloat(i.confidence) || parseFloat(i.probability) || 50;
      return sum + (i.gross * confidence / 100);
    }, 0),
    
    // NOVOS INDICADORES
    // Total de deals no pipeline
    dealsCount: openAgg.length,
    
    // Pipeline total (gross)
    totalPipelineGross: openAgg.reduce((sum, i) => sum + i.gross, 0),
    
    // Pipeline total (net)
    totalPipelineNet: openAgg.reduce((sum, i) => sum + i.net, 0),
    
    // Pipeline Total (TODO - Qualquer Ano Fiscal)
    allPipelineGross: openAgg.reduce((sum, i) => sum + i.gross, 0),
    allPipelineNet: openAgg.reduce((sum, i) => sum + i.net, 0),
    allPipelineDeals: openAgg.length,
    
    // Pipeline Total Ano FY26 (TODAS as oportunidades abertas do ano fiscal 2026)
    pipelineTotalAnoGross: (() => {
      const fy26Deals = openAgg.filter(i => (i.fiscalQ || '').startsWith('FY26-'));
      return fy26Deals.reduce((sum, i) => sum + i.gross, 0);
    })(),
    
    pipelineTotalAnoNet: (() => {
      const fy26Deals = openAgg.filter(i => (i.fiscalQ || '').startsWith('FY26-'));
      return fy26Deals.reduce((sum, i) => sum + i.net, 0);
    })(),
    
    pipelineTotalAnoDeals: openAgg.filter(i => (i.fiscalQ || '').startsWith('FY26-')).length,
    
    // Pipeline por Quarter (usa Fiscal Q para filtro)
    pipelineQuarterDetails: (() => {
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      const result = {};
      
      quarters.forEach(q => {
        const targetFiscalQ = `FY26-${q}`; // Ex: "FY26-Q1"
        
        const dealsInQ = openAgg.filter(i => i.fiscalQ === targetFiscalQ);
        
        result[q] = {
          gross: dealsInQ.reduce((sum, i) => sum + i.gross, 0),
          net: dealsInQ.reduce((sum, i) => sum + i.net, 0),
          count: dealsInQ.length
          // REMOVIDO: deals array (economiza ~30KB, dados já estão em weeklyAgenda)
        };
      });
      
      return result;
    })(),
    
    // Pipeline Sales Specialist (Curado pelos Sales Specialists)
    pipelineSalesSpecialistGross: salesSpecRaw.totalGross,
    pipelineSalesSpecialistNet: salesSpecRaw.totalNet,
    pipelineSalesSpecialistDeals: salesSpecRaw.dealsCount,
    
    // Sales Specialist - Commit (Status = "Commit")
    salesSpecCommitGross: salesSpecRaw.commitGross,
    salesSpecCommitNet: salesSpecRaw.commitNet,
    salesSpecCommitDeals: salesSpecRaw.commitCount,
    
    // Sales Specialist - Upside (Status = "Upside")
    salesSpecUpsideGross: salesSpecRaw.upsideGross,
    salesSpecUpsideNet: salesSpecRaw.upsideNet,
    salesSpecUpsideDeals: salesSpecRaw.upsideCount,
    
    // Sales Specialist - Breakdown por Fiscal Q (baseado em Closed Date)
    salesSpecByFiscalQ: salesSpecRaw.salesSpecByFiscalQ || {},
    
    // Deals com alta confiança (>50%)
    highConfidenceDeals: (() => {
      const highConf = openAgg.filter(i => {
        const confidence = parseFloat(i.confidence) || parseFloat(i.probability) || 0;
        return confidence > 50;
      });
      return {
        gross: highConf.reduce((sum, i) => sum + i.gross, 0),
        net: highConf.reduce((sum, i) => sum + i.net, 0),
        count: highConf.length
      };
    })(),
    
    // Indicador 7: Margem Média por Categoria
    marginByCategory: (() => {
      const categories = {};
      lastWeekWins.forEach(i => {
        const cat = getCategory(i.products);
        if (!categories[cat]) categories[cat] = { net: 0, gross: 0, count: 0 };
        categories[cat].net += i.net;
        categories[cat].gross += i.gross;
        categories[cat].count++;
      });
      
      return Object.keys(categories).map(cat => ({
        category: cat,
        margin: categories[cat].gross > 0 ? (categories[cat].net / categories[cat].gross * 100).toFixed(1) : 0,
        count: categories[cat].count,
        revenue: categories[cat].net
      }));
    })(),
    
    // Quarter atual (label) - Adicionado para compatibilidade com o dashboard
    currentQuarterLabel: currentQuarterLabel
  };

  // 5. Calcula FSR Scorecard (Performance + Diagnóstico de Comportamento)
  const fsrMap = {};
  
  // DEBUG: Verifica amostra de dados de entrada
  if (wonAgg.length > 0) {
    const sample = wonAgg[0];
    console.log('🔍 AMOSTRA wonAgg[0]:', {
      oppName: sample.oppName,
      ciclo: sample.ciclo,
      gross: sample.gross,
      net: sample.net,
      owner: sample.owner,
      aiInsight: (sample.aiInsight || '').substring(0, 100),
      created: sample.created,
      closed: sample.closed,
      hasCreated: !!sample.created,
      hasClosed: !!sample.closed
    });
  }
  if (lostAgg.length > 0) {
    const sample = lostAgg[0];
    console.log('🔍 AMOSTRA lostAgg[0]:', {
      oppName: sample.oppName,
      ciclo: sample.ciclo,
      gross: sample.gross,
      net: sample.net,
      owner: sample.owner,
      aiInsight: (sample.aiInsight || '').substring(0, 100),
      created: sample.created,
      closed: sample.closed,
      hasCreated: !!sample.created,
      hasClosed: !!sample.closed
    });
  }
  
  // Helper para extrair atividades do campo de análise IA
  const extractActivities = (item) => {
    // Busca no campo "# Atividades" da análise IA
    // O campo pode vir como "aiActivities" ou diretamente no item
    if (item.aiActivities && !isNaN(item.aiActivities)) {
      return parseInt(item.aiActivities) || 0;
    }
    // Fallback: tenta extrair do campo de análise textual
    const text = (item.aiInsight || item.desc || '').toUpperCase();
    const match = text.match(/ATIVIDADES?[:\s]*([0-9]+)/i);
    if (match) {
      console.log(`🎯 Atividades extraídas de ${item.oppName}: ${match[1]}`);
      return parseInt(match[1]) || 0;
    }
    // Debug: log se não encontrou
    if (!extractActivities.warnedCount) extractActivities.warnedCount = 0;
    if (extractActivities.warnedCount < 2) {
      console.log(`⚠️ ${item.oppName}: Atividades não encontradas. aiInsight: "${(item.aiInsight || '').substring(0, 50)}..."`);
      extractActivities.warnedCount++;
    }
    return 0;
  };
  
  // Helper para extrair causa raiz ou fator
  const extractReason = (item, field) => {
    // PRIORIDADE 1: Campos específicos das análises
    if (field === 'winFactors' && item.winFactors) {
      return item.winFactors.substring(0, 100).trim();
    }
    if (field === 'secondaryCauses' && item.secondaryCauses) {
      return item.secondaryCauses.substring(0, 100).trim();
    }
    // PRIORIDADE 2: Procura no aiInsight
    const text = item.aiInsight || item[field] || '';
    const match = text.match(/(?:🎯|✨)\s*([^\n]{1,100})/i);
    return match ? match[1].trim() : 'N/A';
  };
  
  // Processa Wins e Losses
  let cycleDebugCount = 0;
  let cycleValidCount = 0;
  let sampleCiclos = [];
  
  wonAgg.forEach(item => {
    const owner = normText_(item.owner);
    if (!fsrMap[owner]) fsrMap[owner] = { 
      won: [], lost: [], revenue: 0, revenueGross: 0 
    };
    
    cycleDebugCount++;
    if (item.ciclo && item.ciclo > 0) {
      cycleValidCount++;
      if (sampleCiclos.length < 5) {
        sampleCiclos.push({ opp: item.oppName, ciclo: item.ciclo, created: item.created, closed: item.closed });
      }
    }
    
    // Verifica se está no quarter atual usando Fiscal Q
    const isInCurrentQuarter = item.fiscalQ && item.fiscalQ === currentQuarterLabel;
    
    // Debug: Log primeiros 5 deals ganhos para verificar dados
    if (!wonAgg.debugLogged) wonAgg.debugLogged = 0;
    if (wonAgg.debugLogged < 5) {
      console.log(`📊 Debug Deal Ganho #${wonAgg.debugLogged + 1}:`, {
        oppName: item.oppName,
        owner: owner,
        gross: item.gross,
        net: item.net,
        fiscalQ: item.fiscalQ,
        currentQuarterLabel: currentQuarterLabel,
        isInCurrentQuarter: isInCurrentQuarter
      });
      wonAgg.debugLogged++;
    }

    fsrMap[owner].won.push({
      cycle: item.ciclo || 0,
      gross: item.gross,
      net: item.net,
      activities: extractActivities(item),
      factor: extractReason(item, 'winFactors'),  // Agora usa campo específico
      isInCurrentQuarter: isInCurrentQuarter
    });
    
    // Acumula revenue (Net) E gross - APENAS do quarter atual para revenue
    if (isInCurrentQuarter) {
      fsrMap[owner].revenue += item.net;
      if (!fsrMap[owner].revenueGross) fsrMap[owner].revenueGross = 0;
      fsrMap[owner].revenueGross += item.gross;
      
      // Debug: Log acumulação
      if (wonAgg.debugLogged <= 5) {
        console.log(`💰 Acumulando ${owner}: +Gross ${item.gross} = Total ${fsrMap[owner].revenueGross}, +Net ${item.net} = Total ${fsrMap[owner].revenue}`);
      }
    }
    if (!fsrMap[owner].totalGross) fsrMap[owner].totalGross = 0;
    if (!fsrMap[owner].totalNet) fsrMap[owner].totalNet = 0;
    fsrMap[owner].totalGross += item.gross;
    fsrMap[owner].totalNet += item.net;
    
    // Debug: Log primeiros 3 acumuladores
    if (!wonAgg.grossDebugCount) wonAgg.grossDebugCount = 0;
    if (wonAgg.grossDebugCount < 3 && item.gross > 0) {
      console.log(`💰 Acumulando ${owner}: +Gross ${item.gross} = Total ${fsrMap[owner].totalGross}, +Net ${item.net} = Total ${fsrMap[owner].totalNet}`);
      wonAgg.grossDebugCount++;
    }
  });
  
  lostAgg.forEach(item => {
    const owner = normText_(item.owner);
    if (!fsrMap[owner]) fsrMap[owner] = { 
      won: [], lost: [], revenue: 0, revenueGross: 0 
    };
    
    cycleDebugCount++;
    if (item.ciclo && item.ciclo > 0) {
      cycleValidCount++;
      if (sampleCiclos.length < 5) {
        sampleCiclos.push({ opp: item.oppName, ciclo: item.ciclo, created: item.created, closed: item.closed });
      }
    }
    
    // Verifica se está no quarter atual usando Fiscal Q
    const isInCurrentQuarter = item.fiscalQ && item.fiscalQ === currentQuarterLabel;
    
    fsrMap[owner].lost.push({
      cycle: item.ciclo || 0,
      activities: extractActivities(item),
      cause: extractReason(item, 'secondaryCauses'),  // Usa causas secundárias se disponível
      avoidable: item.avoidable || 'N/A',
      isInCurrentQuarter: isInCurrentQuarter
    });
  });
  
  // Log para debug
  console.log(`📊 Dashboard Debug: ${cycleValidCount}/${cycleDebugCount} deals com ciclo > 0`);
  console.log(`📅 Filtragem por quarter: ${currentQuarterLabel}`);
  
  // Conta quantos deals estão no quarter atual
  const winsInQuarter = wonAgg.filter(item => item.fiscalQ === currentQuarterLabel).length;
  const lossesInQuarter = lostAgg.filter(item => item.fiscalQ === currentQuarterLabel).length;
  console.log(`✅ Wins no ${currentQuarterLabel}: ${winsInQuarter}/${wonAgg.length}`);
  console.log(`❌ Losses no ${currentQuarterLabel}: ${lossesInQuarter}/${lostAgg.length}`);
  
  if (sampleCiclos.length > 0) {
    console.log('📊 Amostra de ciclos:', JSON.stringify(sampleCiclos.slice(0, 2)));
  } else {
    console.log('⚠️ NENHUM deal tem ciclo > 0. Verificar campos Created Date e Close Date nas planilhas.');
  }

  const fsrScorecard = Object.keys(fsrMap).map(owner => {
    const data = fsrMap[owner];
    const totalWon = data.won.length;
    const totalLost = data.lost.length;
    const total = totalWon + totalLost;
    
    // FILTRO DE QUARTER: Conta apenas deals do quarter atual para métricas de performance
    // Mas mantém histórico completo para ciclo médio e análise de padrões
    const totalWonQuarter = data.won.filter(w => w.isInCurrentQuarter).length;
    const totalLostQuarter = data.lost.filter(l => l.isInCurrentQuarter).length;
    const totalQuarter = totalWonQuarter + totalLostQuarter;
    
    // Scorecard de Performance
    const winRate = total > 0 ? Math.round((totalWon / total) * 100) : 0;
    
    // Debug: Log dos ciclos individuais
    const winCycles = data.won.map(w => w.cycle).filter(c => c > 0);
    const lossCycles = data.lost.map(l => l.cycle).filter(c => c > 0);
    
    const avgWinCycle = winCycles.length > 0 ? Math.round(winCycles.reduce((s, c) => s + c, 0) / winCycles.length) : 0;
    const avgLossCycle = lossCycles.length > 0 ? Math.round(lossCycles.reduce((s, c) => s + c, 0) / lossCycles.length) : 0;
    // Ticket Médio baseado em Gross (prática padrão de mercado)
    const avgGross = totalWon > 0 ? Math.round(data.won.reduce((s, w) => s + w.gross, 0) / totalWon) : 0;
    // Total de Gross e Net Gerado pelo vendedor (vem dos acumuladores)
    const totalGrossGenerated = data.totalGross || 0;
    const totalNetGenerated = data.totalNet || 0;
    
    // Debug dos valores
    if (data.totalGross > 0 || data.totalNet > 0) {
      console.log(`💰 ${owner}: Gross=${totalGrossGenerated}, Net=${totalNetGenerated}, Won=${totalWon}`);
    }
    
    // Diagnóstico de Comportamento
    const avgActivitiesWin = totalWon > 0 ? (data.won.reduce((s, w) => s + w.activities, 0) / totalWon).toFixed(1) : 0;
    const avgActivitiesLoss = totalLost > 0 ? (data.lost.reduce((s, l) => s + l.activities, 0) / totalLost).toFixed(1) : 0;
    
    // Causa principal de perda (mais frequente)
    const lossReasons = {};
    data.lost.forEach(l => {
      lossReasons[l.cause] = (lossReasons[l.cause] || 0) + 1;
    });
    const topLossCause = Object.keys(lossReasons).sort((a,b) => lossReasons[b] - lossReasons[a])[0] || 'N/A';
    
    // Fator principal de sucesso (mais frequente)
    const winFactors = {};
    data.won.forEach(w => {
      winFactors[w.factor] = (winFactors[w.factor] || 0) + 1;
    });
    const topWinFactor = Object.keys(winFactors).sort((a,b) => winFactors[b] - winFactors[a])[0] || 'N/A';
    
    // REMOVIDO: Arrays de word clouds por vendedor (economiza ~70% do payload)
    // Os word clouds globais já contêm todos os dados necessários
    
    // Verifica se o vendedor está na lista de ativos (compara normalizado)
    const isActive = ACTIVE_SELLERS.map(s => normText_(s)).includes(owner);
    
    return {
      name: owner,
      isActive: isActive,
      // Performance (total histórico)
      winRate,
      totalWon,
      totalLost,
      avgWinCycle,
      avgLossCycle,
      avgGross,
      revenue: data.revenue,  // Net filtrado pelo quarter atual
      revenueGross: data.revenueGross || 0,  // Gross filtrado pelo quarter atual
      totalGrossGenerated,
      totalNetGenerated,
      // Performance (quarter atual)
      totalWonQuarter,
      totalLostQuarter,
      // Comportamento
      avgActivitiesWin,
      avgActivitiesLoss,
      topLossCause,
      topWinFactor
      // REMOVIDO: Arrays de word clouds (economiza payload, dados já em wordClouds global)
    };
  }).sort((a,b) => b.revenue - a.revenue);

  // Separa vendedores ativos e inativos
  const activeReps = fsrScorecard.filter(r => r.isActive);
  const inactiveReps = fsrScorecard.filter(r => !r.isActive);
  
  // Debug: Log vendedores ativos
  console.log(`📊 FSR Debug: ${activeReps.length} ativos, ${inactiveReps.length} inativos de ${fsrScorecard.length} total`);
  console.log('Ativos:', activeReps.map(r => r.name).join(', '));
  console.log('Inativos:', inactiveReps.map(r => r.name).join(', '));

  // 6. Prepara Pautas Semanais Inteligentes (Top 3-5 deals críticos por Quarter)
  const weeklyTopics = {};
  
  // Agrupa por quarter - USA FISCAL Q DA ANÁLISE ou calcula da Data Prevista/Close Date
  openAgg.forEach(item => {
    let fiscal;
    
    // PRIORIDADE: Usa Fiscal Q já calculado na análise (FY26-Q1, FY26-Q2, etc.)
    if (item.fiscalQ && item.fiscalQ.trim()) {
      fiscal = { label: item.fiscalQ.trim() };
    } else {
      // FALLBACK: Calcula da data de fechamento (deve usar Data Prevista se tiver)
      fiscal = calculateFiscalQuarter(item.closed);
    }
    
    const key = fiscal.label || "Indefinido";
    if (!weeklyTopics[key]) weeklyTopics[key] = [];
    weeklyTopics[key].push(item);
  });
  
  // Para cada quarter, seleciona os deals mais críticos
  const agendaByQuarter = {};
  Object.keys(weeklyTopics).forEach(quarter => {
    const deals = weeklyTopics[quarter];
    
    // Critérios de criticidade (score composto)
    const scored = deals.map(d => {
      const daysTillClose = Math.ceil((new Date(d.closed) - today) / MS_PER_DAY);
      const confidence = parseFloat(d.probability) || 50;
      const value = d.gross;
      
      // Score: maior valor + menor confiança + proximity to close = mais crítico
      let criticalityScore = 0;
      
      if (value > 50000) criticalityScore += 30;
      else if (value > 20000) criticalityScore += 20;
      else if (value > 10000) criticalityScore += 10;
      
      if (confidence < 50) criticalityScore += 25;
      else if (confidence < 70) criticalityScore += 15;
      
      if (daysTillClose <= 14) criticalityScore += 30;
      else if (daysTillClose <= 30) criticalityScore += 20;
      
      const hasLowActivity = (d.inactiveDays || 0) > 30;
      if (hasLowActivity) criticalityScore += 15;
      
      return { ...d, criticalityScore, daysTillClose, confidence };
    });
    
    // Ordena por criticidade e pega top 5
    const top = scored
      .sort((a, b) => b.criticalityScore - a.criticalityScore)
      .slice(0, 5)
      .map(d => ({
        name: d.oppName,
        account: d.accName || 'N/A',
        accountName: d.accName || 'N/A',  // Duplicado para compatibilidade
        owner: d.owner,
        val: d.gross,
        confidence: d.confidence || 0,  // Agora vem do campo específico
        forecastCategory: d.forecastIA || d.forecast_sf || '',  // Forecast IA (commit/upside/pipeline)
        stage: d.stage,
        quarter: quarter, // ADICIONADO: Quarter da oportunidade
        fiscalQ: d.fiscalQ || quarter, // Campo Fiscal Q para filtro
        closeDate: d.closed, // Data de fechamento
        daysToClose: d.daysTillClose,
        idleDays: d.idleDays || 0,  // Dias sem atividade
        meddicScore: d.meddicScore || 0,
        bantScore: d.bantScore || 0,
        engagementQuality: d.engagementQuality || '',
        activityMix: d.activityMix || '',
        activities7d: d.aiActivities7d || 0,
        activities30d: d.aiActivities30d || 0,
        pipelineAnalysis: (d.aiInsight || '').substring(0, 150),  // LIMITADO: 150 chars
        flags: (d.riskFlags || '').substring(0, 80),  // LIMITADO: 80 chars
        // Usa campo específico de perguntas de auditoria (LIMITADO)
        auditQuestions: (d.auditQuestions || 
          ((d.aiInsight || '').includes('❓') 
            ? (d.aiInsight.match(/❓[^\n]{1,100}/g) || []).slice(0, 2).join(' ') 
            : `Foco: ${d.nextActivityDate ? 'Próx atividade ' + formatDateRobust(d.nextActivityDate) : '⚠️ Sem atividade agendada'}`)).substring(0, 150),
        nextActivity: d.nextActivityDate ? formatDateRobust(d.nextActivityDate) : null
      }));
    
    agendaByQuarter[quarter] = top;
  });
  
  const weeklyAgenda = agendaByQuarter;

  // 7. Consolida Insights para IA (Top Fatores e Causas) - APENAS VENDEDORES ATIVOS
  const allWinFactors = {};
  const allLossCauses = {};
  
  activeReps.forEach(rep => {
    // Conta fatores de sucesso
    if (rep.topWinFactor && rep.topWinFactor !== 'N/A') {
      allWinFactors[rep.topWinFactor] = (allWinFactors[rep.topWinFactor] || 0) + 1;
    }
    // Conta causas de perda
    if (rep.topLossCause && rep.topLossCause !== 'N/A') {
      allLossCauses[rep.topLossCause] = (allLossCauses[rep.topLossCause] || 0) + 1;
    }
  });
  
  const topWinFactors = Object.keys(allWinFactors)
    .map(f => ({ factor: f, count: allWinFactors[f] }))
    .sort((a, b) => b.count - a.count);
  
  const topLossCauses = Object.keys(allLossCauses)
    .map(c => ({ cause: c, count: allLossCauses[c] }))
    .sort((a, b) => b.count - a.count);
  
  // Debug de win factors e loss causes
  console.log(`📊 Win Factors processados: ${topWinFactors.length}`);
  if (topWinFactors.length > 0) {
    console.log(`   Top 3: ${topWinFactors.slice(0, 3).map(f => `${f.factor} (${f.count}x)`).join(', ')}`);
  } else {
    console.log(`   ⚠️ NENHUM win factor encontrado!`);
    console.log(`   Vendedores ativos com topWinFactor:`, activeReps.filter(r => r.topWinFactor && r.topWinFactor !== 'N/A').map(r => `${r.name}: ${r.topWinFactor}`));
  }
  console.log(`📊 Loss Causes processadas: ${topLossCauses.length}`);
  if (topLossCauses.length > 0) {
    console.log(`   Top 3: ${topLossCauses.slice(0, 3).map(c => `${c.cause} (${c.count}x)`).join(', ')}`);
  } else {
    console.log(`   ⚠️ NENHUMA loss cause encontrada!`);
    console.log(`   Vendedores ativos com topLossCause:`, activeReps.filter(r => r.topLossCause && r.topLossCause !== 'N/A').map(r => `${r.name}: ${r.topLossCause}`));
  }
  
  // Métricas agregadas FSR - APENAS VENDEDORES ATIVOS
  // Calcula ciclo médio diretamente dos deals (não da média dos vendedores)
  const allWinCyclesActive = [];
  const allLossCyclesActive = [];
  
  activeReps.forEach(rep => {
    const owner = normText_(rep.name);
    if (fsrMap[owner]) {
      // Coleta todos os ciclos de ganhos > 0
      fsrMap[owner].won.forEach(w => {
        if (w.cycle > 0) allWinCyclesActive.push(w.cycle);
      });
      // Coleta todos os ciclos de perdas > 0
      fsrMap[owner].lost.forEach(l => {
        if (l.cycle > 0) allLossCyclesActive.push(l.cycle);
      });
    }
  });
  
  const fsrMetrics = {
    totalActiveReps: activeReps.length,
    totalInactiveReps: inactiveReps.length,
    avgWinRate: activeReps.length > 0 ? Math.round(activeReps.reduce((s, r) => s + r.winRate, 0) / activeReps.length) : 0,
    avgWinCycle: allWinCyclesActive.length > 0 ? Math.round(allWinCyclesActive.reduce((s, c) => s + c, 0) / allWinCyclesActive.length) : 0,
    avgLossCycle: allLossCyclesActive.length > 0 ? Math.round(allLossCyclesActive.reduce((s, c) => s + c, 0) / allLossCyclesActive.length) : 0,
    avgActivitiesWin: activeReps.length > 0 ? (activeReps.reduce((s, r) => s + parseFloat(r.avgActivitiesWin), 0) / activeReps.length).toFixed(1) : 0,
    avgActivitiesLoss: activeReps.length > 0 ? (activeReps.reduce((s, r) => s + parseFloat(r.avgActivitiesLoss), 0) / activeReps.length).toFixed(1) : 0
  };
  
  // Debug dos ciclos médios calculados
  console.log(`📊 Ciclo Médio (Ganhos): ${fsrMetrics.avgWinCycle}d (base: ${allWinCyclesActive.length} ganhos com ciclo > 0)`);
  console.log(`📊 Ciclo Médio (Perdas): ${fsrMetrics.avgLossCycle}d (base: ${allLossCyclesActive.length} perdas com ciclo > 0)`);
  if (allWinCyclesActive.length > 0) {
    console.log(`   Amostra ganhos: ${allWinCyclesActive.slice(0, 5).join(', ')}...`);
  }
  if (allLossCyclesActive.length > 0) {
    console.log(`   Amostra perdas: ${allLossCyclesActive.slice(0, 5).join(', ')}...`);
  }
  
  // =====================================================================
  // CÁLCULO DO IPV (ÍNDICE DE PERFORMANCE DO VENDEDOR)
  // Score de 0-100 baseado em 3 pilares ponderados
  // =====================================================================
  
  // Helper para normalizar valores (0-100)
  const normalize = (value, min, max, inverted = false) => {
    if (max === min) return 50; // Todos iguais = média
    const norm = ((value - min) / (max - min)) * 100;
    return inverted ? 100 - norm : norm; // Inverter para métricas "menor é melhor"
  };
  
  // Extrai valores para normalização
  const winRates = activeReps.map(r => r.winRate || 0);
  const grossValues = activeReps.map(r => r.totalGrossGenerated || 0);
  const winCycles = activeReps.map(r => r.avgWinCycle || 999);
  const lossCycles = activeReps.map(r => r.avgLossCycle || 999);
  const activitiesWin = activeReps.map(r => parseFloat(r.avgActivitiesWin) || 0);
  
  const minWinRate = Math.min(...winRates);
  const maxWinRate = Math.max(...winRates);
  const minGross = Math.min(...grossValues);
  const maxGross = Math.max(...grossValues);
  const winCyclesValid = winCycles.filter(c => c > 0 && c < 999);
  const lossCyclesValid = lossCycles.filter(c => c > 0 && c < 999);
  const minWinCycle = winCyclesValid.length > 0 ? Math.min(...winCyclesValid) : 0;
  const maxWinCycle = winCyclesValid.length > 0 ? Math.max(...winCyclesValid) : 0;
  const minLossCycle = lossCyclesValid.length > 0 ? Math.min(...lossCyclesValid) : 0;
  const maxLossCycle = lossCyclesValid.length > 0 ? Math.max(...lossCyclesValid) : 0;
  const activitiesValid = activitiesWin.filter(a => a > 0);
  const minActivities = activitiesValid.length > 0 ? Math.min(...activitiesValid) : 0;
  const maxActivities = activitiesValid.length > 0 ? Math.max(...activitiesValid) : 0;
  
  // Calcula IPV para cada vendedor
  activeReps.forEach(rep => {
    // PILAR 1: RESULTADO (40%)
    const scoreWinRate = normalize(rep.winRate || 0, minWinRate, maxWinRate);
    const scoreGross = normalize(rep.totalGrossGenerated || 0, minGross, maxGross);
    const resultScore = (scoreWinRate * 0.6 + scoreGross * 0.4) * 0.40; // 40% do total
    
    // PILAR 2: EFICIÊNCIA (35%)
    let efficiencyScore = 0;
    if (minWinCycle > 0 && maxWinCycle > 0) {
      const scoreWinCycle = normalize(rep.avgWinCycle || 999, minWinCycle, maxWinCycle, true); // Invertido
      const scoreLossCycle = normalize(rep.avgLossCycle || 999, minLossCycle, maxLossCycle, true); // Invertido
      efficiencyScore = (scoreWinCycle * 0.6 + scoreLossCycle * 0.4) * 0.35; // 35% do total
    }
    
    // PILAR 3: COMPORTAMENTO (25%)
    let behaviorScore = 0;
    if (activitiesValid.length > 0) {
      // Atividades: nem muito baixo, nem muito alto (ideal = média da equipe)
      const avgTeamActivities = activitiesWin.reduce((a, b) => a + b, 0) / activitiesWin.length;
      const repActivities = parseFloat(rep.avgActivitiesWin) || avgTeamActivities;
      const activityDeviation = Math.abs(repActivities - avgTeamActivities);
      const scoreActivities = Math.max(0, 100 - (activityDeviation / avgTeamActivities) * 100);
      
      // Penaliza causas de perda ruins (Abandono, Sem Budget, etc.)
      const badCauses = ['ABANDONO', 'SEM BUDGET', 'FALTA DE FOLLOW-UP', 'N/A'];
      const hasBadCause = badCauses.some(bc => (rep.topLossCause || '').toUpperCase().includes(bc));
      const scoreBehavior = hasBadCause ? scoreActivities * 0.7 : scoreActivities;
      behaviorScore = scoreBehavior * 0.25; // 25% do total
    }
    
    // IPV FINAL (0-100) - Proteção contra NaN
    const ipvRaw = resultScore + efficiencyScore + behaviorScore;
    rep.ipv = isNaN(ipvRaw) || !isFinite(ipvRaw) ? 0 : Math.round(ipvRaw);
    rep.ipvBreakdown = {
      result: isNaN(resultScore) || !isFinite(resultScore) ? 0 : Math.round(resultScore / 0.40),
      efficiency: isNaN(efficiencyScore) || !isFinite(efficiencyScore) ? 0 : Math.round(efficiencyScore / 0.35),
      behavior: isNaN(behaviorScore) || !isFinite(behaviorScore) ? 0 : Math.round(behaviorScore / 0.25)
    };
  });
  
  // Ordena por IPV
  activeReps.sort((a, b) => b.ipv - a.ipv);
  
  console.log(`📊 IPV Calculado para ${activeReps.length} vendedores ativos`);
  console.log(`   Top 3: ${activeReps.slice(0, 3).map(r => `${r.name} (${r.ipv})`).join(', ')}`);

  
  // 8. Gera Análise IA com Cache Inteligente (economiza quota)
  const metricsForAI = {
    l10: {
      netRevenue: l10.netRevenue,
      bookingsCount: l10.bookingsCount,
      agingPipeline: l10.agingPipeline,
      pipelineQuarter: l10.pipelineQuarter,
      pipelineNextWeek: l10.pipelineNextWeek
    },
    fsr: fsrMetrics,
    insights: {
      topWinFactors,
      topLossCauses
    },
    // FILTRO POR QUARTER ATUAL: Top 5 oportunidades apenas do quarter corrente
    topOpportunities: (weeklyAgenda[currentQuarterLabel] || []).slice(0, 5)
  };
  
  // Chama IA apenas se houver mudanças significativas
  const aiAnalysis = getAIAnalysisWithCache_(metricsForAI);

  // EXTRAÇÃO DE DADOS PARA WORD CLOUDS - OTIMIZADO COM PROCESSAMENTO INCREMENTAL
  // Ao invés de acumular arrays gigantes e processar no final,
  // processamos em lotes e já calculamos frequências incrementalmente
  
  // Helper para encontrar índice da coluna (case-insensitive e remove emojis)
  const findColIndex = (headers, searchTerm) => {
    const normalized = searchTerm.toLowerCase().replace(/[^\w\s]/g, ''); // Remove emojis/símbolos
    return headers.findIndex(h => {
      const hNormalized = (h || '').toLowerCase().replace(/[^\w\s]/g, '');
      return hNormalized.includes(normalized) || normalized.includes(hNormalized);
    });
  };
  
  // WINS: Extrai Tipo Resultado e Labels
  const winTypeIndex = findColIndex(wonRaw.headers, 'Tipo Resultado');
  const winLabelsIndex = findColIndex(wonRaw.headers, 'Labels'); // 🏷️ Labels
  
  console.log(`🔍 Wins - Tipo Resultado index: ${winTypeIndex}, Labels index: ${winLabelsIndex}`);
  
  // OTIMIZAÇÃO: Usa Map para contar frequências diretamente, evitando arrays gigantes
  const winTypesFreqMap = new Map();
  const winLabelsFreqMap = new Map();
  
  // Processa em lotes de 100 linhas por vez
  const BATCH_SIZE = 100;
  const wonRowsTotal = wonRaw.values.length;
  
  for (let i = 0; i < wonRowsTotal; i += BATCH_SIZE) {
    const batch = wonRaw.values.slice(i, Math.min(i + BATCH_SIZE, wonRowsTotal));
    
    batch.forEach(row => {
      // Tipo Resultado (single value)
      if (winTypeIndex >= 0 && row[winTypeIndex]) {
        const type = String(row[winTypeIndex]).trim().substring(0, 100); // Limita tamanho
        if (type && type !== 'N/A' && type.length > 0) {
          winTypesFreqMap.set(type, (winTypesFreqMap.get(type) || 0) + 1);
        }
      }
      
      // Labels (podem ser múltiplos, separados por vírgula)
      if (winLabelsIndex >= 0 && row[winLabelsIndex]) {
        const labelsRaw = String(row[winLabelsIndex]);
        const labels = labelsRaw.split(',').map(l => l.trim().substring(0, 100)).filter(l => l && l !== 'N/A');
        labels.forEach(label => {
          winLabelsFreqMap.set(label, (winLabelsFreqMap.get(label) || 0) + 1);
        });
      }
    });
  }
  
  console.log(`✅ Wins processados em ${Math.ceil(wonRowsTotal / BATCH_SIZE)} lotes: ${winTypesFreqMap.size} tipos únicos, ${winLabelsFreqMap.size} labels únicos`);
  
  // Debug: Verifica estrutura de wonAgg
  console.log(`📊 wonAgg: ${wonAgg.length} deals`);
  if (wonAgg.length > 0) {
    console.log(`   Amostra wonAgg[0]:`, {
      oppName: wonAgg[0].oppName,
      owner: wonAgg[0].owner,
      gross: wonAgg[0].gross,
      net: wonAgg[0].net,
      fiscalQ: wonAgg[0].fiscalQ
    });
  }
  
  // LOSSES: Extrai Tipo Resultado e Labels
  const lossTypeIndex = findColIndex(lostRaw.headers, 'Tipo Resultado');
  const lossLabelsIndex = findColIndex(lostRaw.headers, 'Labels'); // 🏷️ Labels
  
  console.log(`🔍 Losses - Tipo Resultado index: ${lossTypeIndex}, Labels index: ${lossLabelsIndex}`);
  
  const lossTypesFreqMap = new Map();
  const lossLabelsFreqMap = new Map();
  
  const lostRowsTotal = lostRaw.values.length;
  
  for (let i = 0; i < lostRowsTotal; i += BATCH_SIZE) {
    const batch = lostRaw.values.slice(i, Math.min(i + BATCH_SIZE, lostRowsTotal));
    
    batch.forEach(row => {
      // Tipo Resultado (single value)
      if (lossTypeIndex >= 0 && row[lossTypeIndex]) {
        const type = String(row[lossTypeIndex]).trim().substring(0, 100);
        if (type && type !== 'N/A' && type.length > 0) {
          lossTypesFreqMap.set(type, (lossTypesFreqMap.get(type) || 0) + 1);
        }
      }
      
      // Labels (podem ser múltiplos, separados por vírgula)
      if (lossLabelsIndex >= 0 && row[lossLabelsIndex]) {
        const labelsRaw = String(row[lossLabelsIndex]);
        const labels = labelsRaw.split(',').map(l => l.trim().substring(0, 100)).filter(l => l && l !== 'N/A');
        labels.forEach(label => {
          lossLabelsFreqMap.set(label, (lossLabelsFreqMap.get(label) || 0) + 1);
        });
      }
    });
  }
  
  console.log(`✅ Losses processados em ${Math.ceil(lostRowsTotal / BATCH_SIZE)} lotes: ${lossTypesFreqMap.size} tipos únicos, ${lossLabelsFreqMap.size} labels únicos`);

  // Debug: Verifica estrutura de lostAgg
  console.log(`📊 lostAgg: ${lostAgg.length} deals`);
  if (lostAgg.length > 0) {
    console.log(`   Amostra lostAgg[0]:`, {
      oppName: lostAgg[0].oppName,
      owner: lostAgg[0].owner,
      gross: lostAgg[0].gross,
      net: lostAgg[0].net,
      fiscalQ: lostAgg[0].fiscalQ
    });
  }

  // ============================================================================
  // CALCULA FREQUÊNCIAS DOS WORD CLOUDS (para aba de métricas)
  // ============================================================================
  
  // Como já calculamos as frequências durante a iteração usando Maps,
  // agora só precisamos converter para arrays e ordenar
  const winTypesFreq = Array.from(winTypesFreqMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50); // Top 50
  
  const winLabelsFreq = Array.from(winLabelsFreqMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  
  const lossTypesFreq = Array.from(lossTypesFreqMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  
  const lossLabelsFreq = Array.from(lossLabelsFreqMap.entries())
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  
  console.log(`📊 Word Clouds calculados (Top 50 cada):`);
  console.log(`   • Win Types: ${winTypesFreq.length} (total processado: ${wonRowsTotal})`);
  console.log(`   • Win Labels: ${winLabelsFreq.length}`);
  console.log(`   • Loss Types: ${lossTypesFreq.length} (total processado: ${lostRowsTotal})`);
  console.log(`   • Loss Labels: ${lossLabelsFreq.length}`);

  // PAYLOAD NÃO ENVIA WORD CLOUDS - serão lidos da aba pelo frontend
  // Remove arrays grandes do payload para evitar erros
  console.log(`📦 Payload SEM word clouds (serão lidos da aba)`);

  // FILTRO DE QUARTER: weeklyAgenda apenas FY26 (remove FY24, FY25, FY27+)
  const weeklyAgendaFiltered = {};
  Object.keys(weeklyAgenda).forEach(q => {
    if (q.startsWith('FY26-')) {
      weeklyAgendaFiltered[q] = weeklyAgenda[q];
    }
  });
  console.log(`📅 Weekly Agenda filtrada: ${Object.keys(weeklyAgendaFiltered).length} quarters (apenas FY26)`);

  // Monta payload final
  const payload = {
    l10,
    fsrScorecard,
    fsrMetrics,
    weeklyAgenda: weeklyAgendaFiltered, // Apenas FY26
    insights: {
      topWinFactors,
      topLossCauses
    },
    // WORD CLOUDS REMOVIDOS DO PAYLOAD (agora na aba Dashboard_Metrics)
    // AGREGADOS DE GANHAS E PERDIDAS (necessários para métricas de conversão)
    wonAgg,
    lostAgg,
    aiAnalysis,
    updatedAt: new Date().toISOString(),
    quarterLabel: currentQuarter.label
  };
  
  // Debug: Verifica payload final
  console.log(`📦 Payload montado:`, {
    'l10 keys': Object.keys(l10).length,
    'fsrScorecard': fsrScorecard.length + ' vendedores',
    'weeklyAgenda quarters': Object.keys(weeklyAgendaFiltered).length,
    'wonAgg': wonAgg.length + ' deals',
    'lostAgg': lostAgg.length + ' deals',
    'quarterLabel': currentQuarter.label
  });
  
  // Salva no cache preprocessado (TTL: 5 minutos)
  // Reutiliza a variável 'cache' já declarada no início da função
  try {
    const payloadStr = JSON.stringify(payload);
    const payloadSizeKB = (payloadStr.length / 1024).toFixed(2);
    const payloadSizeMB = (payloadStr.length / (1024 * 1024)).toFixed(2);
    
    console.log(`📦 Tamanho do payload: ${payloadSizeKB} KB (${payloadSizeMB} MB)`);
    console.log(`📊 Componentes do payload:`);
    console.log(`   • l10: ${(JSON.stringify(payload.l10).length / 1024).toFixed(1)} KB`);
    console.log(`   • fsrScorecard (${payload.fsrScorecard.length} vendedores): ${(JSON.stringify(payload.fsrScorecard).length / 1024).toFixed(1)} KB`);
    console.log(`   • weeklyAgenda (${Object.keys(payload.weeklyAgenda).length} quarters): ${(JSON.stringify(payload.weeklyAgenda).length / 1024).toFixed(1)} KB`);
    console.log(`   • aiAnalysis: ${(JSON.stringify(payload.aiAnalysis).length / 1024).toFixed(1)} KB`);
    
    // Google Apps Script cache limit é 100KB por item
    if (payloadStr.length > 100000) {
      console.warn(`⚠️ AVISO: Payload muito grande (${payloadSizeKB} KB), pode falhar ao salvar. Limite: 100 KB`);
      throw new Error(`Payload too large: ${payloadSizeKB} KB (limit: 100 KB)`);
    }
    
    cache.put(DASHBOARD_CACHE_KEY, payloadStr, 5 * 60); // 5 minutos
    console.log('💾 Payload salvo em cache preprocessado (TTL: 5min)');
  } catch(e) {
    console.warn('⚠️ Falha ao salvar cache preprocessado:', e.message);
    // Retorna payload mesmo sem cache - o HTML pode processar diretamente
  }
  
  // Salva também em aba de debug para análise
  console.log('💾 Salvando payload na aba de debug...');
  savePayloadToDebugSheet_(payload);
  console.log('✅ Payload salvo na aba de debug');
  
  // ============================================================================
  // CÁLCULO DE MÉTRICAS DE CONFIANÇA (antes de criar staticMetrics)
  // OTIMIZADO: Processamento em lotes para evitar estouro de memória
  // ============================================================================
  // CALCULA MÉTRICAS DE CONFIANÇA DE TODOS OS DEALS DA ABA
  // ============================================================================
  console.log('🔢 Calculando métricas de confiança de TODOS os deals...');
  let totalConfidence = 0;
  let totalDealsProcessed = 0;
  let above50Value = 0;
  let above50Net = 0;
  let above50Count = 0;
  
  // Itera sobre TODOS os deals em openAgg (não apenas weeklyAgenda)
  // openAgg contém TODOS os deals abertos da aba 🎯 Análise Forecast IA
  const DEALS_BATCH_SIZE = 100;
  
  for (let i = 0; i < openAgg.length; i += DEALS_BATCH_SIZE) {
    const batch = openAgg.slice(i, Math.min(i + DEALS_BATCH_SIZE, openAgg.length));
    
    batch.forEach(d => {
      // Pega confiança da coluna "Confiança (%)" - índice 20
      let conf = parseFloat(d.confidence) || 0;
      
      // Se confiança vem como número inteiro (ex: 50 ao invés de 0.5), divide por 100
      if (conf > 1) conf = conf / 100;
      
      const grossValue = parseFloat(d.gross) || 0;
      const netValue = parseFloat(d.net) || 0;
      
      totalConfidence += conf;
      totalDealsProcessed++;
      
      // Filtra deals >= 50% confiança
      if (conf >= 0.50) {
        above50Value += grossValue;
        above50Net += netValue;
        above50Count++;
      }
    });
    
    // Log a cada batch processado
    if ((i + DEALS_BATCH_SIZE) % 500 === 0 || i + DEALS_BATCH_SIZE >= openAgg.length) {
      console.log(`   Processados ${Math.min(i + DEALS_BATCH_SIZE, openAgg.length)}/${openAgg.length} deals`);
    }
  }
  
  console.log(`📊 Métricas de Confiança Calculadas (TODOS OS DEALS):`);
  console.log(`   • Total de deals processados: ${totalDealsProcessed}`);
  console.log(`   • Confiança média: ${totalDealsProcessed > 0 ? ((totalConfidence / totalDealsProcessed) * 100).toFixed(1) : 0}%`);
  console.log(`   • Deals >= 50% confiança: ${above50Count} (Gross: ${above50Value.toFixed(0)}, Net: ${above50Net.toFixed(0)})`);
  
  // ============================================================================
  // NOVA ARQUITETURA HÍBRIDA: Salva métricas estáticas em aba dedicada
  // ============================================================================
  const staticMetrics = {
    updatedAt: new Date().toISOString(),
    quarterLabel: currentQuarter.label,
    
    // Pipeline Total (Todos os Anos)
    allPipelineGross: l10.allPipelineGross || 0,
    allPipelineNet: l10.allPipelineNet || 0,
    allPipelineDeals: l10.allPipelineDeals || 0,
    
    // Pipeline FY26
    fy26PipelineGross: l10.pipelineTotalAnoGross || 0,
    fy26PipelineNet: l10.pipelineTotalAnoNet || 0,
    fy26PipelineDeals: l10.pipelineTotalAnoDeals || 0,
    
    // Sales Specialist
    salesSpecGross: l10.pipelineSalesSpecialistGross || 0,
    salesSpecNet: l10.pipelineSalesSpecialistNet || 0,
    salesSpecDeals: l10.pipelineSalesSpecialistDeals || 0,
    
    // Revenue do Quarter Atual
    revenueQuarter: l10.netRevenue || 0,
    revenueDealsCount: l10.bookingsCount || 0,
    
    // Vendedores
    activeRepsCount: activeReps.length,
    inactiveRepsCount: inactiveReps.length,
    avgWinRate: fsrMetrics.avgWinRate || 0,
    
    // Confiança Média
    avgConfidence: totalDealsProcessed > 0 
      ? ((totalConfidence / totalDealsProcessed) * 100).toFixed(1)
      : 0,
    
    // Deals com >= 50% confiança
    highConfGross: above50Value || 0,
    highConfNet: above50Net || 0,
    highConfDeals: above50Count || 0,
    
    // WORD CLOUDS COM FREQUÊNCIAS (calculados acima)
    wordClouds: {
      winTypes: winTypesFreq,
      winLabels: winLabelsFreq,
      lossTypes: lossTypesFreq,
      lossLabels: lossLabelsFreq
    }
  };
  
  // Salva métricas estáticas na aba (agora inclui word clouds)
  console.log('📝 Salvando métricas na aba Dashboard_Metrics...');
  console.log('   • Métricas:', Object.keys(staticMetrics));
  console.log('   • Word Clouds:', staticMetrics.wordClouds ? Object.keys(staticMetrics.wordClouds) : 'none');
  updateMetricsSheet_(staticMetrics);
  console.log('✅ Métricas salvas com sucesso!');
  
  // ============================================================================
  // ADICIONA ANÁLISE DA CLOUD FUNCTION AO PAYLOAD (se disponível)
  // ============================================================================
  if (cloudAnalysis) {
    console.log('☁️ Adicionando análise da Cloud Function ao payload...');
    payload.cloudAnalysis = {
      closedAnalysis: cloudAnalysis.closed_analysis,
      pipelineAnalysis: cloudAnalysis.pipeline_analysis,
      sellerScorecard: cloudAnalysis.seller_scorecard,
      warTargets: cloudAnalysis.war_targets,
      summary: cloudAnalysis.summary,
      processingTime: cloudAnalysis.processing_time_seconds
    };
    console.log('✅ Análise da Cloud Function incluída no payload');
  }
  
  return payload;
}

/**
 * Escreve métricas pré-calculadas na aba 📊 Dashboard_Metrics
 * Responsável por TODAS as métricas estáticas que não dependem de filtros
 * @param {Object} metrics - Objeto com todas as métricas estáticas
 */
function updateMetricsSheet_(metrics) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('📊 Dashboard_Metrics');
    
    // Cria aba se não existir
    if (!sheet) {
      sheet = ss.insertSheet('📊 Dashboard_Metrics');
      sheet.setFrozenRows(3);
      SpreadsheetApp.flush(); // Força a aplicação das mudanças
      console.log('✅ Aba 📊 Dashboard_Metrics criada');
    } else {
      console.log('ℹ️ Aba 📊 Dashboard_Metrics já existe, atualizando conteúdo');
    }
    
    // Limpa conteúdo anterior
    sheet.clear();
    
    // ESTRUTURA: Prepara dados em formato de matriz para batch write
    // Isso é muito mais eficiente que setValue() individual
    const maxRow = 28;
    const maxCol = 3;
    const dataMatrix = Array(maxRow).fill(null).map(() => Array(maxCol).fill(''));
    
    // Helper para adicionar valor na matriz (1-indexed)
    const setCell = (row, col, val) => {
      if (row > 0 && row <= maxRow && col > 0 && col <= maxCol) {
        dataMatrix[row - 1][col - 1] = val;
      }
    };
    
    // === METADATA (Linhas 1-2) ===
    setCell(1, 1, 'Última Atualização'); setCell(1, 2, metrics.updatedAt);
    setCell(2, 1, 'Quarter Atual'); setCell(2, 2, metrics.quarterLabel);
    
    // === SEÇÃO 1: PIPELINE GLOBAL (Linhas 5-15) ===
    setCell(5, 1, 'Pipeline Total (Todos Anos)');
    setCell(5, 2, metrics.allPipelineGross); setCell(5, 3, 'Gross');
    setCell(6, 2, metrics.allPipelineNet); setCell(6, 3, 'Net');
    setCell(7, 2, metrics.allPipelineDeals); setCell(7, 3, 'Deals');
    
    setCell(9, 1, 'Pipeline Total (FY26)');
    setCell(9, 2, metrics.fy26PipelineGross); setCell(9, 3, 'Gross');
    setCell(10, 2, metrics.fy26PipelineNet); setCell(10, 3, 'Net');
    setCell(11, 2, metrics.fy26PipelineDeals); setCell(11, 3, 'Deals');
    
    setCell(13, 1, 'Pipeline Sales Specialist');
    setCell(13, 2, metrics.salesSpecGross); setCell(13, 3, 'Gross');
    setCell(14, 2, metrics.salesSpecNet); setCell(14, 3, 'Net');
    setCell(15, 2, metrics.salesSpecDeals); setCell(15, 3, 'Deals');
    
    // === SEÇÃO 2: FECHADO (REVENUE) (Linhas 17-18) ===
    setCell(17, 1, 'Fechado no Quarter Atual');
    setCell(17, 2, metrics.revenueQuarter); setCell(17, 3, 'Net Revenue');
    setCell(18, 2, metrics.revenueDealsCount); setCell(18, 3, 'Deals');
    
    // === SEÇÃO 3: VENDEDORES (Linhas 20-22) ===
    setCell(20, 1, 'Vendedores Ativos');
    setCell(20, 2, metrics.activeRepsCount); setCell(20, 3, 'Total');
    setCell(21, 2, metrics.inactiveRepsCount); setCell(21, 3, 'Inativos');
    setCell(22, 2, metrics.avgWinRate); setCell(22, 3, 'Win Rate (%)');
    
    // === SEÇÃO 4: CONFIANÇA (Linhas 24-27) ===
    setCell(24, 1, 'Confiança Média Geral');
    setCell(24, 2, parseFloat(metrics.avgConfidence)); setCell(24, 3, '% (0-100)');
    
    setCell(26, 1, 'Deals >= 50% Confiança');
    setCell(26, 2, metrics.highConfGross); setCell(26, 3, 'Gross');
    setCell(27, 2, metrics.highConfNet); setCell(27, 3, 'Net');
    setCell(28, 2, metrics.highConfDeals); setCell(28, 3, 'Deals');
    
    // Escreve todos os dados de uma vez (BATCH WRITE - muito mais eficiente)
    sheet.getRange(1, 1, maxRow, maxCol).setValues(dataMatrix);
    
    // === FORMATAÇÃO ===
    // Metadata (Header)
    sheet.getRange('A1:C2').setFontWeight('bold').setBackground('#00BEFF').setFontColor('#FFFFFF');
    
    // Títulos das seções
    const sectionTitles = ['A5', 'A9', 'A13', 'A17', 'A20', 'A24', 'A26'];
    sectionTitles.forEach(cell => {
      sheet.getRange(cell).setFontWeight('bold').setBackground('#E8F4F8').setFontSize(11);
    });
    
    // Valores numéricos (formato com separador de milhares)
    const numericRanges = ['B5:B7', 'B9:B11', 'B13:B15', 'B17:B18', 'B26:B28'];
    numericRanges.forEach(range => {
      sheet.getRange(range).setNumberFormat('#,##0');
    });
    
    // Contadores (sem casas decimais)
    sheet.getRange('B20:B21').setNumberFormat('#,##0');
    
    // Percentuais
    sheet.getRange('B22').setNumberFormat('0"%"');
    sheet.getRange('B24').setNumberFormat('0.0"%"');
    
    // Largura das colunas
    sheet.setColumnWidth(1, 250); // Nome da métrica
    sheet.setColumnWidth(2, 120); // Valor
    sheet.setColumnWidth(3, 100); // Observação
    
    // Alinhamento
    sheet.getRange('B:B').setHorizontalAlignment('right');
    sheet.getRange('C:C').setHorizontalAlignment('center').setFontColor('#666666').setFontSize(9);
    
    // ============================================================================
    // SEÇÃO 5: WORD CLOUDS (Linhas 30+)
    // ============================================================================
    let currentRow = 30;
    
    // Helper para escrever word cloud na aba (otimizado para batch writing)
    const writeWordCloud = (startRow, title, data) => {
      let row = startRow;
      
      // Título da seção
      sheet.getRange(row, 1).setValue(title);
      sheet.getRange(row, 1).setFontWeight('bold').setBackground('#E8F4F8').setFontSize(11);
      row++;
      
      // Cabeçalhos
      sheet.getRange(row, 1, 1, 2).setValues([['Item', 'Count']]);
      sheet.getRange(row, 1, 1, 2).setFontWeight('bold').setBackground('#F5F5F5');
      row++;
      
      // Dados (limita a 30 itens por seção e trunca strings longas)
      const limitedData = data.slice(0, 30);
      if (limitedData.length > 0) {
        // Prepara array 2D para batch write (mais eficiente)
        const rows = limitedData.map(item => [
          String(item.text || '').substring(0, 200), // Limita a 200 caracteres
          item.count || 0
        ]);
        
        // Escreve todos os dados de uma vez
        sheet.getRange(row, 1, rows.length, 2).setValues(rows);
        row += rows.length;
      }
      
      return row + 1; // Retorna próxima linha disponível
    };
    
    // Escreve cada word cloud
    if (metrics.wordClouds) {
      const wc = metrics.wordClouds;
      
      if (wc.lossTypes && wc.lossTypes.length > 0) {
        currentRow = writeWordCloud(currentRow, 'Flags de Risco (Pipeline)', wc.lossTypes);
      }
      
      if (wc.winTypes && wc.winTypes.length > 0) {
        currentRow = writeWordCloud(currentRow, 'Perfil de Vitórias', wc.winTypes);
      }
      
      if (wc.lossLabels && wc.lossLabels.length > 0) {
        currentRow = writeWordCloud(currentRow, 'Padrões de Perda', wc.lossLabels);
      }
      
      if (wc.winLabels && wc.winLabels.length > 0) {
        currentRow = writeWordCloud(currentRow, 'Padrões de Sucesso', wc.winLabels);
      }
      
      // Log de word clouds
      console.log(`   • Word Clouds: ${wc.winTypes.length} win types, ${wc.winLabels.length} win labels, ${wc.lossTypes.length} loss types, ${wc.lossLabels.length} loss labels`);
    }
    
    // Força a aplicação de todas as mudanças
    SpreadsheetApp.flush();
    
    console.log('✅ Aba 📊 Dashboard_Metrics atualizada com sucesso');
    console.log(`   • Pipeline Total: $${metrics.allPipelineGross.toLocaleString()}`);
    console.log(`   • Vendedores Ativos: ${metrics.activeRepsCount}`);
    console.log(`   • Confiança Média: ${metrics.avgConfidence}%`);
    
  } catch (e) {
    console.error('❌ Erro ao atualizar aba Dashboard_Metrics:', e.message);
    console.error('Stack trace:', e.stack);
    throw new Error('Falha ao criar aba Dashboard_Metrics: ' + e.message);
  }
}

/**
 * Lê métricas da aba 📊 Dashboard_Metrics
 * Usado pelo frontend para carregar KPIs estáticos rapidamente
 * @returns {Object} Métricas estáticas pré-calculadas
 */
function getMetricsFromSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('📊 Dashboard_Metrics');
    
    if (!sheet) {
      console.error('❌ Aba 📊 Dashboard_Metrics não encontrada');
      return null;
    }
    
    // Lê valores da estrutura fixa (otimizado para performance)
    const metrics = {
      // Metadata
      updatedAt: sheet.getRange(1, 2).getValue(),
      quarterLabel: sheet.getRange(2, 2).getValue(),
      
      // Pipeline Total (Todos Anos)
      allPipelineGross: sheet.getRange(5, 2).getValue() || 0,
      allPipelineNet: sheet.getRange(6, 2).getValue() || 0,
      allPipelineDeals: sheet.getRange(7, 2).getValue() || 0,
      
      // Pipeline FY26
      fy26PipelineGross: sheet.getRange(9, 2).getValue() || 0,
      fy26PipelineNet: sheet.getRange(10, 2).getValue() || 0,
      fy26PipelineDeals: sheet.getRange(11, 2).getValue() || 0,
      
      // Sales Specialist
      salesSpecGross: sheet.getRange(13, 2).getValue() || 0,
      salesSpecNet: sheet.getRange(14, 2).getValue() || 0,
      salesSpecDeals: sheet.getRange(15, 2).getValue() || 0,
      
      // Revenue
      revenueQuarter: sheet.getRange(17, 2).getValue() || 0,
      revenueDealsCount: sheet.getRange(18, 2).getValue() || 0,
      
      // Vendedores
      activeRepsCount: sheet.getRange(20, 2).getValue() || 0,
      inactiveRepsCount: sheet.getRange(21, 2).getValue() || 0,
      avgWinRate: sheet.getRange(22, 2).getValue() || 0,
      
      // Confiança
      avgConfidence: sheet.getRange(24, 2).getValue() || 0,
      
      // High Confidence Deals
      highConfGross: sheet.getRange(26, 2).getValue() || 0,
      highConfNet: sheet.getRange(27, 2).getValue() || 0,
      highConfDeals: sheet.getRange(28, 2).getValue() || 0
    };
    
    // ============================================================================
    // LÊ WORD CLOUDS DA ABA (Linhas 30+)
    // ============================================================================
    const readWordCloud = (startRow) => {
      const data = [];
      let row = startRow + 2; // Pula título e cabeçalho
      
      // Lê até encontrar linha vazia ou outra seção
      while (row <= sheet.getLastRow()) {
        const text = sheet.getRange(row, 1).getValue();
        const count = sheet.getRange(row, 2).getValue();
        
        // Para se encontrar linha vazia ou novo título
        if (!text || typeof text !== 'string' || text.trim() === '') break;
        
        // Para se a célula tem formatação de título (bold + background)
        const isBold = sheet.getRange(row, 1).getFontWeight() === 'bold';
        const hasBackground = sheet.getRange(row, 1).getBackground() === '#e8f4f8';
        if (isBold && hasBackground) break;
        
        if (count && !isNaN(count)) {
          data.push({ text: String(text), count: Number(count) });
        }
        
        row++;
      }
      
      return data;
    };
    
    // Procura as seções de word clouds
    const wordClouds = {
      lossTypes: [],
      winTypes: [],
      lossLabels: [],
      winLabels: []
    };
    
    // Mapeia títulos para campos
    const titleMap = {
      'Flags de Risco (Pipeline)': 'lossTypes',
      'Perfil de Vitórias': 'winTypes',
      'Padrões de Perda': 'lossLabels',
      'Padrões de Sucesso': 'winLabels'
    };
    
    // Busca cada seção (começa da linha 30)
    for (let row = 30; row <= sheet.getLastRow(); row++) {
      const cellValue = sheet.getRange(row, 1).getValue();
      const title = String(cellValue);
      
      if (titleMap[title]) {
        wordClouds[titleMap[title]] = readWordCloud(row);
      }
    }
    
    metrics.wordClouds = wordClouds;
    
    console.log('✅ Métricas lidas da aba 📊 Dashboard_Metrics');
    
    // Log de word clouds
    const wc = wordClouds;
    console.log(`   • Word Clouds: ${wc.lossTypes.length} flags risco, ${wc.winTypes.length} perfil vitórias, ${wc.lossLabels.length} padrões perda, ${wc.winLabels.length} padrões sucesso`);
    
    return metrics;
    
  } catch (e) {
    console.error('❌ Erro ao ler métricas:', e.message);
    return null;
  }
}

/**
 * Salva payload em aba "Payload_Debug" do sheet para análise completa
 */
function savePayloadToDebugSheet_(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let debugSheet = ss.getSheetByName('Payload_Debug');
    
    // Cria aba se não existir
    if (!debugSheet) {
      debugSheet = ss.insertSheet('Payload_Debug');
      debugSheet.setFrozenRows(1);
    } else {
      debugSheet.clearContents();
    }
    
    const payloadStr = JSON.stringify(payload);
    const payloadSizeKB = (payloadStr.length / 1024).toFixed(2);
    
    // Cabeçalhos
    const headers = ['METRICA', 'VALOR'];
    debugSheet.getRange(1, 1, 1, 2).setValues([headers]);
    
    let row = 2;
    
    // 📊 RESUMO GERAL
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 RESUMO GERAL', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Tamanho Total do Payload', `${payloadSizeKB} KB`]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Timestamp', payload.updatedAt || 'N/A']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Quarter Atual', payload.quarterLabel || 'N/A']]);
    
    // 📦 COMPONENTES (TAMANHO)
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 TAMANHO DOS COMPONENTES', '']]);
    
    const components = {
      'l10': payload.l10 || {},
      'fsrScorecard': payload.fsrScorecard || [],
      'fsrMetrics': payload.fsrMetrics || {},
      'weeklyAgenda': payload.weeklyAgenda || {},
      'insights': payload.insights || {},
      'wordClouds': payload.wordClouds || {},
      'aiAnalysis': payload.aiAnalysis || {}
    };
    
    for (const [key, value] of Object.entries(components)) {
      const sizeKB = (JSON.stringify(value).length / 1024).toFixed(1);
      debugSheet.getRange(row++, 1, 1, 2).setValues([[`   • ${key}`, `${sizeKB} KB`]]);
    }
    
    // 📊 CONTAGEM DE DADOS
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 CONTAGEM DE DADOS', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Vendedores no Scorecard', payload.fsrScorecard?.length || 0]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Quarters na Agenda', Object.keys(payload.weeklyAgenda || {}).length]]);
    
    // Deals por quarter
    let totalDeals = 0;
    Object.entries(payload.weeklyAgenda || {}).forEach(([quarter, deals]) => {
      const count = Array.isArray(deals) ? deals.length : 0;
      totalDeals += count;
      debugSheet.getRange(row++, 1, 1, 2).setValues([[`   • Deals em ${quarter}`, count]]);
    });
    debugSheet.getRange(row++, 1, 1, 2).setValues([['   Total de Deals', totalDeals]]);
    
    // Word Clouds
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 WORD CLOUDS', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Win Types (únicos)', payload.wordClouds?.winTypes?.length || 0]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Win Labels (únicos)', payload.wordClouds?.winLabels?.length || 0]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Loss Types (únicos)', payload.wordClouds?.lossTypes?.length || 0]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Loss Labels (únicos)', payload.wordClouds?.lossLabels?.length || 0]]);
    
    // Insights
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 INSIGHTS', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Top Win Factors', payload.insights?.topWinFactors?.length || 0]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Top Loss Causes', payload.insights?.topLossCauses?.length || 0]]);
    
    // L10 Metrics
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 L10 METRICS', '']]);
    const l10 = payload.l10 || {};
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Net Revenue (Incremental)', formatMoney_(l10.netRevenue || 0)]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Pipeline Quarter Gross', formatMoney_(l10.pipelineQuarter || 0)]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Pipeline Total Ano Gross', formatMoney_(l10.pipelineTotalAnoGross || 0)]]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Deals Count', l10.dealsCount || 0]]);
    
    // FSR Metrics
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 FSR METRICS (TOP SELLERS)', '']]);
    const fsrMetrics = payload.fsrMetrics || {};
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Win Rate Médio', (fsrMetrics.avgWinRate || 0).toFixed(1) + '%']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Ciclo Médio Ganhos', fsrMetrics.avgWinCycle + ' dias']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Ciclo Médio Perdas', fsrMetrics.avgLossCycle + ' dias']]);
    
    // AI Analysis Preview
    debugSheet.getRange(row++, 1, 1, 2).setValues([['', '']]);
    debugSheet.getRange(row++, 1, 1, 2).setValues([['🔹 AI ANALYSIS PREVIEW', '']]);
    const aiAnalysis = payload.aiAnalysis || {};
    const execPreview = (aiAnalysis.executive || '').substring(0, 100) + '...';
    debugSheet.getRange(row++, 1, 1, 2).setValues([['Executive (primeiras 100 chars)', execPreview]]);
    
    // Formatação
    debugSheet.getRange(1, 1, row - 1, 2).setHorizontalAlignment('left');
    debugSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1f2937');
    debugSheet.getRange(1, 1, 1, 2).setFontColor('white');
    
    // Auto-fit columns
    debugSheet.autoResizeColumns(1, 2);
    
    console.log(`✅ Payload salvo na aba 'Payload_Debug' para análise`);
    return true;
    
  } catch(e) {
    console.error(`❌ Erro ao salvar payload em debug sheet: ${e.message}`);
    return false;
  }
}

/**
 * Função auxiliar para formatar números em moeda
 */
function formatMoney_(value) {
  return '$' + (value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Salva payload em aba alternativa com data detalhada (extenso)
 * Chama quando precisa de análise mais profunda
 */
function savePayloadDetailedAnalysis(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let detailSheet = ss.getSheetByName('Payload_Detailed');
    
    if (!detailSheet) {
      detailSheet = ss.insertSheet('Payload_Detailed');
      detailSheet.setFrozenRows(1);
    } else {
      detailSheet.clearContents();
    }
    
    const payloadStr = JSON.stringify(payload);
    const now = new Date().toLocaleString('pt-BR');
    
    const headers = ['Timestamp', 'Categoria', 'Campo', 'Tipo', 'Tamanho_KB', 'Quantidade', 'Exemplo'];
    detailSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    let row = 2;
    
    // L10 - Metrics
    const l10 = payload.l10 || {};
    const l10Fields = ['netRevenue', 'pipelineQuarter', 'pipelineTotalAnoGross', 'dealsCount'];
    l10Fields.forEach(field => {
      const value = l10[field];
      const size = (JSON.stringify(value).length / 1024).toFixed(2);
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'L10', field, typeof value, size, 1, String(value).substring(0, 30)]]);
    });
    
    // Word Clouds - Win Types
    const winTypes = payload.wordClouds?.winTypes || [];
    if (winTypes.length > 0) {
      const size = (JSON.stringify(winTypes).length / 1024).toFixed(2);
      const examples = winTypes.slice(0, 3).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'WordCloud', 'winTypes', 'array', size, winTypes.length, examples]]);
    }
    
    // Word Clouds - Win Labels
    const winLabels = payload.wordClouds?.winLabels || [];
    if (winLabels.length > 0) {
      const size = (JSON.stringify(winLabels).length / 1024).toFixed(2);
      const examples = winLabels.slice(0, 3).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'WordCloud', 'winLabels', 'array', size, winLabels.length, examples]]);
    }
    
    // Word Clouds - Loss Types
    const lossTypes = payload.wordClouds?.lossTypes || [];
    if (lossTypes.length > 0) {
      const size = (JSON.stringify(lossTypes).length / 1024).toFixed(2);
      const examples = lossTypes.slice(0, 3).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'WordCloud', 'lossTypes', 'array', size, lossTypes.length, examples]]);
    }
    
    // FSR Scorecard
    const scorecard = payload.fsrScorecard || [];
    if (scorecard.length > 0) {
      const size = (JSON.stringify(scorecard).length / 1024).toFixed(2);
      const vendors = scorecard.map(v => v.name).slice(0, 3).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'FSRScorecard', 'vendedores', 'array', size, scorecard.length, vendors]]);
    }
    
    // Weekly Agenda
    const agenda = payload.weeklyAgenda || {};
    Object.entries(agenda).forEach(([quarter, deals]) => {
      const dealCount = Array.isArray(deals) ? deals.length : 0;
      const size = (JSON.stringify(deals).length / 1024).toFixed(2);
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'WeeklyAgenda', quarter, 'array', size, dealCount, 'Deals']]);
    });
    
    // Insights
    const insights = payload.insights || {};
    const topWins = insights.topWinFactors || [];
    const topLoss = insights.topLossCauses || [];
    
    if (topWins.length > 0) {
      const size = (JSON.stringify(topWins).length / 1024).toFixed(2);
      const examples = topWins.slice(0, 2).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'Insights', 'topWinFactors', 'array', size, topWins.length, examples]]);
    }
    
    if (topLoss.length > 0) {
      const size = (JSON.stringify(topLoss).length / 1024).toFixed(2);
      const examples = topLoss.slice(0, 2).join(', ');
      detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'Insights', 'topLossCauses', 'array', size, topLoss.length, examples]]);
    }
    
    // AI Analysis
    const aiAnalysis = payload.aiAnalysis || {};
    ['executive', 'opportunities', 'risks'].forEach(key => {
      const value = aiAnalysis[key];
      if (value && String(value).length > 0) {
        const size = (JSON.stringify(value).length / 1024).toFixed(2);
        const wordCount = String(value).split(' ').length;
        const sample = String(value).substring(0, 50);
        detailSheet.getRange(row++, 1, 1, headers.length).setValues([[now, 'AIAnalysis', key, 'string', size, wordCount, sample]]);
      }
    });
    
    // Formatação
    const titleRange = detailSheet.getRange(1, 1, 1, headers.length);
    titleRange.setFontWeight('bold').setBackground('#1f2937').setFontColor('white');
    
    detailSheet.autoResizeColumns(1, headers.length);
    
    console.log(`✅ Análise detalhada do payload salva em 'Payload_Detailed'`);
    return true;
    
  } catch(e) {
    console.error(`❌ Erro ao salvar análise detalhada: ${e.message}`);
    return false;
  }
}
function shouldRegenerateAIAnalysis_(currentMetrics, previousMetrics) {
  if (!previousMetrics) return true;
  
  // Compara métricas chave
  const changes = [
    Math.abs(currentMetrics.revenue - previousMetrics.revenue) / (previousMetrics.revenue || 1),
    Math.abs(currentMetrics.deals - previousMetrics.deals) / (previousMetrics.deals || 1),
    Math.abs(currentMetrics.aging - previousMetrics.aging) / (previousMetrics.aging || 1)
  ];
  
  // Se qualquer mudança for maior que threshold, regenera
  return changes.some(change => change > CHANGE_THRESHOLD);
}

/**
 * Gera análise IA com cache inteligente (economiza quota)
 */
function getAIAnalysisWithCache_(metrics, forceRegenerate = false) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(AI_ANALYSIS_CACHE_KEY);
  
  if (cached && !forceRegenerate) {
    const cachedData = JSON.parse(cached);
    
    // Verifica se precisa regenerar baseado em mudanças
    if (!shouldRegenerateAIAnalysis_(metrics, cachedData.metrics)) {
      console.log('♻️ Usando análise IA em cache (sem mudanças significativas)');
      return cachedData.analysis;
    }
  }
  
  // Gera nova análise
  console.log('🤖 Gerando nova análise IA');
  const analysis = generateFullAIAnalysis_(metrics);
  
  // Salva no cache
  cache.put(AI_ANALYSIS_CACHE_KEY, JSON.stringify({
    metrics: metrics,
    analysis: analysis,
    timestamp: new Date().toISOString()
  }), AI_CACHE_TTL);
  
  return analysis;
}

/**
 * Gera análise IA completa (Executivo + Aprendizados + CRO Commentary + Top Oportunidades)
 */
function generateFullAIAnalysis_(metrics) {
  const { l10, fsr, insights, topOpportunities } = metrics;
  
  // 1. Visão Executiva (Overview Geral)
  let executive = "<b>Visão executiva indisponível.</b>";
  try {
    const rawExecutive = callGeminiAPI(`
      INSTRUÇÕES CRÍTICAS:
      - Você DEVE retornar APENAS texto HTML puro
      - NÃO retorne código JSON
      - NÃO use estruturas como { "campo": "valor" }
      - NÃO comece com chaves { ou termine com }
      - Se você retornar JSON, sua resposta será REJEITADA
      
      Você é o CEO da Xertica. Analise este resumo GTM:
      
      📊 DADOS L10 (Base: última semana de negócios):
      - Revenue incremental: $${Math.round(l10.netRevenue).toLocaleString()}
      - Bookings fechados: ${l10.bookingsCount} deals
      - Pipeline aging >90d: ${l10.agingPipeline} oportunidades
      - Pipeline Q atual: $${Math.round(l10.pipelineQuarter).toLocaleString()}
      
      👥 TIME (Base: ${fsr.totalActiveReps} vendedores ativos):
      - Win Rate médio: ${fsr.avgWinRate}%
      - Ciclo médio (ganhos): ${fsr.avgWinCycle} dias
      - Ciclo médio (perdas): ${fsr.avgLossCycle} dias
      
      FORMATO DA RESPOSTA:
      - Retorne APENAS o parágrafo HTML
      - NÃO retorne JSON (NÃO use { "resumo_executivo": ou similar)
      - NÃO use markdown (backticks, asteriscos, hashtags)
      - Comece DIRETAMENTE com o HTML
      
      Escreva 1 parágrafo executivo (máx 100 palavras) respondendo:
      "Como está a saúde do negócio? Estamos no caminho certo?"
      
      Use HTML com <b> para destaque, <span style="color:#C0FF7D"> para positivo, <span style="color:#E14849"> para alertas.
      Mencione os números-chave para dar credibilidade.
      
      EXEMPLO DE RESPOSTA VÁLIDA:
      A saúde do negócio está <span style="color:#C0FF7D"><b>positiva</b></span> com $250K em revenue...
    `, { responseMimeType: "text/plain" });
    
    console.log('🔍 Executive RAW (primeiros 150 chars):', rawExecutive.substring(0, 150));
    executive = rawExecutive;
  } catch(e) { console.error('Erro Executive:', e); }
  
  // 2. Aprendizados de Ganhas
  let winsInsights = "<i>Analisando padrões de vitória...</i>";
  try {
    winsInsights = callGeminiAPI(`
      Analise estes padrões de VITÓRIAS:
      ${insights.topWinFactors.slice(0, 5).map((f, i) => `${i+1}. ${f.factor} (${f.count}x)`).join('\n')}
      
      Ciclo médio de ganho: ${fsr.avgWinCycle} dias
      Atividades médias: ${fsr.avgActivitiesWin}
      
      Liste 3 aprendizados acionáveis em HTML:
      <ul>
        <li><b>Padrão:</b> ...
        <li><b>Recomendação:</b> ...
      </ul>
      
      Máximo 120 palavras. Seja específico.
    `, { responseMimeType: "text/plain" });
  } catch(e) { console.error('Erro Wins:', e); }
  
  // 3. Insights de Melhorias (Perdas)
  let lossInsights = "<i>Analisando causas de perda...</i>";
  try {
    lossInsights = callGeminiAPI(`
      Analise estas CAUSAS DE PERDA:
      ${insights.topLossCauses.slice(0, 5).map((c, i) => `${i+1}. ${c.cause} (${c.count}x)`).join('\n')}
      
      Ciclo médio de perda: ${fsr.avgLossCycle} dias
      
      Liste 3 melhorias de processo em HTML:
      <ul>
        <li><b>Problema:</b> ...
        <li><b>Solução:</b> ...
      </ul>
      
      Máximo 120 palavras. Foque em ações corretivas.
    `, { responseMimeType: "text/plain" });
  } catch(e) { console.error('Erro Loss:', e); }
  
  // 4. CRO Commentary
  let croCommentary = "<b>Dashboard operacional.</b>";
  try {
    const rawCRO = callGeminiAPI(`
      INSTRUÇÕES CRÍTICAS:
      - Você DEVE retornar APENAS texto HTML puro
      - NÃO retorne código JSON
      - NÃO use estruturas como { "campo": "valor" }
      - NÃO comece com chaves { ou termine com }
      - Se você retornar JSON, sua resposta será REJEITADA
      
      Você é o CRO da Xertica. Analise este resumo operacional:
      
      📊 DADOS DA SEMANA (Base: última semana fechada):
      - Revenue incremental: $${Math.round(l10.netRevenue).toLocaleString()}
      - Bookings: ${l10.bookingsCount} deals fechados
      - Pipeline próxima semana: $${Math.round(l10.pipelineNextWeek).toLocaleString()}
      - Pipeline Q atual: $${Math.round(l10.pipelineQuarter).toLocaleString()}
      - Deals aging >90d: ${l10.agingPipeline} oportunidades estagnadas
      
      👥 PERFORMANCE DO TIME (Base: ${fsr.totalActiveReps} vendedores ativos):
      - Win Rate médio: ${fsr.avgWinRate}%
      - Ciclo médio de ganho: ${fsr.avgWinCycle} dias
      - Ciclo médio de perda: ${fsr.avgLossCycle} dias
      
      FORMATO DA RESPOSTA:
      - Retorne APENAS os 3 parágrafos HTML
      - NÃO retorne JSON (NÃO use { "resumo_semanal_cro":, { "resumo_semanal_html": ou similar)
      - NÃO use markdown ou code blocks
      - Comece DIRETAMENTE com o primeiro parágrafo HTML
      
      Escreva 3 parágrafos curtos (máx 180 palavras total):
      1. <b>🎯 Onde ganhamos</b> - cite números específicos (revenue, deals, win rate)
      2. <b>⚠️ Onde está o risco</b> - cite números de aging, pipeline, ciclos
      3. <b>🚀 Ação imediata</b> - seja específico e acionável
      
      EXEMPLO DE RESPOSTA VÁLIDA:
      <b>🎯 Onde ganhamos</b><br>Fechamos $150K em revenue esta semana...
      
      Use <span style="color:#C0FF7D"> para vitórias e <span style="color:#E14849"> para riscos.
      Sempre mencione a BASE DOS DADOS para dar credibilidade (ex: "dos ${l10.bookingsCount} deals fechados", "${fsr.totalActiveReps} vendedores ativos").
    `, { responseMimeType: "text/plain" });
    
    console.log('🔍 CRO RAW (primeiros 150 chars):', rawCRO.substring(0, 150));
    croCommentary = rawCRO;
  } catch(e) { console.error('Erro CRO:', e); }
  
  // Limpa possíveis prefixos JSON que a IA possa retornar
  const cleanJSON = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text.trim();
    
    // Se começa com { e termina com }, tenta extrair JSON
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        // Tenta fazer parse do JSON
        const parsed = JSON.parse(cleaned);
        
        // Se é um objeto simples com 1 campo, pega o valor
        const keys = Object.keys(parsed);
        if (keys.length === 1) {
          cleaned = parsed[keys[0]];
          console.log(`✂️ JSON extraído da chave "${keys[0]}"`);
        } else {
          // Se tem múltiplas chaves, tenta pegar campos comuns
          cleaned = parsed.resumo_executivo || 
                    parsed.paragrafo_executivo || 
                    parsed.summary_html || 
                    parsed.resumo_semanal_html ||
                    parsed.resumo_semanal_cro ||
                    parsed.html || 
                    parsed.content || 
                    parsed.texto ||
                    cleaned;
          console.log(`✂️ JSON extraído de objeto com ${keys.length} campos`);
        }
      } catch (e) {
        // Se não conseguiu parsear, tenta regex
        console.log(`⚠️ JSON malformado, usando regex: ${e.message}`);
      }
    }
    
    // Remove padrões de JSON por regex (fallback)
    for (let i = 0; i < 3; i++) {
      // { "campo": "valor" } -> valor
      cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*"([^"]*)"\s*\}\s*$/s, '$1');
      
      // { "campo": "valor...restante -> valor...restante
      cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*"/, '');
      
      // ...final" } -> ...final
      cleaned = cleaned.replace(/"\s*\}\s*$/, '');
      
      // { "campo": valor sem aspas
      cleaned = cleaned.replace(/^\s*\{\s*"[^"]+"\s*:\s*/, '');
      
      // } no final
      cleaned = cleaned.replace(/\s*\}\s*$/, '');
    }
    
    // Remove escapes
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&gt;/g, '>');
    
    return cleaned.trim();
  };
  
  console.log('🧹 Limpando análises IA...');
  const cleanedExecutive = cleanJSON(executive);
  const cleanedWins = cleanJSON(winsInsights);
  const cleanedLoss = cleanJSON(lossInsights);
  const cleanedCRO = cleanJSON(croCommentary);
  
  console.log('✅ Executive:', cleanedExecutive.substring(0, 100) + '...');
  console.log('✅ CRO:', cleanedCRO.substring(0, 100) + '...');
  
  // 5. Análise das Principais Oportunidades
  let topOpportunitiesAnalysis = "<i>Analisando principais oportunidades...</i>";
  if (topOpportunities && topOpportunities.length > 0) {
    try {
      const oppsText = topOpportunities.map((opp, i) => 
        `${i+1}. ${opp.name} - ${opp.account || 'Conta N/A'} (${opp.owner}) - $${Math.round(opp.val).toLocaleString()} - ${opp.confidence}% confiança - ${opp.stage}`
      ).join('\n');
      
      topOpportunitiesAnalysis = callGeminiAPI(`
        INSTRUÇÕES CRÍTICAS:
        - Retorne APENAS HTML puro
        - NÃO retorne JSON
        - Comece DIRETAMENTE com o HTML
        
        Você é o VP de Vendas da Xertica. Analise estas 5 principais oportunidades do quarter:
        
        ${oppsText}
        
        Crie uma análise estruturada em HTML com 4 seções:
        
        <div>
          <h4 style="color:#00BEFF;">📊 Visão Geral dos Principais Deals</h4>
          <p>[Breve overview: valor total, distribuição de confiança, vendedores envolvidos]</p>
          
          <h4 style="color:#00BEFF;">⭐ Por que estas são as Principais</h4>
          <p>[Explique critérios: valor alto, impacto no quarter, contas estratégicas]</p>
          
          <h4 style="color:#00BEFF;">⚠️ Principais Riscos Identificados</h4>
          <ul>
            <li><b>Risco de confiança:</b> [deals com confiança baixa]</li>
            <li><b>Risco de timing:</b> [se aplicável]</li>
            <li><b>Risco de concentração:</b> [muitos deals com 1 vendedor?]</li>
          </ul>
          
          <h4 style="color:#00BEFF;">❓ Perguntas-Chave para Executivos</h4>
          <ul>
            <li>[Pergunta específica sobre deal #1]</li>
            <li>[Pergunta sobre estratégia de fechamento]</li>
            <li>[Pergunta sobre plano B se perder]</li>
          </ul>
        </div>
        
        Máximo 250 palavras. Seja direto e acionável.
        Use <span style="color:#E14849"> para riscos e <span style="color:#C0FF7D"> para oportunidades.
      `, { responseMimeType: "text/plain" });
      
      topOpportunitiesAnalysis = cleanJSON(topOpportunitiesAnalysis);
    } catch(e) { 
      console.error('Erro Top Opps:', e);
      topOpportunitiesAnalysis = "<p style='color:#E14849;'>Erro ao gerar análise de oportunidades. Tente recarregar.</p>";
    }
  }
  
  return {
    executive: cleanedExecutive,
    winsInsights: cleanedWins,
    lossInsights: cleanedLoss,
    croCommentary: cleanedCRO,
    topOpportunitiesAnalysis: topOpportunitiesAnalysis
  };
}

/** Função para limpar cache manualmente via Menu */
function clearDashboardCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('DASHBOARD_HTML_V59');
  cache.remove(AI_ANALYSIS_CACHE_KEY);
  SpreadsheetApp.getUi().alert("✅ Cache limpo (HTML + IA)! Recarregue o Web App.");
}

/** Função para debugar dados do dashboard */
function debugDashboardData() {
  const data = getDashboardPayload();
  
  console.log('=== DEBUG DASHBOARD ===');
  console.log('Total vendedores no scorecard:', data.fsrScorecard.length);
  console.log('Vendedores ativos:', data.fsrMetrics.totalActiveReps);
  console.log('Vendedores inativos:', data.fsrMetrics.totalInactiveReps);
  console.log('Win Rate médio:', data.fsrMetrics.avgWinRate);
  console.log('Ciclo médio (ganhos):', data.fsrMetrics.avgWinCycle);
  console.log('Ciclo médio (perdas):', data.fsrMetrics.avgLossCycle);
  
  console.log('\n=== VENDEDORES ATIVOS ===');
  data.fsrScorecard.filter(r => r.isActive).forEach(r => {
    console.log(`${r.name}: ${r.totalWon} ganhos (${r.avgWinCycle}d), ${r.totalLost} perdas (${r.avgLossCycle}d)`);
  });
  
  console.log('\n=== ANÁLISES IA (primeiros 200 chars) ===');
  console.log('Executive:', data.aiAnalysis.executive.substring(0, 200));
  console.log('CRO:', data.aiAnalysis.croCommentary.substring(0, 200));
  
  SpreadsheetApp.getUi().alert("Debug concluído. Veja os logs em Execuções.");
}

/** Função para gerenciar autenticação do dashboard */
function manageDashboardAuth() {
  const ui = SpreadsheetApp.getUi();
  
  const status = DASHBOARD_AUTH.enabled ? '🟢 ATIVADA' : '🔴 DESATIVADA';
  const emailsList = DASHBOARD_AUTH.allowedEmails.join('\n• ');
  const domain = DASHBOARD_AUTH.allowedDomain || 'Nenhum';
  
  const message = `
📊 STATUS DA AUTENTICAÇÃO: ${status}

📧 EMAILS AUTORIZADOS (${DASHBOARD_AUTH.allowedEmails.length}):
• ${emailsList}

🌐 DOMÍNIO PERMITIDO: ${domain}

⚙️ PARA CONFIGURAR:
1. Abra o script (Extensões > Apps Script)
2. Procure por "DASHBOARD_AUTH" (linha ~110)
3. Edite:
   - enabled: true/false
   - allowedEmails: adicione emails
   - allowedDomain: domínio permitido

💡 OPÇÕES DE DEPLOY:
Ao fazer deploy do Web App, escolha:
• "Anyone within xertica.com" - Apenas domínio
• "Anyone" - Público + validação programática

🔐 SEGURANÇA:
✓ Lista de emails (mais controle)
✓ Validação de domínio (mais flexível)
✓ Página de erro personalizada
✓ Log de acessos autorizados
`;

  ui.alert("🔐 Autenticação do Dashboard", message, ui.ButtonSet.OK);
}

/**
 * Configura trigger automático para atualizar dashboard a cada 15 minutos
 */
function setupDashboardAutoRefresh() {
  // Remove triggers existentes para evitar duplicação
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshDashboardData') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Cria novo trigger de 15 minutos
  ScriptApp.newTrigger('refreshDashboardData')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  SpreadsheetApp.getUi().alert(
    "✅ Trigger Configurado!",
    "O dashboard será atualizado automaticamente a cada 15 minutos.\n\n" +
    "Para desativar, vá em: Extensões > Apps Script > Triggers e delete o trigger 'refreshDashboardData'.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  logToSheet("INFO", "Trigger", "Dashboard auto-refresh configurado (15min)");
}

/**
 * Função executada pelo trigger para atualizar dados em background
 */
function refreshDashboardData() {
  try {
    // Limpa cache HTML para forçar regeneração
    CacheService.getScriptCache().remove('DASHBOARD_HTML_V59');
    
    // Pré-carrega dados (warm-up do cache)
    getDashboardPayload();
    
    console.log('✅ Dashboard refresh completado: ' + new Date().toISOString());
  } catch(e) {
    console.error('❌ Erro no refresh do dashboard:', e);
    logToSheet("ERROR", "Trigger", "Falha no auto-refresh: " + e.message);
  }
}

/**
 * Remove trigger automático de atualização
 */
function removeDashboardAutoRefresh() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'refreshDashboardData') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  
  SpreadsheetApp.getUi().alert(
    removed > 0 ? "✅ Trigger Removido" : "ℹ️ Nenhum Trigger Ativo",
    removed > 0 
      ? `${removed} trigger(s) de auto-refresh removido(s).` 
      : "Não há triggers ativos para o dashboard.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  logToSheet("INFO", "Trigger", "Dashboard auto-refresh desativado");
}

/**
 * Retorna o email do usuário logado no Google Sheets
 * Usado para controle de acesso aos logs de debug do dashboard
 */
function getUserEmail() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (e) {
    console.error('Erro ao obter email do usuário:', e);
    return '';
  }
}

// ============================================================================
// 🤖 SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA DO DASHBOARD
// ============================================================================

/**
 * ATIVAR ATUALIZAÇÃO AUTOMÁTICA (chamada via menu)
 * Configura trigger que executa a cada 30 minutos
 */
function ativarTriggerAutomatico() {
  const ui = SpreadsheetApp.getUi();
  
  // Confirmação do usuário
  const response = ui.alert(
    '🤖 Ativar Atualização Automática',
    'Isso criará um trigger que atualiza o dashboard automaticamente a cada 30 minutos.\n\n' +
    'O cache será sempre populado com dados frescos, garantindo que o dashboard esteja sempre disponível.\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  try {
    // Remove triggers antigos para evitar duplicação
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'atualizarDashboardAutomatico') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
      }
    });
    
    if (removidos > 0) {
      console.log(`🗑️ ${removidos} trigger(s) antigo(s) removido(s)`);
    }
    
    // Cria novo trigger: executa a cada 30 minutos
    ScriptApp.newTrigger('atualizarDashboardAutomatico')
      .timeBased()
      .everyMinutes(30)
      .create();
    
    console.log('✅ Trigger instalado com sucesso!');
    
    // Executa a primeira atualização imediatamente
    ui.alert(
      '⏳ Primeira Atualização',
      'Executando primeira atualização agora...\n\nIsso pode levar 10-20 segundos.',
      ui.ButtonSet.OK
    );
    
    atualizarDashboardAutomatico();
    
    ui.alert(
      '✅ Sistema Ativado!',
      '🤖 Atualização automática configurada com sucesso!\n\n' +
      '⏰ Dashboard será atualizado a cada 30 minutos\n' +
      '💾 Cache sempre populado com dados frescos\n' +
      '📊 Timestamp será atualizado automaticamente\n\n' +
      'Use "Verificar Status dos Triggers" para monitorar.',
      ui.ButtonSet.OK
    );
    
    logToSheet("INFO", "Trigger", "Sistema de atualização automática ATIVADO");
    
  } catch (error) {
    console.error('❌ Erro ao ativar trigger:', error);
    ui.alert(
      '❌ Erro',
      'Falha ao criar trigger automático:\n\n' + error.message,
      ui.ButtonSet.OK
    );
    logToSheet("ERROR", "Trigger", "Falha ao ativar: " + error.message);
  }
}

/**
 * DESATIVAR ATUALIZAÇÃO AUTOMÁTICA (chamada via menu)
 */
function desativarTriggerAutomatico() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.alert(
    '🛑 Desativar Atualização Automática',
    'Isso removerá o trigger automático.\n\n' +
    'O dashboard continuará funcionando, mas o cache não será atualizado automaticamente.\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    return;
  }
  
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'atualizarDashboardAutomatico') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  
  ui.alert(
    removed > 0 ? '✅ Sistema Desativado' : 'ℹ️ Nenhum Trigger Ativo',
    removed > 0 
      ? `${removed} trigger(s) removido(s).\n\nAtualização automática DESATIVADA.` 
      : 'Não há triggers ativos no momento.',
    ui.ButtonSet.OK
  );
  
  logToSheet("INFO", "Trigger", `Atualização automática DESATIVADA (${removed} trigger(s) removido(s))`);
}

/**
 * VERIFICAR STATUS DOS TRIGGERS (chamada via menu)
 */
function verificarStatusTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const dashboardTriggers = triggers.filter(t => t.getHandlerFunction() === 'atualizarDashboardAutomatico');
  
  let mensagem = '';
  
  if (dashboardTriggers.length === 0) {
    mensagem = '❌ SISTEMA INATIVO\n\n' +
               'Não há triggers configurados.\n\n' +
               '💡 Use "Ativar Atualização Automática" para configurar.';
  } else {
    mensagem = `✅ SISTEMA ATIVO\n\n` +
               `📊 ${dashboardTriggers.length} trigger(s) configurado(s)\n\n`;
    
    dashboardTriggers.forEach((trigger, i) => {
      mensagem += `Trigger #${i + 1}:\n`;
      mensagem += `  • Função: ${trigger.getHandlerFunction()}\n`;
      mensagem += `  • Tipo: Time-based (30 minutos)\n`;
      mensagem += `  • ID: ${trigger.getUniqueId()}\n\n`;
    });
    
    mensagem += '⏰ O dashboard é atualizado automaticamente a cada 30 minutos.';
  }
  
  SpreadsheetApp.getUi().alert('⏰ Status dos Triggers', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * FUNÇÃO EXECUTADA PELO TRIGGER (A cada 30 minutos)
 * NÃO CHAME MANUALMENTE - deixe o trigger fazer o trabalho
 */
function atualizarDashboardAutomatico() {
  const startTime = new Date();
  console.log('🔄 Iniciando atualização automática do Dashboard...');
  console.log(`⏰ Timestamp: ${startTime.toISOString()}`);
  
  try {
    // 1. Limpa caches antigos do HTML
    limparCachesAntigos_();
    
    // 2. Gera novo payload (getDashboardPayload já salva no cache)
    const payload = getDashboardPayload();
    
    // 3. Força timestamp atualizado
    payload.updatedAt = startTime.toISOString();
    payload.autoRefresh = true;
    
    // 4. Salva novamente no cache com timestamp correto
    const cache = CacheService.getScriptCache();
    const TTL_SECONDS = 5 * 60; // 5 minutos
    cache.put(DASHBOARD_CACHE_KEY, JSON.stringify(payload), TTL_SECONDS);
    
    // 5. Log de sucesso
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000;
    
    console.log('✅ Atualização concluída com sucesso!');
    console.log(`⏱️ Duração: ${duration.toFixed(2)}s`);
    console.log(`📊 Pipeline Total: $${payload.l10?.totalPipelineGross?.toLocaleString() || 'N/A'}`);
    console.log(`📈 Deals Abertos: ${payload.l10?.dealsCount || 'N/A'}`);
    console.log(`👥 Vendedores Ativos: ${payload.fsrScorecard?.filter(r => r.isActive).length || 'N/A'}`);
    console.log(`🔄 Próxima atualização: ${new Date(startTime.getTime() + 30 * 60000).toLocaleString('pt-BR')}`);
    
    logToSheet("INFO", "Trigger", `Dashboard atualizado automaticamente em ${duration.toFixed(2)}s`);
    
  } catch (error) {
    console.error('❌ ERRO na atualização automática:', error);
    console.error('Stack:', error.stack);
    logToSheet("ERROR", "Trigger", `Falha na atualização: ${error.message}`);
  }
}

/**
 * Limpa caches antigos para evitar acúmulo
 * @private
 */
function limparCachesAntigos_() {
  const cache = CacheService.getScriptCache();
  
  // Lista de chaves de cache conhecidas
  const keysToClean = [
    'DASHBOARD_HTML_V59',
    AI_ANALYSIS_CACHE_KEY
  ];
  
  keysToClean.forEach(key => {
    try {
      cache.remove(key);
    } catch (e) {
      // Ignora erros silenciosamente
    }
  });
}

/**
 * Wrapper do menu: Executa análise detalhada do payload
 * Chamado via menu UI > Web Dashboard > Debug: Análise Detalhada do Payload
 */
function savePayloadDetailedAnalysisMenu() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('⏳ Processando... Analisando payload detalhadamente.\n\nIsso pode levar alguns segundos.');
    
    const payload = preprocessDashboardData(true); // true = modo silencioso
    
    if (!payload) {
      ui.alert('❌ Erro: Payload não gerado. Verifique os logs do Apps Script.');
      return;
    }
    
    savePayloadDetailedAnalysis(payload);
    
    ui.alert('✅ Sucesso!\n\nAnálise detalhada salva na aba "Payload_Detailed".\n\nVocê pode analisar cada campo, tamanho e quantidade de dados.');
  } catch(e) {
    SpreadsheetApp.getUi().alert('❌ Erro: ' + e.message);
    console.error('Erro em savePayloadDetailedAnalysisMenu:', e);
  }
}

/**
 * Obtém dados agregados da aba Sales Specialist
 * @private
 */
function getSalesSpecialistData_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Análise Sales Specialist");
    
    if (!sheet || sheet.getLastRow() <= 1) {
      console.log('ℹ️ Aba Sales Specialist não encontrada ou vazia');
      return { 
        totalGross: 0, totalNet: 0, dealsCount: 0,
        commitGross: 0, commitNet: 0, commitCount: 0,
        upsideGross: 0, upsideNet: 0, upsideCount: 0
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Mapear colunas
    const grossIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('BOOKING') && norm.includes('GROSS');
    });
    
    const netIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('BOOKING') && norm.includes('NET');
    });
    
    const statusIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('STATUS');
    });

    const closedDateIdx = headers.findIndex(h => {
      const norm = normText_(String(h));
      return norm.includes('CLOSED') && norm.includes('DATE');
    });
    
    console.log(`📋 Colunas encontradas em Sales Specialist:`);
    console.log(`  • Gross Index: ${grossIdx} (${grossIdx >= 0 ? headers[grossIdx] : 'NÃO ENCONTRADO'})`);
    console.log(`  • Net Index: ${netIdx} (${netIdx >= 0 ? headers[netIdx] : 'NÃO ENCONTRADO'})`);
    console.log(`  • Status Index: ${statusIdx} (${statusIdx >= 0 ? headers[statusIdx] : 'NÃO ENCONTRADO'})`);
    console.log(`  • Closed Date Index: ${closedDateIdx} (${closedDateIdx >= 0 ? headers[closedDateIdx] : 'NÃO ENCONTRADO'})`);
    
    if (grossIdx === -1) {
      console.warn('⚠️ Coluna Booking Gross não encontrada em Sales Specialist');
      return { 
        totalGross: 0, totalNet: 0, dealsCount: 0,
        commitGross: 0, commitNet: 0, commitCount: 0,
        upsideGross: 0, upsideNet: 0, upsideCount: 0
      };
    }
    
    let totalGross = 0;
    let totalNet = 0;
    let dealsCount = 0;
    let commitGross = 0;
    let commitNet = 0;
    let commitCount = 0;
    let upsideGross = 0;
    let upsideNet = 0;
    let upsideCount = 0;

    // Breakdown por Fiscal Q baseado em Closed Date
    const salesSpecByFiscalQ = {};

    const parseClosedDate_ = (value) => {
      if (value instanceof Date) return value;
      const raw = String(value || '').trim();
      if (!raw) return null;
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        const year = parseInt(m[3], 10);
        return new Date(year, month, day);
      }
      const parsed = new Date(raw);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    
    // Somar valores
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Pula linhas vazias (sem Account Name)
      if (!row[0] || String(row[0]).trim() === '') {
        continue;
      }
      
      // Parse de valores monetários (remove $, vírgulas, espaços)
      const grossRaw = String(row[grossIdx] || '0').replace(/[$,\s]/g, '');
      const netRaw = netIdx > -1 ? String(row[netIdx] || '0').replace(/[$,\s]/g, '') : grossRaw;
      
      const gross = parseFloat(grossRaw) || 0;
      const net = parseFloat(netRaw) || 0;
      const status = statusIdx > -1 ? String(row[statusIdx]).toLowerCase().trim() : '';
      const closedDate = closedDateIdx > -1 ? parseClosedDate_(row[closedDateIdx]) : null;
      
      // Debug das primeiras 5 linhas
      if (i <= 5) {
        console.log(`  Linha ${i}: Gross=$${gross.toLocaleString()} (raw: "${row[grossIdx]}"), Net=$${net.toLocaleString()}, Status="${status}"`);
      }
      
      if (gross > 0) {
        totalGross += gross;
        totalNet += net;
        dealsCount++;

        if (closedDate) {
          const fiscal = calculateFiscalQuarter(closedDate);
          const label = fiscal && fiscal.label ? fiscal.label : 'N/A';
          if (!salesSpecByFiscalQ[label]) {
            salesSpecByFiscalQ[label] = { 
              gross: 0, 
              net: 0, 
              deals: 0,
              commit: 0,
              upside: 0 
            };
          }
          salesSpecByFiscalQ[label].gross += gross;
          salesSpecByFiscalQ[label].net += net;
          salesSpecByFiscalQ[label].deals += 1;
          
          // Conta commit/upside por quarter
          if (status === 'commit') {
            salesSpecByFiscalQ[label].commit += gross;
          } else if (status === 'upside') {
            salesSpecByFiscalQ[label].upside += gross;
          }
        }
        
        // Separar por categoria
        if (status === 'commit') {
          commitGross += gross;
          commitNet += net;
          commitCount++;
        } else if (status === 'upside') {
          upsideGross += gross;
          upsideNet += net;
          upsideCount++;
        }
      }
    }
    
    const uncategorized = dealsCount - commitCount - upsideCount;
    
    console.log(`📊 Sales Specialist: ${dealsCount} deals, Gross: $${totalGross.toLocaleString()}, Net: $${totalNet.toLocaleString()}`);
    console.log(`  • Commit: ${commitCount} deals ($${commitGross.toLocaleString()}) - ${totalGross > 0 ? ((commitGross/totalGross)*100).toFixed(1) : 0}%`);
    console.log(`  • Upside: ${upsideCount} deals ($${upsideGross.toLocaleString()}) - ${totalGross > 0 ? ((upsideGross/totalGross)*100).toFixed(1) : 0}%`);
    console.log(`  • Sem categoria: ${uncategorized} deals`);
    
    return { 
      totalGross, totalNet, dealsCount,
      commitGross, commitNet, commitCount,
      upsideGross, upsideNet, upsideCount,
      salesSpecByFiscalQ
    };
    
  } catch (error) {
    console.error('❌ Erro ao ler dados Sales Specialist:', error);
    return { totalGross: 0, totalNet: 0, dealsCount: 0 };
  }
}
