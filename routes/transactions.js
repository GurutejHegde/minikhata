const express = require('express');
const db      = require('../db');
const { recalculateSettlements } = require('../services/settlementEngine');
const { generateNotifications, triggerPaymentReceivedNotification } = require('../services/notificationRules');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// Helper to get customer's outstanding balance (excluding reversed transactions)
async function getCustomerOutstandingBalance(customerId, conn) {
  const runner = conn || db;
  const [[{ balance }]] = await runner.query(`
    SELECT COALESCE(SUM(
      CASE WHEN type = 'credit' THEN amount
           WHEN type = 'payment' THEN -amount ELSE 0 END
    ), 0) AS balance
    FROM transactions
    WHERE customer_id = ? AND status = 'active'
  `, [customerId]);
  return parseFloat(balance);
}

// GET /api/transactions — all, with paginated filtering, search, sorting
// Query params: page, limit, sortBy, sortOrder, search, customerId, type, date
router.get('/', auth, async (req, res) => {
  // If not requesting pagination, return full list (backward compatible)
  if (!req.query.page && !req.query.limit) {
    try {
      const ledgerType = req.session.user.userType || 'business';
      let sqlFilters = ' WHERE c.user_id = ? AND c.ledger_type = ?';
      const params = [req.session.user.id, ledgerType];

      if (req.query.customerId) {
        sqlFilters += ' AND t.customer_id = ?';
        params.push(req.query.customerId);
      }
      if (req.query.type) {
        sqlFilters += ' AND t.type = ?';
        params.push(req.query.type);
      }
      if (req.query.date) {
        sqlFilters += ' AND t.date = ?';
        params.push(req.query.date);
      }
      if (req.query.search) {
        sqlFilters += ' AND (t.note LIKE ? OR c.name LIKE ? OR CAST(t.amount AS CHAR) LIKE ?)';
        const searchVal = `%${req.query.search}%`;
        params.push(searchVal, searchVal, searchVal);
      }

      const querySql = `
        SELECT
          t.transaction_id AS id,
          t.customer_id    AS customerId,
          c.name           AS customerName,
          t.type,
          t.amount,
          t.date,
          t.note,
          t.status,
          t.due_date       AS dueDate,
          t.category,
          t.edited_at      AS editedAt,
          t.edit_reason    AS editReason,
          t.reversal_reason AS reversalReason,
          (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        ${sqlFilters}
        ORDER BY t.date DESC, t.transaction_id DESC
      `;
      const [rows] = await db.query(querySql, params);
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const sortBy = req.query.sortBy || 'date';
  const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  // Validate sort columns
  const allowedSortCols = {
    date: 't.date',
    amount: 't.amount',
    customerName: 'c.name',
    id: 't.transaction_id'
  };
  const sortCol = allowedSortCols[sortBy] || 't.date';

  try {
    const ledgerType = req.session.user.userType || 'business';
    let sqlFilters = ' WHERE c.user_id = ? AND c.ledger_type = ?';
    const params = [req.session.user.id, ledgerType];

    if (req.query.customerId) {
      sqlFilters += ' AND t.customer_id = ?';
      params.push(req.query.customerId);
    }
    if (req.query.type) {
      sqlFilters += ' AND t.type = ?';
      params.push(req.query.type);
    }
    if (req.query.date) {
      sqlFilters += ' AND t.date = ?';
      params.push(req.query.date);
    }
    if (req.query.search) {
      sqlFilters += ' AND (t.note LIKE ? OR c.name LIKE ? OR CAST(t.amount AS CHAR) LIKE ?)';
      const searchVal = `%${req.query.search}%`;
      params.push(searchVal, searchVal, searchVal);
    }

    // 1. Get total matching count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      ${sqlFilters}
    `;
    const [[{ total }]] = await db.query(countSql, params);

    // 2. Fetch paginated data
    const querySql = `
      SELECT
        t.transaction_id AS id,
        t.customer_id    AS customerId,
        c.name           AS customerName,
        t.type,
        t.amount,
        t.date,
        t.note,
        t.status,
        t.due_date       AS dueDate,
        t.category,
        t.edited_at      AS editedAt,
        t.edit_reason    AS editReason,
        t.reversal_reason AS reversalReason,
        (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      ${sqlFilters}
      ORDER BY ${sortCol} ${sortOrder}, t.transaction_id ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(querySql, [...params, limit, offset]);

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

// GET /api/transactions/customer/:id — all txns for one customer (supports pagination if query params present)
router.get('/customer/:id', auth, async (req, res) => {
  const customerId = req.params.id;

  try {
    // If not requesting pagination, return full list (backward compatible)
    if (!req.query.page && !req.query.limit) {
      const [rows] = await db.query(`
        SELECT 
          t.transaction_id AS id, t.customer_id AS customerId,
          t.type, t.amount, t.date, t.note, t.status, t.due_date AS dueDate, t.category,
          t.edited_at AS editedAt, t.edit_reason AS editReason, t.reversal_reason AS reversalReason,
          (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        WHERE t.customer_id = ? AND c.user_id = ?
        ORDER BY t.date DESC, t.transaction_id DESC
      `, [customerId, req.session.user.id]);
      return res.json(rows);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM transactions t 
       JOIN customers c ON t.customer_id = c.customer_id 
       WHERE t.customer_id = ? AND c.user_id = ?`,
      [customerId, req.session.user.id]
    );

    const [rows] = await db.query(`
      SELECT 
        t.transaction_id AS id, t.customer_id AS customerId,
        t.type, t.amount, t.date, t.note, t.status, t.due_date AS dueDate, t.category,
        t.edited_at AS editedAt, t.edit_reason AS editReason, t.reversal_reason AS reversalReason,
        (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.customer_id = ? AND c.user_id = ?
      ORDER BY t.date DESC, t.transaction_id DESC
      LIMIT ? OFFSET ?
    `, [customerId, req.session.user.id, limit, offset]);

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

// GET /api/transactions/dashboard — summary stats
router.get('/dashboard', auth, async (req, res) => {
  const userId = req.session.user.id;
  const ledgerType = req.session.user.userType || 'business';
  try {
    const today = new Date().toISOString().split('T')[0];

    const [[{ totalCustomers }]] = await db.query(
      'SELECT COUNT(*) AS totalCustomers FROM customers WHERE user_id = ? AND ledger_type = ?',
      [userId, ledgerType]
    );

    // Outstanding balance based on active txns
    const [[{ totalPending }]] = await db.query(`
      SELECT COALESCE(SUM(
        CASE WHEN t.type = 'credit'  THEN t.amount
             WHEN t.type = 'payment' THEN -t.amount ELSE 0 END
      ), 0) AS totalPending
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.status = 'active' AND c.user_id = ? AND c.ledger_type = ?
    `, [userId, ledgerType]);

    const [[{ todayCount }]] = await db.query(
      `SELECT COUNT(*) AS todayCount 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.date = ? AND t.status = 'active' AND c.user_id = ? AND c.ledger_type = ?`,
      [today, userId, ledgerType]
    );

    // Overdue count: number of customers who have at least one active overdue credit or overdue installment
    const [[{ overdueCount }]] = await db.query(`
      SELECT COUNT(DISTINCT customer_id) AS overdueCount FROM (
        SELECT t.customer_id
        FROM transactions t
        JOIN customers c ON t.customer_id = c.customer_id
        WHERE t.type = 'credit' AND t.status = 'active' AND t.due_date IS NOT NULL AND t.due_date < CURDATE()
          AND c.user_id = ? AND c.ledger_type = ?
          AND (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) > 0
        UNION
        SELECT t.customer_id
        FROM installments i
        JOIN transactions t ON i.transaction_id = t.transaction_id
        JOIN customers c ON t.customer_id = c.customer_id
        WHERE t.status = 'active' AND i.status = 'overdue' AND c.user_id = ? AND c.ledger_type = ?
      ) AS overdue_customers
    `, [userId, ledgerType, userId, ledgerType]);

    // Dashboard dues summaries: 5 oldest active overdue credit transactions
    const [overdueSummaries] = await db.query(`
      SELECT t.transaction_id AS id, t.amount, t.due_date AS dueDate, c.name AS customerName, c.customer_id AS customerId,
             (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.type = 'credit' AND t.status = 'active' AND t.due_date IS NOT NULL AND t.due_date < CURDATE() AND c.user_id = ? AND c.ledger_type = ?
      HAVING remainingAmount > 0
      ORDER BY t.due_date ASC
      LIMIT 5
    `, [userId, ledgerType]);

    // Upcoming dues: 5 credits due in the next 7 days
    const [upcomingDues] = await db.query(`
      SELECT t.transaction_id AS id, t.amount, t.due_date AS dueDate, c.name AS customerName, c.customer_id AS customerId,
             (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.type = 'credit' AND t.status = 'active' AND t.due_date IS NOT NULL 
        AND t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) AND c.user_id = ? AND c.ledger_type = ?
      HAVING remainingAmount > 0
      ORDER BY t.due_date ASC
      LIMIT 5
    `, [userId, ledgerType]);

    res.json({
      totalCustomers,
      totalPending: parseFloat(totalPending),
      todayCount,
      overdueCount,
      overdueSummaries,
      upcomingDues
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transactions — add new transaction
router.post('/', auth, async (req, res) => {
  const { customerId, type, amount, date, note, dueDate, category } = req.body;
  const userId = req.session.user.id;

  if (!customerId || !type || !amount || !date) {
    return res.status(400).json({ error: 'customerId, type, amount, date are required' });
  }
  if (!['credit', 'payment'].includes(type)) {
    return res.status(400).json({ error: 'type must be credit or payment' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch customer info (verifying user ownership and matching ledger type)
    const ledgerType = req.session.user.userType || 'business';
    const [[customer]] = await conn.query(
      'SELECT name FROM customers WHERE customer_id = ? AND user_id = ? AND ledger_type = ?',
      [customerId, userId, ledgerType]
    );
    if (!customer) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Insert transaction
    const [result] = await conn.query(
      `INSERT INTO transactions (customer_id, type, amount, date, note, status, due_date, category) 
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [customerId, type, parseFloat(amount), date, note?.trim() || '', dueDate || null, category || null]
    );

    const insertId = result.insertId;

    // Recalculate FIFO settlements
    await recalculateSettlements(customerId, conn);

    // If it's a payment, trigger payment received notification immediately
    if (type === 'payment') {
      await triggerPaymentReceivedNotification(userId, customer.name, amount, insertId, conn);
    }

    // Run rules engine to update other alerts
    await generateNotifications(userId, conn);

    await conn.commit();
    res.status(201).json({ id: insertId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/transactions/:id — edit transaction
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { amount, type, note, dueDate, category, editReason } = req.body;
  const userId = req.session.user.id;

  if (!amount || !type) {
    return res.status(400).json({ error: 'amount and type are required' });
  }
  if (!['credit', 'payment'].includes(type)) {
    return res.status(400).json({ error: 'type must be credit or payment' });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch existing transaction (verifying user ownership and active ledger_type)
    const ledgerType = req.session.user.userType || 'business';
    const [[existing]] = await conn.query(
      `SELECT t.customer_id, t.amount, t.type 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?`,
      [id, userId, ledgerType]
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found or access denied' });
    }

    // Perform database update
    await conn.query(
      `UPDATE transactions 
       SET amount = ?, type = ?, note = ?, due_date = ?, category = ?, edited_at = CURRENT_TIMESTAMP, edit_reason = ?
       WHERE transaction_id = ?`,
      [parseFloat(amount), type, note?.trim() || '', dueDate || null, category || null, editReason?.trim() || null, id]
    );

    // Recalculate Settlements & Alerts
    await recalculateSettlements(existing.customer_id, conn);
    await generateNotifications(userId, conn);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// POST /api/transactions/:id/reverse — soft reverse a transaction
router.post('/:id/reverse', auth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.session.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const ledgerType = req.session.user.userType || 'business';
    const [[txn]] = await conn.query(
      `SELECT t.customer_id, t.type, t.amount, t.status 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?`,
      [id, userId, ledgerType]
    );
    if (!txn) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (txn.status === 'reversed') {
      await conn.rollback();
      return res.status(400).json({ error: 'Transaction is already reversed' });
    }

    // Mark as reversed
    await conn.query(
      "UPDATE transactions SET status = 'reversed', reversal_reason = ? WHERE transaction_id = ?",
      [reason?.trim() || 'Reversed by user', id]
    );

    // Recalculate Settlements & Alerts
    await recalculateSettlements(txn.customer_id, conn);
    await generateNotifications(userId, conn);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// POST /api/transactions/:id/unreverse — undo reversal
router.post('/:id/unreverse', auth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const ledgerType = req.session.user.userType || 'business';
    const [[txn]] = await conn.query(
      `SELECT t.customer_id, t.type, t.amount, t.status 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?`,
      [id, userId, ledgerType]
    );
    if (!txn) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (txn.status === 'active') {
      await conn.rollback();
      return res.status(400).json({ error: 'Transaction is already active' });
    }

    // Mark active again
    await conn.query(
      "UPDATE transactions SET status = 'active', reversal_reason = NULL WHERE transaction_id = ?",
      [id]
    );

    // Recalculate Settlements & Alerts
    await recalculateSettlements(txn.customer_id, conn);
    await generateNotifications(userId, conn);

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

// DELETE /api/transactions/:id — mapped to soft reverse for backward compatibility
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const ledgerType = req.session.user.userType || 'business';
    const [[txn]] = await conn.query(
      `SELECT t.customer_id, t.status 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?`,
      [id, userId, ledgerType]
    );
    if (!txn) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Mark as reversed
    await conn.query(
      "UPDATE transactions SET status = 'reversed', reversal_reason = 'Deleted via legacy interface' WHERE transaction_id = ?",
      [id]
    );

    await recalculateSettlements(txn.customer_id, conn);
    await generateNotifications(userId, conn);

    await conn.commit();
    res.json({ success: true, message: 'Transaction soft-deleted (reversed)' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
