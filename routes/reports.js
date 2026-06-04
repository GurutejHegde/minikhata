// routes/reports.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/reports/monthly?from=&to=
router.get('/monthly', auth, async (req, res) => {
  const from = req.query.from || '1970-01-01';
  const to   = req.query.to   || '2099-12-31';

  const ledgerType = req.session.user.userType || 'business';
  try {
    // 1. Monthly chart data
    const [chartData] = await db.query(`
      SELECT 
        DATE_FORMAT(t.date, '%Y-%m') AS month,
        SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END) AS credit,
        SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END) AS payment
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.date BETWEEN ? AND ? AND t.status = 'active' AND c.user_id = ? AND c.ledger_type = ?
      GROUP BY month
      ORDER BY month ASC
    `, [from, to, req.session.user.id, ledgerType]);

    // 2. Summary stats for the range
    const [[summary]] = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE 0 END), 0) AS totalGiven,
        COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS totalCollected,
        COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0) AS totalOutstanding
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.date BETWEEN ? AND ? AND t.status = 'active' AND c.user_id = ? AND c.ledger_type = ?
    `, [from, to, req.session.user.id, ledgerType]);

    // Format fields to numbers
    if (summary) {
      summary.totalGiven = parseFloat(summary.totalGiven || 0);
      summary.totalCollected = parseFloat(summary.totalCollected || 0);
      summary.totalOutstanding = parseFloat(summary.totalOutstanding || 0);
    }

    res.json({ chartData, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
