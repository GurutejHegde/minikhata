# MiniKhata — Digital Credit Ledger Management System

> A full-stack, multiuser digital ledger application for tracking credit, payments, and outstanding balances — built for local businesses and personal lending.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [API Routes](#api-routes)
- [Frontend Pages](#frontend-pages)
- [Project Structure](#project-structure)
- [How to Run](#how-to-run)
- [Demo Credentials](#demo-credentials)

---

## Project Overview

**MiniKhata** (Mini Ledger) is a web-based financial ledger system inspired by traditional "Khata Books" used by shopkeepers across India. It digitizes the process of tracking:

- **Credit Given** — goods/money given on loan to customers
- **Payments Received** — money collected back from customers
- **Outstanding Balances** — how much each customer still owes

The application supports **multiuser accounts** with complete data isolation, meaning multiple shop owners can use the same deployment without seeing each other's data. It also features a **FIFO Settlement Engine** that automatically matches payments against credits in chronological order, an **installment planning system**, a **notification engine**, and **full database backup & restore** capabilities.

### Who Is This For?

| User Type | Use Case |
|:---|:---|
| **Business (Shop Owner)** | Tracks customer credit for a retail shop, kirana store, medical shop, etc. |
| **Personal** | Tracks money lent to friends, family, or colleagues |

The application dynamically adapts its terminology based on the user type:
- Business mode → "Customers", "Credit Given", "Payment Received"
- Personal mode → "People", "Lent", "Paid Back"

---

## Features

### 🔐 Authentication & User Management
- **User Registration** with username/password validation
- **Secure Login** using bcrypt password hashing (10 salt rounds)
- **Session-based Authentication** using express-session with HttpOnly cookies
- **User Type Selection** — choose Personal or Business mode on first login
- **Account Deletion** with double-confirmation safety dialog
- **Logout** with session destruction

### 👥 Customer / People Management
- Add, Edit, and Delete customers/people
- Searchable customer directory with phone number lookup
- View individual customer transaction ledgers
- Outstanding balance automatically calculated per customer
- Paginated customer list with sorting (name, phone, balance, date)

### 💸 Transaction System
- **Add Transactions** — Credit Given or Payment Received entries
- **Edit Transactions** — modify amount, type, note, due date, category with optional edit reason
- **Reverse Transactions** — soft-delete with reversal reason (transactions are never permanently deleted)
- **Undo Reversal** — re-activate reversed transactions
- **Transaction Filtering** — by customer, type, date
- **Paginated Transaction List** with server-side sorting
- **Due Dates & Categories** — optional metadata for each transaction

### ⚙️ FIFO Settlement Engine
- Automatically matches payments against credits in **First-In-First-Out** order
- Recalculates all allocations when any transaction is added, edited, or reversed
- Tracks partial settlements (e.g., a ₹1,000 payment applied to a ₹2,500 credit)
- Settlement data stored in a dedicated `settlements` table with foreign key integrity

### 📅 Installment Planning
- Split any credit transaction into **weekly**, **monthly**, or **custom** installment plans
- Installment amounts automatically divide evenly (with rounding correction on the last installment)
- Status tracking: **Pending**, **Paid**, **Overdue**
- Installment progress bars show settlement percentage
- Paid amounts cascade from the FIFO settlement engine

### 🔔 Notification System
- **Rule-based notification engine** that evaluates alerts on every transaction
- Notification types:
  - 🔴 **High Balance Alert** — customer owes more than ₹10,000
  - 💤 **Inactive Customer** — outstanding balance with no activity for 45+ days
  - ⚠️ **Overdue Credit** — past due date with remaining balance
  - ⏰ **Upcoming Due** — credit due within 3 days
  - 📦 **Overdue Installment** — installment past due date
  - 🔔 **Upcoming Installment** — installment due within 3 days
  - 💰 **Payment Received** — instant alert on every payment
- Notifications dropdown in navbar with unread badge counter
- Mark all as read / dismiss individual notifications

### 📊 Reports & Analytics
- **Date Range Selector** — filter all report data by custom from/to dates
- **Monthly Bar Chart** — credit given vs payment received, grouped by month (Chart.js)
- **Summary Cards** showing:
  - Total Credit Given in range
  - Total Payments Collected in range
  - Total Outstanding in range

### 🏠 Dashboard
- **Summary Stat Cards** — Total Customers, Total Outstanding, Today's Transactions, Overdue Count
- **Overdue Summaries** — 5 oldest overdue credits with remaining amounts
- **Upcoming Dues** — 5 credits due in the next 7 days
- **Recent Transactions** — latest activity feed

### 📋 Overdue Tracking
- Dedicated page listing all customers with overdue credits or installments
- Sorted by days since the oldest overdue date
- Direct navigation to customer detail or transaction history

### 🔍 Global Search
- Search bar in the navbar across all pages
- Searches across customer names, phone numbers, transaction notes, and amounts
- Results grouped by "Customers" and "Transactions" sections
- Click-to-navigate to customer detail or transaction view

### 💾 Backup & Restore
- **Export** — download complete user-specific data as a JSON file
- **Restore** — upload a backup JSON to fully restore all data
- Validates structural integrity before restoring
- Dynamic ID remapping to prevent primary key conflicts
- Preserves all relationships: customers → transactions → settlements → installments → notifications

### 📄 PDF & CSV Export
- Export customer transaction history as a **PDF** (via jsPDF + AutoTable)
- Export transaction data as **CSV** for spreadsheet analysis
- Reports include customer name, phone, balance, and full transaction list

### 🎨 Dynamic UI Adaptation
- Entire interface adapts based on user type (Personal vs Business)
- Labels, sidebar links, form fields, filter options, and badges all change dynamically
- User can change their account type anytime from the Profile page

### 👤 Profile Page
- View account information
- Change user type (Personal ↔ Business)
- Database backup & restore controls
- Account deletion with double confirmation modal

---

## Tech Stack

### Backend

| Technology | Purpose |
|:---|:---|
| **Node.js** | JavaScript runtime environment |
| **Express.js** | Web framework for REST API routing |
| **MySQL / MariaDB** | Relational database (via XAMPP) |
| **mysql2/promise** | MySQL driver with connection pooling and async/await |
| **bcrypt** | Password hashing with salt rounds |
| **express-session** | Cookie-based stateful session management |
| **dotenv** | Environment variable management |
| **cors** | Cross-origin resource sharing middleware |

### Frontend

| Technology | Purpose |
|:---|:---|
| **HTML5** | Page structure and semantic markup |
| **CSS3** | Custom styling with CSS variables, gradients, and animations |
| **Vanilla JavaScript** | Client-side logic, DOM manipulation, and API calls |
| **Chart.js** | Bar chart visualization for reports page |
| **jsPDF + AutoTable** | Client-side PDF generation for exports |
| **Fetch API** | HTTP requests to the backend REST API |

### Development Tools

| Tool | Purpose |
|:---|:---|
| **XAMPP** | Local MySQL/MariaDB server |
| **Nodemon** | Auto-restart server on file changes during development |
| **Git + GitHub** | Version control and remote repository |
| **phpMyAdmin** | Database management GUI (via XAMPP) |

---

## Architecture

```
┌────────────────────────────────────────────────┐
│                   BROWSER                      │
│                                                │
│   index.html ─── Login / Register Page         │
│   dashboard.html ─── Stats, Dues, Alerts       │
│   customers.html ─── Customer CRUD + Drawer    │
│   transactions.html ─── Transaction CRUD       │
│   reports.html ─── Charts + Date Filters       │
│   overdue.html ─── Overdue Tracking            │
│   profile.html ─── Settings, Backup, Delete    │
│                                                │
│   js/app.js ─── Shared Auth, API, Terminology  │
│   css/style.css ─── Design System              │
│                                                │
└────────────────┬───────────────────────────────┘
                 │  HTTP REST API (JSON)
                 │  Session Cookies (HttpOnly)
                 ▼
┌────────────────────────────────────────────────┐
│              EXPRESS.js SERVER                  │
│                                                │
│   server.js ─── Entry Point, Middleware Setup  │
│   db.js ─── MySQL Connection Pool (10 max)     │
│                                                │
│   routes/                                      │
│   ├── auth.js ─── Login, Register, User Type   │
│   ├── customers.js ─── CRUD + Search + Overdue │
│   ├── transactions.js ─── CRUD + Dashboard     │
│   ├── search.js ─── Global Search Endpoint     │
│   ├── reports.js ─── Monthly Charts + Summary  │
│   ├── notifications.js ─── CRUD + Pagination   │
│   ├── installments.js ─── Plans + Scheduling   │
│   └── backup.js ─── Export + Restore           │
│                                                │
│   services/                                    │
│   ├── settlementEngine.js ─── FIFO Allocation  │
│   └── notificationRules.js ─── Alert Engine    │
│                                                │
└────────────────┬───────────────────────────────┘
                 │  SQL Queries (Parameterized)
                 │  Connection Pool (mysql2)
                 ▼
┌────────────────────────────────────────────────┐
│              MySQL DATABASE                    │
│              Database: minikhata               │
│                                                │
│   Tables:                                      │
│   ├── users ─── Accounts + Auth + User Type    │
│   ├── customers ─── Ledger Entities            │
│   ├── transactions ─── Credit/Payment Entries  │
│   ├── settlements ─── FIFO Payment Matching    │
│   ├── installments ─── Payment Plan Schedules  │
│   └── notifications ─── System Alerts          │
│                                                │
│   All FKs: ON DELETE CASCADE                   │
│   Indexes: Composite on (customer_id, status)  │
│            Composite on (date, status)          │
│            Single on (user_id, is_read)         │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables Overview

| Table | Records | Purpose |
|:---|:---|:---|
| `users` | User accounts | Stores login credentials, user type, creation date |
| `customers` | Ledger entities | People/businesses who owe or are owed money |
| `transactions` | Financial events | Credit given and payments received |
| `settlements` | FIFO allocations | Maps which payments settled which credits |
| `installments` | Payment plans | Scheduled payment dates for credit entries |
| `notifications` | System alerts | Rule-triggered warnings and informational alerts |

### Entity-Relationship Summary

```
users (1) ──── (N) customers (1) ──── (N) transactions (1) ──┬── (N) installments
  │                                            │              │
  │                                            │              └── (N) settlements
  │                                            │                    (dual FK: payment + credit)
  └──── (N) notifications
```

### Key Design Decisions
- **DECIMAL(10,2)** for all financial fields — prevents floating-point rounding errors
- **ENUM types** for status fields — enforces valid values at the database level
- **ON DELETE CASCADE** on all foreign keys — ensures clean data removal
- **Composite indexes** on frequently queried column pairs — optimizes JOIN performance
- **Soft deletion** for transactions — reversed transactions are never permanently deleted

---

## API Routes

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|:---|:---|:---|
| POST | `/api/auth/register` | Create new user account |
| POST | `/api/auth/login` | Login with username/password |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Check login status |
| POST | `/api/auth/user-type` | Set personal or business mode |
| DELETE | `/api/auth/account` | Delete user account (cascades all data) |

### Customers (`/api/customers`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/customers` | List all customers with balances (supports pagination) |
| GET | `/api/customers/search?q=` | Search by name or phone |
| GET | `/api/customers/overdue` | Customers with overdue credits/installments |
| GET | `/api/customers/:id` | Single customer with balance |
| POST | `/api/customers` | Add new customer |
| PUT | `/api/customers/:id` | Update customer details |
| DELETE | `/api/customers/:id` | Delete customer and all related data |

### Transactions (`/api/transactions`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/transactions` | All transactions (supports pagination, filtering, sorting) |
| GET | `/api/transactions/customer/:id` | Transactions for one customer |
| GET | `/api/transactions/dashboard` | Dashboard summary stats |
| POST | `/api/transactions` | Add new credit or payment |
| PUT | `/api/transactions/:id` | Edit transaction fields |
| POST | `/api/transactions/:id/reverse` | Soft-reverse a transaction |
| POST | `/api/transactions/:id/unreverse` | Undo a reversal |
| DELETE | `/api/transactions/:id` | Legacy delete (maps to soft-reverse) |

### Installments (`/api/installments`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/installments/transaction/:txnId` | Get installment plan for a credit |
| POST | `/api/installments/transaction/:txnId` | Create/update installment plan (weekly/monthly/custom) |

### Notifications (`/api/notifications`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/notifications?page=&limit=` | Paginated notifications with unread count |
| PUT | `/api/notifications/:id/read` | Mark one notification as read |
| POST | `/api/notifications/read-all` | Mark all notifications as read |
| DELETE | `/api/notifications/:id` | Dismiss a notification |

### Reports (`/api/reports`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/reports/monthly?from=&to=` | Monthly chart data + summary stats for date range |

### Search (`/api/search`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/search?q=` | Global search across customers and transactions |

### Backup (`/api/backup`)

| Method | Endpoint | Description |
|:---|:---|:---|
| GET | `/api/backup/export` | Download user-specific JSON backup |
| POST | `/api/backup/restore` | Upload and restore from JSON backup |

---

## Frontend Pages

| Page | File | Description |
|:---|:---|:---|
| **Login / Register** | `public/index.html` | Authentication forms with tab switching |
| **Dashboard** | `public/pages/dashboard.html` | Summary stats, overdue alerts, recent transactions |
| **Customers** | `public/pages/customers.html` | Customer list, search, add/edit modal, detail drawer with full ledger |
| **Transactions** | `public/pages/transactions.html` | Paginated transaction table, filters, add/edit/reverse modals |
| **Reports** | `public/pages/reports.html` | Date range picker, Chart.js bar chart, summary cards |
| **Overdue** | `public/pages/overdue.html` | Customers with overdue credits sorted by severity |
| **Profile** | `public/pages/profile.html` | User type toggle, backup/restore, account deletion |

### Shared Frontend Module

**`public/js/app.js`** — The core shared JavaScript module loaded by every page:
- Authentication guard (`requireAuth()`)
- User type onboarding modal
- Dynamic UI terminology adapter (`adaptUI()`)
- API helper functions (`apiFetch()`, `getCustomers()`, `addTransaction()`, etc.)
- Global search functionality with dropdown results
- Notification system with bell icon, badge, dropdown, and pagination
- Overdue badge updater in sidebar

---

## Project Structure

```
d:/project_minikhata/
│
├── server.js                    # Express entry point & middleware setup
├── db.js                        # MySQL connection pool configuration
├── migrate.js                   # Database migration utility
├── seed-demo.js                 # Demo data seeder script
├── database.sql                 # Full SQL schema with sample data
├── package.json                 # Dependencies and npm scripts
├── .env                         # Environment variables (DB, session, port)
├── .gitignore                   # Excludes node_modules
├── ARCHITECTURE_REVIEW.md       # Senior architect-level code review
│
├── routes/                      # Express API route handlers
│   ├── auth.js                  #   Authentication & user management
│   ├── customers.js             #   Customer CRUD & search
│   ├── transactions.js          #   Transaction CRUD & dashboard
│   ├── installments.js          #   Installment plan management
│   ├── notifications.js         #   Notification CRUD & pagination
│   ├── reports.js               #   Monthly reports & summaries
│   ├── search.js                #   Global search endpoint
│   └── backup.js                #   Database backup & restore
│
├── services/                    # Business logic engines
│   ├── settlementEngine.js      #   FIFO payment-to-credit allocation
│   └── notificationRules.js     #   Rule-based alert generation
│
└── public/                      # Static frontend files
    ├── index.html               #   Login / Register page
    ├── css/
    │   └── style.css            #   Complete design system
    ├── js/
    │   └── app.js               #   Shared frontend logic module
    └── pages/
        ├── dashboard.html       #   Dashboard with stats & alerts
        ├── customers.html       #   Customer management
        ├── transactions.html    #   Transaction ledger
        ├── reports.html         #   Reports with charts
        ├── overdue.html         #   Overdue tracking
        └── profile.html         #   Profile, backup, account settings
```

---

## How to Run

### Prerequisites
- **Node.js** v16 or higher
- **XAMPP** (or any MySQL/MariaDB server)

### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/GurutejHegde/minikhata.git
cd minikhata

# 2. Install dependencies
npm install

# 3. Start MySQL via XAMPP Control Panel

# 4. Create the database and tables
#    Open phpMyAdmin → SQL tab → paste and run database.sql

# 5. Configure environment variables
#    Edit .env file with your MySQL credentials

# 6. Start the server
npm start        # Production mode
npm run dev      # Development mode (auto-restart with nodemon)

# 7. Open in browser
#    Navigate to http://localhost:3000
```

### Seeding Demo Data

```bash
# Clears all data and inserts 6 demo customers with realistic transactions
node seed-demo.js
```

---

## Demo Credentials

| Field | Value |
|:---|:---|
| **Username** | `gurutej` |
| **Password** | `demo1234` |
| **User Type** | Business |
| **URL** | `http://localhost:3000` |

### Demo Customers & Balances

| # | Customer | Phone | Outstanding |
|:---|:---|:---|---:|
| 1 | Rajan Medical Store | 9876543210 | ₹8,200 |
| 2 | Suresh Kirana Mart | 9123456789 | ₹0 (Settled) |
| 3 | Priya Cloth Emporium | 9988776655 | ₹12,500 |
| 4 | Vikram Hardware | 9654321870 | ₹6,800 |
| 5 | Lakshmi Jewellers | 9871234560 | ₹35,000 |
| 6 | Anand Stationery | 9345678120 | ₹1,950 |
| | | **TOTAL** | **₹64,450** |

---

## GitHub Repository

🔗 **https://github.com/GurutejHegde/minikhata**

---

## License

This project was built as a learning exercise and portfolio project by **Gurutej Hegde**.
