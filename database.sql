-- Run this in phpMyAdmin > SQL tab

CREATE DATABASE IF NOT EXISTS minikhata;
USE minikhata;

-- Users table (login)
CREATE TABLE IF NOT EXISTS users (
  user_id    INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at DATE         DEFAULT (CURDATE())
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(15)  NOT NULL,
  address     VARCHAR(200) DEFAULT '',
  created_at  DATE         DEFAULT (CURDATE())
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT            NOT NULL,
  type           ENUM('credit','payment') NOT NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  date           DATE           NOT NULL,
  note           VARCHAR(200)   DEFAULT '',
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Default admin user (password: 1234)
INSERT INTO users (username, password) VALUES
('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');

-- Sample customers
INSERT INTO customers (name, phone, address) VALUES
('Rajan Medical',  '9876543210', 'Main Bazaar'),
('Suresh Kirana',  '9123456789', 'Gandhi Nagar'),
('Priya Cloth',    '9988776655', 'Cloth Market');

-- Sample transactions
INSERT INTO transactions (customer_id, type, amount, date, note) VALUES
(1, 'credit',  2400.00, '2025-04-01', 'Medicines on credit'),
(1, 'payment',  800.00, '2025-04-15', 'Part payment'),
(2, 'credit',  1200.00, '2025-04-10', 'Groceries'),
(2, 'payment', 1200.00, '2025-04-22', 'Full payment'),
(3, 'credit',  5500.00, '2025-03-20', 'Cloth purchase');
