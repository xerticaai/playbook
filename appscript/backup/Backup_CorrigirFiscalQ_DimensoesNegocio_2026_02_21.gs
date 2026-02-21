/**
 * Backup de funções de Dimensões de Negócio removidas de CorrigirFiscalQ.gs em 2026-02-21.
 */

function enriquecerForecastComDimensoesNegocio() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  if (ui) {
    const r = ui.alert(
      '🧩 Enriquecer Forecast (Segmento/Portfólio/FDM)',
      'Esta função preenche na aba "🎯 Análise Forecast IA":\n\n' +
      '• Subsegmento de mercado\n' +
      '• Segmento Consolidado (primário)\n' +
      '• Portfólio (Categoria SDR)\n' +
      '• Portfolio FDM (derivado de Produtos/Família)\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (r !== ui.Button.YES) return;
  }

  const result = enriquecerForecastComDimensoesNegocio_();
  const msg =
    `✅ Enriquecimento de dimensões concluído!\n\n` +
    `Linhas processadas: ${result.total}\n` +
    `Linhas puladas (já preenchidas): ${result.linhasPuladas}\n` +
    `Campos atualizados: ${result.camposAtualizados}\n` +
    `Colunas inseridas: ${result.colunasInseridas}`;

  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  else console.log(msg);
}

