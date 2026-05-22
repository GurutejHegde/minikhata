// routes/search.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/search?q=
router.get('/', auth, async (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) {
    return res.json({ customers: [], transactions: [] });
  }

  const queryLike = `%${q}%`;

  try {
    // 1. Search Customers / People
    const [customers] = await db.query(
      `SELECT customer_id AS id, name, phone, address 
       FROM customers 
       WHERE user_id = ? AND (name LIKE ? OR phone LIKE ?) 
       ORDER BY name ASC LIMIT 10`,
      [req.session.user.id, queryLike, queryLike]
    );

    // 2. Search Transactions / Lendings
    const [transactions] = await db.query(
      `SELECT t.transaction_id AS id, t.customer_id AS customerId, c.name AS customerName, 
              t.type, t.amount, t.date, t.note 
       FROM transactions t 
       JOIN customers c ON t.customer_id = c.customer_id 
       WHERE c.user_id = ? AND (t.note LIKE ? OR CAST(t.amount AS CHAR) LIKE ?) 
       ORDER BY t.date DESC, t.transaction_id DESC LIMIT 10`,
      [req.session.user.id, queryLike, queryLike]
    );

    res.json({ customers, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
