const express = require('express');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/customers — get all with balance (supports pagination/sorting/searching if query params present)
router.get('/', auth, async (req, res) => {
  try {
    // If not requesting pagination, return full list (backward compatible)
    if (!req.query.page && !req.query.limit && !req.query.search) {
      const [rows] = await db.query(`
        SELECT
          c.customer_id  AS id,
          c.name,
          c.phone,
          c.address,
          c.created_at   AS createdAt,
          COALESCE(
            SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                     WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                     ELSE 0 END), 0
          ) AS balance
        FROM customers c
        LEFT JOIN transactions t ON c.customer_id = t.customer_id
        WHERE c.user_id = ?
        GROUP BY c.customer_id
        ORDER BY c.name ASC
      `, [req.session.user.id]);
      return res.json(rows);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder === 'DESC' ? 'DESC' : 'ASC';

    // Validate sort fields
    const allowedSortCols = {
      name: 'c.name',
      phone: 'c.phone',
      createdAt: 'c.created_at',
      balance: 'balance'
    };
    const sortCol = allowedSortCols[sortBy] || 'c.name';

    let searchFilter = ' WHERE c.user_id = ?';
    const params = [req.session.user.id];
    if (req.query.search) {
      searchFilter += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
      const searchVal = `%${req.query.search}%`;
      params.push(searchVal, searchVal);
    }

    // Get total matching count
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM customers c ${searchFilter}`,
      params
    );
    const total = countRows[0].total;

    // Get paginated customers with active balance
    const [rows] = await db.query(`
      SELECT
        c.customer_id  AS id,
        c.name,
        c.phone,
        c.address,
        c.created_at   AS createdAt,
        COALESCE(
          SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                   WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                   ELSE 0 END), 0
        ) AS balance
      FROM customers c
      LEFT JOIN transactions t ON c.customer_id = t.customer_id
      ${searchFilter}
      GROUP BY c.customer_id
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.json({
      data: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      limit
    });
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
      `SELECT 
        c.customer_id AS id, c.name, c.phone, c.address,
        COALESCE(
          SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                   WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                   ELSE 0 END), 0
        ) AS balance
       FROM customers c
       LEFT JOIN transactions t ON c.customer_id = t.customer_id
       WHERE c.user_id = ? AND (c.name LIKE ? OR c.phone LIKE ?)
       GROUP BY c.customer_id
       ORDER BY c.name ASC`,
      [req.session.user.id, q, q]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/customers/overdue — customers with overdue credits or overdue installments
router.get('/overdue', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        c.customer_id AS id,
        c.name,
        c.phone,
        c.address,
        c.created_at AS createdAt,
        COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                         WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                         ELSE 0 END), 0) AS balance,
        LEAST(
          COALESCE((
            SELECT MIN(due_date) FROM transactions
            WHERE customer_id = c.customer_id AND type = 'credit' AND status = 'active' AND due_date < CURDATE()
              AND (amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = transaction_id), 0)) > 0
          ), '9999-12-31'),
          COALESCE((
            SELECT MIN(i.due_date) FROM installments i
            JOIN transactions txn ON i.transaction_id = txn.transaction_id
            WHERE txn.customer_id = c.customer_id AND txn.status = 'active' AND i.status = 'overdue'
          ), '9999-12-31')
        ) AS oldestOverdueDate,
        DATEDIFF(
          CURDATE(),
          LEAST(
            COALESCE((
              SELECT MIN(due_date) FROM transactions
              WHERE customer_id = c.customer_id AND type = 'credit' AND status = 'active' AND due_date < CURDATE()
                AND (amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = transaction_id), 0)) > 0
            ), '9999-12-31'),
            COALESCE((
              SELECT MIN(i.due_date) FROM installments i
              JOIN transactions txn ON i.transaction_id = txn.transaction_id
              WHERE txn.customer_id = c.customer_id AND txn.status = 'active' AND i.status = 'overdue'
            ), '9999-12-31')
          )
        ) AS daysSinceOverdue
      FROM customers c
      LEFT JOIN transactions t ON c.customer_id = t.customer_id
      WHERE c.user_id = ?
      GROUP BY c.customer_id
      HAVING oldestOverdueDate != '9999-12-31'
      ORDER BY daysSinceOverdue DESC
    `, [req.session.user.id]);
    
    // Map response keys for frontend compatibility
    const mapped = rows.map(r => ({
      ...r,
      daysSinceLastPayment: r.daysSinceOverdue, // fallback naming compatibility
      lastPaymentDate: r.oldestOverdueDate // fallback naming compatibility
    }));

    res.json(mapped);
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
          SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                   WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount ELSE 0 END), 0
        ) AS balance
      FROM customers c
      LEFT JOIN transactions t ON c.customer_id = t.customer_id
      WHERE c.customer_id = ? AND c.user_id = ?
      GROUP BY c.customer_id
    `, [req.params.id, req.session.user.id]);

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
      'INSERT INTO customers (name, phone, address, user_id) VALUES (?, ?, ?, ?)',
      [name.trim(), phone.trim(), address?.trim() || '', req.session.user.id]
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
      'UPDATE customers SET name = ?, phone = ?, address = ? WHERE customer_id = ? AND user_id = ?',
      [name.trim(), phone.trim(), address?.trim() || '', req.params.id, req.session.user.id]
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
    await db.query('DELETE FROM customers WHERE customer_id = ? AND user_id = ?', [req.params.id, req.session.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
