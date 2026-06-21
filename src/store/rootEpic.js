import { combineEpics } from 'redux-observable';
import { fetchExpensesEpic, saveExpensesEpic } from '../features/expenses/expensesEpics';

export const rootEpic = combineEpics(
  fetchExpensesEpic,
  saveExpensesEpic
);
