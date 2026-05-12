// ─── MiniKhata — app.js ──────────────────────────────────────────────────────
// Shared utilities, localStorage data layer, and sidebar logic.
// When you connect MySQL later, replace the get/add/update/remove functions
// with fetch() calls to your Express API.

// ── AUTH GUARD ───────────────────────────────────────────────────────────────
function requireAuth() {
  if (sessionStorage.getItem('mk_auth') !== 'true') {
    window.location.href = '../index.html';
  }
}

// Logout
document.addEventListener('DOMContentLoaded', function () {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      sessionStorage.clear();
      window.location.href = '../index.html';
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

// ── HELPERS ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function genId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

// ── CUSTOMERS — localStorage layer ───────────────────────────────────────────
function getCustomers() {
  return JSON.parse(localStorage.getItem('mk_customers') || '[]');
}

function saveCustomers(data) {
  localStorage.setItem('mk_customers', JSON.stringify(data));
}

function addCustomer(data) {
  const customers = getCustomers();
  customers.push({
    id:        genId(),
    name:      data.name,
    phone:     data.phone,
    address:   data.address || '',
    createdAt: new Date().toISOString().split('T')[0],
  });
  saveCustomers(customers);
}

function updateCustomer(id, data) {
  const customers = getCustomers().map(c =>
    c.id === id ? { ...c, ...data } : c
  );
  saveCustomers(customers);
}

function removeCustomer(id) {
  saveCustomers(getCustomers().filter(c => c.id !== id));
  // Also remove their transactions
  saveTransactions(getTransactions().filter(t => t.customerId !== id));
}

// ── TRANSACTIONS — localStorage layer ────────────────────────────────────────
function getTransactions() {
  return JSON.parse(localStorage.getItem('mk_transactions') || '[]');
}

function saveTransactions(data) {
  localStorage.setItem('mk_transactions', JSON.stringify(data));
}

function addTransaction(data) {
  const txns = getTransactions();
  txns.push({
    id:         genId(),
    customerId: data.customerId,
    type:       data.type,       // 'credit' or 'payment'
    amount:     data.amount,
    date:       data.date,
    note:       data.note || '',
  });
  saveTransactions(txns);
}

// ── BALANCE CALCULATION ───────────────────────────────────────────────────────
// Mirrors the SQL: SUM(credit) - SUM(payment) = balance_due
function getBalance(customerId, txns) {
  return txns
    .filter(t => t.customerId === customerId)
    .reduce((acc, t) => t.type === 'credit' ? acc + t.amount : acc - t.amount, 0);
}

// Days since last payment (for overdue detection)
function daysSinceLastPayment(customerId, txns) {
  const payments = txns
    .filter(t => t.customerId === customerId && t.type === 'payment')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (payments.length === 0) return 999;
  const diff = new Date() - new Date(payments[0].date);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ── SEED DATA (runs once so the app isn't empty on first open) ────────────────
(function seedIfEmpty() {
  if (getCustomers().length > 0) return;

  const c1 = genId(); const c2 = genId(); const c3 = genId();

  saveCustomers([
    { id: c1, name: 'Rajan Medical',  phone: '9876543210', address: 'Main Bazaar',   createdAt: '2025-04-01' },
    { id: c2, name: 'Suresh Kirana',  phone: '9123456789', address: 'Gandhi Nagar',  createdAt: '2025-04-05' },
    { id: c3, name: 'Priya Cloth',    phone: '9988776655', address: 'Cloth Market',  createdAt: '2025-04-10' },
  ]);

  saveTransactions([
    { id: genId(), customerId: c1, type: 'credit',  amount: 2400, date: '2025-04-01', note: 'Medicines on credit' },
    { id: genId(), customerId: c1, type: 'payment', amount: 800,  date: '2025-04-15', note: 'Part payment'        },
    { id: genId(), customerId: c2, type: 'credit',  amount: 1200, date: '2025-04-10', note: 'Groceries'           },
    { id: genId(), customerId: c2, type: 'payment', amount: 1200, date: '2025-04-22', note: 'Full payment'        },
    { id: genId(), customerId: c3, type: 'credit',  amount: 5500, date: '2025-03-20', note: 'Cloth purchase'      },
  ]);
})();
