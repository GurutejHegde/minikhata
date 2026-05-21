/* ── MiniKhata App.js ─────────────────────────────────────────── */

// ── STORAGE HELPERS ───────────────────────────────────────────────────────
const DB = {
  get: (key) => JSON.parse(localStorage.getItem('mk_' + key) || '[]'),
  set: (key, val) => localStorage.setItem('mk_' + key, JSON.stringify(val)),
  init() {
    if (!localStorage.getItem('mk_customers')) {
      this.set('customers', [
        { id: 1, name: 'Rajan Medicals', phone: '9876543210', address: 'Main Bazaar', created: '2025-01-10' },
        { id: 2, name: 'Suresh Kirana',  phone: '9123456789', address: 'Gandhi Nagar', created: '2025-01-15' },
        { id: 3, name: 'Priya Cloth Store', phone: '9988776655', address: 'Cloth Market', created: '2025-02-01' },
      ]);
      this.set('transactions', [
        { id: 1, customer_id: 1, amount: 2400, type: 'credit',  date: '2025-04-01', note: 'Medicines on credit' },
        { id: 2, customer_id: 1, amount: 800,  type: 'payment', date: '2025-04-15', note: 'Part payment cash' },
        { id: 3, customer_id: 2, amount: 1200, type: 'credit',  date: '2025-04-10', note: 'Grocery items' },
        { id: 4, customer_id: 2, amount: 1200, type: 'payment', date: '2025-04-22', note: 'Full payment' },
        { id: 5, customer_id: 3, amount: 5500, type: 'credit',  date: '2025-03-20', note: 'Cloth purchase' },
        { id: 6, customer_id: 3, amount: 1000, type: 'payment', date: '2025-04-05', note: 'Partial' },
      ]);
      this.set('next_cid', 4);
      this.set('next_tid', 7);
    }
  },
  nextCid() { const n = this.get('next_cid') || 4; this.set('next_cid', n + 1); return n; },
  nextTid() { const n = this.get('next_tid') || 7; this.set('next_tid', n + 1); return n; },
};

// ── UTILS ─────────────────────────────────────────────────────────────────
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
const initials = (name) => name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

function getBalance(customerId) {
  const txns = DB.get('transactions').filter(t => t.customer_id === customerId);
  return txns.reduce((acc, t) => t.type === 'credit' ? acc + t.amount : acc - t.amount, 0);
}

function getAllStats() {
  const customers = DB.get('customers');
  const transactions = DB.get('transactions');
  let totalDue = 0, totalCredit = 0, totalPayment = 0;
  customers.forEach(c => {
    const bal = getBalance(c.id);
    if (bal > 0) totalDue += bal;
  });
  transactions.forEach(t => {
    if (t.type === 'credit') totalCredit += t.amount;
    else totalPayment += t.amount;
  });
  return { totalDue, totalCredit, totalPayment, customers: customers.length, transactions: transactions.length };
}

// ── TOAST ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── MODAL ─────────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}

// Close modal when clicking backdrop
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ── NAV ACTIVE ────────────────────────────────────────────────────────────
function setNavActive(page) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

