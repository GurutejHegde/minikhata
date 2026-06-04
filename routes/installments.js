const express = require('express');
const db      = require('../db');
const { recalculateSettlements } = require('../services/settlementEngine');
const router  = express.Router();

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// GET /api/installments/transaction/:txnId — get installment timeline for a credit txn
router.get('/transaction/:txnId', auth, async (req, res) => {
  try {
    const ledgerType = req.session.user.userType || 'business';
    const [rows] = await db.query(
      `SELECT i.id, i.amount, i.due_date AS dueDate, i.status, i.paid_amount AS paidAmount
       FROM installments i
       JOIN transactions t ON i.transaction_id = t.transaction_id
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE i.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?
       ORDER BY i.due_date ASC, i.id ASC`,
      [req.params.txnId, req.session.user.id, ledgerType]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/installments/transaction/:txnId — create or update installment plan
router.post('/transaction/:txnId', auth, async (req, res) => {
  const { txnId } = req.params;
  const { planType, installmentsCount, startDate, customInstallments } = req.body;

  if (!planType) {
    return res.status(400).json({ error: 'planType is required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch transaction amount and customer id (scoped to current user and active mode)
    const ledgerType = req.session.user.userType || 'business';
    const [[txn]] = await conn.query(
      `SELECT t.amount, t.customer_id AS customerId, t.type, t.status 
       FROM transactions t
       JOIN customers c ON t.customer_id = c.customer_id
       WHERE t.transaction_id = ? AND c.user_id = ? AND c.ledger_type = ?`,
      [txnId, req.session.user.id, ledgerType]
    );

    if (!txn) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (txn.type !== 'credit') {
      await conn.rollback();
      return res.status(400).json({ error: 'Installment plans can only be created for credit entries' });
    }
    if (txn.status === 'reversed') {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot create installment plans for reversed transactions' });
    }

    const totalAmount = parseFloat(txn.amount);
    let installmentEntries = [];

    if (planType === 'custom') {
      if (!Array.isArray(customInstallments) || customInstallments.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'customInstallments array is required for custom plan' });
      }

      let customSum = 0;
      for (const inst of customInstallments) {
        if (!inst.dueDate || !inst.amount || parseFloat(inst.amount) <= 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'Each installment must have a valid dueDate and amount > 0' });
        }
        customSum += parseFloat(inst.amount);
        installmentEntries.push({
          dueDate: inst.dueDate,
          amount: parseFloat(inst.amount)
        });
      }

      // Check sum matches
      if (Math.abs(customSum - totalAmount) > 0.01) {
        await conn.rollback();
        return res.status(400).json({ 
          error: `Sum of custom installments (₹${customSum}) must equal total credit amount (₹${totalAmount})` 
        });
      }
    } else {
      const count = parseInt(installmentsCount);
      if (!count || count <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'installmentsCount must be greater than 0' });
      }
      if (!startDate) {
        await conn.rollback();
        return res.status(400).json({ error: 'startDate is required' });
      }

      // Split amount evenly, last one gets the rounding error remainder
      const baseAmount = Math.floor((totalAmount / count) * 100) / 100;
      const lastAmount = parseFloat((totalAmount - (baseAmount * (count - 1))).toFixed(2));

      let current = new Date(startDate);

      for (let i = 0; i < count; i++) {
        const amt = (i === count - 1) ? lastAmount : baseAmount;
        const formattedDate = current.toISOString().split('T')[0];

        installmentEntries.push({
          dueDate: formattedDate,
          amount: amt
        });

        // Increment date based on planType
        if (planType === 'weekly') {
          current.setDate(current.getDate() + 7);
        } else if (planType === 'monthly') {
          current.setMonth(current.getMonth() + 1);
        }
      }
    }

    // Delete existing installments
    await conn.query('DELETE FROM installments WHERE transaction_id = ?', [txnId]);

    // Insert new installments
    const insertValues = installmentEntries.map(inst => [
      txnId,
      inst.dueDate,
      inst.amount,
      'pending',
      0.00
    ]);

    await conn.query(
      'INSERT INTO installments (transaction_id, due_date, amount, status, paid_amount) VALUES ?',
      [insertValues]
    );

    // Recalculate settlements to allocate payments to these installments
    await recalculateSettlements(txn.customerId, conn);

    await conn.commit();
    res.json({ success: true, count: installmentEntries.length });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

module.exports = router;
