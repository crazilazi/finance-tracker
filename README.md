# 💎 Finance Tracker

A state-of-the-art, highly intuitive user-scoped financial analytics platform built with **Next.js 16 (Turbopack)**, **React 19**, Redux-Observable, RxJS, **Ant Design v6**, and **Tailwind CSS v4**. Features real-time financial health forecasting, OAuth 2.0 authentication, interactive chart click drill-downs, Bank Statement Excel reconciliation, yearly audit scanning, and a relational SQL Server backend with automatic retry. Works on **every device**: phones, tablets, laptops and desktops, in the browser or installed as a PWA.

---

## 🌟 Key Highlights & Major Features

### 🔐 1. User-Based Scoping & OAuth 2.0 Authentication
- **Multi-Tenant User Data Isolation**: Every transaction, category, and report is automatically scoped to the logged-in user context.
- **OAuth 2.0 Engine**: Supports real GitHub OAuth 2.0 (with CSRF `state` verification) and an interactive Mock OAuth 2.0 consent page that is only available in development and only when GitHub is not configured.
- **Session Security**: Signed JWT sessions in `HttpOnly`, `SameSite=Lax`, `Secure` cookies; every API request is scoped by the `user_id` in the session, never by a client-supplied name. Every request also checks the session against the database, so **Log out** ends that session for good (a copied cookie stops working too), and **Settings → Sign out other devices** ends every other session at once.
- **Content-Security-Policy**: Scripts load only from the app itself and fonts only from Google Fonts. The policy ships in report-only mode: violations are written to the server log by `/api/csp-report`, and `CSP_ENFORCE` in `next.config.mjs` switches it to enforcing once the log stays quiet.
- **Input Validation**: All expense payloads and query parameters are validated server-side (month format, amount range, allow-listed types, GUID ids) and SQL errors are never returned to the browser.

### 📋 2. Copy Month Expense Template
- **Template Cloner**: Select any historical month as a template, preview all entries, adjust individual amounts inline, select/deselect items, and save directly to a target month. The copy is saved in one transaction, and it needs an unlocked tab: hidden or demo amounts are never copied as real ones.
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
- **Excel & CSV Parsing**: Drag and drop bank statements (`.xlsx`, `.xls`, `.csv`) directly into the app. Powered by SheetJS (`xlsx` 0.20.x, installed from the official SheetJS CDN because the npm registry copy stopped at 0.18.5 and carries known advisories).
- **AI-Like Normalization**: Automatically detects date, narration, and debit/credit columns, normalizes dates to `YYYY-MM`, and maps raw bank descriptions to existing expense categories via keyword fuzzy matching and NLP hints. Numeric dates are read day-first as Indian banks print them (05/09/2026 is 5 September), and footer lines without a date, such as totals and balances, are skipped.
- **One entry per category per month**: transactions that map to the same category, month and type are added together, so five food-delivery debits in September become one September Food entry with their total and all five narrations in its note.
- **Reconciliation Engine**: Compares against every month the statement covers, not just the page open in the Data Table, and classifies rows into 🟢 **New Records**, 🟡 **Amount Mismatches**, and ⚪ **Synced** entries. Statuses update as you edit a row inline, and one click bulk-syncs the ticked rows. Reconciling needs an unlocked tab, since matching compares real amounts.

### 🗑️ 6. Bulk Operations & Data Table Filtering
- **Multi-Row Checkbox Selection**: Select multiple records and delete them in a single batch operation (`Delete Selected (N)`).
- **Descending Index Splicing**: Splicing algorithms sort indices descending to preserve data integrity and prevent mid-operation index shifting.
- **Specific Year & Month Controls**: Control bar dropdowns for filtering table records by exact Year and Month.
- **Chart Click Drill-Downs**: Click any slice on the Category Doughnut chart or any bar on the Monthly Overview chart to instantly filter the Data Table and jump to those specific entries.

### 🗄️ 7. Relational SQL Server Backend
- **Schema**: `Users`, `Types`, `Categories` (per user), `Expenses`, and an `Expenses_Audit` table populated by a trigger on every insert, update, and delete. Schema lives in `scripts/migrate.sql` and migrates the legacy flat `Expenses` table automatically.
- **Connection Pooling Optimization**: The `DATABASE_URL` connection string is parsed and opened with an explicit pool (`min: 1`, `max: 10`, 30 s idle timeout), so one connection stays warm and cold-start delays are eliminated.
- **Exponential Backoff**: Network interruptions trigger an exponential backoff retry mechanism (1s, 2s, 4s). Writes run inside transactions so category and type lookups roll back together with the expense rows.
- **Notes**: Every expense can carry a free-text note (bank statement narration is stored here when reconciling), which is searchable from the data table.