// ── PAGE: DASHBOARD ───────────────────────────────────────────────────────
function initDashboard() {
  setNavActive('dashboard');
  const stats = getAllStats();

  document.getElementById('stat-due').textContent      = fmt(stats.totalDue);
  document.getElementById('stat-customers').textContent = stats.customers;
  document.getElementById('stat-credit').textContent   = fmt(stats.totalCredit);
  document.getElementById('stat-payment').textContent  = fmt(stats.totalPayment);

  // Recent transactions
  const txns = DB.get('transactions').slice(-5).reverse();
  const customers = DB.get('customers');
  const list = document.getElementById('recent-txns');
  if (!txns.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No transactions yet.<br><strong>Add a customer to get started.</strong></p></div>`;
    return;
  }
  list.innerHTML = txns.map(t => {
    const c = customers.find(x => x.id === t.customer_id);
    const name = c ? c.name : 'Unknown';
    return `
    <div class="txn-item">
      <div class="txn-dot ${t.type}">${t.type === 'credit' ? '📤' : '📥'}</div>
      <div class="txn-info">
        <div class="txn-name">${name}</div>
        <div class="txn-note">${t.note || '—'}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${t.type}">${t.type === 'credit' ? '+' : '-'}${fmt(t.amount)}</div>
        <div class="txn-date">${fmtDate(t.date)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── PAGE: CUSTOMERS ───────────────────────────────────────────────────────
function initCustomers() {
  setNavActive('customers');
  renderCustomerList('');

  // Search
  const searchInput = document.getElementById('customer-search');
  if (searchInput) searchInput.addEventListener('input', e => renderCustomerList(e.target.value));

  // Add customer form
  const form = document.getElementById('add-customer-form');
  if (form) form.addEventListener('submit', addCustomer);
}

function renderCustomerList(query) {
  const customers = DB.get('customers');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
    : customers;

  const list = document.getElementById('customer-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>${q ? 'No customers found for <strong>"' + query + '"</strong>' : 'No customers yet.<br><strong>Tap + to add one.</strong>'}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    const bal = getBalance(c.id);
    const balClass = bal > 0 ? 'due' : 'clear';
    const balText = bal > 0 ? fmt(bal) : 'Clear';
    const balLabel = bal > 0 ? 'Due' : 'Settled';
    return `
    <div class="customer-item" onclick="goToDetail(${c.id})">
      <div class="customer-avatar">${initials(c.name)}</div>
      <div class="customer-info">
        <div class="customer-name">${c.name}</div>
        <div class="customer-phone">📞 ${c.phone}</div>
      </div>
      <div class="customer-balance">
        <div class="balance-amount ${balClass}">${balText}</div>
        <div class="balance-label">${balLabel}</div>
      </div>
    </div>`;
  }).join('');
}

function addCustomer(e) {
  e.preventDefault();
  const name    = document.getElementById('c-name').value.trim();
  const phone   = document.getElementById('c-phone').value.trim();
  const address = document.getElementById('c-address').value.trim();
  if (!name || !phone) return;

  const customers = DB.get('customers');
  customers.push({ id: DB.nextCid(), name, phone, address, created: new Date().toISOString().slice(0,10) });
  DB.set('customers', customers);

  closeModal('add-customer-modal');
  e.target.reset();
  renderCustomerList('');
  showToast('✅ Customer added!');
}

function goToDetail(id) {
  window.location.href = `detail.html?id=${id}`;
}

// ── PAGE: CUSTOMER DETAIL ─────────────────────────────────────────────────
function initDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id'));
  if (!id) { window.location.href = 'customers.html'; return; }

  const customers = DB.get('customers');
  const customer = customers.find(c => c.id === id);
  if (!customer) { window.location.href = 'customers.html'; return; }

  const bal = getBalance(id);

  // Header
  document.getElementById('d-name').textContent    = customer.name;
  document.getElementById('d-phone').textContent   = '📞 ' + customer.phone;
  document.getElementById('d-balance').textContent = bal > 0 ? fmt(bal) : 'Clear';
  document.getElementById('d-balance').className   = 'amount ' + (bal > 0 ? 'due' : 'clear');

  const txns = DB.get('transactions').filter(t => t.customer_id === id);
  const totalCredit  = txns.filter(t => t.type === 'credit').reduce((a,t)=>a+t.amount,0);
  const totalPayment = txns.filter(t => t.type === 'payment').reduce((a,t)=>a+t.amount,0);
  document.getElementById('d-credit').textContent  = fmt(totalCredit);
  document.getElementById('d-payment').textContent = fmt(totalPayment);

  // Transactions
  renderDetailTxns(id, 'all');

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDetailTxns(id, btn.dataset.filter);
    });
  });

  // Add transaction form
  let selectedType = 'credit';
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      document.querySelectorAll('.type-btn').forEach(b => {
        b.className = 'type-btn';
        if (b.dataset.type === selectedType) b.classList.add(`selected-${selectedType}`);
      });
    });
  });
  // default select credit
  document.querySelector('.type-btn[data-type="credit"]').classList.add('selected-credit');

  const form = document.getElementById('add-txn-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('t-amount').value);
    const note   = document.getElementById('t-note').value.trim();
    const date   = document.getElementById('t-date').value || new Date().toISOString().slice(0,10);
    if (!amount || amount <= 0) { showToast('❌ Enter a valid amount'); return; }

    const txns = DB.get('transactions');
    txns.push({ id: DB.nextTid(), customer_id: id, amount, type: selectedType, date, note });
    DB.set('transactions', txns);

    closeModal('add-txn-modal');
    form.reset();
    document.querySelector('.type-btn[data-type="credit"]').classList.add('selected-credit');
    selectedType = 'credit';
    initDetail();
    showToast(`✅ ${selectedType === 'credit' ? 'Credit' : 'Payment'} recorded!`);
  });

  // Delete customer
  const delBtn = document.getElementById('delete-customer-btn');
  if (delBtn) delBtn.addEventListener('click', () => {
    const customers = DB.get('customers').filter(c => c.id !== id);
    const txns2 = DB.get('transactions').filter(t => t.customer_id !== id);
    DB.set('customers', customers);
    DB.set('transactions', txns2);
    showToast('🗑️ Customer deleted');
    setTimeout(() => window.location.href = 'customers.html', 800);
  });
}

