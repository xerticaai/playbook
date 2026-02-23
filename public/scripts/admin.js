// Gestão de férias e acesso do administrador
function normalizeUserEmail(rawEmail) {
  const value = String(rawEmail || '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes(':')) return value.split(':').pop().trim().toLowerCase();
  return value;
}

function updateAdminValidateButton() {
  const adminBtn = document.getElementById('nav-admin-validate-btn');
  if (!adminBtn) return;
  adminBtn.textContent = adminPreviewEnabled ? 'Preview: ativado' : 'Preview: desativado';
  adminBtn.title = adminPreviewEnabled
    ? 'Clique para ocultar abas em construção (Dashboard, ML)'
    : 'Clique para visualizar abas em construção (Dashboard, ML)';
}

function applyAdminVisibility() {
  // If Firebase email is confirmed as admin, never hide admin items during
  // the same session even if resolveAdminAccess is called mid-cycle.
  const confirmedEmail = normalizeUserEmail(window._firebaseAuthEmail);
  if (confirmedEmail && ADMIN_ALLOWED_EMAILS.includes(confirmedEmail)) {
    isAdminUser = true;
  }

  const navDashboardItem = document.getElementById('nav-dashboard-item');
  const navMlItem = document.getElementById('nav-ml-item');
  const navAdminItem = document.getElementById('nav-admin-item');
  const navGroupTitle = document.getElementById('nav-em-construcao-title');
  const navAdminGroupTitle = document.getElementById('nav-admin-group-title');
  const adminBtn = document.getElementById('nav-admin-validate-btn');
  const dashboardSection = document.getElementById('dashboard');
  const mlSection = document.getElementById('ml');
  const adminSection = document.getElementById('admin');
  const shouldShowUnderConstruction = isAdminUser && adminPreviewEnabled;

  if (navDashboardItem) navDashboardItem.style.display = shouldShowUnderConstruction ? '' : 'none';
  if (navMlItem) navMlItem.style.display = shouldShowUnderConstruction ? '' : 'none';
  if (navAdminItem) navAdminItem.style.display = isAdminUser ? '' : 'none';
  if (navGroupTitle) navGroupTitle.style.display = shouldShowUnderConstruction ? '' : 'none';
  if (navAdminGroupTitle) navAdminGroupTitle.style.display = isAdminUser ? '' : 'none';
  if (adminBtn) adminBtn.style.display = isAdminUser ? '' : 'none';

  if (!shouldShowUnderConstruction) {
    if (dashboardSection && dashboardSection.classList.contains('active')) {
      dashboardSection.classList.remove('active');
    }
    if (mlSection && mlSection.classList.contains('active')) {
      mlSection.classList.remove('active');
    }
  }

  if (!isAdminUser && adminSection && adminSection.classList.contains('active')) {
    adminSection.classList.remove('active');
  }
}

function getAdminSellerOptions() {
  const byKey = new Map();
  const all = [
    ...(Array.isArray(availableSellers?.active) ? availableSellers.active : []),
    ...(Array.isArray(availableSellers?.historical) ? availableSellers.historical : [])
  ];
  all.forEach((item) => {
    const name = item && item.Vendedor ? String(item.Vendedor).trim() : '';
    if (!name) return;
    const key = name.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, name);
  });
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

function populateAdminSellerSelect() {
  const select = document.getElementById('admin-vac-seller');
  if (!select) return;
  const sellers = getAdminSellerOptions();
  if (sellers.length === 0) {
    select.innerHTML = '<option value="">Sem vendedores disponíveis</option>';
    return;
  }
  select.innerHTML = sellers.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
}

async function loadAdminVacations() {
  if (!isAdminUser) return;
  const tbody = document.getElementById('admin-vac-table-body');
  const feedback = document.getElementById('admin-vac-feedback');
  if (!tbody) return;

  try {
    const yearEl = document.getElementById('admin-vac-year');
    const year = String(yearEl?.value || '').trim();
    const qs = year ? `?year=${encodeURIComponent(year)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/admin/vacations${qs}`, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-gray);padding:20px;">Nenhum registro</td></tr>';
    } else {
      tbody.innerHTML = items.map((item) => {
        const id = String(item.id || '');
        const seller = escapeHtml(String(item.seller || ''));
        const start = escapeHtml(String(item.start_date || '').slice(0, 10));
        const end = escapeHtml(String(item.end_date || '').slice(0, 10));
        const type = escapeHtml(String(item.type || 'ferias'));
        const notes = escapeHtml(String(item.notes || ''));
        return `
          <tr>
            <td>${seller}</td>
            <td>${start}</td>
            <td>${end}</td>
            <td>${type}</td>
            <td>${notes || '-'}</td>
            <td><button onclick="deleteAdminVacation('${id}')" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,80,80,0.35);background:rgba(255,80,80,0.12);color:var(--danger);font-weight:700;cursor:pointer;">Excluir</button></td>
          </tr>
        `;
      }).join('');
    }

    if (feedback) feedback.textContent = `Total: ${items.length} registro(s).`;
  } catch (error) {
    console.error('[ADMIN] Erro ao carregar férias:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">Erro ao carregar registros</td></tr>';
    if (feedback) feedback.textContent = `Falha ao carregar férias: ${error.message || error}`;
  }
}

