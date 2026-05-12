// routes/customers.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Auth middleware
function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/customers — get all with balance
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        c.customer_id  AS id,
        c.name,
        c.phone,
        c.address,
        c.created_at   AS createdAt,
        COALESCE(
          SUM(CASE WHEN t.type = 'credit'  THEN t.amount
                   WHEN t.type = 'payment' THEN -t.amount
                   ELSE 0 END), 0
        ) AS balance
      FROM customers c
      LEFT JOIN transactions t ON c.customer_id = t.customer_id
      GROUP BY c.customer_id
      ORDER BY c.name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/customers/search?q=term
router.get('/search', auth, async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  try {
    const [rows] = await db.query(
      `SELECT customer_id AS id, name, phone, address
       FROM customers
       WHERE name LIKE ? OR phone LIKE ?
       ORDER BY name ASC`,
      [q, q]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/customers/:id — single customer + balance
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        c.customer_id AS id, c.name, c.phone, c.address, c.created_at AS createdAt,
        COALESCE(
          SUM(CASE WHEN t.type = 'credit'  THEN t.amount
                   WHEN t.type = 'payment' THEN -t.amount ELSE 0 END), 0
        ) AS balance
      FROM customers c
      LEFT JOIN transactions t ON c.customer_id = t.customer_id
      WHERE c.customer_id = ?
      GROUP BY c.customer_id
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/customers — add new customer
router.post('/', auth, async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  try {
    const [result] = await db.query(
      'INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)',
      [name.trim(), phone.trim(), address?.trim() || '']
    );
    res.status(201).json({ id: result.insertId, name, phone, address });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/customers/:id — update customer
router.put('/:id', auth, async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

  try {
    await db.query(
      'UPDATE customers SET name = ?, phone = ?, address = ? WHERE customer_id = ?',
      [name.trim(), phone.trim(), address?.trim() || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
