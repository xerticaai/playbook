/**
 * DIAGNOSTIC.gs
 * Arquivo de diagnóstico para identificar problemas com o menu
 * 
 * INSTRUÇÕES:
 * 1. Copie este arquivo para o Apps Script
 * 2. Execute a função testMenuSetup()
 * 3. Veja os logs (View > Logs ou Executions)
 * 4. Me envie o resultado
 */

function testMenuSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  let report = "🔍 DIAGNÓSTICO DO MENU\n\n";
  
  // 1. Verificar se onOpen existe
  try {
    if (typeof onOpen === 'function') {
      report += "✅ Função onOpen() existe\n";
    } else {
      report += "❌ Função onOpen() NÃO existe\n";
    }
  } catch (e) {
    report += "❌ Erro ao verificar onOpen: " + e.message + "\n";
  }
  
  // 2. Tentar executar onOpen manualmente
  try {
    onOpen();
    report += "✅ onOpen() executou sem erros\n";
  } catch (e) {
    report += "❌ ERRO ao executar onOpen():\n";
    report += "   Mensagem: " + e.message + "\n";
    report += "   Stack: " + e.stack + "\n";
  }
  
  // 3. Verificar BigQuery Service
  try {
    if (typeof BigQuery !== 'undefined') {
      report += "✅ BigQuery Service adicionado\n";
    } else {
      report += "⚠️ BigQuery Service NÃO encontrado (necessário para funções BigQuery)\n";
    }
  } catch (e) {
    report += "⚠️ BigQuery não disponível\n";
  }
  
  // 4. Verificar funções do menu BigQuery
  const bqFunctions = [
    'syncToBigQueryManual',
    'configurarBigQuerySync',
    'desativarBigQuerySync',
    'verificarStatusBigQuery',
    'testarConexaoBigQuery'
  ];
  
  report += "\n📋 Funções BigQuery:\n";
  bqFunctions.forEach(func => {
    try {
      if (typeof eval(func) === 'function') {
        report += `✅ ${func}\n`;
      } else {
        report += `❌ ${func} NÃO encontrada\n`;
      }
    } catch (e) {
      report += `❌ ${func} com erro: ${e.message}\n`;
    }
  });
  
  // 5. Verificar outras funções críticas do menu
  const menuFunctions = [
    'ativarAutoSync',
    'startPipeline',
    'startWon',
    'startLost',
    'resetPanel'
  ];
  
  report += "\n📋 Funções do Menu Principal:\n";
  menuFunctions.forEach(func => {
    try {
      if (typeof eval(func) === 'function') {
        report += `✅ ${func}\n`;
      } else {
        report += `❌ ${func} NÃO encontrada\n`;
      }
    } catch (e) {
      report += `❌ ${func} com erro: ${e.message}\n`;
    }
  });
  
  // 6. Listar todos os arquivos .gs
  report += "\n📁 Arquivos detectados:\n";
  report += "(Esta informação só está disponível via interface do Apps Script)\n";
  report += "Verifique se você tem:\n";
  report += "- MenuOpen.gs (NOVO)\n";
  report += "- SheetCode.gs (sem onOpen)\n";
  report += "- Dashboard (Firebase)\n";
  report += "- BigQuerySync.gs\n";
  report += "- Outros arquivos existentes\n";
  
  Logger.log(report);
  ui.alert("Diagnóstico Completo", report, ui.ButtonSet.OK);
  
  return report;
}

/**
 * Força execução do onOpen para testar
 */
function forceOnOpen() {
  try {
    onOpen();
    SpreadsheetApp.getUi().alert("✅ Menu carregado com sucesso!\n\nRecarregue a planilha (F5) para ver o menu.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ ERRO:\n\n" + e.message + "\n\nStack:\n" + e.stack);
  }
}
