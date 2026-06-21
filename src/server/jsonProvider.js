import fs from 'fs';
import path from 'path';

export function getExpenses(rootDir) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  if (!fs.existsSync(dataPath)) {
    return [];
  }
  const content = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(content || '[]');
}

export function saveExpenses(rootDir, data) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  return { success: true };
}
