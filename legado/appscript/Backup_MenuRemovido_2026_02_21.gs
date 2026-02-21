/**
 * Backup_MenuRemovido_2026_02_21.gs
 * Backup das entradas removidas do menu em 2026-02-21.
 *
 * Objetivo:
 * - Guardar referência das funções que foram retiradas da UI (menu)
 * - Permitir restauração rápida caso necessário
 *
 * Observação:
 * - As funções originais permanecem no projeto (não foram excluídas do código-fonte)
 * - Este arquivo serve como inventário de rollback do menu
 */

function getBackupMenuRemovido_2026_02_21_() {
  return {
    removidoDeSistemaAutomatico: [
      { label: '🔄 Processar Mudanças Manualmente', handler: 'processarMudancasManual' }
    ],

    removidoDeAnalisesManuais: [
      { label: '📊 Analisar Pipeline (Open)', handler: 'startPipeline' },
      { label: '✅ Analisar Ganhas (Won)', handler: 'startWon' },
      { label: '❌ Analisar Perdidas (Lost)', handler: 'startLost' },
      { label: '🔧 Corrigir Change Tracking (Ganhas/Perdidas)', handler: 'corrigirChangeTrackingClosedDeals' },
      { label: '📊 Normalizar Datas + Recalcular Fiscal Q/Ciclo', handler: 'recalcularFiscalQTodasAnalises' },
      { label: '🛠️ Atualizar Data Prevista + Fiscal Q (Pipeline)', handler: 'atualizarDataPrevistaEFiscalQPipeline' },
      { label: '🧩 Preencher Data de criação (Pipeline → Análise)', handler: 'preencherDataCriacaoPipelineAnaliseUnico' },
      { label: '🏷️ Enriquecer Forecast (Preventa + Segmentação IA)', handler: 'enriquecerForecastComSegmentacaoIA' },
      { label: '🧩 Enriquecer Forecast (Segmento/Portfólio/FDM)', handler: 'enriquecerForecastComDimensoesNegocio' },
      { label: '🏷️ Enriquecer Ganhas (Segmentação IA)', handler: 'enriquecerAnaliseGanhasComSegmentacaoIA' },
      { label: '🧩 Enriquecer Ganhas (Segmento/Portfólio/FDM)', handler: 'enriquecerAnaliseGanhasComDimensoesNegocio' },
      { label: '🏷️ Enriquecer Perdidas (Segmentação IA)', handler: 'enriquecerAnalisePerdidasComSegmentacaoIA' },
      { label: '🧩 Enriquecer Perdidas (Segmento/Portfólio/FDM)', handler: 'enriquecerAnalisePerdidasComDimensoesNegocio' },
      { label: '🏷️ Enriquecer Todas Análises (IA)', handler: 'enriquecerTodasAnalisesComSegmentacaoIA' },
      { label: '🔄 Limpar + Reclassificar Forecast', handler: 'limparEReenriquecerForecast' },
      { label: '🔄 Limpar + Reclassificar Ganhas', handler: 'limparEReenriquecerGanhas' },
      { label: '🔄 Limpar + Reclassificar Perdidas', handler: 'limparEReenriquecerPerdidas' },
      { label: '🔄 Limpar + Reclassificar Todas', handler: 'limparEReenriquecerTodas' },
      { label: '🧪 TESTE: Forecast (5 linhas)', handler: 'enriquecerForecast_TESTE_5_LINHAS' },
      { label: '🧪 TESTE: Forecast Dimensões (5 linhas)', handler: 'enriquecerForecastDimensoes_TESTE_5_LINHAS' },
      { label: '🧪 TESTE: Ganhas (5 linhas)', handler: 'enriquecerGanhas_TESTE_5_LINHAS' },
      { label: '🧪 TESTE: Ganhas Dimensões (5 linhas)', handler: 'enriquecerGanhasDimensoes_TESTE_5_LINHAS' },
      { label: '🧪 TESTE: Perdidas (5 linhas)', handler: 'enriquecerPerdidas_TESTE_5_LINHAS' },
      { label: '🧪 TESTE: Perdidas Dimensões (5 linhas)', handler: 'enriquecerPerdidasDimensoes_TESTE_5_LINHAS' },
      { label: '🔍 Diagnosticar Disponibilidade IA', handler: 'diagnosticarDisponibilidadeIA' },
      { label: '⏰ Atualizar Timestamps', handler: 'atualizarTimestampsManual' },
      { label: '📋 Relatório de Qualidade de Dados', handler: 'gerarRelatorioQualidadeDados' }
    ],

    removidoDeFerramentasDiagnostico: [
      { label: '💊 Health Check Completo', handler: 'runHealthCheck' },
      { label: '⚡ Teste Rápido de API', handler: 'runQuickTest' },
      { label: '🧹 Ativar Normalização Automática (30 min)', handler: 'configurarNormalizacaoDatasAutomatica' },
      { label: '🛑 Desativar Normalização Automática', handler: 'desativarNormalizacaoDatasAutomatica' },
      { label: '🩺 Diagnosticar Flags do Sistema', handler: 'diagnosticarFlags' },
      { label: '🧹 Limpar Flags Residuais', handler: 'limparFlagsResiduais' },
      { label: '🔄 Ativar Auditoria Automática (15 min)', handler: 'configurarAuditoriaAutomatica' },
      { label: '⏸️ Desativar Auditoria Automática', handler: 'desativarAuditoriaAutomatica' },
      { label: '🗑️ Limpar Logs Antigos', handler: 'limparLogsManualmente' },
      { label: '⚙️ Instalar Todos os Triggers (automático)', handler: 'instalarTodosTriggers' }
    ],

    mantidoNoMenu: [
      { label: '🧹 Normalizar Datas (todas as abas)', handler: 'normalizarDatasTodasAbas' },
      { label: '📋 Auditoria: Base vs Análise', handler: 'auditarBaseVsAnalise' },
      { label: '📋 Gerar Tabela de Identificação', handler: 'gerarTabelaIdentificacaoAliases' }
    ]
  };
}
