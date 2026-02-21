// Estado global: DATA, availableSellers, selectedSellers
let DATA = {
  l10: {},
  executive: {},
  fsrScorecard: [],
  fsrMetrics: {},
  insights: { topWinFactors: [], topLossCauses: [] },
  insightsRag: {},
  aiAnalysis: {},
  weeklyAgenda: {},
  updatedAt: new Date().toISOString(),
  quarterLabel: 'N/A'
};

// Multi-select seller state
let availableSellers = {
  active: [],
  historical: []
};
let selectedSellers = [];

/* ========================
   MULTI-SELECT SELLERS
   ======================== */

