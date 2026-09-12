import * as mssqlProvider from './mssqlProvider';

async function withRetry(operation, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Business-rule errors (409 etc.) are final; only connectivity problems are retried.
      if (error && error.status) throw error;
      if (attempt === retries) {
        console.error(`SQL Server operation failed after ${retries} attempts:`, error.message);
        throw error;
      }
      console.warn(`SQL Server operation failed (attempt ${attempt}/${retries}). Retrying in ${delayMs}ms...`, error.message);
      await new Promise(res => setTimeout(res, delayMs));
      // Exponential backoff
      delayMs *= 2;
    }
  }
}

export async function getExpenses(config, userId) {
  return await withRetry(() => mssqlProvider.getExpenses(config, userId));
}

export async function getExpensesPaginated(config, params, userId) {
  return await withRetry(() => mssqlProvider.getExpensesPaginated(config, params, userId));
}

export async function getAnalytics(config, params, userId) {
  return await withRetry(() => mssqlProvider.getAnalytics(config, params, userId));
}

export async function getMonthSummary(config, month, userId) {
  return await withRetry(() => mssqlProvider.getMonthSummary(config, month, userId));
}

export async function createExpense(config, item, userId) {
  return await withRetry(() => mssqlProvider.createExpense(config, item, userId));
}

export async function updateExpense(config, uuid, item, userId) {
  return await withRetry(() => mssqlProvider.updateExpense(config, uuid, item, userId));
}

export async function deleteExpense(config, uuid, userId) {
  return await withRetry(() => mssqlProvider.deleteExpense(config, uuid, userId));
}

export async function bulkSyncExpenses(config, items, userId) {
  return await withRetry(() => mssqlProvider.bulkSyncExpenses(config, items, userId));
}

export async function verifyOrCreateUser(config, profile) {
  return await withRetry(() => mssqlProvider.verifyOrCreateUser(config, profile));
}

export async function getTypes(config) {
  return await withRetry(() => mssqlProvider.getTypes(config));
}

export async function getCategories(config, userId, typeName) {
  return await withRetry(() => mssqlProvider.getCategories(config, userId, typeName));
}

export async function createCategory(config, input, userId) {
  return await withRetry(() => mssqlProvider.createCategory(config, input, userId));
}

export async function updateCategory(config, id, patch, userId) {
  return await withRetry(() => mssqlProvider.updateCategory(config, id, patch, userId));
}

export async function deleteCategory(config, id, userId) {
  return await withRetry(() => mssqlProvider.deleteCategory(config, id, userId));
}

export async function mergeCategories(config, sourceIds, targetId, userId) {
  return await withRetry(() => mssqlProvider.mergeCategories(config, sourceIds, targetId, userId));
}