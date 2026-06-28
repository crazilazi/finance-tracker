import { combineEpics } from 'redux-observable';
import {
  fetchTableDataEpic,
  fetchAnalyticsEpic,
  globalFilterChangeEpic,
  tableConfigChangeEpic,
  queryChangeEpic,
  createExpenseEpic,
  updateExpenseEpic,
  deleteExpenseEpic,
  undoEpic,
  bulkSyncEpic,
  checkAuthSessionEpic,
  logoutEpic,
} from '../features/expenses/expensesEpics';

export const rootEpic = combineEpics(
  fetchTableDataEpic,
  fetchAnalyticsEpic,
  globalFilterChangeEpic,
  tableConfigChangeEpic,
  queryChangeEpic,
  createExpenseEpic,
  updateExpenseEpic,
  deleteExpenseEpic,
  undoEpic,
  bulkSyncEpic,
  checkAuthSessionEpic,
  logoutEpic,
);
