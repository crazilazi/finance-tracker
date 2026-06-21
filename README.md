# 🚗 Gaddi Expense Tracker

A premium, interactive finance and expense tracker featuring real-time analytics, predictive financial health forecasting, smart natural-language filtering, and a self-healing SQL Server / JSON storage engine.

---

## ✨ Features

- **📊 Real-time Financial Health Index**: Live health score calculation based on EMIs, savings rates, and expense stability.
- **🔍 Smart Natural-Language Filtering**: Instant search and advanced query filters across all dimensions.
- **🕵️ Anomaly & Alert Engine**: Automatic outlier detection that tags unusual spending patterns.
- **💼 Yearly & Range Propagation**: Bulk-propagate category expenses across months or distribute them evenly over ranges (e.g. PPF savings from Jan to Jun).
- **🔒 Privacy Mode Toggle**: Hide sensitive figures across all charts and tables with a single click, showing asterisks instead.
- **🌓 Adaptive Theme Modes**: Premium styling supporting fluid transitions between vibrant dark and bright light themes.

---

## 🗄️ Architecture & Dual-Storage

Gaddi Expense Tracker features a highly resilient dual-storage backend integrated directly into Vite's dev server middleware:
- **Primary Database**: Local Microsoft SQL Server (MSSQL).
- **Fallback Database**: Local JSON file (`public/expense_data.json`).
- **Resilience**: If SQL Server is offline or experiences connection timeouts, the server gracefully logs a warning and automatically falls back to serving and updating the JSON database so the app never goes down.

---

## 🚀 Getting Started

### 1. Installation
Clone the repository and install dependencies using legacy peer options to bypass Redux-Observable conflicts:
```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment (`.env`)
Create a `.env` file in the root directory:
```env
# Data Source Mode: 'mssql' or 'json'
DATA_SOURCE=mssql

# SQL Server connection configurations
DB_SERVER=localhost
DB_DATABASE=GaddiTracker

# SQL Server Authentication (leave blank for local Windows Authentication)
DB_USER=sa
DB_PASSWORD=your_secure_password

# Security options
DB_TRUST_SERVER_CERTIFICATE=true
```

### 3. Migrate Seed Data to SQL Server
Initialize the tables and load existing seed records into your SQL Server instance:
```bash
node scripts/migrate-to-sql.js
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:8080](http://localhost:8080) to access the application.

---

## 📄 License
This project is licensed under the terms of the [MIT License](LICENSE).
