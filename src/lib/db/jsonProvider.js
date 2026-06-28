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

export function getExpensesPaginated(rootDir, params, username) {
  const {
    filter = 'all',
    page = 1,
    pageSize = 50,
    sortCol = 'month',
    sortDir = 'desc',
    type = 'all',
    category = 'all',
    search = '',
    query = '',
  } = params;

  let data = getExpenses(rootDir, username);

  if (filter && filter !== 'all') {
    if (filter.startsWith('last')) {
      const n = parseInt(filter.replace('last', ''));
      const today = new Date();
      let year = today.getFullYear();
      let month = (today.getMonth() + 1) - (n - 1);
      while (month <= 0) { month += 12; year -= 1; }
      const cutoffStr = `${year}-${String(month).padStart(2, '0')}`;
      const currentStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = data.filter(d => d.month >= cutoffStr && d.month <= currentStr);
    } else if (filter.length === 4) {
      data = data.filter(d => d.month.startsWith(filter));
    } else {
      data = data.filter(d => d.month === filter);
    }
  }
  if (type && type !== 'all') data = data.filter(d => d.type === type);
  if (category && category !== 'all') data = data.filter(d => d.category === category);
  if (search) data = data.filter(d => d.category.toLowerCase().includes(search.toLowerCase()) || d.month.includes(search));
  if (query && query.trim()) {
    const q = query.toLowerCase();
    data = data.filter(d => d.category.toLowerCase().includes(q) || d.type.toLowerCase().includes(q));
  }

  const allowedCols = ['month', 'category', 'amount', 'type'];
  const safeCol = allowedCols.includes(sortCol) ? sortCol : 'month';
  data = [...data].sort((a, b) => {
    const valA = safeCol === 'amount' ? parseFloat(a[safeCol]) : a[safeCol];
    const valB = safeCol === 'amount' ? parseFloat(b[safeCol]) : b[safeCol];
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const total = data.length;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const paged = data.slice(offset, offset + parseInt(pageSize));
  return { data: paged, total };
}

export function getAnalytics(rootDir, params, username) {
  const { filter = 'all', query = '' } = params;
  let data = getExpenses(rootDir, username);

  if (filter && filter !== 'all') {
    if (filter.startsWith('last')) {
      const n = parseInt(filter.replace('last', ''));
      const today = new Date();
      let year = today.getFullYear();
      let month = (today.getMonth() + 1) - (n - 1);
      while (month <= 0) { month += 12; year -= 1; }
      const cutoffStr = `${year}-${String(month).padStart(2, '0')}`;
      const currentStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = data.filter(d => d.month >= cutoffStr && d.month <= currentStr);
    } else if (filter.length === 4) {
      data = data.filter(d => d.month.startsWith(filter));
    } else {
      data = data.filter(d => d.month === filter);
    }
  }
  if (query && query.trim()) {
    const q = query.toLowerCase();
    data = data.filter(d => d.category.toLowerCase().includes(q) || d.type.toLowerCase().includes(q));
  }

  const monthlyTotals = {};
  data.forEach(d => {
    if (!monthlyTotals[d.month]) monthlyTotals[d.month] = { Expense: 0, EMI: 0, Saving: 0, Income: 0, total: 0 };
    monthlyTotals[d.month][d.type] = (monthlyTotals[d.month][d.type] || 0) + d.amount;
    if (d.type !== 'Income') monthlyTotals[d.month].total += d.amount;
  });

  const months = Object.keys(monthlyTotals).sort();
  const catMap = {};
  data.forEach(d => {
    if (!catMap[d.category]) catMap[d.category] = { total: 0, type: d.type };
    catMap[d.category].total += d.amount;
  });
  const categoryTotals = Object.entries(catMap)
    .map(([cat, v]) => [cat, v.total, v.type])
    .sort((a, b) => b[1] - a[1]);

  const allData = getExpenses(rootDir, username);
  const allCategories = [...new Set(allData.map(d => d.category))].sort();
  const allYears = [...new Set(allData.map(d => d.month.slice(0, 4)))].sort().reverse();
  const allMonths = [...new Set(allData.map(d => d.month))].sort().reverse();

  return { monthlyTotals, months, categoryTotals, allCategories, allYears, allMonths, rawForAnomalies: data };
}