### ⚡ 8. High-Performance Architecture (v16 Upgrade)
- **Next.js 16 & React 19**: Powered by Turbopack and React 19's concurrent features.
- **Server-Side Aggregation**: All chart generation, monthly totals, and complex statistics are pre-computed on the backend (`/api/expenses/analytics`), eliminating heavy client-side processing bottlenecks.
- **Server-Paginated Data**: The Data Table integrates tightly with SQL `OFFSET/FETCH` to ensure minimal payload sizes when handling tens of thousands of rows.
- **Tailwind CSS v4**: Features the new PostCSS `@tailwindcss/postcss` rendering pipeline for blazing fast styling.

### 📱 9. Works on Every Device: Responsive Layout & PWA
- **Mobile, tablet, laptop, desktop**: one codebase adapts to the viewport through a shared breakpoint contract (`src/hooks/useViewport.js`, mirrored in `src/index.css`):

  | Viewport | Width | Layout |
  |---|---|---|
  | Mobile | < 768 px | Sidebar in a slide-out drawer, single-column cards, icon-only buttons, smart filter opens as an overlay |
  | Tablet | 768–1023 px | Collapsed 72 px icon sidebar, 1–2 column grids, compact top bar |
  | Laptop | 1024–1439 px | Full sidebar, multi-column dashboard |
  | Desktop | ≥ 1440 px | Full sidebar, widest grids and charts |

- **Touch-friendly**: Ant Design controls, drawers and modals are sized for touch; tables scroll horizontally on small screens; charts stay interactive (tap a bar or slice to drill down).
- **iOS safe areas**: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding, so content clears the notch and home indicator in standalone mode.
- **Installable via Browser**: Users can "Add to Home Screen" on iOS, Android, and Desktop browsers to run the app in a standalone window, removing browser UI for a native application feel. Icons ship as real 192 px and 512 px PNGs.
- **Privacy-safe service worker**: `@ducanh2912/next-pwa` generates the worker at build time, but its default rules are replaced with a static-only allowlist. Every `/api/*` request is **network-only**, so amounts are never written to Cache Storage; only the app shell, hashed `/_next/static` bundles, icons and fonts are cached. Logout also clears every cache. The worker is only emitted by the webpack build, which is why `npm run build` runs `next build --webpack` (Turbopack skips the plugin entirely); `npm run dev` still uses Turbopack.


### ⚡ 10. Monthly Routine Accelerators
- **This Month checklist** on the Dashboard: your usual categories (recurring, or recorded in 4 of the last 6 months) with recorded vs missing, pre-filled suggested amounts, per-row **Add** and one-click **Fill all missing**.
- **Category manager** (sidebar → Categories): rename, icon, type, recurring flag, default amount, budget, archive, and **merge duplicates** (case/punctuation variants are detected automatically). When both categories have an entry for the same month, the merge adds them into one entry, so category totals don't change.
- **Smart filter** in the top bar works server-side across the table, charts and export: `>5000`, `1000-5000`, `2k-1.5l`, `type:emi`, `cat:loan`, `notes:swiggy`, `sheet:july`, plus free text.
- **Inline editing** in the Data Table: click an amount, category, type or note to change it in place; Undo is one click away.
- **Command palette** with `Ctrl/⌘+K`; hotkeys `N` (new expense), `/` (smart filter), `G` then `D/T/A/B/I/S/R/C/X` (jump to a tab), `Ctrl+Z` (undo).
- **Remembered view**: theme, filters, sort, page size and last tab persist across reloads; the Data Table opens on the current month by default.
- **Top movers** card and real per-category charts in Trends and Breakdown, powered by a month × category matrix in the analytics response.

