import * as mssqlProvider from './mssqlProvider';

async function withRetry(operation, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Business-rule errors (404/409 etc.) are final; only connectivity problems are retried.
      if (error && error.status) throw error;
      if (attempt === retries) {
        console.error(`SQL Server operation failed after ${retries} attempts:`, error.message);
        throw error;
      }
      console.warn(`SQL Server operation failed (attempt ${attempt}/${retries}). Retrying in ${delayMs}ms...`, error.message);
      await new Promise(res => setTimeout(res, delayMs));
      delayMs *= 2;
    }
  }
}

const wrap = (fn) => (...args) => withRetry(() => fn(...args));

export const getExpenses = wrap(mssqlProvider.getExpenses);
export const getExpensesPaginated = wrap(mssqlProvider.getExpensesPaginated);
export const getAnalytics = wrap(mssqlProvider.getAnalytics);
export const getMonthSummary = wrap(mssqlProvider.getMonthSummary);
export const createExpense = wrap(mssqlProvider.createExpense);
export const updateExpense = wrap(mssqlProvider.updateExpense);
export const deleteExpense = wrap(mssqlProvider.deleteExpense);
export const bulkSyncExpenses = wrap(mssqlProvider.bulkSyncExpenses);
export const verifyOrCreateUser = wrap(mssqlProvider.verifyOrCreateUser);

export const getUserSettings = wrap(mssqlProvider.getUserSettings);
export const saveUserSettings = wrap(mssqlProvider.saveUserSettings);

export const getTypes = wrap(mssqlProvider.getTypes);
export const getCategoryNameList = wrap(mssqlProvider.getCategoryNameList);
export const getCategories = wrap(mssqlProvider.getCategories);
export const createCategory = wrap(mssqlProvider.createCategory);
export const updateCategory = wrap(mssqlProvider.updateCategory);
export const deleteCategory = wrap(mssqlProvider.deleteCategory);
export const mergeCategories = wrap(mssqlProvider.mergeCategories);

export const getGoals = wrap(mssqlProvider.getGoals);
export const createGoal = wrap(mssqlProvider.createGoal);
export const updateGoal = wrap(mssqlProvider.updateGoal);
export const deleteGoal = wrap(mssqlProvider.deleteGoal);

export const getLoans = wrap(mssqlProvider.getLoans);
export const createLoan = wrap(mssqlProvider.createLoan);
export const updateLoan = wrap(mssqlProvider.updateLoan);
export const deleteLoan = wrap(mssqlProvider.deleteLoan);
export const addPrepayment = wrap(mssqlProvider.addPrepayment);
export const deletePrepayment = wrap(mssqlProvider.deletePrepayment);

export const getReminders = wrap(mssqlProvider.getReminders);
