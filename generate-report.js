/**
 * generate-report.js
 * Generates MiniKhata_Submission_Report.docx
 * Run: node generate-report.js
 */
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  UnderlineType,
  HorizontalPositionAlign,
  VerticalPositionAlign,
  HyperlinkRef,
  ExternalHyperlink,
  SectionType,
  convertInchesToTwip,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── Helper: read image into buffer ──────────────────────────────────────────
function img(filename) {
  const p = path.join(__dirname, 'docs', 'screenshots', filename);
  return fs.readFileSync(p);
}

// ── Colours ──────────────────────────────────────────────────────────────────
const CLR = {
  indigo:      '5B5BD6',
  indigoDark:  '3D3D9E',
  dark:        '0F0F1A',
  surface:     '161625',
  muted:       '94A3B8',
  white:       'FFFFFF',
  green:       '22C55E',
  red:         'EF4444',
  amber:       'F59E0B',
  border:      '1E293B',
  tableHead:   '1E1E2E',
  rowAlt:      '16162A',
};

// ── Reusable paragraph styles ─────────────────────────────────────────────────
function spacer(lines = 1) {
  return new Paragraph({ text: '', spacing: { after: 80 * lines } });
}

function sectionTitle(text, icon = '') {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CLR.indigo } },
    children: [
      new TextRun({
        text: icon ? `${icon}  ${text}` : text,
        bold: true,
        size: 36,
        color: CLR.indigo,
        font: 'Calibri',
      }),
    ],
  });
}

function subTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: CLR.indigoDark,
        font: 'Calibri',
      }),
    ],
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text, bold, size: 22, font: 'Calibri', color: '1E293B' }),
    ],
  });
}

function subBullet(label, value) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 50 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 21, font: 'Calibri', color: '334155' }),
      new TextRun({ text: value, size: 21, font: 'Calibri', color: '475569' }),
    ],
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, size: 22, font: 'Calibri', color: '1E293B' })],
  });
}

function captionText(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 200 },
    children: [
      new TextRun({
        text,
        italics: true,
        size: 19,
        color: CLR.muted,
        font: 'Calibri',
      }),
    ],
  });
}

function inlineCode(text) {
  return new TextRun({
    text: ` ${text} `,
    font: 'Courier New',
    size: 20,
    color: CLR.indigo,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2FF' },
  });
}

// ── Embeds a screenshot centered ──────────────────────────────────────────────
function screenshotPara(buffer, widthPx = 620, heightPx) {
  // Scale to fit width ~620px (≈ 8.6 inch at 72dpi) → in EMUs: 1 inch = 914400 EMU
  const emuW = convertInchesToTwip(6.2) * 15; // approximate EMU
  const ratio = heightPx / widthPx;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 60 },
    children: [
      new ImageRun({
        data: buffer,
        transformation: { width: 620, height: Math.round(620 * ratio) },
      }),
    ],
  });
}

// ── Table: tech stack ─────────────────────────────────────────────────────────
function techStackTable() {
  const rows = [
    ['Layer',          'Technology',          'Purpose'],
    ['Backend',        'Node.js + Express.js','REST API, session auth, routing'],
    ['Database',       'MySQL (via XAMPP)',    'Relational storage, FK constraints, FIFO engine'],
    ['Frontend',       'HTML5, CSS3, Vanilla JS', 'Dynamic SPA dashboard, dark-mode UI'],
    ['Auth',           'bcrypt + express-session', 'Secure password hashing, session management'],
    ['PDF Export',     'Browser Print API',   'Customer statement generation'],
    ['Backup/Restore', 'JSON file (API)',      'Portable data export & restore'],
    ['Version Control','Git + GitHub',         'Source code, CI deployment ready'],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: row.map((cell, j) =>
          new TableCell({
            shading: i === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: '4F46E5' }
              : i % 2 === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEF2FF' }
              : { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell,
                    bold: i === 0,
                    color: i === 0 ? 'FFFFFF' : '1E293B',
                    size: 20,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          })
        ),
      })
    ),
  });
}