function renderDetailTxns(customerId, filter) {
  let txns = DB.get('transactions').filter(t => t.customer_id === customerId);
  if (filter === 'credit')  txns = txns.filter(t => t.type === 'credit');
  if (filter === 'payment') txns = txns.filter(t => t.type === 'payment');
  txns = txns.slice().reverse();

  const list = document.getElementById('txn-list');
  if (!txns.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><p>No transactions here yet.</p></div>`;
    return;
  }
  list.innerHTML = txns.map(t => `
    <div class="txn-item">
      <div class="txn-dot ${t.type}">${t.type === 'credit' ? '📤' : '📥'}</div>
      <div class="txn-info">
        <div class="txn-name"><span class="badge badge-${t.type}">${t.type === 'credit' ? 'Credit' : 'Payment'}</span></div>
        <div class="txn-note">${t.note || '—'}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${t.type}">${t.type === 'credit' ? '+' : '-'}${fmt(t.amount)}</div>
        <div class="txn-date">${fmtDate(t.date)}</div>
      </div>
    </div>`).join('');
}

// ── PAGE: TRANSACTIONS ────────────────────────────────────────────────────
function initTransactions() {
  setNavActive('transactions');
  renderAllTransactions('all');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAllTransactions(btn.dataset.filter);
    });
  });
}

function renderAllTransactions(filter) {
  const customers = DB.get('customers');
  let txns = DB.get('transactions');
  if (filter === 'credit')  txns = txns.filter(t => t.type === 'credit');
  if (filter === 'payment') txns = txns.filter(t => t.type === 'payment');
  txns = txns.slice().reverse();

  const list = document.getElementById('all-txns');
  if (!txns.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><p>No transactions found.</p></div>`;
    return;
  }
  list.innerHTML = txns.map(t => {
    const c = customers.find(x => x.id === t.customer_id);
    const name = c ? c.name : 'Unknown';
    return `
    <div class="txn-item" onclick="goToDetail(${t.customer_id})" style="cursor:pointer">
      <div class="txn-dot ${t.type}">${t.type === 'credit' ? '📤' : '📥'}</div>
      <div class="txn-info">
        <div class="txn-name">${name}</div>
        <div class="txn-note">${t.note || '—'}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${t.type}">${t.type === 'credit' ? '+' : '-'}${fmt(t.amount)}</div>
        <div class="txn-date">${fmtDate(t.date)}</div>
      </div>
    </div>`;
  }).join('');
}

// ── PAGE: SEARCH ──────────────────────────────────────────────────────────
function initSearch() {
  setNavActive('search');
  const input = document.getElementById('search-input');
  if (input) {
    input.addEventListener('input', e => doSearch(e.target.value));
    input.focus();
  }
}

function doSearch(query) {
  const q = query.trim().toLowerCase();
  const results = document.getElementById('search-results');
  if (!q) { results.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Search by customer name or phone number.</p></div>`; return; }

  const customers = DB.get('customers');
  const filtered = customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));

  if (!filtered.length) {
    results.innerHTML = `<div class="empty-state"><div class="empty-icon">😕</div><p>No customers found for <strong>"${query}"</strong></p></div>`;
    return;
  }

  results.innerHTML = filtered.map(c => {
    const bal = getBalance(c.id);
    const txnCount = DB.get('transactions').filter(t => t.customer_id === c.id).length;
    return `
    <div class="customer-item" onclick="goToDetail(${c.id})">
      <div class="customer-avatar">${initials(c.name)}</div>
      <div class="customer-info">
        <div class="customer-name">${c.name}</div>
        <div class="customer-phone">📞 ${c.phone} &nbsp;·&nbsp; ${txnCount} transactions</div>
      </div>
      <div class="customer-balance">
        <div class="balance-amount ${bal > 0 ? 'due' : 'clear'}">${bal > 0 ? fmt(bal) : 'Clear'}</div>
        <div class="balance-label">${bal > 0 ? 'Due' : 'Settled'}</div>
      </div>
    </div>`;
  }).join('');
}

// ── LOGIN ─────────────────────────────────────────────────────────────────
function initLogin() {
  DB.init();
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    // Simple check — replace with real auth when backend is ready
    if (user === 'admin' && pass === 'admin123') {
      localStorage.setItem('mk_user', user);
      window.location.href = 'pages/dashboard.html';
    } else {
      document.getElementById('login-error').style.display = 'block';
    }
  });
}

// ── AUTH GUARD ────────────────────────────────────────────────────────────
function requireAuth() {
  DB.init();
  if (!localStorage.getItem('mk_user')) {
    window.location.href = '../index.html';
  }
}

function logout() {
  localStorage.removeItem('mk_user');
  window.location.href = '../index.html';
}

// ── AUTO INIT ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login')        initLogin();
  if (page === 'dashboard')    { requireAuth(); initDashboard(); }
  if (page === 'customers')    { requireAuth(); initCustomers(); }
  if (page === 'detail')       { requireAuth(); initDetail(); }
  if (page === 'transactions') { requireAuth(); initTransactions(); }
  if (page === 'search')       { requireAuth(); initSearch(); }
});
