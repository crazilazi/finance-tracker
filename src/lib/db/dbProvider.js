import * as jsonProvider from './jsonProvider';
import * as mssqlProvider from './mssqlProvider';

async function withRetry(operation, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ SQL Server operation failed after ${retries} attempts:`, error.message);
        throw error;
      }
      console.warn(`⚠️ SQL Server operation failed (Attempt ${attempt}/${retries}). Retrying in ${delayMs}ms...`, error.message);
      await new Promise(res => setTimeout(res, delayMs));
      // Exponential backoff
      delayMs *= 2; 
    }
  }
}

function handleSqlError(e, fallbackOp) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Database connection failed: ${e.message}`);
  }
  console.error('⚠️ SQL Server operation failed. Falling back to local JSON.', e.message);
  return fallbackOp();
}

export async function getExpenses(config, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.getExpenses(config, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.getExpenses(rootDir, username));
    }
  }
  return jsonProvider.getExpenses(rootDir, username);
}

export async function getExpensesPaginated(config, params, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.getExpensesPaginated(config, params, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.getExpensesPaginated(rootDir, params, username));
    }
  }
  return jsonProvider.getExpensesPaginated(rootDir, params, username);
}

export async function getAnalytics(config, params, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.getAnalytics(config, params, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.getAnalytics(rootDir, params, username));
    }
  }
  return jsonProvider.getAnalytics(rootDir, params, username);
}

export async function saveExpenses(config, data, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.saveExpenses(config, data, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.saveExpenses(rootDir, data, username));
    }
  }
  return jsonProvider.saveExpenses(rootDir, data, username);
}

export async function createExpense(config, item, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.createExpense(config, item, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.createExpense(rootDir, item, username));
    }
  }
  return jsonProvider.createExpense(rootDir, item, username);
}

export async function updateExpense(config, uuid, item, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.updateExpense(config, uuid, item, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.updateExpense(rootDir, uuid, item, username));
    }
  }
  return jsonProvider.updateExpense(rootDir, uuid, item, username);
}

export async function deleteExpense(config, uuid, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.deleteExpense(config, uuid, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.deleteExpense(rootDir, uuid, username));
    }
  }
  return jsonProvider.deleteExpense(rootDir, uuid, username);
}

export async function bulkSyncExpenses(config, items, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await withRetry(() => mssqlProvider.bulkSyncExpenses(config, items, username));
    } catch (e) {
      return handleSqlError(e, () => jsonProvider.bulkSyncExpenses(rootDir, items, username));
    }
  }
  return jsonProvider.bulkSyncExpenses(rootDir, items, username);
}