// ── Table: DB tables ──────────────────────────────────────────────────────────
function dbTable() {
  const rows = [
    ['Table',          'Primary Key', 'Key Columns',                      'Purpose'],
    ['users',          'user_id',     'username, password, user_type',    'Login credentials & account type'],
    ['customers',      'customer_id', 'user_id (FK), name, phone',        'Customer profiles per user'],
    ['transactions',   'transaction_id','customer_id (FK), type, amount', 'Credit & payment records'],
    ['settlements',    'id',          'payment_txn_id, credit_txn_id',    'FIFO payment allocations'],
    ['installments',   'id',          'transaction_id (FK), due_date',    'Installment schedules'],
    ['notifications',  'id',          'user_id (FK), type, message',      'Smart alert system'],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: row.map((cell) =>
          new TableCell({
            shading: i === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: '0F172A' }
              : i % 2 === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' }
              : { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell,
                    bold: i === 0,
                    color: i === 0 ? 'FFFFFF' : '1E293B',
                    size: 19,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          })
        ),
      })
    ),
  });
}

// ── Table: API routes ─────────────────────────────────────────────────────────
function apiTable() {
  const rows = [
    ['Method', 'Route',                          'Description'],
    ['POST',   '/api/auth/login',                'Authenticate user'],
    ['POST',   '/api/auth/register',             'Register new account'],
    ['POST',   '/api/auth/logout',               'End session'],
    ['GET',    '/api/customers',                 'List all customers'],
    ['POST',   '/api/customers',                 'Add new customer'],
    ['DELETE', '/api/customers/:id',             'Remove customer + cascade'],
    ['GET',    '/api/transactions',              'Paginated transaction list'],
    ['POST',   '/api/transactions',              'Add credit or payment'],
    ['PATCH',  '/api/transactions/:id',          'Edit transaction'],
    ['POST',   '/api/transactions/:id/reverse',  'Reverse with audit reason'],
    ['GET',    '/api/reports',                   'Monthly analytics data'],
    ['GET',    '/api/notifications',             'User notifications'],
    ['GET',    '/api/backup/export',             'Export DB as JSON'],
    ['POST',   '/api/backup/import',             'Restore DB from JSON'],
  ];

  const methodColor = { GET: '0369A1', POST: '15803D', PATCH: 'B45309', DELETE: 'B91C1C' };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: row.map((cell, j) =>
          new TableCell({
            shading: i === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: '4F46E5' }
              : i % 2 === 0
              ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F4FF' }
              : { type: ShadingType.CLEAR, color: 'auto', fill: 'FFFFFF' },
            margins: { top: 70, bottom: 70, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell,
                    bold: i === 0 || (j === 0 && i > 0),
                    color: i === 0 ? 'FFFFFF' : (j === 0 && i > 0 ? (methodColor[cell] || '1E293B') : '1E293B'),
                    size: 19,
                    font: i === 0 ? 'Calibri' : (j <= 1 ? 'Courier New' : 'Calibri'),
                  }),
                ],
              }),
            ],
          })
        ),
      })
    ),
  });
}

// ── COVER PAGE ────────────────────────────────────────────────────────────────
function coverPage() {
  return [
    spacer(4),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: '₹', bold: true, size: 120, color: CLR.indigo, font: 'Calibri' }),
        new TextRun({ text: ' MiniKhata', bold: true, size: 120, color: CLR.indigo, font: 'Calibri' }),
      ],
    }),
    spacer(1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Project Submission Report',
          bold: true,
          size: 52,
          color: '334155',
          font: 'Calibri',
        }),
      ],
    }),
    spacer(1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: {
        top: { style: BorderStyle.SINGLE, size: 3, color: CLR.indigo },
        bottom: { style: BorderStyle.SINGLE, size: 3, color: CLR.indigo },
      },
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({
          text: 'A Multi-User Digital Ledger Application for Small Businesses',
          italics: true,
          size: 30,
          color: CLR.muted,
          font: 'Calibri',
        }),
      ],
    }),
    spacer(3),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Developed by:', size: 24, color: '64748B', font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Gurutej Hegde', bold: true, size: 36, color: CLR.indigoDark, font: 'Calibri' })],
    }),
    spacer(1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'GitHub: github.com/GurutejHegde/minikhata', size: 22, color: CLR.indigo, font: 'Calibri' })],
    }),
    spacer(1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Report Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, size: 22, color: '94A3B8', font: 'Calibri' })],
    }),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  BUILD DOCUMENT