### 🔒 11. Privacy by Default, Demo Data, Loans, Goals & Reminders
- **Locked by default, enforced in the API.** Each user's saved setting decides what every response contains: `hidden` (amounts removed, charts keep only their shape), `demo` (plausible fake numbers, consistent across the whole app, seeded per user), or `real`. Nothing the browser sends can widen it.
- **No side channels while locked.** Amount filters such as `>5000` and sorting by amount need an unlock, since they would otherwise reveal hidden values; locking a tab drops any amount filter. Demo numbers are keyed with a server secret (`DEMO_SECRET`), and the demo seed is only sent to an unlocked tab, so fake amounts cannot be converted back into real ones.
- **Unlock per tab.** The lock icon requests a short-lived, server-signed grant (optionally PIN-protected) that lives in the tab's session storage; other tabs stay locked and the tab re-locks after the configured idle window. Locking revokes the grant in the `RevokedUnlockGrants` table, so it is refused by every app instance, not just the one that issued it.
- **PIN brute-force protection.** After 5 incorrect PINs, unlocking pauses for 15 minutes, doubling with each further lockout up to 24 hours. Attempts are counted atomically in the `UnlockAttempts` table, so parallel requests cannot bypass the limit, and a correct PIN resets it.
- **Safe writes.** While hidden you can still add entries you type yourself, but existing rows are never touched: creating an entry for a month and category that already has one is refused with `409`, and **Fill all missing** skips those rows and tells you how many it skipped. Editing, deleting, bulk sync and undo need an unlock. In demo mode every change is refused with `423 Locked`.
- **Settings tab**: default mode, mask category names, unlock window, PIN, demo-seed reshuffle.
- **Loans**: principal, rate, tenure and start month give outstanding balance, payoff date, interest paid, an amortisation chart, recorded prepayments, a what-if prepayment slider and a "which loan to prepay first" ranking.
- **Goals**: link a savings target to a category; progress, six-month average contribution, projected completion and the monthly amount needed to hit a target month.
- **Budgets & Upcoming** on the dashboard: spent vs budget per category with 80%/100% alerts, yearly items detected from your history, credit-card due dates, and an income nudge when no salary has been recorded.

### ✅ 12. Mark as Paid
Recording an entry and paying it are separate steps. An EMI created at the start of the month shows as **Pending** until you mark it paid, so the dashboard tells you what has actually gone out.

- **One tap, everywhere.** Every recorded entry has a paid / pending tag: in the **This Month** card (pending first, with **Mark all paid** and a "Paid N of M" count), in a **Paid** column in the Data Table (plus bulk **Paid** / **Pending** for selected rows), and in the **Due and unpaid** list on the Upcoming card. **Ctrl+Z** undoes it.
- **Wording follows the type.**

  | Type | Done | Not yet |
  |---|---|---|
  | Expense, EMI | Paid | Pending |
  | Income | Received | Expected |
  | Saving | Transferred | Planned |

- **Sensible defaults.** New entries for a past month are saved as paid; entries for this month or later start pending. The expense form has a switch to override it. When the feature was installed, every existing entry before the current month was marked paid.
- **Bank statements settle it.** Rows synced from the reconciler are saved as paid, and statement lines that match an entry you already recorded can mark that entry paid in the same step.
- **Card bills.** Once a card's bill for the month is marked paid, the Upcoming card shows it as paid instead of counting down to the due date.
- **Works while locked.** Paid state reveals no amount, so it can be changed while amounts are hidden, without the PIN. Demo mode refuses it like every other change.
- **Smart filter.** `status:pending` (or `unpaid`) and `status:paid` (or `paid`) combine with the other filters, for example `status:pending type:emi`.
- **Export and audit.** The Excel export has **Paid** and **Paid on** columns, and every change is recorded in `Expenses_Audit`.

---

## 🚀 Getting Started

### 1. Prerequisites & Installation
Requires Node.js 22 LTS. Clone the repository and install from the lockfile (the same command CI uses):
```bash
git clone https://github.com/crazilazi/finance-tracker.git
cd finance-tracker
npm ci
```
Use `npm install` instead only when you are intentionally changing dependencies; commit the updated `package-lock.json` with that change so `npm ci` keeps working in CI.

### 2. Environment Configuration (`.env`)
Create a `.env` file in the root project directory:
```env
# ----------------------------------------
# 🗄️ Database Configuration
# ----------------------------------------
# Your full Microsoft SQL Server connection string (required)
# Format: "Server=your-server.database.windows.net;Database=tracker;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=false;"
DATABASE_URL=

# ----------------------------------------
# 🔐 Security & Authentication
# ----------------------------------------
# A long, random string used to sign authentication cookies AND per-tab unlock grants (required)
JWT_SECRET=

# Public origin of the app, used to build the OAuth redirect URI.
# Recommended in production so the Host header is never trusted, e.g. https://tracker.azurewebsites.net
APP_BASE_URL=

# ----------------------------------------
# 🐙 GitHub OAuth 2.0 Integration
# ----------------------------------------
# Your GitHub OAuth App Client ID (Leave blank to bypass real auth and use interactive Mock Auth locally)
GITHUB_CLIENT_ID=

# Your GitHub OAuth App Client Secret (Leave blank if Mock Auth is used)
GITHUB_CLIENT_SECRET=

# Numeric GitHub user ids allowed to use the app, comma separated.
# Empty = the owner only (crazilazi, 24241036). "*" = any GitHub account.
# Find an id at https://api.github.com/users/<login>; refused sign-ins are logged with it.
ALLOWED_GITHUB_IDS=

# ----------------------------------------
# 🎭 Demo data
# ----------------------------------------
# A long, random string that keys the fake numbers shown in demo mode.
# Falls back to JWT_SECRET when empty. Changing it reshuffles every user's demo numbers.
DEMO_SECRET=
```

