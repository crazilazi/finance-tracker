import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Paginated rows for the Data Table (current page only)
  tableData: [],
  tableTotalCount: 0,

  // Server-computed analytics (dashboard, trends, anomalies, breakdown)
  analytics: {
    monthlyTotals: {},
    months: [],
    categoryTotals: [],   // [[category, total, type], ...]
    allCategories: [],    // full list for dropdowns
    allYears: [],         // full list for dropdowns
    anomalies: [],
    alerts: [],
    healthScore: 0,
    healthMetrics: { savingsRate: 0, emiBurden: 0, stability: 0, anomalyScore: 0 },
  },

  // Cache: key = "filter|query|page|pageSize|sortCol|sortDir|type|category|search"
  // value = { tableData, tableTotalCount, timestamp }
  tableCache: {},
  // key = "filter|query", value = { analytics, timestamp }
  analyticsCache: {},

  // UI state
  theme: 'dark',
  currentPage: 'dashboard',
  filter: 'all',
  query: '',
  hideAmounts: false,
  tableFilters: { search: '', type: 'all', category: 'all', year: 'all', month: 'all' },
  sortCol: 'month',
  sortDir: 'desc',
  dataPage: 1,
  pageSize: 50,

  // Loading states
  loading: true,
  tableLoading: false,
  analyticsLoading: false,

  // Auth
  user: { authenticated: false, username: null, email: null },

  // Thin undo stack (stores the action+uuid, not full dataset)
  undoStack: [],
};

const CACHE_TTL_MS = 60 * 1000; // 1 minute

const expensesSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    // ── Auth ──────────────────────────────────────────────────
    setUser(state, action) {
      state.user = action.payload;
    },
    logoutUser(state) {
      state.user = { authenticated: false, username: null, email: null };
      state.tableData = [];
      state.tableTotalCount = 0;
      state.analytics = initialState.analytics;
      state.tableCache = {};
      state.analyticsCache = {};
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
      state.analytics = { ...state.analytics, ...action.payload };
      state.analyticsLoading = false;
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
      // Cap undo stack at 20
      if (state.undoStack.length > 20) state.undoStack.shift();
    },
    popUndoEntry(state) {
      state.undoStack.pop();
    },

    // ── UI filter state ───────────────────────────────────────
    setTheme(state, action) {
      state.theme = action.payload;
    },
    toggleHideAmounts(state) {
      state.hideAmounts = !state.hideAmounts;
    },
    setCurrentPage(state, action) {
      state.currentPage = action.payload;
    },
    setFilter(state, action) {
      state.filter = action.payload;
      state.dataPage = 1; // reset to page 1 on filter change
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
  setLoading,
  setTableLoading,
  setAnalyticsLoading,
  setTableData,
  setAnalytics,
  setTableCacheEntry,
  setAnalyticsCacheEntry,
  invalidateCache,
  pushUndoEntry,
  popUndoEntry,
  setTheme,
  toggleHideAmounts,
  setCurrentPage,
  setFilter,
  setQuery,
  setTableFilters,
  setSort,
  setDataPage,
  setPageSize,
} = expensesSlice.actions;

// ── Cache key helpers ─────────────────────────────────────────────────────────
export function makeTableCacheKey(state) {
  const { filter, query, dataPage, pageSize, sortCol, sortDir, tableFilters } = state.expenses;
  const { type, category, search } = tableFilters;
  return [filter, query, dataPage, pageSize, sortCol, sortDir, type, category, search].join('|');
}

export function makeAnalyticsCacheKey(state) {
  const { filter, query } = state.expenses;
  return `${filter}|${query}`;
}

export function isCacheFresh(entry) {
  return entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS;
}

export default expensesSlice.reducer;
