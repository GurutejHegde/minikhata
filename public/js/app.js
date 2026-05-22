// ─── MiniKhata — app.js (API version) ───────────────────────────────────────
// All data now comes from the Express + MySQL backend.

const API = '';   // empty = same origin. If running separately use 'http://localhost:3000'

// ── AUTH GUARD ───────────────────────────────────────────────────────────────
async function requireAuth() {
  try {
    const res  = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/index.html';
    } else {
      const el = document.getElementById('navUser');
      if (el) el.textContent = data.username;
      
      // Save user type globally
      window.currentUserType = data.userType;
      
      if (!data.userType) {
        showUserTypeModal();
      } else {
        adaptUI(data.userType);
        updateOverdueBadge();
        initNotifications();
      }
    }
  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = '/index.html';
  }
}

// ── USER TYPE MODAL ONBOARDING ────────────────────────────────────────────────
function showUserTypeModal() {
  // If modal already exists, don't recreate
  if (document.getElementById('userTypeModalOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'userTypeModalOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h3>Choose Account Type</h3>
      </div>
      <div class="modal-form">
        <p style="font-size: 13px; color: var(--text-secondary); text-align: center; margin-bottom: 10px;">
          Select how you want to use MiniKhata. You can change this later from your Profile.
        </p>
        <div class="type-selector-grid">
          <div class="type-option-card" id="typeOptPersonal">
            <div class="type-option-icon">👤</div>
            <div class="type-option-title">Personal</div>
            <div class="type-option-desc">Lending money to friends, family, or relatives</div>
          </div>
          <div class="type-option-card" id="typeOptBusiness">
            <div class="type-option-icon">💼</div>
            <div class="type-option-title">Business</div>
            <div class="type-option-desc">Tracking shop customers, sales on credit, and payments</div>
          </div>
        </div>
        <div id="typeModalError" class="error-msg hidden">Please select an option.</div>
        <div class="modal-actions" style="margin-top: 10px;">
          <button class="btn btn-primary btn-full" id="typeModalSaveBtn">Confirm & Continue</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedType = null;

  const optPersonal = document.getElementById('typeOptPersonal');
  const optBusiness = document.getElementById('typeOptBusiness');
  const saveBtn = document.getElementById('typeModalSaveBtn');
  const errEl = document.getElementById('typeModalError');

  optPersonal.addEventListener('click', () => {
    selectedType = 'personal';
    optPersonal.classList.add('selected');
    optBusiness.classList.remove('selected');
    errEl.classList.add('hidden');
  });

  optBusiness.addEventListener('click', () => {
    selectedType = 'business';
    optBusiness.classList.add('selected');
    optPersonal.classList.remove('selected');
    errEl.classList.add('hidden');
  });

  saveBtn.addEventListener('click', async () => {
    if (!selectedType) {
      errEl.classList.remove('hidden');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await apiFetch('/api/auth/user-type', {
        method: 'POST',
        body: JSON.stringify({ userType: selectedType }),
      });
      overlay.remove();
      window.currentUserType = selectedType;
      adaptUI(selectedType);
      updateOverdueBadge();
      // Reload current page to let local page scripts adapt
      window.location.reload();
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Confirm & Continue';
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ── UI TERMINOLOGY ADAPTER ───────────────────────────────────────────────────
function adaptUI(userType) {
  if (!userType) return;
  document.body.classList.remove('personal-mode', 'business-mode');
  document.body.classList.add(`${userType}-mode`);

  const isPersonal = userType === 'personal';

  // Translate Sidebar Links
  const linkCustomers = document.getElementById('linkCustomers');
  if (linkCustomers) {
    linkCustomers.innerHTML = isPersonal ? '👥 People' : '👥 Customers';
  }

  const linkTransactions = document.getElementById('linkTransactions');
  if (linkTransactions) {
    linkTransactions.innerHTML = isPersonal ? '💸 Lendings' : '💸 Transactions';
  }

  // Page-specific adaptations
  const path = window.location.pathname;

  if (path.includes('dashboard.html')) {
    // Stat Card labels
    const labels = document.querySelectorAll('.stat-label');
    labels.forEach(el => {
      if (el.textContent.includes('CUSTOMERS')) {
        el.textContent = isPersonal ? 'TOTAL PEOPLE' : 'TOTAL CUSTOMERS';
      }
      if (el.textContent.includes('PENDING DUES')) {
        el.textContent = isPersonal ? 'PENDING LENDINGS' : 'PENDING DUES';
      }
    });

    const headers = document.querySelectorAll('h3');
    headers.forEach(el => {
      if (el.textContent.includes('Customers with Pending Dues')) {
        el.textContent = isPersonal ? 'People with Pending Lendings' : 'Customers with Pending Dues';
      }
      if (el.textContent.includes('Recent Transactions')) {
        el.textContent = isPersonal ? 'Recent Lendings' : 'Recent Transactions';
      }
    });
  }

  if (path.includes('customers.html')) {
    const title = document.querySelector('.page-title');
    if (title) title.textContent = isPersonal ? 'People' : 'Customers';

    const subtitle = document.querySelector('.page-sub');
    if (subtitle) subtitle.textContent = isPersonal ? 'Manage your lending records' : 'All customer credit records';

    const addBtn = document.getElementById('addCustomerBtn');
    if (addBtn) addBtn.textContent = isPersonal ? '+ Add Person' : '+ Add Customer';

    const searchInput = document.querySelector('.search-bar input');
    if (searchInput) searchInput.placeholder = isPersonal ? 'Search by name or phone...' : 'Search by name or phone...';

    // Modal
    const modalTitle = document.querySelector('#customerModal h3');
    if (modalTitle) {
      modalTitle.textContent = isPersonal ? 'Add Person' : 'Add Customer';
    }
  }

  if (path.includes('transactions.html')) {
    const title = document.querySelector('.page-title');
    if (title) title.textContent = isPersonal ? 'Lendings' : 'Transactions';

    const subtitle = document.querySelector('.page-sub');
    if (subtitle) subtitle.textContent = isPersonal ? 'All lending and repayment records' : 'All credit and payment records';

    const addBtn = document.getElementById('addTxnBtn');
    if (addBtn) addBtn.textContent = isPersonal ? '+ Add Lending' : '+ Add';

    const filterCustomer = document.getElementById('filterCustomer');
    if (filterCustomer && filterCustomer.options[0]) {
      filterCustomer.options[0].textContent = isPersonal ? 'All People' : 'All Customers';
    }

    const modalCustomerOpt = document.getElementById('txnCustomer');
    if (modalCustomerOpt && modalCustomerOpt.options[0]) {
      modalCustomerOpt.options[0].textContent = isPersonal ? 'Select person' : 'Select customer';
    }

    const tableHeaders = document.querySelectorAll('.data-table th');
    if (tableHeaders[0]) tableHeaders[0].textContent = isPersonal ? 'Person' : 'Customer';

    const modalTitle = document.querySelector('#txnModal h3');
    if (modalTitle) modalTitle.textContent = isPersonal ? 'Add Lending' : 'Add Transaction';

    const formLabels = document.querySelectorAll('.modal-form label');
    formLabels.forEach(el => {
      if (el.textContent.includes('Customer')) {
        el.textContent = isPersonal ? 'Person *' : 'Customer *';
      }
    });

    const filterTypeSelect = document.getElementById('filterType');
    if (filterTypeSelect && filterTypeSelect.options[1] && filterTypeSelect.options[2]) {
      filterTypeSelect.options[1].textContent = isPersonal ? 'Lent' : 'Borrowed';
      filterTypeSelect.options[2].textContent = isPersonal ? 'Paid back' : 'Paid';
    }

    const modalTypeSelect = document.getElementById('txnType');
    if (modalTypeSelect && modalTypeSelect.options[1] && modalTypeSelect.options[2]) {
      modalTypeSelect.options[1].textContent = isPersonal ? 'Lent (gave credit)' : 'Borrowed (took credit)';
      modalTypeSelect.options[2].textContent = isPersonal ? 'Paid back (repay)' : 'Paid (payment)';
    }

    const editModalTypeSelect = document.getElementById('editTxnType');
    if (editModalTypeSelect && editModalTypeSelect.options[0] && editModalTypeSelect.options[1]) {
      editModalTypeSelect.options[0].textContent = isPersonal ? 'Lent (gave credit)' : 'Borrowed (took credit)';
      editModalTypeSelect.options[1].textContent = isPersonal ? 'Paid back (repay)' : 'Paid (payment)';
    }
  }
}

// ── OVERDUE ALERTS BADGE UPDATER ──────────────────────────────────────────────
async function updateOverdueBadge() {
  try {
    const stats = await getDashboardStats();
    const badge = document.getElementById('overdueBadge');
    if (badge) {
      if (stats.overdueCount > 0) {
        badge.textContent = stats.overdueCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Failed to update overdue badge:', err);
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function escHtml(str = '') {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
async function getCustomers()         { return apiFetch('/api/customers'); }
async function getOverdueCustomers()  { return apiFetch('/api/customers/overdue'); }
async function addCustomer(data)      { return apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(data) }); }
async function updateCustomer(id, d)  { return apiFetch(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function removeCustomer(id)     { return apiFetch(`/api/customers/${id}`, { method: 'DELETE' }); }

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
async function getTransactions(params = {}) {
  const q = new URLSearchParams(params).toString();
  return apiFetch('/api/transactions' + (q ? '?' + q : ''));
}
async function getCustomerTransactions(id) { return apiFetch(`/api/transactions/customer/${id}`); }
async function addTransaction(data)        { return apiFetch('/api/transactions', { method: 'POST', body: JSON.stringify(data) }); }
async function getDashboardStats()         { return apiFetch('/api/transactions/dashboard'); }

// ── BALANCE (computed client-side from txn list) ──────────────────────────────
function getBalance(txns) {
  return txns.reduce((acc, t) =>
    t.type === 'credit' ? acc + parseFloat(t.amount) : acc - parseFloat(t.amount), 0
  );
}

function getTxnTypeName(type, userType) {
  const isPersonal = userType === 'personal';
  const t = String(type).toLowerCase();
  if (t === 'credit') {
    return isPersonal ? 'Lent' : 'Borrowed';
  } else if (t === 'payment') {
    return isPersonal ? 'Paid back' : 'Paid';
  }
  return type;
}

// ── SIDEBAR & GLOBAL SEARCH INITIALIZATION ────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (e) {
        console.error('Logout request failed', e);
      }
      window.location.href = '/index.html';
    });
  }

  // Sidebar toggle
  const menuToggle = document.getElementById('menuToggle');
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebarOverlay');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  // Dynamically insert global search in navbar
  const navLeft = document.querySelector('.nav-left');
  if (navLeft && !window.location.pathname.includes('index.html')) {
    const searchWrap = document.createElement('div');
    searchWrap.className = 'nav-search-wrap';
    searchWrap.innerHTML = `
      <input type="text" id="globalSearch" placeholder="Search..." autocomplete="off" />
      <div id="globalSearchResults" class="search-results-dropdown hidden"></div>
    `;
    navLeft.appendChild(searchWrap);
    setupGlobalSearch();
  }
});

// ── GLOBAL SEARCH UTILITY ─────────────────────────────────────────────────────
function setupGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const dropdown = document.getElementById('globalSearchResults');
  if (!input || !dropdown) return;

  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      dropdown.innerHTML = '';
      dropdown.classList.add('hidden');
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        const results = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        renderSearchResults(results, dropdown);
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 250);
  });

  // Hide dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  input.addEventListener('focus', () => {
    if (input.value.trim() && dropdown.children.length > 0) {
      dropdown.classList.remove('hidden');
    }
  });
}

