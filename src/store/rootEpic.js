import { combineEpics } from 'redux-observable';
import {
  fetchExpensesEpic,
  saveExpensesEpic,
  checkAuthSessionEpic,
  logoutEpic
} from '../features/expenses/expensesEpics';

export const rootEpic = combineEpics(
  fetchExpensesEpic,
  saveExpensesEpic,
  checkAuthSessionEpic,
  logoutEpic
);
