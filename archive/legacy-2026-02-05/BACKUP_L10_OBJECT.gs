/**
 * BACKUP DO OBJETO L10 - DELETADO EM 2026-02-05
 * 
 * Este código foi removido de DashboardCode.gs como parte da migração
 * para Cloud Function (Python/BigQuery).
 * 
 * CONTEXTO: Usuário solicitou "MIL VEZES" passar cálculos para Python.
 * Todos os cálculos agora são feitos em main.py e retornados em cloudAnalysis.
 * 
 * Dashboard.html agora lê de:
 * - cloudAnalysis.pipeline_analysis.executive.*
 * - cloudAnalysis.closed_analysis.closed_quarter.forecast_specialist.*
 * 
 * Este backup serve apenas para referência/rollback de emergência.
 */

// Código original do DashboardCode.gs (linhas 1680-1869):

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
