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
    }
  } catch {
    window.location.href = '/index.html';
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

// ── SIDEBAR & LOGOUT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
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
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
});
