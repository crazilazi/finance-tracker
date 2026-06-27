import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function getExpenses(rootDir, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  if (!fs.existsSync(dataPath)) {
    return [];
  }
  const content = fs.readFileSync(dataPath, 'utf8');
  let allData = JSON.parse(content || '[]');
  const userVal = username || 'Default User';

  let migrated = false;
  allData = allData.map(item => {
    if (!item.uuid) {
      migrated = true;
      return { ...item, uuid: crypto.randomUUID() };
    }
    return item;
  });

  if (migrated) {
    fs.writeFileSync(dataPath, JSON.stringify(allData, null, 2), 'utf8');
  }

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

  const otherUsersData = allData.filter(d => (d.username || 'Default User') !== userVal);
  const updatedData = data.map(item => ({
    ...item,
    uuid: item.uuid || crypto.randomUUID(),
    username: userVal
  }));
  const combined = [...otherUsersData, ...updatedData];

  fs.writeFileSync(dataPath, JSON.stringify(combined, null, 2), 'utf8');
  return { success: true };
}

export function createExpense(rootDir, item, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  const userVal = username || 'Default User';
  let allData = [];
  if (fs.existsSync(dataPath)) {
    try {
      allData = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    } catch (e) {}
  }

  const newItem = {
    ...item,
    uuid: item.uuid || crypto.randomUUID(),
    username: userVal
  };
  allData.push(newItem);
  fs.writeFileSync(dataPath, JSON.stringify(allData, null, 2), 'utf8');
  return { success: true, data: newItem };
}

export function updateExpense(rootDir, uuid, item, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  const userVal = username || 'Default User';
  let allData = [];
  if (fs.existsSync(dataPath)) {
    try {
      allData = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    } catch (e) {}
  }

  const index = allData.findIndex(d => d.uuid === uuid && (d.username || 'Default User') === userVal);
  if (index >= 0) {
    allData[index] = { ...allData[index], ...item, uuid, username: userVal };
    fs.writeFileSync(dataPath, JSON.stringify(allData, null, 2), 'utf8');
    return { success: true, data: allData[index] };
  }
  return { success: false, error: 'Item not found' };
}

export function deleteExpense(rootDir, uuid, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  const userVal = username || 'Default User';
  let allData = [];
  if (fs.existsSync(dataPath)) {
    try {
      allData = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    } catch (e) {}
  }

  const filtered = allData.filter(d => !(d.uuid === uuid && (d.username || 'Default User') === userVal));
  fs.writeFileSync(dataPath, JSON.stringify(filtered, null, 2), 'utf8');
  return { success: true };
}

export function bulkSyncExpenses(rootDir, items, username) {
  const dataPath = path.resolve(rootDir, 'public/expense_data.json');
  const userVal = username || 'Default User';
  let allData = [];
  if (fs.existsSync(dataPath)) {
    try {
      allData = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]');
    } catch (e) {}
  }

  const otherUsersData = allData.filter(d => (d.username || 'Default User') !== userVal);
  const updatedItems = items.map(item => ({
    ...item,
    uuid: item.uuid || crypto.randomUUID(),
    username: userVal
  }));

  fs.writeFileSync(dataPath, JSON.stringify([...otherUsersData, ...updatedItems], null, 2), 'utf8');
  return { success: true };
}
