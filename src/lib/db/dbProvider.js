import * as mssqlProvider from './mssqlProvider';

// SQL Server / Azure SQL error numbers worth retrying: deadlock victim, database
// unavailable or reconfiguring (including serverless resume), throttling, and
// transport failures. Everything else (bad object names, constraint violations,
// validation) is final, so it fails at once instead of after a 3 s backoff.
const TRANSIENT_SQL_ERRORS = new Set([
  64, 233, 1205, 4060, 4221, 10053, 10054, 10060, 10928, 10929,
  40143, 40197, 40501, 40540, 40613, 42108, 42109, 49918, 49919, 49920,
]);
const TRANSIENT_CODES = new Set(['ESOCKET', 'ECONNCLOSED', 'ECONNRESET', 'ENOTOPEN', 'ETIMEOUT']);

export function isTransientDbError(error) {
  if (!error || error.status) return false;
  if (error.name === 'ConnectionError') return true;
  if (TRANSIENT_CODES.has(error.code)) return true;
  const number = error.number ?? error.originalError?.info?.number;
  return TRANSIENT_SQL_ERRORS.has(number);
}

async function withRetry(operation, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Business-rule errors (404/409 etc.) and non-transient SQL errors are final.
      if (!isTransientDbError(error)) throw error;
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

export const getExpensesPaginated = wrap(mssqlProvider.getExpensesPaginated);
export const getAnalytics = wrap(mssqlProvider.getAnalytics);
export const getMonthSummary = wrap(mssqlProvider.getMonthSummary);
export const createExpense = wrap(mssqlProvider.createExpense);
export const updateExpense = wrap(mssqlProvider.updateExpense);
export const deleteExpense = wrap(mssqlProvider.deleteExpense);
export const setExpensesPaid = wrap(mssqlProvider.setExpensesPaid);
export const bulkSyncExpenses = wrap(mssqlProvider.bulkSyncExpenses);
export const verifyOrCreateUser = wrap(mssqlProvider.verifyOrCreateUser);

export const getUserSettings = wrap(mssqlProvider.getUserSettings);
export const getSessionState = wrap(mssqlProvider.getSessionState);
export const getSessionVersion = wrap(mssqlProvider.getSessionVersion);
export const bumpSessionVersion = wrap(mssqlProvider.bumpSessionVersion);
export const revokeSession = wrap(mssqlProvider.revokeSession);
export const saveUserSettings = wrap(mssqlProvider.saveUserSettings);
export const isUnlockGrantRevoked = wrap(mssqlProvider.isUnlockGrantRevoked);
export const revokeUnlockGrant = wrap(mssqlProvider.revokeUnlockGrant);
export const reservePinAttempt = wrap(mssqlProvider.reservePinAttempt);
export const lockPinAttempts = wrap(mssqlProvider.lockPinAttempts);
export const resetPinAttempts = wrap(mssqlProvider.resetPinAttempts);

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
