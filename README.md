# 💎 Finance Tracker

A state-of-the-art, highly intuitive user-scoped financial analytics platform built with **Next.js 16 (Turbopack)**, **React 19**, Redux-Observable, RxJS, **Ant Design v6**, and **Tailwind CSS v4**. Features real-time financial health forecasting, OAuth 2.0 authentication, interactive chart click drill-downs, Bank Statement Excel reconciliation, yearly audit scanning, and a self-healing SQL Server / JSON dual-storage backend.

---

## 🌟 Key Highlights & Major Features

### 🔐 1. User-Based Scoping & OAuth 2.0 Authentication
- **Multi-Tenant User Data Isolation**: Every transaction, category, and report is automatically scoped to the logged-in user context.
- **OAuth 2.0 Engine**: Supports real GitHub OAuth 2.0 and an interactive Mock OAuth 2.0 consent page for quick local testing.
- **Session Security**: Session management powered by HttpOnly authentication cookies.

### 📋 2. Copy Month Expense Template
- **Template Cloner**: Select any historical month as a template, preview all entries, adjust individual amounts inline, select/deselect items, and save directly to a target month.
- **Maximize / Minimize Modal**: Toggle between standard width and full-screen preview to audit large monthly templates with ease.

### 📊 3. Income Tracking & Overlaid Comparison Charts
- **Income Support**: Track incoming funds (`Salary`, `Bonus`, `Dividends`, etc.) alongside `Expense`, `EMI`, and `Saving` allocations.
- **Overlaid Income vs Outflow Chart**: Displays an emerald green **Income Line** running over stacked monthly spending bars.
- **Smart Outflow Fallback**: If a month's income isn't explicitly defined, the system dynamically treats the total monthly allocation as the income baseline to maintain accurate net-balance comparisons without artificial deficits.

### 🔍 4. Yearly Missing Expenses & Gap Scanner
- **Missing Month Detector**: Scans all 12 calendar months (`Jan`–`Dec`) for a selected year and flags months with zero recorded entries.
- **Recurring Category Audit**: Identifies recurring items (e.g. Room Rent, Electricity, LIC) present in some months but missing in others.
- **Quick Fill Shortcuts**: One-click actions to launch template cloning or entry creation for detected gaps.

### 📑 5. Smart Bank Statement Reconciliation Wizard
- **Excel & CSV Parsing**: Drag and drop bank statements (`.xlsx`, `.xls`, `.csv`) directly into the app. Powered by `xlsx` (SheetJS).
- **AI-Like Normalization**: Automatically detects date, narration, and debit/credit columns, normalizes dates to `YYYY-MM`, and maps raw bank descriptions to existing expense categories via keyword fuzzy matching and NLP hints.
- **Reconciliation Engine**: Classifies incoming statement rows into 🟢 **New Records**, 🟡 **Amount Mismatches**, and ⚪ **Synced** entries with inline editing and one-click bulk database synchronization.

### 🗑️ 6. Bulk Operations & Data Table Filtering
- **Multi-Row Checkbox Selection**: Select multiple records and delete them in a single batch operation (`Delete Selected (N)`).
- **Descending Index Splicing**: Splicing algorithms sort indices descending to preserve data integrity and prevent mid-operation index shifting.
- **Specific Year & Month Controls**: Control bar dropdowns for filtering table records by exact Year and Month.
- **Chart Click Drill-Downs**: Click any slice on the Category Doughnut chart or any bar on the Monthly Overview chart to instantly filter the Data Table and jump to those specific entries.

### 🗄️ 7. Self-Healing Dual-Storage Backend (SQL Server / JSON)
- **Primary Storage**: Microsoft SQL Server (`mssql`).
- **Fallback Storage**: Local JSON engine (`public/expense_data.json`).
- **Self-Healing Resilience**: Automatic seamless fallback to local JSON storage if local SQL Server connections go offline or timeout.

### ⚡ 8. High-Performance Architecture (v16 Upgrade)
- **Next.js 16 & React 19**: Powered by Turbopack and React 19's concurrent features.
- **Server-Side Aggregation**: All chart generation, monthly totals, and complex statistics are pre-computed on the backend (`/api/expenses/analytics`), eliminating heavy client-side processing bottlenecks.
- **Server-Paginated Data**: The Data Table integrates tightly with SQL `OFFSET/FETCH` to ensure minimal payload sizes when handling tens of thousands of rows.
- **Tailwind CSS v4**: Features the new PostCSS `@tailwindcss/postcss` rendering pipeline for blazing fast styling.

---

## 🚀 Getting Started

### 1. Prerequisites & Installation
Clone the repository and install dependencies using `--legacy-peer-deps` to ensure compatibility across Peer Dependencies:
```bash
git clone https://github.com/crazilazi/finance-tracker.git
cd finance-tracker
npm install --legacy-peer-deps
```

### 2. Environment Configuration (`.env`)
Create a `.env` file in the root project directory:
```env
# Data Source Mode: 'mssql' or 'json'
DATA_SOURCE=mssql

# Local Microsoft SQL Server details
DB_SERVER=localhost
DB_DATABASE=GaddiTracker
DB_USER=sa
DB_PASSWORD=your_password_here
DB_TRUST_SERVER_CERTIFICATE=true

# GitHub OAuth 2.0 (Leave blank to use interactive Mock OAuth 2.0)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### 3. Database Initialization (Optional)
To create tables and seed initial sample data into your local SQL Server instance:
```bash
node scripts/migrate-to-sql.js
```

---

## 🛠️ Running & Deploying Locally

### Development Mode
Runs the Next.js dev server with hot module replacement and integrated API routes:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build & Local Deployment
To compile production assets and run a local production server:
```bash
npm run build
npm start
```

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).
