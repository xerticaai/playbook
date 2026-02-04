/**
 * @fileoverview AUDITORIA: BASE vs ANÁLISE
 * @author GitHub Copilot
 * 
 * ================================================================================
 * PROPÓSITO
 * ================================================================================
 * Comparar as bases de dados com suas respectivas análises:
 * - Historico_Ganhos vs 📊 Análise Ganhos
 * - Historico_Perdidas vs 📉 Análise Perdidas
 * - Pipeline_Aberto vs 🎯 Análise Forecast IA
 * 
 * Métricas calculadas:
 * - Oportunidades únicas na BASE
 * - Oportunidades únicas na ANÁLISE
 * - GAP (faltando análise)
 * - ÓRFÃS (análise sem base)
 * - Duplicatas em cada aba
 * 
 * ================================================================================
 * COMO USAR
 * ================================================================================
 * 1. No menu: Auditoria > 🔍 Comparar Base vs Análise
 * 2. Ou execute manualmente: auditarBaseVsAnalise()
 * 3. Veja o relatório na aba "🔍 Auditoria Base-Análise"
 */

// ================================================================================================
// --- CONFIGURAÇÃO DOS PARES BASE → ANÁLISE ---
// ================================================================================================

const PARES_AUDITORIA = [
  {
    modo: 'GANHOS',
    emoji: '🏆',
    base: {
      nome: 'Historico_Ganhos',
      coluna: 'Nome da oportunidade'
    },
    analise: {
      nome: '📈 Análise Ganhas',
      coluna: 'Oportunidade'
    }
  },
  {
    modo: 'PERDIDAS',
    emoji: '❌',
    base: {
      nome: 'Historico_Perdidas',
      coluna: 'Nome da oportunidade'
    },
    analise: {
      nome: '📉 Análise Perdidas',
      coluna: 'Oportunidade'
    }
  },
  {
    modo: 'PIPELINE',
    emoji: '📊',
    base: {
      nome: 'Pipeline_Aberto',
      coluna: 'Nome da oportunidade'
    },
    analise: {
      nome: '🎯 Análise Forecast IA',
      coluna: 'Oportunidade'
    }
  }
];

// ================================================================================================
// --- FUNÇÃO PRINCIPAL ---
// ================================================================================================

/**
 * Audita e compara BASE vs ANÁLISE para todos os modos
 */
