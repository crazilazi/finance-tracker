import { createSlice } from '@reduxjs/toolkit';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const expensesInitialState = {
  // Paginated rows for the Data Table (current page only)
  tableData: [],
  tableTotalCount: 0,

  // Server-computed analytics (dashboard, trends, anomalies, breakdown)
  analytics: {
    monthlyTotals: {},
    months: [],
    categoryTotals: [],   // [[category, total, type], ...]
    categoryMatrix: { months: [], categories: [], values: {} }, // month × category amounts
    allCategories: [],    // full list for dropdowns
    allYears: [],         // full list for dropdowns
    allMonths: [],
    usualCategories: [],  // categories recorded most months (drives "missing" checks)
    budgetStatus: [],     // [{ category, budget, spent, pct }] for the current month
    openingBalance: 0,
    anomalies: [],
    alerts: [],
    healthScore: 0,
    healthMetrics: { savingsRate: 0, emiBurden: 0, stability: 0, anomalyScore: 0 },
    unit: 'inr',          // 'index' while amounts are hidden (0–100 relative values)
  },

  // "This month" checklist (see /api/expenses/summary)
  summary: null,
  summaryMonth: currentMonth(),
  summaryLoading: false,

  // Full category objects (icon, recurring flag, defaults, usage stats)
  categories: [],
  categoriesLoaded: false,

  // Phase B data
  goals: [],
  loans: [],
  reminders: null,

  // Privacy: what the server is currently returning, and the user's settings
  privacy: { mode: 'hidden', unlocked: false, unlockExpiresAt: null },
  settings: null,
  unlockPromptOpen: false,

  // Cache: key = "mode|filter|query|page|pageSize|sortCol|sortDir|type|category|search|year|month"
  tableCache: {},
  // key = "mode|filter|query", value = { analytics, timestamp }
  analyticsCache: {},

  // UI state (persisted keys: see src/store/persist.js)
  theme: 'dark',
  currentPage: 'dashboard',
  filter: 'all',
  query: '',
  hideAmounts: true,       // derived from privacy.mode === 'hidden'; not user-toggled any more
  tableFilters: { search: '', type: 'all', category: 'all', year: 'all', month: 'all' },
  sortCol: 'month',
  sortDir: 'desc',
  dataPage: 1,
  pageSize: 50,
  paletteOpen: false,

  // Loading states
  loading: true,
  tableLoading: false,
  analyticsLoading: false,

  // Transient feedback surfaced by App.jsx as toasts
  lastError: null,
  lastNotice: null,

  // Auth
  user: { authenticated: false, username: null, email: null },

  // Thin undo stack (stores the action+uuid, not full dataset)
  undoStack: [],
};

const CACHE_TTL_MS = 60 * 1000; // 1 minute

const expensesSlice = createSlice({
  name: 'expenses',
  initialState: expensesInitialState,
  reducers: {
    // ── Auth ──────────────────────────────────────────────────
    setUser(state, action) {
      state.user = action.payload;
    },
    logoutUser(state) {
      state.user = { authenticated: false, username: null, email: null };
      state.tableData = [];
      state.tableTotalCount = 0;
      state.analytics = expensesInitialState.analytics;
      state.summary = null;
      state.categories = [];
      state.categoriesLoaded = false;
      state.goals = [];
      state.loans = [];
      state.reminders = null;
      state.settings = null;
      state.privacy = { mode: 'hidden', unlocked: false, unlockExpiresAt: null };
      state.hideAmounts = true;
      state.tableCache = {};
      state.analyticsCache = {};
      state.undoStack = [];
    },

    // ── Privacy ───────────────────────────────────────────────
    setPrivacy(state, action) {
      state.privacy = { ...state.privacy, ...action.payload };
      state.hideAmounts = state.privacy.mode === 'hidden';
    },
    /** Called with the X-Privacy-Mode header of every response: keeps the UI honest about what it shows. */
    syncMode(state, action) {
      const mode = action.payload;
      if (!mode || mode === state.privacy.mode) return;
      state.privacy.mode = mode;
      if (mode !== 'real') { state.privacy.unlocked = false; state.privacy.unlockExpiresAt = null; }
      state.hideAmounts = mode === 'hidden';
      state.tableCache = {};
      state.analyticsCache = {};
    },
    setSettings(state, action) {
      state.settings = action.payload;
    },
    setUnlockPromptOpen(state, action) {
      state.unlockPromptOpen = !!action.payload;
    },

    // ── Loading ───────────────────────────────────────────────
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setTableLoading(state, action) {
      state.tableLoading = action.payload;
    },
    setAnalyticsLoading(state, action) {
      state.analyticsLoading = action.payload;
    },

    // ── Table Data (server-paginated) ─────────────────────────
    setTableData(state, action) {
      const { data, total } = action.payload;
      state.tableData = data;
      state.tableTotalCount = total;
      state.tableLoading = false;
    },

    // ── Analytics (server-aggregated) ────────────────────────
    setAnalytics(state, action) {
      state.analytics = { ...state.analytics, unit: 'inr', ...action.payload };
      state.analyticsLoading = false;
    },

    // ── Month summary ─────────────────────────────────────────
    setSummary(state, action) {
      state.summary = action.payload;
      state.summaryLoading = false;
    },
    setSummaryLoading(state, action) {
      state.summaryLoading = action.payload;
    },
    setSummaryMonth(state, action) {
      state.summaryMonth = action.payload;
    },

    // ── Categories / goals / loans / reminders ────────────────
    setCategories(state, action) {
      state.categories = action.payload;
      state.categoriesLoaded = true;
    },
    setGoals(state, action) {
      state.goals = action.payload;
    },
    setLoans(state, action) {
      state.loans = action.payload;
    },
    setReminders(state, action) {
      state.reminders = action.payload;
    },

    // ── Cache management ─────────────────────────────────────
    setTableCacheEntry(state, action) {
      const { key, data, total } = action.payload;
      state.tableCache[key] = { data, total, timestamp: Date.now() };
    },
    setAnalyticsCacheEntry(state, action) {
      const { key, analytics } = action.payload;
      state.analyticsCache[key] = { analytics, timestamp: Date.now() };
    },
    invalidateCache(state) {
      state.tableCache = {};
      state.analyticsCache = {};
    },

    // ── Undo stack (stores only { action, uuid, snapshot }) ──
    pushUndoEntry(state, action) {
      state.undoStack.push(action.payload);
      if (state.undoStack.length > 20) state.undoStack.shift();
    },
    popUndoEntry(state) {
      state.undoStack.pop();
    },

    // ── Feedback ──────────────────────────────────────────────
    setLastError(state, action) {
      state.lastError = action.payload ? { text: action.payload, at: Date.now() } : null;
    },
    setLastNotice(state, action) {
      state.lastNotice = action.payload ? { text: action.payload, at: Date.now() } : null;
    },

    // ── UI filter state ───────────────────────────────────────
    setTheme(state, action) {
      state.theme = action.payload;
    },
    setCurrentPage(state, action) {
      state.currentPage = action.payload;
    },
    setPaletteOpen(state, action) {
      state.paletteOpen = !!action.payload;
    },
    togglePalette(state) {
      state.paletteOpen = !state.paletteOpen;
    },
    setFilter(state, action) {
      state.filter = action.payload;
      state.dataPage = 1;
    },
    setQuery(state, action) {
      state.query = action.payload;
      state.dataPage = 1;
    },
    setTableFilters(state, action) {
      state.tableFilters = { ...state.tableFilters, ...action.payload };
      state.dataPage = 1;
    },
    setSort(state, action) {
      const col = action.payload;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      state.dataPage = 1;
    },
    setDataPage(state, action) {
      state.dataPage = action.payload;
    },
    setPageSize(state, action) {
      state.pageSize = action.payload;
      state.dataPage = 1;
    },
  },
});

