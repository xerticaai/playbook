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
const ADMIN_ALLOWED_EMAIL = 'amalia.silva@xertica.com';
let currentUserEmail = null;
let isAdminUser = false;
let adminPreviewEnabled = false;