### 3. Database Initialization
Apply the relational schema in `scripts/migrate.sql` (idempotent; also migrates a legacy flat `Expenses` table if one exists), followed by the numbered feature migrations in `scripts/migrations/` (each recorded once in `SchemaMigrations`):
```bash
node scripts/migrate-to-sql.js
```
Re-run this after every pull that adds a file under `scripts/migrations/`. `004_unlock_revocations.sql` makes privacy locks durable across app instances, and `005_unlock_attempts.sql` adds the PIN attempt limit. Until 005 is applied, unlocking still works but PIN attempts are not limited, and the server logs an error saying so.

`006_expense_unique_month_category.sql` makes the database enforce one entry per month and category. If older data already has two rows for the same month and category, the migration stops without changing anything. Review and resolve those rows, then run the migration again:
```bash
node scripts/undo-legacy-reimport.js         # rows you deleted that an old migration run brought back
node scripts/undo-legacy-reimport.js --fix   # per row: delete again, or keep
node scripts/dedupe-expenses.js              # list duplicates, change nothing
node scripts/dedupe-expenses.js --fix        # per group: add together, keep one, or skip
```

`007_paid_status.sql` adds the paid state. It marks every existing entry from before the current month (Indian time) as paid, and leaves this month and later as pending for you to mark.

`008_sessions.sql` makes sessions revocable. Until it is applied, sign-in and the owner-only check still work, but Log out only clears the cookie and **Sign out other devices** fails; the server logs an error saying so.

**A least-privilege login for the app.** The app only reads and writes rows, so it should not connect as the server admin. With the admin `DATABASE_URL` in your local `.env`, run:
```bash
node scripts/create-app-db-user.js
```
It creates a `tracker_app` database user with a random password and read/write rights only, signs in as it to prove it cannot alter tables, and prints the connection string to use as the App Service `DATABASE_URL`. Keep the admin connection string locally for migrations.

**The one-time legacy import.** `scripts/migrate.sql` also imports an old flat `Expenses_Legacy` table, if one exists. It now runs at most once, only into an empty `Expenses` table, and records itself in `SchemaMigrations` as `migrate.sql:legacy-import`. Before this guard it ran on every migration and re-inserted legacy rows that had been deleted in the app; `undo-legacy-reimport.js` finds and removes those.

**Legacy and seeded accounts.** Users created by the legacy migration or by `--seed` have no GitHub identity, and sign-in never links them automatically by username. Link one explicitly:
```bash
node scripts/link-legacy-user.js --user-id <guid> --github-id <numeric id>
```
The script shows what the row owns and asks for confirmation. If that GitHub account already signed in and received a new, empty user, the empty row is replaced; if it already holds data, the script refuses.
To additionally import sample data from `public/expense_data.json` into the relational tables:
```bash
node scripts/migrate-to-sql.js --seed
```
You can also run `scripts/migrate.sql` directly from SQL Server Management Studio or Azure Data Studio.

---

## 🛠️ Running & Deploying Locally

### Development Mode
Runs the Next.js dev server with hot module replacement and integrated API routes:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Deploying to Azure App Service

The application is specifically optimized for **Azure App Service Linux** using a **Next.js Standalone** build.

1. **Azure Web App Setup**: Create an App Service running Node.js 22 LTS. Set the **Startup Command** to `node server.js` and add `PORT=8080` to your Application Settings, along with `DATABASE_URL` (the least-privilege `tracker_app` login, not the admin), `JWT_SECRET`, `APP_BASE_URL`, the GitHub OAuth settings and `DEMO_SECRET`. `ALLOWED_GITHUB_IDS` is optional: without it only the owner can sign in.
2. **GitHub Actions**: The repository includes a ready-to-go `.github/workflows/develop_tracker.yml` CI/CD pipeline.
3. **Artifact Zipping**: The workflow installs with `npm ci` on Node 22, builds the highly optimized `.next/standalone` directory, zips it locally on the build server to bypass Azure hidden-file strictness, and uses OIDC to deploy directly to your App Service.
4. **Time zone**: Add the Application Setting `TZ=Asia/Kolkata`. App Service runs in UTC by default, which would make budgets, reminders and the This Month checklist switch months at 05:30 IST instead of midnight. Check it from the Kudu SSH console with `date`.

---

## 📄 License
This project is open-source and licensed under the [MIT License](LICENSE).

