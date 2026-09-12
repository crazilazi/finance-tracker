import { demoAmount, maskAmountsInText } from '../privacy';

/**
 * Pure helpers that shape provider results for the "hidden" and "demo" modes.
 * SQL-level transforms (fake amounts per expense row) live in mssqlProvider;
 * everything that is not computed in SQL is handled here.
 */

const nullish = (v) => v === null || v === undefined;

/** Scale every number in a series to 0–100 of `max` (hidden mode keeps chart shapes, not magnitudes). */
function toIndex(value, max) {
  if (nullish(value) || !max) return 0;
  return Math.round((Number(value) / max) * 1000) / 10;
}

export function indexAnalytics(a) {
  const monthly = a.monthlyTotals || {};
  const monthMax = Math.max(1, ...Object.values(monthly).map(m => Math.max(m.total || 0, m.Income || 0)));
  const monthlyTotals = {};
  for (const [m, v] of Object.entries(monthly)) {
    monthlyTotals[m] = {
      Expense: toIndex(v.Expense, monthMax), EMI: toIndex(v.EMI, monthMax), Saving: toIndex(v.Saving, monthMax),
      Income: toIndex(v.Income, monthMax), total: toIndex(v.total, monthMax),
    };
  }

  const catMax = Math.max(1, ...(a.categoryTotals || []).map(c => c[1] || 0));
  const categoryTotals = (a.categoryTotals || []).map(([name, total, type]) => [name, toIndex(total, catMax), type]);

  const matrix = a.categoryMatrix || { months: [], categories: [], values: {} };
  let cellMax = 1;
  for (const row of Object.values(matrix.values || {})) for (const v of Object.values(row)) cellMax = Math.max(cellMax, v || 0);
  const values = {};
  for (const [m, row] of Object.entries(matrix.values || {})) {
    values[m] = {};
    for (const [cat, v] of Object.entries(row)) values[m][cat] = toIndex(v, cellMax);
  }

  return {
    ...a,
    unit: 'index',
    monthlyTotals,
    categoryTotals,
    categoryMatrix: { ...matrix, values },
    openingBalance: null,
    budgetStatus: (a.budgetStatus || []).map(b => ({ ...b, spent: null, budget: null })),
  };
}

export function maskAnomalies(list) {
  return (list || []).map(x => ({
    ...x,
    amount: null, expected: null,
    detail: maskAmountsInText(x.detail),
  }));
}

export function maskAlerts(list) {
  return (list || []).map(x => ({ ...x, detail: maskAmountsInText(x.detail) }));
}

export function hideRows(rows) {
  return (rows || []).map(r => ({ ...r, amount: null, tags: null, sheet: null }));
}

export function hideSummary(s) {
  return {
    ...s,
    items: s.items.map(i => ({ ...i, amount: null, lastAmount: null, suggestedAmount: null, budget: null })),
    extras: s.extras.map(e => ({ ...e, amount: null })),
    missingSuggestedTotal: null,
    monthTotal: null,
    monthIncome: null,
  };
}

export function hideCategories(rows) {
  return rows.map(c => ({ ...c, default_amount: null, budget_amount: null, last_amount: null }));
}

/** Demo mode for values that are user configuration rather than expense rows. */
export function demoCategories(rows, seed) {
  return rows.map(c => ({
    ...c,
    default_amount: demoAmount(c.default_amount, seed, `cat-default:${c.id}`),
    budget_amount: demoAmount(c.budget_amount, seed, `cat-budget:${c.id}`),
    last_amount: demoAmount(c.last_amount, seed, `cat-last:${c.id}`),
  }));
}

export function demoSummaryConfig(s, seed) {
  // Row amounts are already fake from SQL; budgets and defaults come from category config.
  return {
    ...s,
    items: s.items.map(i => ({
      ...i,
      budget: demoAmount(i.budget, seed, `cat-budget:${i.categoryId}`),
      suggestedAmount: i.amount === null && i.lastAmount === null ? demoAmount(i.suggestedAmount, seed, `cat-default:${i.categoryId}`) : i.suggestedAmount,
    })),
  };
}

// ---- Category name masking -----------------------------------------------------

/** Builds a name → "Category NN" mapper with a stable order (by category id). */
export function buildNameMasker(categories) {
  const sorted = [...categories].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const map = new Map();
  sorted.forEach((c, i) => map.set(c.name, `Category ${String(i + 1).padStart(2, '0')}`));
  return (name) => (name === null || name === undefined ? name : (map.get(name) || name));
}

export function maskNamesDeep(value, mask, keys = new Set(['category', 'name'])) {
  if (Array.isArray(value)) return value.map(v => maskNamesDeep(v, mask, keys));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (keys.has(k) && typeof v === 'string') out[k] = mask(v);
      else out[k] = maskNamesDeep(v, mask, keys);
    }
    return out;
  }
  return value;
}

/** Analytics carry category names as object keys (matrix) and inside tuples (categoryTotals). */
export function maskAnalyticsNames(a, mask) {
  const matrix = a.categoryMatrix || { months: [], categories: [], values: {} };
  const values = {};
  for (const [m, row] of Object.entries(matrix.values || {})) {
    values[m] = {};
    for (const [cat, v] of Object.entries(row)) values[m][mask(cat)] = v;
  }
  return {
    ...a,
    categoryTotals: (a.categoryTotals || []).map(([n, t, ty]) => [mask(n), t, ty]),
    categoryMatrix: { ...matrix, categories: matrix.categories.map(mask), values },
    allCategories: (a.allCategories || []).map(mask),
    usualCategories: (a.usualCategories || []).map(mask),
    budgetStatus: (a.budgetStatus || []).map(b => ({ ...b, category: mask(b.category) })),
    anomalies: (a.anomalies || []).map(x => ({ ...x, category: mask(x.category), detail: maskNamesInText(x.detail, mask) })),
    alerts: (a.alerts || []).map(x => ({ ...x, detail: maskNamesInText(x.detail, mask) })),
  };
}

function maskNamesInText(text, mask) {
  if (typeof text !== 'string') return text;
  // mask() only knows exact names; replace each known name occurrence in the sentence
  return mask.__names ? mask.__names.reduce((t, n) => t.split(n).join(mask(n)), text) : text;
}

export function attachNamesToMasker(mask, categories) {
  mask.__names = [...categories].map(c => c.name).sort((a, b) => b.length - a.length);
  return mask;
}
