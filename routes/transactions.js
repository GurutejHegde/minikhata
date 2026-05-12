// routes/transactions.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/transactions — all, with optional filters
// Query params: customerId, type, date
router.get('/', auth, async (req, res) => {
  try {
    let sql = `
      SELECT
        t.transaction_id AS id,
        t.customer_id    AS customerId,
        c.name           AS customerName,
        t.type,
        t.amount,
        t.date,
        t.note
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (req.query.customerId) {
      sql += ' AND t.customer_id = ?';
      params.push(req.query.customerId);
    }
    if (req.query.type) {
      sql += ' AND t.type = ?';
      params.push(req.query.type);
    }
    if (req.query.date) {
      sql += ' AND t.date = ?';
      params.push(req.query.date);
    }

    sql += ' ORDER BY t.date DESC, t.transaction_id DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/customer/:id — all txns for one customer
router.get('/customer/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT transaction_id AS id, customer_id AS customerId,
              type, amount, date, note
       FROM transactions
       WHERE customer_id = ?
       ORDER BY date DESC, transaction_id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transactions/dashboard — summary stats
router.get('/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [[{ totalCustomers }]] = await db.query(
      'SELECT COUNT(*) AS totalCustomers FROM customers'
    );

    const [[{ totalPending }]] = await db.query(`
      SELECT COALESCE(SUM(
        CASE WHEN type = 'credit'  THEN amount
             WHEN type = 'payment' THEN -amount ELSE 0 END
      ), 0) AS totalPending
      FROM transactions
    `);

    const [[{ todayCount }]] = await db.query(
      "SELECT COUNT(*) AS todayCount FROM transactions WHERE date = ?",
      [today]
    );

    // Overdue: customers with balance > 0 and no payment in 30+ days
    const [overdueRows] = await db.query(`
      SELECT c.customer_id
      FROM customers c
      WHERE (
        SELECT COALESCE(SUM(
          CASE WHEN type='credit' THEN amount
               WHEN type='payment' THEN -amount ELSE 0 END
        ), 0) FROM transactions WHERE customer_id = c.customer_id
      ) > 0
      AND (
        SELECT MAX(date) FROM transactions
        WHERE customer_id = c.customer_id AND type = 'payment'
      ) < DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      OR (
        SELECT COUNT(*) FROM transactions
        WHERE customer_id = c.customer_id AND type = 'payment'
      ) = 0
    `);

    res.json({
      totalCustomers,
      totalPending: parseFloat(totalPending),
      todayCount,
      overdueCount: overdueRows.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transactions — add new transaction
router.post('/', auth, async (req, res) => {
  const { customerId, type, amount, date, note } = req.body;

  if (!customerId || !type || !amount || !date) {
    return res.status(400).json({ error: 'customerId, type, amount, date are required' });
  }
  if (!['credit', 'payment'].includes(type)) {
    return res.status(400).json({ error: 'type must be credit or payment' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO transactions (customer_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)',
      [customerId, type, parseFloat(amount), date, note?.trim() || '']
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM transactions WHERE transaction_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
