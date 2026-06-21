import fs from 'fs';
import path from 'path';

export function getExpenses(rootDir, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  if (!fs.existsSync(dataPath)) {
    return [];
  }
  const content = fs.readFileSync(dataPath, 'utf8');
  const allData = JSON.parse(content || '[]');
  const userVal = username || 'Default User';
  return allData.filter(d => (d.username || 'Default User') === userVal);
}

export function saveExpenses(rootDir, data, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  const userVal = username || 'Default User';

  let allData = [];
  if (fs.existsSync(dataPath)) {
    try {
      const content = fs.readFileSync(dataPath, 'utf8');
      allData = JSON.parse(content || '[]');
    } catch (e) {
      console.warn('Failed to parse json on save, starting clean.', e.message);
    }
  }

  // Keep records from other users
  const otherUsersData = allData.filter(d => (d.username || 'Default User') !== userVal);

  // Append new/updated records with correct username
  const updatedData = data.map(item => ({ ...item, username: userVal }));
  const combined = [...otherUsersData, ...updatedData];

  fs.writeFileSync(dataPath, JSON.stringify(combined, null, 2), 'utf8');
  return { success: true };
}
