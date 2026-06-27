import { createSlice, createSelector } from '@reduxjs/toolkit';
import { matchSmartQuery } from '../../utils/financeEngine';

const initialState = {
  rawData: [],
  theme: 'dark',
  currentPage: 'dashboard',
  filter: 'all',
  query: '', // Global smart query string
  hideAmounts: false, // Privacy mode
  tableFilters: { search: '', type: 'all', category: 'all', year: 'all', month: 'all' },
  sortCol: 'month',
  sortDir: 'desc',
  dataPage: 1,
  pageSize: 20,
  anomalies: [],
  alerts: [],
  healthScore: 0,
  healthMetrics: { savingsRate: 0, emiBurden: 0, stability: 0, anomalyScore: 0 },
  undoStack: [],
  loading: true,
  user: { authenticated: false, username: null, email: null }
};

const expensesSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    setUser(state, action) {
      state.user = action.payload;
    },
    logoutUser(state) {
      state.user = { authenticated: false, username: null, email: null };
      state.rawData = [];
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setExpenses(state, action) {
      const generateUUID = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
      state.rawData = (action.payload || []).map(d => ({ ...d, uuid: d.uuid || generateUUID() }));
    },
    addExpense: {
      reducer(state, action) {
        state.rawData.push(action.payload);
        state.undoStack.push({ action: 'create', data: action.payload, index: state.rawData.length - 1 });
      },
      prepare(payload) {
        const generateUUID = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
        return { payload: { ...payload, uuid: payload.uuid || generateUUID() } };
      }
    },
    updateExpense: {
      reducer(state, action) {
        const { index, data } = action.payload;
        const oldData = state.rawData[index];
        if (oldData) {
          state.undoStack.push({ action: 'update', data: oldData, index });
          state.rawData[index] = { 
            ...data, 
            uuid: data.uuid || oldData.uuid,
            sheet: data.sheet !== undefined ? data.sheet : oldData.sheet
          };
        }
      },
      // Unfortunately prepare doesn't have access to state to get oldData.uuid.
      // But we can ensure it in the component or we can just let the epic read from the next state!
    },
    deleteExpense(state, action) {
      const index = typeof action.payload === 'object' ? action.payload.index : action.payload;
      const oldData = state.rawData[index];
      if (oldData) {
        state.undoStack.push({ action: 'delete', data: oldData, index });
        state.rawData.splice(index, 1);
      }
    },
    deleteBulkExpenses(state, action) {
      const indices = [...action.payload].sort((a, b) => b - a);
      const operations = [];

      indices.forEach(idx => {
        const oldData = state.rawData[idx];
        if (oldData) {
          operations.push({ action: 'delete', data: oldData, index: idx });
          state.rawData.splice(idx, 1);
        }
      });

      state.undoStack.push({ action: 'bulk', operations });
    },
    undoAction(state) {
      if (state.undoStack.length === 0) return;
      const last = state.undoStack.pop();
      if (last.action === 'create') {
        state.rawData.splice(last.index, 1);
      } else if (last.action === 'delete') {
        state.rawData.splice(last.index, 0, last.data);
      } else if (last.action === 'update') {
        state.rawData[last.index] = last.data;
      } else if (last.action === 'bulk') {
        // Revert bulk operations in reverse order
        for (let i = last.operations.length - 1; i >= 0; i--) {
          const op = last.operations[i];
          if (op.action === 'create') {
            state.rawData.splice(op.index, 1);
          } else if (op.action === 'update') {
            state.rawData[op.index] = op.data;
          } else if (op.action === 'delete') {
            state.rawData.splice(op.index, 0, op.data);
          }
        }
      }
    },
    propagateYearlyExpense(state, action) {
      const { year, category, amount, type } = action.payload;
      const operations = [];

      for (let m = 1; m <= 12; m++) {
        const monthStr = `${year}-${String(m).padStart(2, '0')}`;
        const index = state.rawData.findIndex(
          d => d.month === monthStr && d.category.toLowerCase() === category.toLowerCase()
        );

        const payload = {
          month: monthStr,
          amount,
          category,
          type
        };

        if (index >= 0) {
          const oldData = state.rawData[index];
          operations.push({ action: 'update', data: oldData, index });
          state.rawData[index] = payload;
        } else {
          state.rawData.push(payload);
          operations.push({ action: 'create', data: payload, index: state.rawData.length - 1 });
        }
      }

      state.undoStack.push({ action: 'bulk', operations });
    },
    propagateRangeExpense(state, action) {
      const { months, category, amount, type } = action.payload;
      const operations = [];

      months.forEach(monthStr => {
        const index = state.rawData.findIndex(
          d => d.month === monthStr && d.category.toLowerCase() === category.toLowerCase()
        );

        const payload = {
          month: monthStr,
          amount,
          category,
          type
        };

        if (index >= 0) {
          const oldData = state.rawData[index];
          operations.push({ action: 'update', data: oldData, index });
          state.rawData[index] = payload;
        } else {
          state.rawData.push(payload);
          operations.push({ action: 'create', data: payload, index: state.rawData.length - 1 });
        }
      });

      state.undoStack.push({ action: 'bulk', operations });
    },
    copyMonthExpenses(state, action) {
      const { targetMonth, items } = action.payload;
      const operations = [];

      items.forEach(item => {
        const index = state.rawData.findIndex(
          d => d.month === targetMonth && d.category.toLowerCase() === item.category.toLowerCase()
        );

        const generateUUID = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
        const payload = {
          uuid: (index >= 0 ? state.rawData[index].uuid : null) || generateUUID(),
          month: targetMonth,
          category: item.category,
          amount: parseFloat(item.amount),
          type: item.type,
          sheet: item.sheet || null
        };

        if (index >= 0) {
          const oldData = state.rawData[index];
          operations.push({ action: 'update', data: oldData, index });
          state.rawData[index] = payload;
        } else {
          state.rawData.push(payload);
          operations.push({ action: 'create', data: payload, index: state.rawData.length - 1 });
        }
      });

      state.undoStack.push({ action: 'bulk', operations });
    },
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
    },
    setQuery(state, action) {
      state.query = action.payload;
    },
    setTableFilters(state, action) {
      state.tableFilters = { ...state.tableFilters, ...action.payload };
    },
    setSort(state, action) {
      const col = action.payload;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
    },
    setDataPage(state, action) {
      state.dataPage = action.payload;
    },
    setAnalyticsResults(state, action) {
      const { anomalies, alerts, healthScore, healthMetrics } = action.payload;
      state.anomalies = anomalies;
      state.alerts = alerts;
      state.healthScore = healthScore;
      state.healthMetrics = healthMetrics;
    }
  }
});

