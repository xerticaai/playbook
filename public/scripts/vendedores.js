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
  const trigger = document.querySelector('.multi-select-trigger');
  const dropdown = document.getElementById('seller-dropdown');
  
  trigger.classList.toggle('open');
  dropdown.classList.toggle('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const container = document.getElementById('seller-multi-select');
  if (container && !container.contains(e.target)) {
    const trigger = document.querySelector('.multi-select-trigger');
    const dropdown = document.getElementById('seller-dropdown');
    trigger?.classList.remove('open');
    dropdown?.classList.remove('open');
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