// ════════════════════════════════════════════════════════════════════════════
async function buildDoc() {

  // Load images
  const dashboard  = img('screenshot_dashboard.png');
  const txn        = img('screenshot_transactions.png');
  const drawer     = img('screenshot_customer_drawer.png');
  const overdue    = img('screenshot_overdue_alerts.png');
  const reports    = img('screenshot_ledger_reports.png');
  const profile    = img('screenshot_profile_settings.png');
  const erDiagram  = img('screenshot_er_diagram.jpg');

  const doc = new Document({
    creator: 'Gurutej Hegde',
    title:   'MiniKhata Project Submission Report',
    description: 'Full project report with screenshots for MiniKhata digital ledger application',
    styles: {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          run: { font: 'Calibri', size: 22, color: '1E293B' },
        },
      ],
    },
    sections: [
      // ── SECTION 1: Cover Page ──────────────────────────────────────────────
      {
        properties: { type: SectionType.NEXT_PAGE },
        children: coverPage(),
      },

      // ── SECTION 2: Full Report ─────────────────────────────────────────────
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: CLR.indigo } },
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: '₹ MiniKhata  —  Project Submission Report', size: 18, color: CLR.muted, font: 'Calibri' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: CLR.indigo } },
                spacing: { before: 80 },
                children: [
                  new TextRun({ text: 'Page ', size: 18, color: CLR.muted, font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: CLR.indigo, font: 'Calibri' }),
                  new TextRun({ text: ' of ', size: 18, color: CLR.muted, font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: CLR.muted, font: 'Calibri' }),
                ],
              }),
            ],
          }),
        },

        children: [

          // ── 1. Project Overview ──────────────────────────────────────────
          sectionTitle('1. Project Overview', '📋'),
          bodyText(
            'MiniKhata is a full-stack web application that serves as a digital udhar khata (credit ledger) for small business owners and individuals. It enables users to manage customer accounts, record credit and payment transactions, track installment-based payments, generate analytics reports, and receive smart overdue notifications — all through a modern, dark-themed web interface.'
          ),
          spacer(),
          bodyText('The name "MiniKhata" comes from the Hindi word "Khata" (खाता), meaning account book or ledger. The "Mini" prefix reflects its lightweight, accessible nature — a digital equivalent of the traditional physical ledger book used by small Indian shopkeepers.'),

          spacer(2),

          // ── 2. Tech Stack ────────────────────────────────────────────────
          sectionTitle('2. Technology Stack', '🛠️'),
          bodyText('The application is built using a clean and modern stack optimized for rapid development, maintainability, and performance:'),
          spacer(),
          techStackTable(),
          spacer(2),

          // ── 3. Key Features ──────────────────────────────────────────────
          sectionTitle('3. Key Features', '⭐'),

          subTitle('3.1  Authentication & Multi-User Support'),
          bullet('Secure registration and login with bcrypt password hashing'),
          bullet('Session-based authentication using express-session'),
          bullet('Two account modes: Business (Customers & Dues) and Personal (People & Lendings)'),
          bullet('Dynamic UI terminology that switches based on selected account type'),
          spacer(),

          subTitle('3.2  Customer Management'),
          bullet('Add, view, search, and delete customers with name, phone, and address'),
          bullet('Real-time outstanding balance calculated per customer'),
          bullet('Interactive side drawer for full transaction history per customer'),
          bullet('PDF statement export for individual customer ledger'),
          spacer(),

          subTitle('3.3  Transaction Management'),
          bullet('Record Credit Given and Payment Received transactions with notes and dates'),
          bullet('Full edit history with edit reason tracking and timestamps'),
          bullet('Reverse transactions with mandatory reason entry (audit trail)'),
          bullet('Paginated table view with multi-filter support (customer, type, date, keyword)'),
          spacer(),

          subTitle('3.4  FIFO Settlement Engine'),
          bullet('Automatically allocates each payment to the oldest outstanding credit first'),
          bullet('Tracks exactly what percentage of each credit is settled vs. remaining'),
          bullet('Visual progress bars in the customer drawer showing settlement status'),
          bullet('Recalculates on every transaction add, edit, or reversal'),
          spacer(),

          subTitle('3.5  Installment & Due Date Tracking'),
          bullet('Attach due dates to credit transactions for installment tracking'),
          bullet('Overdue Alerts page flags accounts with no payment in 30+ days'),
          bullet('Shows exact "days idle" count per overdue account'),
          bullet('Upcoming dues widget on Dashboard for next-7-day reminders'),
          spacer(),

          subTitle('3.6  Analytics & Reports'),
          bullet('Monthly bar chart showing Credit Given vs. Payment Received'),
          bullet('Summary cards for Total Given, Total Collected, and Total Outstanding'),
          bullet('Custom date range filter for report generation'),
          spacer(),

          subTitle('3.7  Notifications & Alerts'),
          bullet('Smart notification engine evaluates ledger state on each login'),
          bullet('Alerts generated for: overdue payments, large balances, unsettled credits'),
          bullet('Notification badge count displayed in the top navigation bar'),
          spacer(),

          subTitle('3.8  Backup & Data Safety'),
          bullet('Export entire ledger database as a structured JSON backup file'),
          bullet('One-click restore from any previous JSON backup'),
          bullet('Full account deletion with cascade removal of all associated data'),

          spacer(2),

          // ── 4. Database Schema ───────────────────────────────────────────
          sectionTitle('4. Database Architecture', '🗄️'),
          bodyText('The database follows a normalized relational design with six tables, connected via foreign keys and equipped with cascade delete rules to maintain data integrity.'),
          spacer(),
          dbTable(),
          spacer(2),

          // ── 4b. ER Diagram ───────────────────────────────────────────────
          subTitle('4.1  Entity-Relationship Diagram'),
          bodyText('The diagram below illustrates the relationships between all six database entities:'),
          spacer(),
          screenshotPara(erDiagram, 620, 620),
          captionText('Figure 1 — MiniKhata Database ER Diagram showing all 6 tables with primary keys, foreign keys, and cardinality'),
          spacer(2),

          // ── 5. API Routes ────────────────────────────────────────────────
          sectionTitle('5. API Routes', '🔌'),
          bodyText('All API endpoints follow RESTful conventions and are protected by session-based authentication middleware:'),
          spacer(),
          apiTable(),
          spacer(2),

          // ── 6. UI Walkthrough ────────────────────────────────────────────
          sectionTitle('6. User Interface Walkthrough', '🖥️'),
          bodyText('The following screenshots capture the live system running with realistic demo data seeded across 6 customers and 24 transactions.'),

          spacer(),
          subTitle('6.1  Dashboard'),
          bodyText('The Dashboard provides an immediate overview of the entire ledger. Four metric cards show Total Customers, Total Pending Amount, Today\'s Activity, and Overdue Account count. Below these, two panels list customers with outstanding balances and the five most recent transactions.'),
          spacer(),
          screenshotPara(dashboard, 620, 787),
          captionText('Figure 2 — Dashboard overview showing 6 customers, ₹64,450 total outstanding, and 2 overdue accounts'),

          spacer(2),
          subTitle('6.2  Transaction Ledger'),
          bodyText('The Transactions page shows all 24 records with smart filters. Green "Payment Received" badges with + amounts and red "Credit Given" badges with − amounts make cash flow immediately visible. Each row has Edit, Reverse, and Installments action buttons.'),
          spacer(),
          screenshotPara(txn, 620, 692),
          captionText('Figure 3 — Transactions page showing paginated ledger with filters, type badges, and action buttons'),

          spacer(2),
          subTitle('6.3  Customer Side Drawer'),
          bodyText('Clicking any customer opens a smooth slide-in drawer showing their live balance, all transactions in reverse chronological order, FIFO settlement progress bars per credit, and quick-action buttons to add credits or payments, or export a PDF statement.'),
          spacer(),
          screenshotPara(drawer, 620, 678),
          captionText('Figure 4 — Lakshmi Jewellers drawer showing ₹35,000 balance, FIFO settlement tracking, and transaction history'),

          spacer(2),
          subTitle('6.4  Overdue Alerts'),
          bodyText('The Overdue Alerts page surfaces customers who have outstanding balances with no incoming payment for more than 30 days. The "Days Idle" counter turns red to indicate urgency, and a direct "Open Drawer" button allows immediate collection action.'),
          spacer(),
          screenshotPara(overdue, 620, 529),
          captionText('Figure 5 — Overdue Alerts showing Priya Cloth Emporium (418 days) and Lakshmi Jewellers (393 days)'),

          spacer(2),
          subTitle('6.5  Ledger Reports'),
          bodyText('The Reports tab generates a monthly bar chart comparing Credit Given (red bars) vs. Payment Received (green bars). Three summary cards show total figures for the selected period. Date range filters allow custom analysis.'),
          spacer(),
          screenshotPara(reports, 620, 587),
          captionText('Figure 6 — Ledger Reports showing ₹1,20,700 total given, ₹56,250 collected, ₹64,450 outstanding'),

          spacer(2),
          subTitle('6.6  Profile Settings'),
          bodyText('The Profile page allows users to change account type (Business ↔ Personal), which dynamically updates all UI labels across the application. It also provides a one-click Backup & Restore system for data safety, and an Account Deletion option with cascade removal.'),
          spacer(),
          screenshotPara(profile, 620, 856),
          captionText('Figure 7 — Profile Settings showing Account Type switcher, Backup & Restore, and Account Deletion'),

          spacer(2),

          // ── 7. Project File Structure ────────────────────────────────────
          sectionTitle('7. Project File Structure', '📁'),
          bodyText('The project follows a clear MVC-like separation with routes handling API logic, services encapsulating business engines, and public containing all front-end assets:'),
          spacer(),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: [
                  'minikhata/',
                  '├── server.js              # Express app entry point',
                  '├── db.js                  # MySQL connection pool',
                  '├── database.sql           # Schema + default seed',
                  '├── seed-demo.js           # Demo data seeder',
                  '├── .env                   # DB credentials (gitignored)',
                  '├── routes/',
                  '│   ├── auth.js            # Login, register, logout',
                  '│   ├── customers.js       # Customer CRUD',
                  '│   ├── transactions.js    # Transactions + FIFO trigger',
                  '│   ├── reports.js         # Monthly analytics',
                  '│   ├── notifications.js   # Alert system',
                  '│   ├── backup.js          # Export / Import',
                  '│   ├── installments.js    # Due date tracking',
                  '│   └── search.js          # Global search',
                  '├── services/',
                  '│   ├── settlementEngine.js # FIFO algorithm',
                  '│   └── notificationRules.js # Alert rules',
                  '└── public/',
                  '    ├── index.html         # Login page',
                  '    ├── js/app.js          # Core frontend logic',
                  '    └── pages/',
                  '        ├── dashboard.html',
                  '        ├── customers.html',
                  '        ├── transactions.html',
                  '        ├── overdue.html',
                  '        ├── reports.html',
                  '        └── profile.html',
                ].join('\n'),
                font: 'Courier New',
                size: 18,
                color: '1E293B',
              }),
            ],
            border: {
              top: { style: BorderStyle.SINGLE, size: 3, color: 'E2E8F0' },
              bottom: { style: BorderStyle.SINGLE, size: 3, color: 'E2E8F0' },
              left: { style: BorderStyle.SINGLE, size: 12, color: CLR.indigo },
              right: { style: BorderStyle.SINGLE, size: 3, color: 'E2E8F0' },
            },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
            indent: { left: 200, right: 200 },
          }),

          spacer(2),

          // ── 8. Conclusion ────────────────────────────────────────────────
          sectionTitle('8. Conclusion', '✅'),
          bodyText(
            'MiniKhata demonstrates a complete, production-quality web application built from scratch. It solves a real-world problem faced by millions of small business owners in India who still rely on physical ledger books — by digitizing the entire process with modern engineering practices.'
          ),
          spacer(),
          bodyText('The system applies several core engineering concepts including:'),
          bullet('Relational database normalization with proper FK constraints and cascade rules'),
          bullet('FIFO algorithmic design for accurate financial settlement tracking'),
          bullet('RESTful API architecture with clean separation of concerns'),
          bullet('Session-based authentication with bcrypt security'),
          bullet('Event-driven notification system that evaluates business rules on login'),
          spacer(),
          bodyText('Future improvements could include: SMS/WhatsApp payment reminders, multi-branch support, cloud deployment (Railway / Render), and a React Native mobile app.'),

          spacer(2),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: CLR.indigo },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: CLR.indigo },
            },
            spacing: { before: 200, after: 200 },
            children: [
              new TextRun({
                text: '₹ MiniKhata  |  github.com/GurutejHegde/minikhata  |  localhost:3000',
                size: 20,
                color: CLR.indigo,
                font: 'Calibri',
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(__dirname, 'MiniKhata_Submission_Report.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`\n✅ Report generated: ${outPath}\n`);
}

buildDoc().catch(console.error);
