// db.js — MySQL connection pool
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'minikhata',
  waitForConnections: true,
  connectionLimit:    10,
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✓ MySQL connected');
    conn.release();
  })
  .catch(err => {
    console.error('✗ MySQL connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
