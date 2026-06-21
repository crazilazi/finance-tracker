import * as jsonProvider from './jsonProvider.js';
import * as mssqlProvider from './mssqlProvider.js';

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
