const db = require('../db');

/**
 * Evaluates rules to auto-generate and clean up notifications for a specific user.
 * 
 * @param {number} userId 
 * @param {object} [conn] Optional connection
 */
async function generateNotifications(userId, conn) {
  const runner = conn || db;
  const today = new Date().toISOString().split('T')[0];

  // 1. RULE: High Pending Balance (> 10,000)
  // Fetch customer balances
  const [customerBalances] = await runner.query(`
    SELECT c.customer_id AS id, c.name,
           COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                             WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                             ELSE 0 END), 0) AS balance
    FROM customers c
    LEFT JOIN transactions t ON c.customer_id = t.customer_id
    WHERE c.user_id = ?
    GROUP BY c.customer_id
  `, [userId]);

  for (const c of customerBalances) {
    const bal = parseFloat(c.balance);
    if (bal > 10000) {
      // Check if alert already exists
      const [existing] = await runner.query(
        'SELECT id FROM notifications WHERE user_id = ? AND type = "high_balance" AND reference_id = ?',
        [userId, c.id]
      );
      if (existing.length === 0) {
        await runner.query(
          'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "high_balance", ?, ?)',
          [userId, `Customer ${c.name} has a high pending balance of ₹${bal.toLocaleString('en-IN')}`, c.id]
        );
      }
    } else {
      // Clean up if balance fell below threshold
      await runner.query(
        'DELETE FROM notifications WHERE user_id = ? AND type = "high_balance" AND reference_id = ?',
        [userId, c.id]
      );
    }
  }

  // 2. RULE: Inactive Customers (balance > 0, no transaction in 45 days)
  const [inactiveCustomers] = await runner.query(`
    SELECT c.customer_id AS id, c.name,
           COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'active' THEN t.amount
                             WHEN t.type = 'payment' AND t.status = 'active' THEN -t.amount
                             ELSE 0 END), 0) AS balance,
           MAX(CASE WHEN t.status = 'active' THEN t.date ELSE NULL END) AS lastTxnDate
    FROM customers c
    LEFT JOIN transactions t ON c.customer_id = t.customer_id
    WHERE c.user_id = ?
    GROUP BY c.customer_id
    HAVING balance > 0 AND (lastTxnDate < DATE_SUB(CURDATE(), INTERVAL 45 DAY) OR lastTxnDate IS NULL)
  `, [userId]);

  const activeInactiveIds = inactiveCustomers.map(ic => ic.id);

  // Clear inactive customer warnings if they are no longer in the inactive list
  if (activeInactiveIds.length > 0) {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "inactive_customer" AND reference_id NOT IN (?)',
      [userId, activeInactiveIds]
    );
  } else {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "inactive_customer"',
      [userId]
    );
  }

  for (const c of inactiveCustomers) {
    const bal = parseFloat(c.balance);
    const [existing] = await runner.query(
      'SELECT id FROM notifications WHERE user_id = ? AND type = "inactive_customer" AND reference_id = ?',
      [userId, c.id]
    );
    if (existing.length === 0) {
      await runner.query(
        'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "inactive_customer", ?, ?)',
        [userId, `Customer ${c.name} has been inactive for 45+ days with an outstanding balance of ₹${bal.toLocaleString('en-IN')}`, c.id]
      );
    }
  }

  // 3. RULE: Overdue Credit Dues (due_date in past, remaining amount > 0)
  const [overdueCredits] = await runner.query(`
    SELECT t.transaction_id AS id, t.amount, t.due_date, c.name AS customerName,
           (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
    FROM transactions t
    JOIN customers c ON t.customer_id = c.customer_id
    WHERE t.type = 'credit' AND t.status = 'active' AND t.due_date IS NOT NULL AND t.due_date < CURDATE()
      AND c.user_id = ?
    HAVING remainingAmount > 0
  `, [userId]);

  const overdueCreditIds = overdueCredits.map(oc => oc.id);
  // Remove overdue credit alerts for fully settled credits
  if (overdueCreditIds.length > 0) {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "overdue_credit" AND reference_id NOT IN (?)',
      [userId, overdueCreditIds]
    );
  } else {
    await runner.query('DELETE FROM notifications WHERE user_id = ? AND type = "overdue_credit"', [userId]);
  }

  for (const t of overdueCredits) {
    const [existing] = await runner.query(
      'SELECT id FROM notifications WHERE user_id = ? AND type = "overdue_credit" AND reference_id = ?',
      [userId, t.id]
    );
    if (existing.length === 0) {
      const dueStr = new Date(t.due_date).toLocaleDateString('en-IN');
      await runner.query(
        'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "overdue_credit", ?, ?)',
        [userId, `Credit of ₹${parseFloat(t.amount).toLocaleString('en-IN')} for ${t.customerName} is overdue (Due: ${dueStr})`, t.id]
      );
    }
  }

  // 4. RULE: Upcoming Credit Dues (due_date in next 3 days)
  const [upcomingCredits] = await runner.query(`
    SELECT t.transaction_id AS id, t.amount, t.due_date, c.name AS customerName,
           (t.amount - COALESCE((SELECT SUM(amount_allocated) FROM settlements WHERE credit_transaction_id = t.transaction_id), 0)) AS remainingAmount
    FROM transactions t
    JOIN customers c ON t.customer_id = c.customer_id
    WHERE t.type = 'credit' AND t.status = 'active' AND t.due_date IS NOT NULL 
      AND t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
      AND c.user_id = ?
    HAVING remainingAmount > 0
  `, [userId]);

  const upcomingCreditIds = upcomingCredits.map(uc => uc.id);
  if (upcomingCreditIds.length > 0) {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "upcoming_due_credit" AND reference_id NOT IN (?)',
      [userId, upcomingCreditIds]
    );
  } else {
    await runner.query('DELETE FROM notifications WHERE user_id = ? AND type = "upcoming_due_credit"', [userId]);
  }

  for (const t of upcomingCredits) {
    const [existing] = await runner.query(
      'SELECT id FROM notifications WHERE user_id = ? AND type = "upcoming_due_credit" AND reference_id = ?',
      [userId, t.id]
    );
    if (existing.length === 0) {
      const dueStr = new Date(t.due_date).toLocaleDateString('en-IN');
      await runner.query(
        'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "upcoming_due_credit", ?, ?)',
        [userId, `Credit of ₹${parseFloat(t.amount).toLocaleString('en-IN')} for ${t.customerName} is due soon on ${dueStr}`, t.id]
      );
    }
  }

  // 5. RULE: Overdue Installments
  const [overdueInstallments] = await runner.query(`
    SELECT i.id, i.amount, i.due_date, c.name AS customerName
    FROM installments i
    JOIN transactions t ON i.transaction_id = t.transaction_id
    JOIN customers c ON t.customer_id = c.customer_id
    WHERE t.status = 'active' AND i.status = 'overdue' AND c.user_id = ?
  `, [userId]);

  const overdueInstIds = overdueInstallments.map(oi => oi.id);
  if (overdueInstIds.length > 0) {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "overdue_installment" AND reference_id NOT IN (?)',
      [userId, overdueInstIds]
    );
  } else {
    await runner.query('DELETE FROM notifications WHERE user_id = ? AND type = "overdue_installment"', [userId]);
  }

  for (const inst of overdueInstallments) {
    const [existing] = await runner.query(
      'SELECT id FROM notifications WHERE user_id = ? AND type = "overdue_installment" AND reference_id = ?',
      [userId, inst.id]
    );
    if (existing.length === 0) {
      const dueStr = new Date(inst.due_date).toLocaleDateString('en-IN');
      await runner.query(
        'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "overdue_installment", ?, ?)',
        [userId, `Installment of ₹${parseFloat(inst.amount).toLocaleString('en-IN')} for ${inst.customerName} is overdue (Due: ${dueStr})`, inst.id]
      );
    }
  }

  // 6. RULE: Upcoming Installments
  const [upcomingInstallments] = await runner.query(`
    SELECT i.id, i.amount, i.due_date, c.name AS customerName
    FROM installments i
    JOIN transactions t ON i.transaction_id = t.transaction_id
    JOIN customers c ON t.customer_id = c.customer_id
    WHERE t.status = 'active' AND i.status = 'pending' 
      AND i.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
      AND c.user_id = ?
  `, [userId]);

  const upcomingInstIds = upcomingInstallments.map(ui => ui.id);
  if (upcomingInstIds.length > 0) {
    await runner.query(
      'DELETE FROM notifications WHERE user_id = ? AND type = "upcoming_due_installment" AND reference_id NOT IN (?)',
      [userId, upcomingInstIds]
    );
  } else {
    await runner.query('DELETE FROM notifications WHERE user_id = ? AND type = "upcoming_due_installment"', [userId]);
  }

  for (const inst of upcomingInstallments) {
    const [existing] = await runner.query(
      'SELECT id FROM notifications WHERE user_id = ? AND type = "upcoming_due_installment" AND reference_id = ?',
      [userId, inst.id]
    );
    if (existing.length === 0) {
      const dueStr = new Date(inst.due_date).toLocaleDateString('en-IN');
      await runner.query(
        'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "upcoming_due_installment", ?, ?)',
        [userId, `Installment of ₹${parseFloat(inst.amount).toLocaleString('en-IN')} for ${inst.customerName} is due soon on ${dueStr}`, inst.id]
      );
    }
  }
}

/**
 * Triggers a notification for received payment immediately on creation.
 */
async function triggerPaymentReceivedNotification(userId, customerName, amount, paymentTxnId, conn) {
  const runner = conn || db;
  await runner.query(
    'INSERT INTO notifications (user_id, type, message, reference_id) VALUES (?, "received_payment", ?, ?)',
    [userId, `Received payment of ₹${parseFloat(amount).toLocaleString('en-IN')} from ${customerName}`, paymentTxnId]
  );
}

module.exports = {
  generateNotifications,
  triggerPaymentReceivedNotification
};
