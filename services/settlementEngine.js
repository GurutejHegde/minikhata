const db = require('../db');

/**
 * Recalculates all payment-to-credit FIFO settlements and updates installment progress for a customer.
 * Must run inside a transaction block to maintain database consistency.
 * 
 * @param {number} customerId 
 * @param {object} [conn] Optional connection (use if running inside an active transaction)
 */
async function recalculateSettlements(customerId, conn) {
  const runner = conn || db;

  // 1. Delete all existing settlements for this customer
  await runner.query(`
    DELETE FROM settlements 
    WHERE payment_transaction_id IN (
      SELECT transaction_id FROM transactions WHERE customer_id = ?
    )
  `, [customerId]);

  // 2. Fetch all active, non-reversed payments for this customer (FIFO order)
  const [payments] = await runner.query(`
    SELECT transaction_id AS id, amount 
    FROM transactions 
    WHERE customer_id = ? AND type = 'payment' AND status = 'active'
    ORDER BY date ASC, transaction_id ASC
  `, [customerId]);

  // 3. Fetch all active, non-reversed credits for this customer (FIFO order)
  const [credits] = await runner.query(`
    SELECT transaction_id AS id, amount 
    FROM transactions 
    WHERE customer_id = ? AND type = 'credit' AND status = 'active'
    ORDER BY date ASC, transaction_id ASC
  `, [customerId]);

  // Track allocated amount for each credit
  const creditDetails = credits.map(c => ({
    id: c.id,
    amount: parseFloat(c.amount),
    allocated: 0.0
  }));

  const settlementRows = [];

  // 4. Run FIFO allocation algorithm
  for (const payment of payments) {
    let unallocatedAmount = parseFloat(payment.amount);

    for (const credit of creditDetails) {
      if (unallocatedAmount <= 0) break;

      const remainingNeed = credit.amount - credit.allocated;
      if (remainingNeed > 0) {
        const alloc = Math.min(unallocatedAmount, remainingNeed);
        credit.allocated += alloc;
        unallocatedAmount -= alloc;

        settlementRows.push([payment.id, credit.id, alloc]);
      }
    }
  }

  // 5. Bulk insert settlements if any
  if (settlementRows.length > 0) {
    await runner.query(
      'INSERT INTO settlements (payment_transaction_id, credit_transaction_id, amount_allocated) VALUES ?',
      [settlementRows]
    );
  }

  // 6. Update installment statuses for all credits of this customer
  for (const credit of creditDetails) {
    // Check if this credit transaction has installment records
    const [installments] = await runner.query(`
      SELECT id, amount, due_date 
      FROM installments 
      WHERE transaction_id = ?
      ORDER BY due_date ASC, id ASC
    `, [credit.id]);

    if (installments.length > 0) {
      let creditAllocated = credit.allocated;

      for (const inst of installments) {
        const instAmount = parseFloat(inst.amount);
        const alloc = Math.min(creditAllocated, instAmount);
        creditAllocated -= alloc;

        let status = 'pending';
        if (alloc >= instAmount) {
          status = 'paid';
        } else {
          // If unpaid or partially paid, check if overdue
          const today = new Date().toISOString().split('T')[0];
          const dueStr = new Date(inst.due_date).toISOString().split('T')[0];
          if (dueStr < today) {
            status = 'overdue';
          } else {
            status = 'pending';
          }
        }

        await runner.query(`
          UPDATE installments 
          SET paid_amount = ?, status = ? 
          WHERE id = ?
        `, [alloc, status, inst.id]);
      }
    }
  }
}

module.exports = {
  recalculateSettlements
};
