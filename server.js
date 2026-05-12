// server.js — MiniKhata Express Server
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const session      = require('express-session');

const authRoutes   = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const txnRoutes    = require('./routes/transactions');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'minikhata_secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,   // set true if using HTTPS
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 8,  // 8 hours
  },
}));

// ── SERVE FRONTEND ────────────────────────────────────────────────────────────
// Serves everything inside /public as static files
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/customers',    customerRoutes);
app.use('/api/transactions', txnRoutes);

// ── CATCH-ALL — serve index.html for unknown routes ───────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ₹ MiniKhata running at http://localhost:${PORT}\n`);
});
