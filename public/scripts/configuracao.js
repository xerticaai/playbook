// Configuração global: URL da API, constantes, helpers log/icon
// Função de log (wrapper para console.log)
const log = (...args) => console.log(...args);

// Helper function para ícones SVG
const icon = (name, size = '') => {
  const sizeClass = size === 'lg' ? 'icon-lg' : '';
  return `<svg class="icon ${sizeClass}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
};

// Endpoints (Firebase Hosting -> Cloud Functions / Cloud Run)
const API_BASE_URL = (() => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8080';
  }
  // In production (Firebase Hosting), use empty string for relative URLs
  // Firebase will proxy /api/** to Cloud Run automatically
  if (window.location.hostname.includes('web.app')) {
    return ''; // Relative URLs will use Firebase proxy
  }
  // Fallback to Cloud Run URL directly
  return 'https://sales-intelligence-api-j7loux7yta-uc.a.run.app';
})();
const DASHBOARD_API_URL = API_BASE_URL;
const ML_API_URL = API_BASE_URL;
window.API_BASE_URL = API_BASE_URL;
const USER_CONTEXT_ENDPOINTS = API_BASE_URL
  ? [`${API_BASE_URL}/api/user-context`]
  : [
      'https://sales-intelligence-api-j7loux7yta-uc.a.run.app/api/user-context',
      '/api/user-context'
    ];
const ADMIN_ALLOWED_EMAILS = [
  'amalia.silva@xertica.com',
  'barbara.pessoa@xertica.com',
  'gustavo.paula@xertica.com'
];
let currentUserEmail = null;
let isAdminUser = false;
let adminPreviewEnabled = false;

const STAGNANT_ALERT_WEBHOOK_URL = 'https://script.google.com/a/macros/xertica.com/s/AKfycbyUrKHd-DZMfNI0_1dYl47S7MBAZuv_jnlm12_TD5vxA16WVUlOHLauQMmRtpJsLCF9/exec';
const STAGNANT_ALERT_SECRET = '';
window.STAGNANT_ALERT_WEBHOOK_URL = STAGNANT_ALERT_WEBHOOK_URL;
window.STAGNANT_ALERT_SECRET = STAGNANT_ALERT_SECRET;