async function createAdminVacation() {
  if (!isAdminUser) return;
  const seller = document.getElementById('admin-vac-seller')?.value || '';
  const startDate = document.getElementById('admin-vac-start')?.value || '';
  const endDate = document.getElementById('admin-vac-end')?.value || '';
  const type = document.getElementById('admin-vac-type')?.value || 'ferias';
  const notes = document.getElementById('admin-vac-notes')?.value || '';
  const feedback = document.getElementById('admin-vac-feedback');

  if (!seller || !startDate || !endDate) {
    if (feedback) feedback.textContent = 'Preencha vendedor, início e fim.';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/vacations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seller,
        start_date: startDate,
        end_date: endDate,
        type,
        notes
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (feedback) feedback.textContent = 'Registro salvo com sucesso.';
    const notesEl = document.getElementById('admin-vac-notes');
    if (notesEl) notesEl.value = '';
    await loadAdminVacations();
  } catch (error) {
    console.error('[ADMIN] Erro ao salvar férias:', error);
    if (feedback) feedback.textContent = `Falha ao salvar: ${error.message || error}`;
  }
}

async function deleteAdminVacation(vacationId) {
  if (!confirm('Confirmar exclusão desta ausência? Esta ação não pode ser desfeita.')) return;
  if (!isAdminUser || !vacationId) return;
  const feedback = document.getElementById('admin-vac-feedback');

  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/vacations/${encodeURIComponent(vacationId)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (feedback) feedback.textContent = 'Registro removido com sucesso.';
    await loadAdminVacations();
  } catch (error) {
    console.error('[ADMIN] Erro ao remover férias:', error);
    if (feedback) feedback.textContent = `Falha ao remover: ${error.message || error}`;
  }
}

function initAdminSection() {
  if (!isAdminUser) return;
  populateAdminSellerSelect();
  loadAdminVacations();
}

function toggleAdminPreview() {
  if (!isAdminUser) return;
  adminPreviewEnabled = !adminPreviewEnabled;
  localStorage.setItem('x_admin_preview', adminPreviewEnabled ? '1' : '0');
  updateAdminValidateButton();
  applyAdminVisibility();

  if (!adminPreviewEnabled) {
    const executiveNav = document.querySelector('.nav-item[onclick="showSection(this, \'executive\')"]');
    showSection(executiveNav, 'executive');
  }
}

async function checkAdminPermissionByApi_() {
  try {
    const year = new Date().getFullYear();
    const response = await fetch(`${API_BASE_URL}/api/admin/vacations?year=${year}`, { cache: 'no-store' });
    if (response.status === 403) return false;
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function resolveAdminAccess() {
  isAdminUser = false;
  adminPreviewEnabled = false;
  currentUserEmail = null;

  // Fonte primária: email do Firebase Auth (disponível após login, não depende
  // de headers IAP do Cloud Run que não chegam pela Firebase Hosting proxy).
  const firebaseEmail = normalizeUserEmail(window._firebaseAuthEmail);
  const qs = new URLSearchParams(window.location.search || '');
  const forceAdminPreview = qs.get('admin_preview') === '1' || localStorage.getItem('x_admin_preview_force') === '1';
  if (firebaseEmail) {
    currentUserEmail = firebaseEmail;
    isAdminUser = forceAdminPreview || ADMIN_ALLOWED_EMAILS.includes(currentUserEmail);
    if (!isAdminUser) {
      const hasApiAdminAccess = await checkAdminPermissionByApi_();
      if (hasApiAdminAccess) {
        isAdminUser = true;
      }
    }
    adminPreviewEnabled = isAdminUser && (localStorage.getItem('x_admin_preview') !== '0');
    log('[AUTH] Email resolvido via Firebase Auth:', currentUserEmail, '| admin:', isAdminUser);
    updateAdminValidateButton();
    applyAdminVisibility();
    return;
  }

  // Fallback: tenta /api/user-context (funciona quando Cloud Run IAP está ativo)
  try {
    for (const endpoint of USER_CONTEXT_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        currentUserEmail = normalizeUserEmail(data.email);
        isAdminUser = forceAdminPreview || ADMIN_ALLOWED_EMAILS.includes(currentUserEmail);
        if (!isAdminUser) {
          const hasApiAdminAccess = await checkAdminPermissionByApi_();
          if (hasApiAdminAccess) {
            isAdminUser = true;
          }
        }
        adminPreviewEnabled = isAdminUser && (localStorage.getItem('x_admin_preview') !== '0');
        log('[AUTH] Email resolvido via user-context:', currentUserEmail, '| admin:', isAdminUser);
        break;
      } catch (innerError) {
        log('[AUTH] user-context falhou:', endpoint, innerError?.message || innerError);
      }
    }
  } catch (e) {
    log('[AUTH] Não foi possível validar acesso admin:', e.message || e);
  }

  if (forceAdminPreview) {
    isAdminUser = true;
    adminPreviewEnabled = localStorage.getItem('x_admin_preview') !== '0';
  }

  updateAdminValidateButton();
  applyAdminVisibility();
}

// Recupera dados do servidor (não mais injetados pelo template)
