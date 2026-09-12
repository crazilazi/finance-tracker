import { configureStore } from '@reduxjs/toolkit';
import { createEpicMiddleware } from 'redux-observable';
import rootReducer from './rootReducer';
import { rootEpic } from './rootEpic';
import { expensesInitialState } from '../features/expenses/expensesSlice';
import { loadUiState, attachUiPersistence } from './persist';

const epicMiddleware = createEpicMiddleware();

// Restore the user's last view (theme, filters, tab, page size) before the first render.
const persistedUi = loadUiState();

const store = configureStore({
  reducer: rootReducer,
  preloadedState: {
    expenses: {
      ...expensesInitialState,
      ...persistedUi,
      tableFilters: { ...expensesInitialState.tableFilters, ...(persistedUi.tableFilters || {}) },
    },
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false // Disable serializability check for observable events
    }).concat(epicMiddleware)
});

epicMiddleware.run(rootEpic);
attachUiPersistence(store);

export default store;