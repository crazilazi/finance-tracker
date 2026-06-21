import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  rawData: [],
  theme: 'dark',
  currentPage: 'dashboard',
  filter: 'all',
  query: '', // Global smart query string
  hideAmounts: false, // Privacy mode
  tableFilters: { search: '', type: 'all', category: 'all' },
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
      state.rawData = action.payload;
    },
    addExpense(state, action) {
      state.rawData.push(action.payload);
      state.undoStack.push({ action: 'create', data: action.payload, index: state.rawData.length - 1 });
    },
    updateExpense(state, action) {
      const { index, data } = action.payload;
      const oldData = state.rawData[index];
      if (oldData) {
        state.undoStack.push({ action: 'update', data: oldData, index });
        state.rawData[index] = data;
      }
    },
    deleteExpense(state, action) {
      const index = action.payload;
      const oldData = state.rawData[index];
      if (oldData) {
        state.undoStack.push({ action: 'delete', data: oldData, index });
        state.rawData.splice(index, 1);
      }
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
  undoAction,
  propagateYearlyExpense,
  propagateRangeExpense,
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

export default expensesSlice.reducer;
