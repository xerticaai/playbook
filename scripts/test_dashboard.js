#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const DEFAULT_DASHBOARD_URL = 'https://sales-intelligence-engine-run-j7loux7yta-uc.a.run.app';
const DEFAULT_ML_URL = 'https://sales-intelligence-engine-run-j7loux7yta-uc.a.run.app/ml-intelligence';
const DEFAULT_PROJECT_ID = 'operaciones-br';
const DEFAULT_DATASET_ID = 'sales_intelligence';
const DEFAULT_LOCATION = 'us-central1';

const args = process.argv.slice(2);
const argValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const dashboardUrl = argValue('--dashboard-url') || DEFAULT_DASHBOARD_URL;
const mlUrl = argValue('--ml-url') || DEFAULT_ML_URL;
const projectId = argValue('--project') || DEFAULT_PROJECT_ID;
const datasetId = argValue('--dataset') || DEFAULT_DATASET_ID;
const location = argValue('--location') || DEFAULT_LOCATION;
const skipMl = args.includes('--skip-ml');
const skipBq = args.includes('--skip-bq');
const skipStatic = args.includes('--skip-static');
const forceRefresh = args.includes('--force-refresh');
const htmlPath = argValue('--html') || path.join(__dirname, '..', 'public', 'index.html');
const mainPath = argValue('--main') || path.join(__dirname, '..', 'cloud-function', 'main.py');
const dashboardCalcPath = argValue('--dashboard-calc') || path.join(__dirname, '..', 'cloud-function', 'dashboard_calculations.py');

const getPath = (obj, pathStr) => {
  if (!obj) return undefined;
  return pathStr.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

const ensure = (label, condition, failures) => {
  if (!condition) {
    failures.push(label);
  }
};

const extractIdsFromHtml = (html) => {
  const ids = new Set();
  const idRegex = /id="([^"]+)"/g;
  let match;
  while ((match = idRegex.exec(html))) {
    ids.add(match[1]);
  }
  return ids;
};

const extractReferencedIds = (source) => {
  const ids = new Set();
  const patterns = [
    /setTextSafe\('\s*([^']+)\s*'\)/g,
    /setHtmlSafe\('\s*([^']+)\s*'\)/g,
    /setBarSafe\('\s*([^']+)\s*'\)/g,
    /document\.getElementById\('\s*([^']+)\s*'\)/g
  ];

  patterns.forEach((regex) => {
    let match;
    while ((match = regex.exec(source))) {
      ids.add(match[1]);
    }
  });

  return ids;
};

const reportIdDiffs = (htmlIds, referencedIds) => {
  const missing = [];
  referencedIds.forEach((id) => {
    if (!htmlIds.has(id)) {
      missing.push(id);
    }
  });
  return missing;
};

const getFetch = async () => {
  if (typeof fetch !== 'undefined') {
    return fetch;
  }
  throw new Error('fetch() nao disponivel. Use Node 18+ ou instale um polyfill.');
};

const fetchJson = async (url, payload, extraHeaders = {}) => {
  const fetchFn = await getFetch();
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Resposta nao-JSON de ${url}: ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} de ${url}: ${text.slice(0, 500)}`);
  }

  return data;
};

const runBqQuery = (sql) => {
  const { execSync } = require('child_process');
  const cmd = [
    'bq',
    'query',
    '--format=json',
    '--use_legacy_sql=false',
    `'${sql.replace(/'/g, "''")}'`
  ].join(' ');

  const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  return JSON.parse(output || '[]');
};

const readFileSafe = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
};

const extractConstant = (source, name) => {
  const regex = new RegExp(`${name}\\s*=\\s*['\"]([^'\"]+)['\"]`);
  const match = source.match(regex);
  return match ? match[1] : null;
};

const approxEqual = (a, b, tolerance = 0.01) => {
  if (a === 0 && b === 0) return true;
  const diff = Math.abs(a - b);
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / max <= tolerance;
};