function enriquecerForecastDimensoes_TESTE_5_LINHAS() {
  const result = enriquecerAnaliseComDimensoesNegocio_(
    '🎯 Análise Forecast IA',
    (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto',
    5
  );
  console.log(`🧪 TESTE (5 linhas) dimensões: ${JSON.stringify(result)}`);
  return result;
}

function enriquecerForecastComDimensoesNegocio_() {
  return enriquecerAnaliseComDimensoesNegocio_(
    '🎯 Análise Forecast IA',
    (typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto'
  );
}

function enriquecerAnaliseGanhasComDimensoesNegocio() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  if (ui) {
    const r = ui.alert(
      '🧩 Enriquecer Ganhas (Segmento/Portfólio/FDM)',
      'Esta função preenche na aba "📈 Análise Ganhas":\n\n' +
      '• Subsegmento de mercado\n' +
      '• Segmento Consolidado (primário)\n' +
      '• Portfólio (Categoria SDR)\n' +
      '• Portfolio FDM (derivado de Produtos/Família)\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (r !== ui.Button.YES) return;
  }

  const result = enriquecerAnaliseGanhasComDimensoesNegocio_();
  const msg =
    `✅ Enriquecimento de dimensões (Ganhas) concluído!\n\n` +
    `Linhas processadas: ${result.total}\n` +
    `Linhas puladas (já preenchidas): ${result.linhasPuladas}\n` +
    `Campos atualizados: ${result.camposAtualizados}\n` +
    `Colunas inseridas: ${result.colunasInseridas}`;

  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  else console.log(msg);
}

function enriquecerAnaliseGanhasComDimensoesNegocio_() {
  return enriquecerAnaliseComDimensoesNegocio_(
    '📈 Análise Ganhas',
    (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos'
  );
}

function enriquecerGanhasDimensoes_TESTE_5_LINHAS() {
  const result = enriquecerAnaliseComDimensoesNegocio_(
    '📈 Análise Ganhas',
    (typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos',
    5
  );
  console.log(`🧪 TESTE (5 linhas) dimensões GANHAS: ${JSON.stringify(result)}`);
  return result;
}

function enriquecerAnalisePerdidasComDimensoesNegocio() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  if (ui) {
    const r = ui.alert(
      '🧩 Enriquecer Perdidas (Segmento/Portfólio/FDM)',
      'Esta função preenche na aba "📉 Análise Perdidas":\n\n' +
      '• Subsegmento de mercado\n' +
      '• Segmento Consolidado (primário)\n' +
      '• Portfólio (Categoria SDR)\n' +
      '• Portfolio FDM (derivado de Produtos/Família)\n\n' +
      'Continuar?',
      ui.ButtonSet.YES_NO
    );
    if (r !== ui.Button.YES) return;
  }

  const result = enriquecerAnalisePerdidasComDimensoesNegocio_();
  const msg =
    `✅ Enriquecimento de dimensões (Perdidas) concluído!\n\n` +
    `Linhas processadas: ${result.total}\n` +
    `Linhas puladas (já preenchidas): ${result.linhasPuladas}\n` +
    `Campos atualizados: ${result.camposAtualizados}\n` +
    `Colunas inseridas: ${result.colunasInseridas}`;

  if (ui) ui.alert('✅ Concluído', msg, ui.ButtonSet.OK);
  else console.log(msg);
}

function enriquecerAnalisePerdidasComDimensoesNegocio_() {
  return enriquecerAnaliseComDimensoesNegocio_(
    '📉 Análise Perdidas',
    (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas'
  );
}

function enriquecerPerdidasDimensoes_TESTE_5_LINHAS() {
  const result = enriquecerAnaliseComDimensoesNegocio_(
    '📉 Análise Perdidas',
    (typeof SHEETS !== 'undefined' && SHEETS.PERDIDAS) ? SHEETS.PERDIDAS : 'Historico_Perdidas',
    5
  );
  console.log(`🧪 TESTE (5 linhas) dimensões PERDIDAS: ${JSON.stringify(result)}`);
  return result;
}

function derivePortfolioFromCategoriaSDR_(categoriaSDR) {
  const categoria = String(categoriaSDR || '').trim();
  if (categoria) return categoria;
  return '';
}

function derivePortfolioFromBase_(portfolioBase) {
  return String(portfolioBase || '').trim();
}

function enriquecerAnaliseComDimensoesNegocio_(analysisSheetName, baseSheetName, maxLinesToProcess) {
  const ANALYSIS_SHEET = '🎯 Análise Forecast IA';
  const LAST_UPDATE_HEADER = '🕐 Última Atualização';
  const REQUIRED_HEADERS = [
    'Subsegmento de mercado',
    'Segmento Consolidado',
    'Portfólio',
    'Portfolio FDM'
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const analysisSheet = ss.getSheetByName(analysisSheetName || ANALYSIS_SHEET);
  if (!analysisSheet) throw new Error(`Aba ${analysisSheetName || ANALYSIS_SHEET} não encontrada`);

  const colunasInseridas = ensureColumnsBeforeLastUpdate_(analysisSheet, REQUIRED_HEADERS, LAST_UPDATE_HEADER);

  const analysisLastRow = analysisSheet.getLastRow();
  const analysisMaxCol = analysisSheet.getMaxColumns();
  if (analysisLastRow <= 1 || analysisMaxCol <= 0) {
    return { total: 0, linhasPuladas: 0, camposAtualizados: 0, colunasInseridas, erros: 0 };
  }

  const analysisRange = analysisSheet.getRange(1, 1, analysisLastRow, analysisMaxCol);
  const analysisData = analysisRange.getValues();
  const analysisHeaders = analysisData[0];
  const outputRows = analysisData.slice(1).map(r => r.slice());

  const baseSheet = ss.getSheetByName(baseSheetName);
  if (!baseSheet) throw new Error(`Aba base "${baseSheetName}" não encontrada`);
  if (baseSheet.getLastRow() <= 1) {
    return { total: 0, linhasPuladas: 0, camposAtualizados: 0, colunasInseridas, erros: 0, skipped: true };
  }

  const baseData = baseSheet.getDataRange().getValues();
  const baseHeaders = baseData[0];
  const baseRows = baseData.slice(1);

  const colBaseOpp = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'opp')
    : findColumnByPatterns_(baseHeaders, ['nome da oportunidade', 'opportunity name', 'oportunidade']);
  const colBaseProdutos = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'prod')
    : findColumnByPatterns_(baseHeaders, ['produtos', 'products', 'product name', 'nome do produto']);
  const colBaseFamily = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'prod_family')
    : findColumnByPatterns_(baseHeaders, ['família de produtos', 'familia de produtos', 'família de produto', 'product family']);
  const colBasePortfolioXertica = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'portfolio')
    : findColumnByPatterns_(baseHeaders, ['portafolio xertica.ai', 'portafolio xertica ai', 'portfólio xertica.ai', 'portfolio xertica.ai', 'portafolio', 'portfólio', 'portfolio']);
  const colBaseCategoriaSDR = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'categoria_sdr')
    : findColumnByPatterns_(baseHeaders, ['categoria sdr', 'categoria_sdr']);
  const colBaseSubsegmento = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'subsegmento_mercado')
    : findColumnByPatterns_(baseHeaders, ['subsegmento de mercado', 'subsegmento mercado', 'subsegmento']);
  const colBaseSegmentoConsolidado = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(baseHeaders, 'segmento_consolidado')
    : findColumnByPatterns_(baseHeaders, ['segmento consolidado', 'segmento_consolidado']);

  if (colBaseOpp === -1) {
    throw new Error(`Coluna de oportunidade não encontrada na base "${baseSheetName}"`);
  }

  const baseByOpp = new Map();
  baseRows.forEach((row) => {
    const opp = String(row[colBaseOpp] || '').trim();
    if (!opp) return;
    const key = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
    if (baseByOpp.has(key)) return;
    baseByOpp.set(key, {
      produtos: colBaseProdutos > -1 ? String(row[colBaseProdutos] || '').trim() : '',
      family: colBaseFamily > -1 ? String(row[colBaseFamily] || '').trim() : '',
      portfolioBase: colBasePortfolioXertica > -1 ? String(row[colBasePortfolioXertica] || '').trim() : '',
      categoriaSDR: colBaseCategoriaSDR > -1 ? String(row[colBaseCategoriaSDR] || '').trim() : '',
      subsegmentoMercado: colBaseSubsegmento > -1 ? String(row[colBaseSubsegmento] || '').trim() : '',
      segmentoConsolidado: colBaseSegmentoConsolidado > -1 ? String(row[colBaseSegmentoConsolidado] || '').trim() : ''
    });
  });

  const colOpp = (typeof findColumnByAlias_ === 'function')
    ? findColumnByAlias_(analysisHeaders, 'opp')
    : findColumnByPatterns_(analysisHeaders, ['oportunidade', 'opportunity']);
  const colProdutos = findLastHeaderIndexExact_(analysisHeaders, 'Produtos');
  const colSubsegmento = findLastHeaderIndexExact_(analysisHeaders, 'Subsegmento de mercado');
  const colSegmentoConsolidado = findLastHeaderIndexExact_(analysisHeaders, 'Segmento Consolidado');
  const colPortfolio = findLastHeaderIndexExact_(analysisHeaders, 'Portfólio');
  const colPortfolioFDM = findLastHeaderIndexExact_(analysisHeaders, 'Portfolio FDM');

  const baseAberto = ((typeof SHEETS !== 'undefined' && SHEETS.ABERTO) ? SHEETS.ABERTO : 'Pipeline_Aberto');
  const baseGanhas = ((typeof SHEETS !== 'undefined' && SHEETS.GANHAS) ? SHEETS.GANHAS : 'Historico_Ganhos');
  const usaCategoriaSDRNoPortfolio =
    String(baseSheetName || '') === String(baseAberto) ||
    String(baseSheetName || '') === String(baseGanhas);

  const linhasAProcessar = maxLinesToProcess && maxLinesToProcess > 0
    ? Math.min(maxLinesToProcess, outputRows.length)
    : outputRows.length;

  let total = 0;
  let linhasPuladas = 0;
  let camposAtualizados = 0;
  let erros = 0;

  for (let i = 0; i < linhasAProcessar; i++) {
    try {
      const row = outputRows[i];
      const opp = colOpp > -1 ? String(row[colOpp] || '').trim() : '';
      if (!opp) {
        linhasPuladas++;
        continue;
      }

      const oppKey = (typeof normText_ === 'function') ? normText_(opp) : String(opp).toLowerCase().trim();
      const base = baseByOpp.get(oppKey);
      if (!base) {
        linhasPuladas++;
        continue;
      }

      const produtos = base.produtos || (colProdutos > -1 ? String(row[colProdutos] || '').trim() : '');
      const segmentoConsolidado = base.segmentoConsolidado || '';
      const subsegmentoMercado = base.subsegmentoMercado || '';
      const portfolioFinal = usaCategoriaSDRNoPortfolio
        ? derivePortfolioFromCategoriaSDR_(base.categoriaSDR)
        : derivePortfolioFromBase_(base.portfolioBase);
      const categoriaFDM = (typeof deriveCategoriaFDM_ === 'function')
        ? deriveCategoriaFDM_(base.family, produtos)
        : 'Outros Portfólios';

      const novosCamposJaPreenchidos =
        (colSubsegmento > -1 ? String(row[colSubsegmento] || '').trim() !== '' : true) &&
        (colSegmentoConsolidado > -1 ? String(row[colSegmentoConsolidado] || '').trim() !== '' : true) &&
        (colPortfolio > -1 ? String(row[colPortfolio] || '').trim() !== '' : true) &&
        (colPortfolioFDM > -1 ? String(row[colPortfolioFDM] || '').trim() !== '' : true);

      if (novosCamposJaPreenchidos) {
        linhasPuladas++;
        continue;
      }

      if (colSubsegmento > -1 && subsegmentoMercado && String(row[colSubsegmento] || '').trim() !== subsegmentoMercado) {
        row[colSubsegmento] = subsegmentoMercado;
        camposAtualizados++;
      }
      if (colSegmentoConsolidado > -1 && segmentoConsolidado && String(row[colSegmentoConsolidado] || '').trim() !== segmentoConsolidado) {
        row[colSegmentoConsolidado] = segmentoConsolidado;
        camposAtualizados++;
      }
      if (colPortfolio > -1 && portfolioFinal && String(row[colPortfolio] || '').trim() !== portfolioFinal) {
        row[colPortfolio] = portfolioFinal;
        camposAtualizados++;
      }
      if (colPortfolioFDM > -1 && categoriaFDM && String(row[colPortfolioFDM] || '').trim() !== categoriaFDM) {
        row[colPortfolioFDM] = categoriaFDM;
        camposAtualizados++;
      }

      total++;
    } catch (err) {
      erros++;
      console.error(`⚠️ Erro ao enriquecer dimensões na linha ${i + 2}: ${err.message}`);
    }
  }

  const expectedLength = analysisHeaders.length;
  for (let i = 0; i < outputRows.length; i++) {
    while (outputRows[i].length < expectedLength) outputRows[i].push('');
  }

  analysisSheet.getRange(2, 1, outputRows.length, analysisHeaders.length).setValues(outputRows);
  SpreadsheetApp.flush();

  return {
    total,
    linhasPuladas,
    camposAtualizados,
    colunasInseridas,
    erros
  };
}
