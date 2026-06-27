import { combineEpics } from 'redux-observable';
import {
  fetchExpensesEpic,
  saveExpensesEpic,
  analyticsEpic,
  checkAuthSessionEpic,
  logoutEpic
} from '../features/expenses/expensesEpics';

export const rootEpic = combineEpics(
  fetchExpensesEpic,
  saveExpensesEpic,
  analyticsEpic,
  checkAuthSessionEpic,
  logoutEpic
);