export const {
  setUser,
  logoutUser,
  setPrivacy,
  syncMode,
  setSettings,
  setUnlockPromptOpen,
  setLoading,
  setTableLoading,
  setAnalyticsLoading,
  setTableData,
  setAnalytics,
  setSummary,
  setSummaryLoading,
  setSummaryMonth,
  setCategories,
  setGoals,
  setLoans,
  setReminders,
  setTableCacheEntry,
  setAnalyticsCacheEntry,
  invalidateCache,
  pushUndoEntry,
  popUndoEntry,
  setLastError,
  setLastNotice,
  setTheme,
  setCurrentPage,
  setPaletteOpen,
  togglePalette,
  setFilter,
  setQuery,
  setTableFilters,
  setSort,
  setDataPage,
  setPageSize,
} = expensesSlice.actions;

// ── Selectors ────────────────────────────────────────────────────────────────

/** What the current privacy mode permits. Mirrors the server's write matrix. */
export function selectCan(state) {
  const mode = state.expenses.privacy.mode;
  return {
    mode,
    real: mode === 'real',
    edit: mode === 'real',            // update / delete / bulk sync / undo
    create: mode !== 'demo',          // new expense with a typed amount, fill-month
    config: mode !== 'demo',          // categories, goals, loans
    settings: mode === 'real',
    export: mode === 'real',
  };
}

// ── Derived request parameters ───────────────────────────────────────────────

export function effectiveTableFilter(state) {
  const { filter, tableFilters } = state.expenses;
  const year = tableFilters.year && tableFilters.year !== 'all' ? tableFilters.year : null;
  const month = tableFilters.month && tableFilters.month !== 'all' ? tableFilters.month : null;
  if (year && month) return { filter: `${year}-${month}`, monthNum: '' };
  if (year) return { filter: year, monthNum: '' };
  if (month) return { filter, monthNum: month };
  return { filter, monthNum: '' };
}

export function tableRequestParams(state) {
  const { query, sortCol, sortDir, tableFilters } = state.expenses;
  const { type, category, search } = tableFilters;
  const { filter, monthNum } = effectiveTableFilter(state);
  return { filter, query, sortCol, sortDir, type, category, search, monthNum };
}

// ── Cache key helpers ─────────────────────────────────────────────────────────
export function makeTableCacheKey(state) {
  const { filter, query, dataPage, pageSize, sortCol, sortDir, tableFilters, privacy } = state.expenses;
  const { type, category, search, year, month } = tableFilters;
  return [privacy.mode, filter, query, dataPage, pageSize, sortCol, sortDir, type, category, search, year, month].join('|');
}

export function makeAnalyticsCacheKey(state) {
  const { filter, query, privacy } = state.expenses;
  return `${privacy.mode}|${filter}|${query}`;
}

export function isCacheFresh(entry) {
  return entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS;
}

export default expensesSlice.reducer;
