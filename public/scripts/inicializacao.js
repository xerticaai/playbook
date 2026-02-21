// Inicialização: DOMContentLoaded – ponto de entrada da aplicação
document.addEventListener('DOMContentLoaded', async () => {
  // Default do filtro global de período: semana vigente (segunda até hoje)
  // (aplica-se principalmente às Atividades da Pauta Semanal)
  try {
    const dateStartFilter = document.getElementById('date-start-filter');
    const dateEndFilter = document.getElementById('date-end-filter');
    const hasStart = !!(dateStartFilter && dateStartFilter.value);
    const hasEnd = !!(dateEndFilter && dateEndFilter.value);

    if (dateStartFilter && dateEndFilter && !hasStart && !hasEnd) {
      const today = new Date();
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const start = new Date(end);
      const day = start.getDay();
      // JS: 0=Domingo..6=Sábado. Queremos segunda.
      const diffToMonday = (day + 6) % 7;
      start.setDate(start.getDate() - diffToMonday);

      const toIso = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };

      dateStartFilter.value = toIso(start);
      dateEndFilter.value = toIso(end);
      log('[FILTERS] Período default (semana vigente):', dateStartFilter.value, '→', dateEndFilter.value);
    }
  } catch (e) {
    // Não bloquear inicialização
    console.warn('Falha ao aplicar período default:', e);
  }

  await resolveAdminAccess();
  if (typeof initGlobalFiltersPanel === 'function') {
    initGlobalFiltersPanel();
  }
  if (typeof initAdvancedMultiSelects === 'function') {
    initAdvancedMultiSelects();
  }
  loadSellers(); // Load available sellers for multi-select
  if (typeof loadAdvancedFilterOptions === 'function') {
    loadAdvancedFilterOptions();
  }
  loadDashboardData();
  enhanceAllKpiCards(document);
  initKpiCardInfoObserver();
});

// Função para recarregar dashboard quando filtros mudam (COM DEBOUNCE)
