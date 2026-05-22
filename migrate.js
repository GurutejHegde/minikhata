const db = require('./db');

async function run() {
  console.log('Starting database migrations...');
  const conn = await db.getConnection();
  try {
    // Start transaction
    await conn.beginTransaction();

    // Check if columns already exist on transactions to prevent errors
    const [cols] = await conn.query('SHOW COLUMNS FROM transactions');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('status')) {
      console.log('Adding status column to transactions...');
      await conn.query(`
        ALTER TABLE transactions 
        ADD COLUMN status ENUM('active', 'reversed') DEFAULT 'active' AFTER note
      `);
    }

    if (!colNames.includes('due_date')) {
      console.log('Adding due_date column to transactions...');
      await conn.query(`
        ALTER TABLE transactions 
        ADD COLUMN due_date DATE DEFAULT NULL AFTER status
      `);
    }

    if (!colNames.includes('category')) {
      console.log('Adding category column to transactions...');
      await conn.query(`
        ALTER TABLE transactions 
        ADD COLUMN category VARCHAR(50) DEFAULT NULL AFTER due_date
      `);
    }

    if (!colNames.includes('edited_at')) {
      console.log('Adding edit tracking columns to transactions...');
      await conn.query(`
        ALTER TABLE transactions 
        ADD COLUMN edited_at TIMESTAMP NULL DEFAULT NULL AFTER category,
        ADD COLUMN edit_reason VARCHAR(255) DEFAULT NULL AFTER edited_at,
        ADD COLUMN reversal_reason VARCHAR(255) DEFAULT NULL AFTER edit_reason
      `);
    }

    // Add indexes if not exist (we can catch duplicate index errors if any, or create indexes normally)
    console.log('Adding database indexes...');
    try {
      await conn.query('CREATE INDEX idx_txn_customer_status ON transactions (customer_id, status)');
    } catch (e) {
      console.log('Note: idx_txn_customer_status index might already exist.');
    }
    try {
      await conn.query('CREATE INDEX idx_txn_date_status ON transactions (date, status)');
    } catch (e) {
      console.log('Note: idx_txn_date_status index might already exist.');
    }

    // Create settlements table
    console.log('Creating settlements table if not exists...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settlements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_transaction_id INT NOT NULL,
        credit_transaction_id INT NOT NULL,
        amount_allocated DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
        FOREIGN KEY (credit_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
        INDEX idx_settlement_payment (payment_transaction_id),
        INDEX idx_settlement_credit (credit_transaction_id)
      )
    `);

    // Create installments table
    console.log('Creating installments table if not exists...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS installments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id INT NOT NULL,
        due_date DATE NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
        paid_amount DECIMAL(10,2) DEFAULT 0.00,
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
        INDEX idx_inst_txn (transaction_id),
        INDEX idx_inst_due (due_date)
      )
    `);

    // Create notifications table
    console.log('Creating notifications table if not exists...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message VARCHAR(255) NOT NULL,
        reference_id INT DEFAULT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_notif_user_read (user_id, is_read)
      )
    `);

    // Check and add user_id to customers
    const [custCols] = await conn.query('SHOW COLUMNS FROM customers');
    const custColNames = custCols.map(c => c.Field);
    if (!custColNames.includes('user_id')) {
      console.log('Adding user_id column to customers...');
      await conn.query(`
        ALTER TABLE customers 
        ADD COLUMN user_id INT DEFAULT 1 AFTER customer_id,
        ADD CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      `);
    }

    await conn.commit();
    console.log('✓ Migrations successfully completed!');
  } catch (err) {
    await conn.rollback();
    console.error('✗ Migration failed:', err);
    process.exit(1);
  } finally {
    conn.release();
    db.end();
  }
}

run();