function renderSearchResults(results, dropdown) {
  dropdown.innerHTML = '';
  const isPersonal = window.currentUserType === 'personal';

  const customers = results.customers || [];
  const transactions = results.transactions || [];

  if (customers.length === 0 && transactions.length === 0) {
    dropdown.innerHTML = '<div class="search-no-results">No results found</div>';
    dropdown.classList.remove('hidden');
    return;
  }

  // Customers / People Section
  if (customers.length > 0) {
    const title = document.createElement('div');
    title.className = 'search-section-title';
    title.textContent = isPersonal ? 'People' : 'Customers';
    dropdown.appendChild(title);

    customers.forEach(c => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <div class="search-item-left">
          <span class="search-item-title">${escHtml(c.name)}</span>
          <span class="search-item-sub">${escHtml(c.phone)}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        if (window.location.pathname.includes('customers.html')) {
          if (typeof window.viewCustomerDetail === 'function') {
            window.viewCustomerDetail(c.id);
          }
        } else {
          window.location.href = `/pages/customers.html?openDrawer=${c.id}`;
        }
      });
      dropdown.appendChild(item);
    });
  }

  // Transactions / Lendings Section
  if (transactions.length > 0) {
    const title = document.createElement('div');
    title.className = 'search-section-title';
    title.textContent = isPersonal ? 'Lendings' : 'Transactions';
    dropdown.appendChild(title);

    transactions.forEach(t => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <div class="search-item-left">
          <span class="search-item-title">${escHtml(t.customerName)}</span>
          <span class="search-item-sub">${t.date} — ${escHtml(t.note || '—')}</span>
        </div>
        <div class="search-item-right ${t.type === 'credit' ? 'amount-due' : 'amount-paid'}">
          ${t.type === 'credit' ? '+' : '-'}₹${parseFloat(t.amount).toLocaleString('en-IN')}
        </div>
      `;
      item.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        window.location.href = `/pages/transactions.html?customerId=${t.customerId}`;
      });
      dropdown.appendChild(item);
    });
  }

  dropdown.classList.remove('hidden');
}

// ── NOTIFICATIONS LOGIC ───────────────────────────────────────────────────────
let notifPage = 1;
let notifLimit = 5;
let notifTotalPages = 1;

async function initNotifications() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || document.getElementById('navNotifWrap')) return;

  const notifWrap = document.createElement('div');
  notifWrap.className = 'nav-notif-wrap';
  notifWrap.id = 'navNotifWrap';
  notifWrap.innerHTML = `
    <button class="nav-notif-btn" id="navNotifBtn" title="Notifications">
      🔔
      <span class="notif-badge hidden" id="notifBadge">0</span>
    </button>
    <div class="notif-dropdown hidden" id="notifDropdown">
      <div class="notif-header">
        <h4>Notifications</h4>
        <button class="notif-mark-all" id="notifMarkAll">Mark all read</button>
      </div>
      <div class="notif-list" id="notifList">
        <div class="notif-empty">No notifications</div>
      </div>
      <div class="notif-footer">
        <button class="notif-load-more hidden" id="notifLoadMore">Load More</button>
      </div>
    </div>
  `;

  // Insert before logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    navRight.insertBefore(notifWrap, logoutBtn);
  } else {
    navRight.appendChild(notifWrap);
  }

  // Toggle Dropdown
  const btn = document.getElementById('navNotifBtn');
  const dropdown = document.getElementById('notifDropdown');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      notifPage = 1;
      loadNotifications(true);
    }
  });

  // Hide dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!notifWrap.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  // Mark all read
  document.getElementById('notifMarkAll').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      notifPage = 1;
      await loadNotifications(true);
    } catch (err) {
      console.error(err);
    }
  });

  // Load more
  document.getElementById('notifLoadMore').addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifPage < notifTotalPages) {
      notifPage++;
      loadNotifications(false);
    }
  });

  // Query unread count initially
  updateUnreadCount();
}

async function updateUnreadCount() {
  try {
    const res = await apiFetch('/api/notifications?page=1&limit=1');
    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (res.unreadCount > 0) {
        badge.textContent = res.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Failed to get notifications count', err);
  }
}

async function loadNotifications(replace = true) {
  const list = document.getElementById('notifList');
  const loadMoreBtn = document.getElementById('notifLoadMore');
  if (replace) {
    list.innerHTML = '<div class="notif-empty">Loading...</div>';
  }

  try {
    const res = await apiFetch(`/api/notifications?page=${notifPage}&limit=${notifLimit}`);
    notifTotalPages = res.totalPages;
    
    // Update badge count
    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (res.unreadCount > 0) {
        badge.textContent = res.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (replace) list.innerHTML = '';

    if (res.data.length === 0 && replace) {
      list.innerHTML = '<div class="notif-empty">No notifications</div>';
      loadMoreBtn.classList.add('hidden');
      return;
    }

    res.data.forEach(n => {
      const item = document.createElement('div');
      item.className = `notif-item ${n.isRead ? '' : 'unread'}`;
      item.dataset.id = n.id;
      
      let icon = '📢';
      let actionUrl = '#';
      let actionText = '';
      
      if (n.type === 'overdue') {
        icon = '⚠️';
        actionText = 'View Customer';
        actionUrl = `/pages/customers.html?openDrawer=${n.referenceId}`;
      } else if (n.type === 'upcoming_due') {
        icon = '⏰';
        actionText = 'View Transactions';
        actionUrl = `/pages/transactions.html?customerId=${n.referenceId}`;
      } else if (n.type === 'high_balance') {
        icon = '📈';
        actionText = 'View Customer';
        actionUrl = `/pages/customers.html?openDrawer=${n.referenceId}`;
      } else if (n.type === 'inactive') {
        icon = '💤';
        actionText = 'View Customer';
        actionUrl = `/pages/customers.html?openDrawer=${n.referenceId}`;
      } else if (n.type === 'payment_received') {
        icon = '💰';
        actionText = 'View Transactions';
        actionUrl = `/pages/transactions.html`;
      }

      const timeStr = new Date(n.createdAt).toLocaleDateString('en-IN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      item.innerHTML = `
        <span class="notif-icon">${icon}</span>
        <div class="notif-content">
          <div class="notif-message">${escHtml(n.message)}</div>
          <div class="notif-meta">
            <span class="notif-time">${timeStr}</span>
            ${actionText ? `<a class="notif-action" href="${actionUrl}">${actionText}</a>` : ''}
          </div>
        </div>
        <button class="notif-dismiss" title="Dismiss">&times;</button>
      `;

      item.addEventListener('click', async () => {
        if (!n.isRead) {
          try {
            await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PUT' });
            item.classList.remove('unread');
            updateUnreadCount();
          } catch (e) {
            console.error(e);
          }
        }
      });

      const dismissBtn = item.querySelector('.notif-dismiss');
      dismissBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await apiFetch(`/api/notifications/${n.id}`, { method: 'DELETE' });
          item.style.animation = 'fadeOut 0.2s ease forwards';
          setTimeout(() => {
            item.remove();
            if (list.children.length === 0) {
              list.innerHTML = '<div class="notif-empty">No notifications</div>';
            }
          }, 200);
          updateUnreadCount();
        } catch (e) {
          console.error(e);
        }
      });

      list.appendChild(item);
    });

    if (notifPage < notifTotalPages) {
      loadMoreBtn.classList.remove('hidden');
    } else {
      loadMoreBtn.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to load notifications', err);
    if (replace) {
      list.innerHTML = `<div class="notif-empty">Error loading notifications</div>`;
    }
  }
}
