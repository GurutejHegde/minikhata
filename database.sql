-- Run this in phpMyAdmin > SQL tab

CREATE DATABASE IF NOT EXISTS minikhata;
USE minikhata;

-- Users table (login)
CREATE TABLE IF NOT EXISTS users (
  user_id    INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)  NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  user_type  ENUM('personal', 'business') DEFAULT NULL,
  created_at DATE         DEFAULT (CURDATE())
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  customer_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT            DEFAULT 1,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(15)  NOT NULL,
  address     VARCHAR(200) DEFAULT '',
  created_at  DATE         DEFAULT (CURDATE()),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT            NOT NULL,
  type           ENUM('credit','payment') NOT NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  date           DATE           NOT NULL,
  note           VARCHAR(200)   DEFAULT '',
  status         ENUM('active','reversed') DEFAULT 'active',
  due_date       DATE           DEFAULT NULL,
  category       VARCHAR(50)    DEFAULT NULL,
  edited_at      TIMESTAMP      NULL DEFAULT NULL,
  edit_reason    VARCHAR(255)   DEFAULT NULL,
  reversal_reason VARCHAR(255)  DEFAULT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
  INDEX idx_txn_customer_status (customer_id, status),
  INDEX idx_txn_date_status (date, status)
);

-- Settlements table (FIFO tracking)
CREATE TABLE IF NOT EXISTS settlements (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  payment_transaction_id INT            NOT NULL,
  credit_transaction_id  INT            NOT NULL,
  amount_allocated       DECIMAL(10,2)  NOT NULL,
  created_at             TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  FOREIGN KEY (credit_transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  INDEX idx_settlement_payment (payment_transaction_id),
  INDEX idx_settlement_credit (credit_transaction_id)
);

-- Installments table (installment plans)
CREATE TABLE IF NOT EXISTS installments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT            NOT NULL,
  due_date       DATE           NOT NULL,
  amount         DECIMAL(10,2)  NOT NULL,
  status         ENUM('pending', 'paid', 'overdue') DEFAULT 'pending',
  paid_amount    DECIMAL(10,2)  DEFAULT 0.00,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  INDEX idx_inst_txn (transaction_id),
  INDEX idx_inst_due (due_date)
);

-- Notifications table (alert system)
CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT            NOT NULL,
  type         VARCHAR(50)    NOT NULL,
  message      VARCHAR(255)   NOT NULL,
  reference_id INT            DEFAULT NULL,
  is_read      TINYINT(1)     DEFAULT 0,
  created_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read)
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