export const {
  setUser,
  logoutUser,
  setLoading,
  setExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  deleteBulkExpenses,
  undoAction,
  propagateYearlyExpense,
  propagateRangeExpense,
  copyMonthExpenses,
  setTheme,
  toggleHideAmounts,
  setCurrentPage,
  setFilter,
  setQuery,
  setTableFilters,
  setSort,
  setDataPage,
  setAnalyticsResults
} = expensesSlice.actions;

// Memoized Selectors
export const selectRawData = state => state.expenses.rawData;
export const selectQuery = state => state.expenses.query;
export const selectFilter = state => state.expenses.filter;

export const selectFilteredTransactions = createSelector(
  [selectRawData, selectQuery, selectFilter],
  (rawData, query, filter) => {
    let data = rawData;
    if (filter && filter !== 'all') {
      if (filter.startsWith('last')) {
        const n = parseInt(filter.replace('last', ''));
        const today = new Date();
        let year = today.getFullYear();
        let month = (today.getMonth() + 1) - (n - 1);
        while (month <= 0) {
          month += 12;
          year -= 1;
        }
        const cutoffStr = `${year}-${String(month).padStart(2, '0')}`;
        // Filter out future months as well when using "last N months" to keep it strictly past/present
        const currentStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        data = rawData.filter(d => d.month >= cutoffStr && d.month <= currentStr);
      } else {
        data = rawData.filter(d => d.month.startsWith(filter));
      }
    }
    if (query && query.trim()) {
      const lowerQuery = query.toLowerCase();
      data = data.filter(d => matchSmartQuery(d, lowerQuery));
    }
    return data;
  }
);

export default expensesSlice.reducer;