const run = async () => {
  console.log('=== TESTE COMPLETO INDEX.HTML ===');
  console.log(`Dashboard URL: ${dashboardUrl}`);
  console.log(`ML URL: ${mlUrl}`);
  console.log(`HTML: ${htmlPath}`);
  console.log(`Main.py: ${mainPath}`);
  console.log(`Dashboard calculations: ${dashboardCalcPath}`);
  console.log(`Project: ${projectId}`);
  console.log(`Dataset: ${datasetId}`);
  console.log(`Location: ${location}`);

  const failures = [];

  let html;
  try {
    html = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    console.error('Falha ao ler index.html:', err.message);
    process.exit(2);
  }

  const htmlIds = extractIdsFromHtml(html);
  const referencedIds = extractReferencedIds(html);
  const missingIds = reportIdDiffs(htmlIds, referencedIds);

  if (missingIds.length) {
    failures.push('IDs referenciados no JS nao existem no HTML');
    console.log('\n[HTML] IDs ausentes no HTML:');
    missingIds.forEach((id) => console.log(`- ${id}`));
  } else {
    console.log('\n[HTML] OK: todos os IDs referenciados existem no HTML.');
  }

  if (!skipStatic) {
    console.log('\n[STATIC] Validando constantes e modulos...');
    const mainSource = readFileSafe(mainPath);
    const dashboardCalcSource = readFileSafe(dashboardCalcPath);
    if (!mainSource) {
      failures.push('main.py nao encontrado');
    } else {
      const projectConst = extractConstant(mainSource, 'PROJECT_ID');
      const datasetConst = extractConstant(mainSource, 'DATASET_ID');
      const locationConst = extractConstant(mainSource, 'LOCATION');
      ensure('PROJECT_ID divergente', projectConst === projectId, failures);
      ensure('DATASET_ID divergente', datasetConst === datasetId, failures);
      ensure('LOCATION divergente', locationConst === location, failures);
    }

    if (!dashboardCalcSource) {
      failures.push('dashboard_calculations.py nao encontrado');
    } else {
      const hasBuild = /def\s+build_dashboard_metrics\s*\(/.test(dashboardCalcSource);
      ensure('build_dashboard_metrics nao encontrado', hasBuild, failures);
    }
  }

  const dashboardPayload = {
    source: 'bigquery',
    filters: {},
    force_refresh: forceRefresh
  };

  const extraHeaders = forceRefresh ? { 'X-Force-Refresh': '1' } : {};

  let dashboard;
  try {
    dashboard = await fetchJson(dashboardUrl, dashboardPayload, extraHeaders);
  } catch (err) {
    console.error('\n[DASHBOARD] Falha ao buscar dashboard:', err.message);
    process.exit(2);
  }

  console.log('\n[DASHBOARD] Resposta recebida. Validando payload...');

  ensure('status != success', dashboard && dashboard.status === 'success', failures);

  ensure('pipeline_analysis.executive.pipeline_all.gross', getPath(dashboard, 'pipeline_analysis.executive.pipeline_all.gross') !== undefined, failures);
  ensure('pipeline_analysis.executive.pipeline_all.net', getPath(dashboard, 'pipeline_analysis.executive.pipeline_all.net') !== undefined, failures);
  ensure('pipeline_analysis.executive.pipeline_all.deals_count', getPath(dashboard, 'pipeline_analysis.executive.pipeline_all.deals_count') !== undefined, failures);
  ensure('pipeline_analysis.executive.pipeline_by_quarter', typeof getPath(dashboard, 'pipeline_analysis.executive.pipeline_by_quarter') === 'object', failures);

  ensure('closed_analysis.closed_quarter', getPath(dashboard, 'closed_analysis.closed_quarter') !== undefined, failures);
  ensure('closed_analysis.closed_quarter.closed', getPath(dashboard, 'closed_analysis.closed_quarter.closed') !== undefined, failures);
  ensure('closed_analysis.win_rate_by_seller', getPath(dashboard, 'closed_analysis.win_rate_by_seller') !== undefined, failures);

  ensure('aggregations.by_forecast_category', Array.isArray(getPath(dashboard, 'aggregations.by_forecast_category')), failures);

  const weeklyAgenda = getPath(dashboard, 'weekly_agenda') || {};
  ensure('weekly_agenda vazio', Object.keys(weeklyAgenda).length > 0, failures);

  const wordClouds = getPath(dashboard, 'word_clouds') || {};
  const wordCloudKeys = ['winTypes', 'winLabels', 'lossTypes', 'lossLabels', 'riskFlags', 'actionLabels'];
  wordCloudKeys.forEach((key) => {
    const values = wordClouds[key] || [];
    ensure(`word_clouds.${key} vazio`, Array.isArray(values) && values.length > 0, failures);
  });

  const aiAnalysis = getPath(dashboard, 'ai_analysis') || {};
  const aiKeys = ['executive', 'winsInsights', 'lossInsights', 'topOpportunitiesAnalysis', 'forecastAnalysis'];
  aiKeys.forEach((key) => {
    const value = aiAnalysis[key];
    ensure(`ai_analysis.${key} vazio`, typeof value === 'string' && value.trim().length > 0, failures);
  });

  ensure('won_agg vazio', Array.isArray(getPath(dashboard, 'won_agg')) && getPath(dashboard, 'won_agg').length > 0, failures);
  ensure('lost_agg vazio', Array.isArray(getPath(dashboard, 'lost_agg')) && getPath(dashboard, 'lost_agg').length > 0, failures);

  const dashboardMetrics = getPath(dashboard, 'dashboard_metrics') || null;
  if (dashboardMetrics) {
    const pipelineAll = getPath(dashboard, 'pipeline_analysis.executive.pipeline_all') || {};
    const pipelineTotal = dashboardMetrics.pipeline_total || {};
    ensure('dashboard_metrics.pipeline_total.gross inconsistente', approxEqual(pipelineAll.gross || 0, pipelineTotal.gross || 0), failures);
    ensure('dashboard_metrics.pipeline_total.net inconsistente', approxEqual(pipelineAll.net || 0, pipelineTotal.net || 0), failures);

    const forecastCategories = getPath(dashboard, 'aggregations.by_forecast_category') || [];
    const above50GrossCalc = forecastCategories
      .filter((cat) => ['COMMIT', 'UPSIDE'].includes((cat.category || '').toUpperCase()))
      .reduce((sum, cat) => sum + (cat.total_gross || 0), 0);
    const above50Metric = dashboardMetrics.forecast_ai_over_50 || {};
    ensure('dashboard_metrics.forecast_ai_over_50.gross inconsistente', approxEqual(above50GrossCalc, above50Metric.gross || 0), failures);
  }

  if (!skipBq) {
    console.log('\n[BIGQUERY] Validando dados no BigQuery...');
    try {
      const pipelineStats = runBqQuery(
        'SELECT COUNT(*) AS total, COUNT(Data_Prevista) AS com_prevista FROM `' +
          projectId +
          '.' +
          datasetId +
          '.pipeline`'
      );
      const pipelineRow = pipelineStats[0] || {};
      ensure('pipeline total == 0', Number(pipelineRow.total || 0) > 0, failures);
      ensure('pipeline sem Data_Prevista', Number(pipelineRow.com_prevista || 0) > 0, failures);

      const closedWonStats = runBqQuery(
        'SELECT COUNT(*) AS total, COUNT(Data_Fechamento) AS com_fechamento FROM `' +
          projectId +
          '.' +
          datasetId +
          '.closed_deals_won`'
      );
      const closedLostStats = runBqQuery(
        'SELECT COUNT(*) AS total, COUNT(Data_Fechamento) AS com_fechamento FROM `' +
          projectId +
          '.' +
          datasetId +
          '.closed_deals_lost`'
      );
      const wonRow = closedWonStats[0] || {};
      const lostRow = closedLostStats[0] || {};
      ensure('closed_deals_won total == 0', Number(wonRow.total || 0) > 0, failures);
      ensure('closed_deals_won sem Data_Fechamento', Number(wonRow.com_fechamento || 0) > 0, failures);
      ensure('closed_deals_lost total == 0', Number(lostRow.total || 0) > 0, failures);
      ensure('closed_deals_lost sem Data_Fechamento', Number(lostRow.com_fechamento || 0) > 0, failures);

      const specialistStats = runBqQuery(
        'SELECT COUNT(*) AS total, COUNT(closed_date) AS com_close FROM `' +
          projectId +
          '.' +
          datasetId +
          '.sales_specialist`'
      );
      const specialistRow = specialistStats[0] || {};
      ensure('sales_specialist total == 0', Number(specialistRow.total || 0) > 0, failures);
      ensure('sales_specialist sem closed_date', Number(specialistRow.com_close || 0) > 0, failures);
    } catch (err) {
      failures.push(`Falha ao validar BigQuery: ${err.message}`);
    }
  }

  if (!skipMl) {
    let mlData;
    try {
      mlData = await fetchJson(mlUrl, { source: 'bigquery', filters: {} }, extraHeaders);
    } catch (err) {
      console.error('\n[ML] Falha ao buscar ML:', err.message);
      failures.push('ML endpoint indisponivel');
      mlData = null;
    }

    if (mlData) {
      console.log('\n[ML] Resposta recebida. Validando modelos...');
      ensure('ml status != success', mlData.status === 'success', failures);
      const requiredModels = [
        'previsao_ciclo',
        'classificador_perda',
        'risco_abandono',
        'performance_vendedor',
        'prioridade_deals',
        'proxima_acao'
      ];
      requiredModels.forEach((model) => {
        const modelData = mlData[model];
        ensure(`ML.${model} ausente`, modelData !== undefined, failures);
        ensure(`ML.${model}.deals ausente`, Array.isArray(modelData?.deals), failures);
      });
    }
  }

  if (failures.length) {
    console.log('\n=== RESULTADO: FALHAS ENCONTRADAS ===');
    failures.forEach((item, idx) => console.log(`${idx + 1}. ${item}`));
    process.exit(1);
  }

  console.log('\n=== RESULTADO: OK ===');
  console.log('Payload do dashboard e ML validado com sucesso.');
};

run().catch((err) => {
  console.error('Erro inesperado:', err.message);
  process.exit(2);
});
