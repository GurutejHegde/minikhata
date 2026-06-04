const express = require('express');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/backup/export — download user-specific DB backup
router.get('/export', auth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [customers] = await db.query(
      'SELECT customer_id, name, phone, address, ledger_type, created_at FROM customers WHERE user_id = ?',
      [userId]
    );

    const [transactions] = await db.query(
      `SELECT t.transaction_id, t.customer_id, t.type, t.amount, t.date, t.note,
              t.status, t.due_date, t.category, t.edited_at, t.edit_reason, t.reversal_reason
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE c.user_id = ?`,
      [userId]
    );

    const [settlements] = await db.query(
      `SELECT s.id, s.payment_transaction_id, s.credit_transaction_id, s.amount_allocated, s.created_at
       FROM settlements s
       JOIN transactions t ON s.payment_transaction_id = t.transaction_id
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE c.user_id = ?`,
      [userId]
    );

    const [installments] = await db.query(
      `SELECT i.id, i.transaction_id, i.due_date, i.amount, i.status, i.paid_amount
       FROM installments i
       JOIN transactions t ON i.transaction_id = t.transaction_id
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE c.user_id = ?`,
      [userId]
    );

    const [notifications] = await db.query(
      'SELECT id, type, message, reference_id, is_read, created_at FROM notifications WHERE user_id = ?',
      [userId]
    );

    const backupObject = {
      backup: true,
      version: '1.1',
      timestamp: new Date().toISOString(),
      data: {
        customers,
        transactions,
        settlements,
        installments,
        notifications
      }
    };

    res.setHeader('Content-disposition', `attachment; filename=minikhata_backup_${req.session.user.username}.json`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(backupObject, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error exporting database' });
  }
});

// POST /api/backup/restore — upload and restore database for current user
router.post('/restore', auth, async (req, res) => {
  const { backup, data } = req.body;
  const userId = req.session.user.id;

  if (!backup || !data) {
    return res.status(400).json({ error: 'Invalid backup file format' });
  }

  const { customers, transactions, settlements, installments, notifications } = data;

  // 1. Validate structural integrity
  if (!Array.isArray(customers) || !Array.isArray(transactions) ||
      !Array.isArray(settlements) || !Array.isArray(installments)) {
    return res.status(400).json({ error: 'Integrity check failed: Missing database table arrays' });
  }

  // Validate critical columns are present
  const customerValid = customers.every(c => c.customer_id && c.name && c.phone);
  const txnValid = transactions.every(t => t.transaction_id && t.customer_id && t.type && t.amount && t.date);

  if (!customerValid || !txnValid) {
    return res.status(400).json({ error: 'Integrity check failed: Corrupted customer or transaction schemas' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 2. Safely delete this user's existing records (maintaining isolation, not truncating)
    await conn.query(`
      DELETE i FROM installments i
      JOIN transactions t ON i.transaction_id = t.transaction_id
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE c.user_id = ?
    `, [userId]);

    await conn.query(`
      DELETE s FROM settlements s
      JOIN transactions t ON s.payment_transaction_id = t.transaction_id
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE c.user_id = ?
    `, [userId]);

    await conn.query(`
      DELETE t FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE c.user_id = ?
    `, [userId]);

    await conn.query('DELETE FROM customers WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM notifications WHERE user_id = ?', [userId]);

    // ID maps to translate relationship keys from backup to newly created records
    const customerIdMap = {};
    const txnIdMap = {};

    // 3. Restore Customers
    for (const c of customers) {
      const [result] = await conn.query(
        `INSERT INTO customers (name, phone, address, user_id, ledger_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          c.name,
          c.phone,
          c.address || '',
          userId,
          c.ledger_type || 'business',
          c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : null
        ]
      );
      customerIdMap[c.customer_id] = result.insertId;
    }

    // 4. Restore Transactions
    for (const t of transactions) {
      const newCustId = customerIdMap[t.customer_id];
      if (!newCustId) continue; // safety check

      const [result] = await conn.query(
        `INSERT INTO transactions (customer_id, type, amount, date, note, status, due_date, category, edited_at, edit_reason, reversal_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newCustId,
          t.type,
          parseFloat(t.amount),
          t.date ? new Date(t.date).toISOString().split('T')[0] : null,
          t.note || '',
          t.status || 'active',
          t.due_date ? new Date(t.due_date).toISOString().split('T')[0] : null,
          t.category || null,
          t.edited_at ? new Date(t.edited_at) : null,
          t.edit_reason || null,
          t.reversal_reason || null
        ]
      );
      txnIdMap[t.transaction_id] = result.insertId;
    }

    // 5. Restore Settlements
    for (const s of settlements) {
      const newPaymentTxnId = txnIdMap[s.payment_transaction_id];
      const newCreditTxnId = txnIdMap[s.credit_transaction_id];

      if (newPaymentTxnId && newCreditTxnId) {
        await conn.query(
          `INSERT INTO settlements (payment_transaction_id, credit_transaction_id, amount_allocated, created_at)
           VALUES (?, ?, ?, ?)`,
          [
            newPaymentTxnId,
            newCreditTxnId,
            parseFloat(s.amount_allocated),
            s.created_at ? new Date(s.created_at) : null
          ]
        );
      }
    }

    // 6. Restore Installments
    for (const i of installments) {
      const newTxnId = txnIdMap[i.transaction_id];
      if (newTxnId) {
        await conn.query(
          `INSERT INTO installments (transaction_id, due_date, amount, status, paid_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [
            newTxnId,
            i.due_date ? new Date(i.due_date).toISOString().split('T')[0] : null,
            parseFloat(i.amount),
            i.status || 'pending',
            parseFloat(i.paid_amount || 0)
          ]
        );
      }
    }

    // 7. Restore or regenerate Notifications
    const notifsToInsert = [];
    if (Array.isArray(notifications)) {
      for (const n of notifications) {
        let newRefId = null;
        if (n.reference_id) {
          if (['received_payment', 'overdue_credit', 'upcoming_due_credit'].includes(n.type)) {
            newRefId = txnIdMap[n.reference_id] || null;
          } else if (['high_balance', 'inactive_customer'].includes(n.type)) {
            newRefId = customerIdMap[n.reference_id] || null;
          }
        }
        notifsToInsert.push([
          userId,
          n.type,
          n.message,
          newRefId,
          n.is_read || 0,
          n.created_at ? new Date(n.created_at) : null
        ]);
      }
    }

    if (notifsToInsert.length > 0) {
      await conn.query(
        `INSERT INTO notifications (user_id, type, message, reference_id, is_read, created_at)
         VALUES ?`,
        [notifsToInsert]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Database restored successfully' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error restoring database backup: ' + err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
