import * as jsonProvider from './jsonProvider';
import * as mssqlProvider from './mssqlProvider';

export async function getExpenses(config, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.getExpenses(config, username);
    } catch (e) {
      console.error('⚠️ SQL Server connection failed. Falling back to local JSON.', e.message);
      return jsonProvider.getExpenses(rootDir, username);
    }
  }
  return jsonProvider.getExpenses(rootDir, username);
}

export async function getExpensesPaginated(config, params, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.getExpensesPaginated(config, params, username);
    } catch (e) {
      console.error('⚠️ SQL Server paginated fetch failed. Falling back to local JSON.', e.message);
      return jsonProvider.getExpensesPaginated(rootDir, params, username);
    }
  }
  return jsonProvider.getExpensesPaginated(rootDir, params, username);
}

export async function getAnalytics(config, params, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.getAnalytics(config, params, username);
    } catch (e) {
      console.error('⚠️ SQL Server analytics failed. Falling back to local JSON.', e.message);
      return jsonProvider.getAnalytics(rootDir, params, username);
    }
  }
  return jsonProvider.getAnalytics(rootDir, params, username);
}

export async function saveExpenses(config, data, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.saveExpenses(config, data, username);
    } catch (e) {
      console.error('⚠️ SQL Server save failed. Falling back to local JSON.', e.message);
      return jsonProvider.saveExpenses(rootDir, data, username);
    }
  }
  return jsonProvider.saveExpenses(rootDir, data, username);
}

export async function createExpense(config, item, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.createExpense(config, item, username);
    } catch (e) {
      console.error('⚠️ SQL Server create failed. Falling back to local JSON.', e.message);
      return jsonProvider.createExpense(rootDir, item, username);
    }
  }
  return jsonProvider.createExpense(rootDir, item, username);
}

export async function updateExpense(config, uuid, item, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.updateExpense(config, uuid, item, username);
    } catch (e) {
      console.error('⚠️ SQL Server update failed. Falling back to local JSON.', e.message);
      return jsonProvider.updateExpense(rootDir, uuid, item, username);
    }
  }
  return jsonProvider.updateExpense(rootDir, uuid, item, username);
}

export async function deleteExpense(config, uuid, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.deleteExpense(config, uuid, username);
    } catch (e) {
      console.error('⚠️ SQL Server delete failed. Falling back to local JSON.', e.message);
      return jsonProvider.deleteExpense(rootDir, uuid, username);
    }
  }
  return jsonProvider.deleteExpense(rootDir, uuid, username);
}

export async function bulkSyncExpenses(config, items, rootDir, username) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.bulkSyncExpenses(config, items, username);
    } catch (e) {
      console.error('⚠️ SQL Server bulk sync failed. Falling back to local JSON.', e.message);
      return jsonProvider.bulkSyncExpenses(rootDir, items, username);
    }
  }
  return jsonProvider.bulkSyncExpenses(rootDir, items, username);
}
