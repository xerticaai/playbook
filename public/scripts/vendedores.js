// Multi-select de vendedores: loadSellers, renderSellerOptions, etc.
async function loadSellers() {
  try {
    const data = await fetchJsonNoCache(`${API_BASE_URL}/api/sellers`);
    availableSellers = data;
    
    log('[SELLERS] Loaded:', {
      active: data.active.length,
      historical: data.historical.length
    });
    
    renderSellerOptions();
  } catch (e) {
    console.error('[SELLERS] Error loading:', e);
  }
}

function renderSellerOptions() {
  const activeGroup = document.getElementById('active-sellers-group');
  const historicalGroup = document.getElementById('historical-sellers-group');
  
  if (!activeGroup || !historicalGroup) return;
  
  // Clear existing options (except title)
  activeGroup.innerHTML = '<div class="multi-select-group-title">🟢 Vendedores Ativos</div>';
  historicalGroup.innerHTML = '<div class="multi-select-group-title">📜 Vendedores Históricos</div>';
  
  // Render active sellers
  availableSellers.active.forEach(seller => {
    const option = createSellerOption(seller.Vendedor, seller.deals_pipeline, true);
    activeGroup.appendChild(option);
  });
  
  // Render historical sellers
  availableSellers.historical.forEach(seller => {
    const option = createSellerOption(seller.Vendedor, seller.deals_won + seller.deals_lost, false);
    historicalGroup.appendChild(option);
  });
}

function createSellerOption(name, dealsCount, isActive) {
  const div = document.createElement('div');
  div.className = 'multi-select-option';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = `seller-${name.replace(/\s/g, '-')}`;
  checkbox.value = name;
  checkbox.onchange = () => onSellerChange();
  
  const label = document.createElement('label');
  label.setAttribute('for', checkbox.id);
  
  const nameSpan = document.createElement('span');
  nameSpan.textContent = name;
  
  const badge = document.createElement('span');
  badge.className = 'multi-select-option-badge';
  badge.textContent = dealsCount;
  
  label.appendChild(nameSpan);
  label.appendChild(badge);
  
  div.appendChild(checkbox);
  div.appendChild(label);
  
  return div;
}

function toggleSellerDropdown() {
  const container = document.getElementById('seller-multi-select');
  const trigger = container?.querySelector('.multi-select-trigger');
  const dropdown = document.getElementById('seller-dropdown');
  if (!trigger || !dropdown) return;

  const isOpening = !trigger.classList.contains('open');
  trigger.classList.toggle('open');
  dropdown.classList.toggle('open');

  if (isOpening) {
    setTimeout(() => {
      const searchInput = document.getElementById('seller-search');
      if (searchInput) searchInput.focus();
    }, 50);
  } else {
    const searchInput = document.getElementById('seller-search');
    if (searchInput) {
      searchInput.value = '';
      filterSellerOptions('');
    }
  }
}

function filterSellerOptions(query) {
  const q = String(query || '').trim().toLowerCase();
  ['active-sellers-group', 'historical-sellers-group'].forEach(groupId => {
    const group = document.getElementById(groupId);
    if (!group) return;
    const options = group.querySelectorAll('.multi-select-option');
    let visibleCount = 0;
    options.forEach(opt => {
      const label = opt.querySelector('label span')?.textContent?.toLowerCase() || '';
      const matches = !q || label.includes(q);
      opt.style.display = matches ? '' : 'none';
      if (matches) visibleCount++;
    });
    // Mostra/oculta o título do grupo se não tiver nenhum resultado
    const title = group.querySelector('.multi-select-group-title');
    if (title) title.style.display = visibleCount === 0 && q ? 'none' : '';
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const container = document.getElementById('seller-multi-select');
  if (container && !container.contains(e.target)) {
    const trigger = container.querySelector('.multi-select-trigger');
    const dropdown = document.getElementById('seller-dropdown');
    if (trigger?.classList.contains('open')) {
      trigger.classList.remove('open');
      dropdown?.classList.remove('open');
      const searchInput = document.getElementById('seller-search');
      if (searchInput) { searchInput.value = ''; filterSellerOptions(''); }
    }
  }
});

function onSellerChange() {
  const checkboxes = document.querySelectorAll('#seller-dropdown input[type="checkbox"]');
  selectedSellers = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  
  updateSellerTriggerText();
  
  // Reload dashboard with selected sellers
  reloadDashboard();
}

function updateSellerTriggerText() {
  const triggerText = document.getElementById('seller-selected-text');
  
  if (selectedSellers.length === 0) {
    triggerText.textContent = 'Todos os Vendedores';
    triggerText.style.color = '#ffffff';
  } else if (selectedSellers.length === 1) {
    triggerText.textContent = selectedSellers[0];
    triggerText.style.color = 'var(--primary-cyan)';
  } else {
    triggerText.textContent = `${selectedSellers.length} vendedores`;
    triggerText.style.color = 'var(--primary-cyan)';
  }
}

function selectAllSellers() {
  const checkboxes = document.querySelectorAll('#seller-dropdown input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = true);
  onSellerChange();
}

function selectActiveSellers() {
  const checkboxes = document.querySelectorAll('#seller-dropdown input[type="checkbox"]');
  checkboxes.forEach(cb => {
    const sellerName = (cb.value || '').trim().toLowerCase();
    const isActive = availableSellers.active.some(s => ((s.Vendedor || '').trim().toLowerCase()) === sellerName);
    cb.checked = isActive;
  });
  onSellerChange();
}

function clearAllSellers() {
  const checkboxes = document.querySelectorAll('#seller-dropdown input[type="checkbox"]');
  checkboxes.forEach(cb => cb.checked = false);
  onSellerChange();
}

/* ========================
   END MULTI-SELECT SELLERS
   ======================== */

// Inicialização
