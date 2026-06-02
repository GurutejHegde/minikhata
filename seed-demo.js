/**
 * seed-demo.js — Populate MiniKhata with realistic demo data for screenshots/reports
 * Run: node seed-demo.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seed() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'minikhata',
  });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // ─── 1. WIPE ALL EXISTING DATA (order matters due to FK constraints) ───
    console.log('🗑️  Clearing existing data...');
    await conn.query('DELETE FROM installments');
    await conn.query('DELETE FROM settlements');
    await conn.query('DELETE FROM notifications');
    await conn.query('DELETE FROM transactions');
    await conn.query('DELETE FROM customers');
    await conn.query('DELETE FROM users');

    // Reset auto-increment counters
    await conn.query('ALTER TABLE users AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE customers AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE transactions AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE settlements AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE installments AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE notifications AUTO_INCREMENT = 1');

    // ─── 2. CREATE DEMO USERS ──────────────────────────────────────────────
    console.log('👤 Creating demo users...');
    const usersToCreate = [
      { username: 'gurutej', password: 'demo1234', type: 'business' },
      { username: 'admin', password: '1234', type: 'business' }
    ];

    for (const u of usersToCreate) {
      const hashedPassword = await bcrypt.hash(u.password, 10);
      const [userResult] = await conn.query(
        `INSERT INTO users (username, password, user_type, created_at) VALUES (?, ?, ?, '2025-01-10')`,
        [u.username, hashedPassword, u.type]
      );
      const userId = userResult.insertId;

      // ─── 3. INSERT 6 CUSTOMERS ────────────────────────────────────────────
      console.log(`👥 Adding 6 customers for ${u.username}...`);
      const customers = [
        { name: 'Rajan Medical Store',   phone: '9876543210', address: 'Main Bazaar, Hubli',      created: '2025-01-15' },
        { name: 'Suresh Kirana Mart',    phone: '9123456789', address: 'Gandhi Nagar, Dharwad',    created: '2025-01-20' },
        { name: 'Priya Cloth Emporium',  phone: '9988776655', address: 'Cloth Market, Hubli',      created: '2025-02-05' },
        { name: 'Vikram Hardware',       phone: '9654321870', address: 'Station Road, Hubli',      created: '2025-02-18' },
        { name: 'Lakshmi Jewellers',     phone: '9871234560', address: 'Deshpande Nagar, Hubli',   created: '2025-03-01' },
        { name: 'Anand Stationery',      phone: '9345678120', address: 'Vidyanagar, Dharwad',      created: '2025-03-10' },
      ];

      const customerIds = [];
      for (const c of customers) {
        const [res] = await conn.query(
          `INSERT INTO customers (user_id, name, phone, address, created_at) VALUES (?, ?, ?, ?, ?)`,
          [userId, c.name, c.phone, c.address, c.created]
        );
        customerIds.push(res.insertId);
      }
      const [rajanId, sureshId, priyaId, vikramId, lakshmiId, anandId] = customerIds;

      // ─── 4. INSERT TRANSACTIONS (realistic, spread over months) ───────────
      console.log(`💸 Adding transactions for ${u.username}...`);
      const txns = [
        // ── Rajan Medical Store (Outstanding: ₹8,200) ──
        { cid: rajanId, type: 'credit',  amount: 5000,  date: '2025-02-01', note: 'Medicines bulk order' },
        { cid: rajanId, type: 'credit',  amount: 3200,  date: '2025-02-15', note: 'Surgical supplies' },
        { cid: rajanId, type: 'payment', amount: 2000,  date: '2025-03-01', note: 'Partial payment — cash' },
        { cid: rajanId, type: 'credit',  amount: 4500,  date: '2025-03-20', note: 'Monthly medicines restock' },
        { cid: rajanId, type: 'payment', amount: 2500,  date: '2025-04-05', note: 'UPI transfer' },

        // ── Suresh Kirana Mart (Outstanding: ₹0 — fully settled) ──
        { cid: sureshId, type: 'credit',  amount: 8000,  date: '2025-01-25', note: 'Grocery wholesale order' },
        { cid: sureshId, type: 'payment', amount: 3000,  date: '2025-02-10', note: 'Cash payment' },
        { cid: sureshId, type: 'payment', amount: 5000,  date: '2025-03-15', note: 'Full settlement — bank transfer' },

        // ── Priya Cloth Emporium (Outstanding: ₹12,500) ──
        { cid: priyaId, type: 'credit',  amount: 15000, date: '2025-02-10', note: 'Silk sarees — wedding season', dueDate: '2025-04-10' },
        { cid: priyaId, type: 'payment', amount: 5000,  date: '2025-03-01', note: 'Advance payment — cheque' },
        { cid: priyaId, type: 'credit',  amount: 7500,  date: '2025-03-25', note: 'Cotton fabrics shipment', dueDate: '2025-05-25' },
        { cid: priyaId, type: 'payment', amount: 5000,  date: '2025-04-15', note: 'Monthly installment — UPI' },

        // ── Vikram Hardware (Outstanding: ₹6,800) ──
        { cid: vikramId, type: 'credit',  amount: 12000, date: '2025-02-20', note: 'Cement and steel rods' },
        { cid: vikramId, type: 'payment', amount: 6000,  date: '2025-03-10', note: 'Partial — cash' },
        { cid: vikramId, type: 'credit',  amount: 3800,  date: '2025-04-01', note: 'Plumbing materials' },
        { cid: vikramId, type: 'payment', amount: 3000,  date: '2025-04-20', note: 'UPI payment' },

        // ── Lakshmi Jewellers (Outstanding: ₹35,000 — high balance) ──
        { cid: lakshmiId, type: 'credit',  amount: 50000, date: '2025-03-05', note: 'Gold chain — 8 grams', dueDate: '2025-05-05' },
        { cid: lakshmiId, type: 'payment', amount: 15000, date: '2025-03-20', note: 'Cash deposit' },
        { cid: lakshmiId, type: 'credit',  amount: 8000,  date: '2025-04-10', note: 'Silver anklets pair' },
        { cid: lakshmiId, type: 'payment', amount: 8000,  date: '2025-04-25', note: 'Cheque payment' },

        // ── Anand Stationery (Outstanding: ₹1,950) ──
        { cid: anandId, type: 'credit',  amount: 2500,  date: '2025-03-15', note: 'Notebooks and registers bulk' },
        { cid: anandId, type: 'payment', amount: 1000,  date: '2025-04-01', note: 'Cash' },
        { cid: anandId, type: 'credit',  amount: 1200,  date: '2025-04-12', note: 'Printer cartridges' },
        { cid: anandId, type: 'payment', amount: 750,   date: '2025-04-28', note: 'UPI — partial' },
      ];

      for (const t of txns) {
        await conn.query(
          `INSERT INTO transactions (customer_id, type, amount, date, note, status, due_date, category)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
          [t.cid, t.type, t.amount, t.date, t.note, t.dueDate || null, null]
        );
      }

      // ─── 5. RUN FIFO SETTLEMENT ENGINE FOR EACH CUSTOMER ──────────────────
      console.log(`⚙️  Running FIFO settlement engine for ${u.username}...`);
      const { recalculateSettlements } = require('./services/settlementEngine');
      for (const cid of customerIds) {
        await recalculateSettlements(cid, conn);
      }

      // ─── 6. GENERATE NOTIFICATIONS ────────────────────────────────────────
      console.log(`🔔 Generating notifications for ${u.username}...`);
      const { generateNotifications } = require('./services/notificationRules');
      await generateNotifications(userId, conn);
    }

    await conn.commit();

    // ─── 7. PRINT SUMMARY ─────────────────────────────────────────────────
    console.log('\n✅ Demo data seeded successfully!\n');
    console.log('═══════════════════════════════════════════');
    console.log('  LOGIN CREDENTIALS OPTIONS');
    console.log('═══════════════════════════════════════════');
    console.log('  Option 1:');
    console.log('    Username : admin');
    console.log('    Password : 1234');
    console.log('    Type     : Business');
    console.log('  Option 2:');
    console.log('    Username : gurutej');
    console.log('    Password : demo1234');
    console.log('    Type     : Business');
    console.log('═══════════════════════════════════════════\n');

    console.log('📊 Customer Balances (Outstanding):');
    console.log('  1. Rajan Medical Store   → ₹8,200');
    console.log('  2. Suresh Kirana Mart    → ₹0 (Fully Settled)');
    console.log('  3. Priya Cloth Emporium  → ₹12,500');
    console.log('  4. Vikram Hardware       → ₹6,800');
    console.log('  5. Lakshmi Jewellers     → ₹35,000');
    console.log('  6. Anand Stationery      → ₹1,950');
    console.log('  ─────────────────────────────────');
    console.log('  TOTAL OUTSTANDING        → ₹64,450\n');

  } catch (err) {
    await conn.rollback();
    console.error('❌ Seed failed:', err);
  } finally {
    conn.release();
    await pool.end();
    process.exit(0);
  }
}

seed();
