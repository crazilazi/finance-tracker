import * as jsonProvider from './jsonProvider.js';
import * as mssqlProvider from './mssqlProvider.js';

export async function getExpenses(config, rootDir) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.getExpenses(config);
    } catch (e) {
      console.error('⚠️ SQL Server connection failed. Falling back to local JSON.', e.message);
      return jsonProvider.getExpenses(rootDir);
    }
  }
  return jsonProvider.getExpenses(rootDir);
}

export async function saveExpenses(config, data, rootDir) {
  if (config.dataSource === 'mssql') {
    try {
      return await mssqlProvider.saveExpenses(config, data);
    } catch (e) {
      console.error('⚠️ SQL Server save failed. Falling back to local JSON.', e.message);
      return jsonProvider.saveExpenses(rootDir, data);
    }
  }
  return jsonProvider.saveExpenses(rootDir, data);
}