function auditarBaseVsAnalise() {
  const startTime = new Date();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 INICIANDO AUDITORIA: BASE vs ANÁLISE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultados = [];
  
  // Processar cada par BASE → ANÁLISE
  for (const par of PARES_AUDITORIA) {
    console.log(`\n${par.emoji} Auditando ${par.modo}...`);
    const resultado = compararBaseAnalise_(ss, par);
    resultados.push(resultado);
    
    console.log(`   BASE: ${resultado.base.total} registros → ${resultado.base.unicos} únicos`);
    console.log(`   ANÁLISE: ${resultado.analise.total} registros → ${resultado.analise.unicos} únicos`);
    console.log(`   GAP: ${resultado.gap.faltando} faltam análise`);
    console.log(`   ÓRFÃS: ${resultado.gap.orfas} análises sem base`);
  }
  
  // Gerar relatório consolidado
  const endTime = new Date();
  const duracao = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n📊 Gerando relatório...');
  escreverRelatorioAuditoria_(ss, resultados, duracao);
  
  // Exibir alerta para usuário
  const ui = SpreadsheetApp.getUi();
  const totalGap = resultados.reduce((sum, r) => sum + r.gap.faltando, 0);
  const totalOrfas = resultados.reduce((sum, r) => sum + r.gap.orfas, 0);
  
  ui.alert(
    '✅ Auditoria Concluída!',
    `Total de Gaps: ${totalGap} oportunidades sem análise\n` +
    `Total de Órfãs: ${totalOrfas} análises sem base\n\n` +
    `Relatório disponível na aba "🔍 Auditoria Base-Análise"`,
    ui.ButtonSet.OK
  );
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ AUDITORIA CONCLUÍDA em ${duracao}s`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  return resultados;
}

// ================================================================================================
// --- FUNÇÕES DE COMPARAÇÃO ---
// ================================================================================================

/**
 * Compara uma BASE com sua ANÁLISE correspondente
 */
function compararBaseAnalise_(ss, par) {
  // Ler BASE
  console.log(`   🔍 Buscando aba BASE: "${par.base.nome}"`);
  const baseSheet = ss.getSheetByName(par.base.nome);
  if (!baseSheet) {
    console.error(`   ❌ Aba BASE não encontrada: "${par.base.nome}"`);
  } else {
    console.log(`   ✅ Aba BASE encontrada!`);
  }
  const baseData = lerOportunidades_(baseSheet, par.base.coluna);
  
  // Ler ANÁLISE
  console.log(`   🔍 Buscando aba ANÁLISE: "${par.analise.nome}"`);
  const analiseSheet = ss.getSheetByName(par.analise.nome);
  if (!analiseSheet) {
    console.error(`   ❌ Aba ANÁLISE não encontrada: "${par.analise.nome}"`);
    console.error(`   📋 Abas disponíveis: ${ss.getSheets().map(s => s.getName()).join(', ')}`);
  } else {
    console.log(`   ✅ Aba ANÁLISE encontrada!`);
  }
  const analiseData = lerOportunidades_(analiseSheet, par.analise.coluna);
  
  // Comparar
  const gap = calcularGap_(baseData.oportunidades, analiseData.oportunidades);
  
  // 🔍 INVESTIGAR LOGS: Buscar oportunidades faltando nos logs de execução
  let diagnosticoLogs = null;
  if (gap.faltando.length > 0) {
    console.log(`   🔎 Investigando ${gap.faltando.length} oportunidades nos logs...`);
    diagnosticoLogs = investigarOportunidadesEmLogs_(ss, gap.faltando, par.modo);
    console.log(`      • Encontradas em logs: ${diagnosticoLogs.encontradas}`);
    console.log(`      • Com erro: ${diagnosticoLogs.comErro}`);
    console.log(`      • Nunca processadas: ${diagnosticoLogs.nuncaProcessadas}`);
  }
  
  return {
    modo: par.modo,
    emoji: par.emoji,
    base: {
      aba: par.base.nome,
      total: baseData.total,
      unicos: baseData.oportunidades.size
    },
    analise: {
      aba: par.analise.nome,
      total: analiseData.total,
      unicos: analiseData.oportunidades.size
    },
    gap: {
      faltando: gap.faltando.length,
      orfas: gap.orfas.length,
      listaFaltando: gap.faltando.slice(0, 10), // Top 10
      listaOrfas: gap.orfas.slice(0, 10)
    },
    diagnostico: diagnosticoLogs
  };
}

/**
 * Lê oportunidades de uma aba e normaliza nomes
 */
function lerOportunidades_(sheet, colunaNome) {
  if (!sheet) {
    console.warn(`   ⚠️ Aba não encontrada`);
    return {
      total: 0,
      oportunidades: new Set()
    };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    console.warn(`   ⚠️ Aba "${sheet.getName()}" está vazia`);
    return {
      total: 0,
      oportunidades: new Set()
    };
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // DEBUG: Mostrar TODAS as colunas
  console.log(`\n   📋 DEBUG: "${sheet.getName()}" tem ${headers.length} colunas:`);
  headers.forEach((h, i) => {
    console.log(`      [${i}] "${h}"`);
  });
  
  // Encontrar coluna de oportunidade (BUSCA PRIORITÁRIA)
  let oppIdx = -1;
  
  // 1️⃣ PRIORIDADE MÁXIMA: Match exato com "Nome da oportunidade"
  oppIdx = headers.findIndex(h => {
    const norm = String(h).trim().toLowerCase();
    return norm === 'nome da oportunidade' || norm === 'nome da opportunidade';
  });
  
  if (oppIdx !== -1) {
    console.log(`   ✅ [MATCH EXATO] Encontrou: "${headers[oppIdx]}" (índice ${oppIdx})`);
  }
  
  // 2️⃣ Segunda tentativa: Contém "oportunidade" mas NÃO é "conta"
  if (oppIdx === -1) {
    oppIdx = headers.findIndex(h => {
      const norm = String(h).trim().toLowerCase();
      return (norm.includes('oportunidade') || norm.includes('opportunity')) && 
             !norm.includes('conta') && 
             !norm.includes('account');
    });
    
    if (oppIdx !== -1) {
      console.log(`   ✅ [MATCH PARCIAL] Encontrou: "${headers[oppIdx]}" (índice ${oppIdx})`);
    }
  }
  
  // 3️⃣ Terceira tentativa: Apenas "Oportunidade" sozinho
  if (oppIdx === -1) {
    oppIdx = headers.findIndex(h => {
      const norm = String(h).trim().toLowerCase();
      return norm === 'oportunidade' || norm === 'opportunity';
    });
    
    if (oppIdx !== -1) {
      console.log(`   ✅ [MATCH SIMPLES] Encontrou: "${headers[oppIdx]}" (índice ${oppIdx})`);
    }
  }
  
  // ❌ Não encontrou
  if (oppIdx === -1) {
    console.error(`   ❌ FALHA: Nenhuma coluna de oportunidade detectada!`);
    console.error(`   🔍 Procurei por: "Nome da oportunidade", "oportunidade", "opportunity"`);
    console.error(`   📋 Colunas disponíveis: ${headers.map((h,i) => `[${i}]${h}`).join(', ')}`);
    return {
      total: 0,
      oportunidades: new Set()
    };
  }
  
  // Mapear oportunidades (SET para valores únicos)
  const oppSet = new Set();
  
  for (let i = 1; i < data.length; i++) {
    const oppName = String(data[i][oppIdx] || '').trim();
    if (!oppName) continue;
    
    const normName = normalizarNomeOpp_(oppName);
    oppSet.add(normName);
  }
  
  return {
    total: data.length - 1,
    oportunidades: oppSet
  };
}

/**
 * Calcula gaps entre BASE e ANÁLISE
 */
function calcularGap_(baseSet, analiseSet) {
  const faltando = []; // Em BASE mas não em ANÁLISE
  const orfas = [];    // Em ANÁLISE mas não em BASE
  
  // Verificar o que falta na análise
  baseSet.forEach(opp => {
    if (!analiseSet.has(opp)) {
      faltando.push(opp);
    }
  });
  
  // Verificar órfãs (análises sem base)
  analiseSet.forEach(opp => {
    if (!baseSet.has(opp)) {
      orfas.push(opp);
    }
  });
  
  return {
    faltando: faltando,
    orfas: orfas
  };
}

/**
 * Normaliza nome de oportunidade para comparação
 */
function normalizarNomeOpp_(nome) {
  return String(nome)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '')    // Remove especiais
    .replace(/\s+/g, ' ');           // Normaliza espaços
}

// ================================================================================================
// --- INVESTIGAÇÃO DE LOGS ---
// ================================================================================================

/**
 * Investiga oportunidades faltando nos logs de execução
 */
function investigarOportunidadesEmLogs_(ss, oportunidadesFaltando, modo) {
  const logSheet = ss.getSheetByName('Auto Refresh Execution Log');
  
  if (!logSheet) {
    console.warn('   ⚠️ Aba "Auto Refresh Execution Log" não encontrada');
    return {
      encontradas: 0,
      comErro: 0,
      nuncaProcessadas: oportunidadesFaltando.length,
      detalhes: [],
      totalLinhasLog: 0
    };
  }
  
  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) {
    console.warn('   ⚠️ Log de execução está vazio');
    return {
      encontradas: 0,
      comErro: 0,
      nuncaProcessadas: oportunidadesFaltando.length,
      detalhes: [],
      totalLinhasLog: 0
    };
  }
  
  console.log(`      📊 Log tem ${lastRow - 1} linhas totais`);
  
  // Ler logs (últimas 50000 linhas para melhor cobertura)
  const startRow = Math.max(2, lastRow - 49999);
  const numRows = lastRow - startRow + 1;
  console.log(`      🔍 Analisando últimas ${numRows} linhas...`);
  
  const logData = logSheet.getRange(startRow, 1, numRows, Math.min(3, logSheet.getLastColumn())).getValues();
  
  // Mapear prefixos por modo
  const prefixosModo = {
    'GANHOS': ['[WON]', '[GANHOS]'],
    'PERDIDAS': ['[LOST]', '[PERDIDAS]'],
    'PIPELINE': ['[OPEN]', '[PIPELINE]']
  };
  const prefixos = prefixosModo[modo] || [];
  console.log(`      🏷️ Buscando por prefixos: ${prefixos.join(', ')}`);
  
  // Filtrar logs apenas do modo específico
  const logsDoModo = [];
  for (let i = 0; i < logData.length; i++) {
    const message = String(logData[i][2] || '');
    // Verificar se a linha pertence ao modo
    const pertenceAoModo = prefixos.some(p => message.includes(p));
    if (pertenceAoModo) {
      logsDoModo.push({
        timestamp: logData[i][0],
        level: String(logData[i][1] || '').trim(),
        message: message,
        messageLower: message.toLowerCase()
      });
    }
  }
  
  console.log(`      ✅ Filtrado: ${logsDoModo.length} linhas relevantes para ${modo}`);
  
  // Mapear status de cada oportunidade
  const statusMap = new Map(); // opp normalizada -> {encontrada, erro, ultimaMensagem, timestamp}
  
  // Pesquisar cada oportunidade nos logs FILTRADOS
  const oppAnalisar = oportunidadesFaltando.slice(0, 100); // Aumentar para 100
  console.log(`      🔎 Analisando ${oppAnalisar.length} de ${oportunidadesFaltando.length} oportunidades...`);
  
  for (const oppNorm of oppAnalisar) {
    statusMap.set(oppNorm, {
      encontrada: false,
      erro: false,
      ultimaMensagem: null,
      timestamp: null
    });
    
    // Buscar menções nos logs do modo (de trás pra frente - mais recente primeiro)
    for (let i = logsDoModo.length - 1; i >= 0; i--) {
      const log = logsDoModo[i];
      
      // Verificar se a oportunidade está mencionada (busca flexível)
      if (log.messageLower.includes(oppNorm)) {
        statusMap.get(oppNorm).encontrada = true;
        statusMap.get(oppNorm).timestamp = log.timestamp;
        statusMap.get(oppNorm).ultimaMensagem = log.message;
        
        // Verificar se é erro
        if (log.level.toLowerCase().includes('erro') || log.level.toLowerCase().includes('error')) {
          statusMap.get(oppNorm).erro = true;
        }
        
        break; // Encontrou a menção mais recente
      }
    }
  }
  
  // Consolidar estatísticas
  let encontradas = 0;
  let comErro = 0;
  let nuncaProcessadas = 0;
  const detalhes = [];
  
  statusMap.forEach((status, opp) => {
    if (status.encontrada) {
      encontradas++;
      if (status.erro) {
        comErro++;
        detalhes.push({
          oportunidade: opp,
          status: 'ERRO',
          timestamp: status.timestamp,
          mensagem: status.ultimaMensagem
        });
      } else {
        detalhes.push({
          oportunidade: opp,
          status: 'PROCESSADA (sem análise)',
          timestamp: status.timestamp,
          mensagem: status.ultimaMensagem
        });
      }
    } else {
      nuncaProcessadas++;
      detalhes.push({
        oportunidade: opp,
        status: 'NUNCA PROCESSADA',
        timestamp: null,
        mensagem: 'Não encontrada nos logs'
      });
    }
  });
  
  return {
    encontradas: encontradas,
    comErro: comErro,
    nuncaProcessadas: nuncaProcessadas,
    detalhes: detalhes.slice(0, 10), // Top 10
    totalAnalisado: statusMap.size,
    totalLinhasLog: lastRow - 1,
    linhasDoModo: logsDoModo.length
  };
}

// ================================================================================================
// --- GERAÇÃO DE RELATÓRIO ---
// ================================================================================================

/**
 * Escreve relatório detalhado na planilha
 */
function escreverRelatorioAuditoria_(ss, resultados, duracao) {
  const sheetName = '🔍 Auditoria Base-Análise';
  let sheet = ss.getSheetByName(sheetName);
  
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(sheetName);
  }
  
  const data = [];
  
  // === CABEÇALHO ===
  data.push(['═══════════════════════════════════════════════════════════════']);
  data.push(['🔍 AUDITORIA: BASE vs ANÁLISE']);
  data.push(['═══════════════════════════════════════════════════════════════']);
  data.push(['']);
  data.push(['📅 Data:', Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss')]);
  data.push(['⏱️ Duração:', duracao + 's']);
  data.push(['']);
  
  // === RESUMO GERAL ===
  data.push(['═══ RESUMO GERAL ═══']);
  data.push(['']);
  
  const totalGap = resultados.reduce((sum, r) => sum + r.gap.faltando, 0);
  const totalOrfas = resultados.reduce((sum, r) => sum + r.gap.orfas, 0);
  const totalBase = resultados.reduce((sum, r) => sum + r.base.unicos, 0);
  const totalAnalise = resultados.reduce((sum, r) => sum + r.analise.unicos, 0);
  
  data.push(['📊 Total Base (Únicos):', totalBase]);
  data.push(['📊 Total Análise (Únicos):', totalAnalise]);
  data.push(['⚠️ GAP (Faltam Análise):', totalGap]);
  data.push(['🗑️ ÓRFÃS (Análise sem Base):', totalOrfas]);
  data.push(['✅ Cobertura:', `${((totalAnalise / totalBase) * 100).toFixed(1)}%`]);
  data.push(['']);
  
  // === DETALHAMENTO POR MODO ===
  data.push(['═══ DETALHAMENTO POR MODO ═══']);
  data.push(['']);
  
  for (const res of resultados) {
    data.push([`${res.emoji} ${res.modo}`]);
    data.push(['']);
    data.push(['   📁 BASE:', res.base.aba]);
    data.push(['      • Total Registros:', res.base.total, '(pode ter duplicatas - é normal)']);
    data.push(['      • Oportunidades Únicas:', res.base.unicos]);
    data.push(['']);
    data.push(['   📊 ANÁLISE:', res.analise.aba, '(agregada - sempre única)']);
    data.push(['      • Total Registros:', res.analise.total]);
    data.push(['      • Oportunidades Únicas:', res.analise.unicos]);
    data.push(['']);
    data.push(['   🔍 COMPARAÇÃO:']);
    data.push(['      • Faltam Análise:', res.gap.faltando]);
    data.push(['      • Órfãs (sem Base):', res.gap.orfas]);
    data.push(['      • Cobertura:', `${((res.analise.unicos / res.base.unicos) * 100).toFixed(1)}%`]);
    
    // 🔎 DIAGNÓSTICO DE LOGS
    if (res.diagnostico) {
      data.push(['']);
      data.push(['   🔎 DIAGNÓSTICO (análise de logs):']);
      data.push(['      • Total linhas no log:', res.diagnostico.totalLinhasLog]);
      data.push(['      • Linhas deste modo:', res.diagnostico.linhasDoModo]);
      data.push(['      • Oportunidades analisadas:', res.diagnostico.totalAnalisado, 'das', res.gap.faltando]);
      data.push(['      • Encontradas em logs:', res.diagnostico.encontradas]);
      data.push(['      • Com ERRO:', res.diagnostico.comErro]);
      data.push(['      • NUNCA processadas:', res.diagnostico.nuncaProcessadas]);
      
      // Listar casos de erro
      if (res.diagnostico.detalhes && res.diagnostico.detalhes.length > 0) {
        data.push(['']);
        data.push(['      TOP 10 DETALHES:']);
        res.diagnostico.detalhes.forEach((det, i) => {
          data.push([`         ${i+1}.`, det.oportunidade]);
          data.push(['            Status:', det.status]);
          if (det.timestamp) {
            data.push(['            Timestamp:', Utilities.formatDate(new Date(det.timestamp), 'America/Sao_Paulo', 'dd/MM HH:mm')]);
          }
          if (det.mensagem && det.mensagem.length < 100) {
            data.push(['            Mensagem:', det.mensagem.substring(0, 100)]);
          }
          data.push(['']);
        });
      }
    }
    
    // Listar top 10 faltando
    if (res.gap.faltando > 0 && res.gap.listaFaltando.length > 0) {
      data.push(['']);
      data.push(['      TOP 10 FALTANDO ANÁLISE:']);
      res.gap.listaFaltando.forEach((opp, i) => {
        data.push([`         ${i+1}.`, opp]);
      });
      if (res.gap.faltando > 10) {
        data.push(['         ...', `(mais ${res.gap.faltando - 10})`]);
      }
    }
    
    // Listar top 10 órfãs
    if (res.gap.orfas > 0 && res.gap.listaOrfas.length > 0) {
      data.push(['']);
      data.push(['      TOP 10 ÓRFÃS (SEM BASE):']);
      res.gap.listaOrfas.forEach((opp, i) => {
        data.push([`         ${i+1}.`, opp]);
      });
      if (res.gap.orfas > 10) {
        data.push(['         ...', `(mais ${res.gap.orfas - 10})`]);
      }
    }
    
    data.push(['']);
    data.push(['']);
  }
  
  // === RECOMENDAÇÕES ===
  data.push(['═══ RECOMENDAÇÕES ═══']);
  data.push(['']);
  
  if (totalGap === 0 && totalOrfas === 0) {
    data.push(['✅ PERFEITO! Base e Análise estão 100% sincronizadas.']);
  } else {
    if (totalGap > 0) {
      data.push([`⚠️ ${totalGap} oportunidades precisam de análise.`]);
      data.push(['   AÇÃO: Execute o Auto-Sync para processar.']);
    }
    if (totalOrfas > 0) {
      data.push([`🗑️ ${totalOrfas} análises órfãs detectadas.`]);
      data.push(['   AÇÃO: Remover automaticamente ou verificar base.']);
    }
  }
  
  // Normalizar colunas
  const maxCols = Math.max(...data.map(row => row.length));
  const normalizedData = data.map(row => {
    const newRow = [...row];
    while (newRow.length < maxCols) {
      newRow.push('');
    }
    return newRow;
  });
  
  // Escrever
  sheet.getRange(1, 1, normalizedData.length, maxCols).setValues(normalizedData);
  
  // Formatação
  sheet.getRange(1, 1, 3, maxCols)
    .setBackground('#4a86e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  sheet.getRange(8, 1, 1, maxCols)
    .setBackground('#f4cccc')
    .setFontWeight('bold');
  
  sheet.getRange(17, 1, 1, maxCols)
    .setBackground('#fff2cc')
    .setFontWeight('bold');
  
  sheet.autoResizeColumns(1, maxCols);
}

// ================================================================================================
// NOTA: Menu integrado no SheetCode.gs (onOpen principal)
// Para executar: Menu > 🔧 Ferramentas & Diagnóstico > 📊 Auditoria: Base vs Análise
// ================================================================================================
