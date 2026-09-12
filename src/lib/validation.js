/**
 * Request validation shared by the API routes and the DB layer.
 * Every value that reaches SQL is normalised here first so that bad input
 * becomes a 400 instead of a driver error, and so that free-form strings
 * cannot pollute shared reference tables.
 */

export const EXPENSE_TYPES = ['Expense', 'Income', 'EMI', 'Saving'];
export const SORT_COLUMNS = ['month', 'category', 'amount', 'type'];
export const CADENCES = ['monthly', 'yearly'];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NUM_RE = /^(0[1-9]|1[0-2])$/;
const FILTER_RE = /^(all|last\d{1,2}|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

const MAX_AMOUNT = 999999999999; // comfortably inside DECIMAL(18,2)

export function isGuid(value) {
  return typeof value === 'string' && GUID_RE.test(value);
}

export function isValidMonth(value) {
  return typeof value === 'string' && MONTH_RE.test(value);
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Case-insensitive match against the allow-list; returns canonical name or null. */
export function normalizeType(value) {
  const needle = String(value ?? '').trim().toLowerCase();
  return EXPENSE_TYPES.find(t => t.toLowerCase() === needle) || null;
}

function cleanString(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function toInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalAmount(value, field) {
  if (value === null || value === undefined || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: `${field} must be a non-negative number` };
  return { value: Math.round(n * 100) / 100 };
}

/** Validate a single expense payload (create / update / bulk item). */
export function validateExpense(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object' };
  }

  const month = cleanString(body.month, 7);
  if (!MONTH_RE.test(month)) return { error: 'month must be in YYYY-MM format' };

  const category = cleanString(body.category, 100);
  if (!category) return { error: 'category is required' };

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return { error: 'amount must be a non-negative number' };
  }

  const type = normalizeType(body.type || 'Expense');
  if (!type) return { error: `type must be one of ${EXPENSE_TYPES.join(', ')}` };

  const hasUuid = body.uuid !== undefined && body.uuid !== null && body.uuid !== '';
  if (hasUuid && !isGuid(body.uuid)) return { error: 'uuid must be a valid GUID' };

  return {
    value: {
      uuid: hasUuid ? body.uuid : undefined,
      month,
      category,
      amount: Math.round(amount * 100) / 100,
      type,
      tags: cleanString(body.tags, 500) || null,
      sheet: cleanString(body.sheet, 100) || null,
    },
  };
}

export function validateExpenseList(body, max = 2000) {
  if (!Array.isArray(body)) return { error: 'Request body must be an array' };
  if (body.length === 0) return { error: 'At least one item is required' };
  if (body.length > max) return { error: `At most ${max} items per request` };

  const value = [];
  for (let i = 0; i < body.length; i++) {
    const result = validateExpense(body[i]);
    if (result.error) return { error: `Item ${i + 1}: ${result.error}` };
    value.push(result.value);
  }
  return { value };
}

/** Validate query-string parameters for the paginated list endpoint. */
export function validateListParams(query = {}) {
  const filter = cleanString(query.filter, 7) || 'all';
  if (!FILTER_RE.test(filter)) return { error: 'Invalid filter' };

  const typeRaw = cleanString(query.type, 20) || 'all';
  const type = typeRaw === 'all' ? 'all' : normalizeType(typeRaw);
  if (!type) return { error: 'Invalid type' };

  const monthNumRaw = cleanString(query.monthNum, 3);
  if (monthNumRaw && monthNumRaw !== 'all' && !MONTH_NUM_RE.test(monthNumRaw)) return { error: 'Invalid monthNum' };

  return {
    value: {
      filter,
      page: toInt(query.page, 1, 1, 1000000),
      pageSize: toInt(query.pageSize, 50, 1, 500),
      sortCol: SORT_COLUMNS.includes(query.sortCol) ? query.sortCol : 'month',
      sortDir: query.sortDir === 'asc' ? 'asc' : 'desc',
      type,
      category: cleanString(query.category, 100) || 'all',
      search: cleanString(query.search, 100),
      query: cleanString(query.query, 200),
      monthNum: monthNumRaw && monthNumRaw !== 'all' ? monthNumRaw : null,
      isExport: query.export === 'true',
    },
  };
}

/** Validate query-string parameters for the analytics endpoint. */
export function validateAnalyticsParams(query = {}) {
  const filter = cleanString(query.filter, 7) || 'all';
  if (!FILTER_RE.test(filter)) return { error: 'Invalid filter' };
  return { value: { filter, query: cleanString(query.query, 200) } };
}

/** `?month=YYYY-MM`, defaulting to the current calendar month. */
export function validateMonthParam(value) {
  const month = cleanString(value, 7) || currentMonth();
  if (!MONTH_RE.test(month)) return { error: 'month must be in YYYY-MM format' };
  return { value: month };
}

/** Body of POST /api/expenses/fill-month: { month, items: [{ category, amount, type? }] } */
export function validateFillMonth(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object' };
  const monthCheck = validateMonthParam(body.month);
  if (monthCheck.error) return monthCheck;
  if (!Array.isArray(body.items)) return { error: 'items must be an array' };
  const withMonth = body.items.map(item => ({ ...(item || {}), month: monthCheck.value, uuid: undefined }));
  const list = validateExpenseList(withMonth, 200);
  if (list.error) return list;
  return { value: { month: monthCheck.value, items: list.value } };
}

/** Partial update for a category. At least one recognised field is required. */
export function validateCategoryPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object' };
  const patch = {};

  if (body.name !== undefined) {
    const name = cleanString(body.name, 100);
    if (!name) return { error: 'name cannot be empty' };
    patch.name = name;
  }
  if (body.type !== undefined) {
    const type = normalizeType(body.type);
    if (!type) return { error: `type must be one of ${EXPENSE_TYPES.join(', ')}` };
    patch.type = type;
  }
  if (body.icon !== undefined) {
    patch.icon = body.icon === null ? null : cleanString(body.icon, 16) || null;
  }
  if (body.color !== undefined) {
    if (body.color === null || body.color === '') patch.color = null;
    else if (!COLOR_RE.test(String(body.color))) return { error: 'color must be a hex value like #6366f1' };
    else patch.color = String(body.color).toLowerCase();
  }
  if (body.is_recurring !== undefined) patch.is_recurring = Boolean(body.is_recurring);
  if (body.archived !== undefined) patch.archived = Boolean(body.archived);
  if (body.default_amount !== undefined) {
    const r = optionalAmount(body.default_amount, 'default_amount');
    if (r.error) return r;
    patch.default_amount = r.value;
  }
  if (body.budget_amount !== undefined) {
    const r = optionalAmount(body.budget_amount, 'budget_amount');
    if (r.error) return r;
    patch.budget_amount = r.value;
  }
  if (body.cadence !== undefined) {
    if (body.cadence === null || body.cadence === '') patch.cadence = null;
    else if (!CADENCES.includes(body.cadence)) return { error: `cadence must be one of ${CADENCES.join(', ')}` };
    else patch.cadence = body.cadence;
  }

  if (Object.keys(patch).length === 0) return { error: 'No updatable fields supplied' };
  return { value: patch };
}

/** Body of POST /api/master/categories/merge: { sourceIds: [guid], targetId: guid } */
export function validateMerge(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object' };
  const { sourceIds, targetId } = body;
  if (!isGuid(targetId)) return { error: 'targetId must be a valid GUID' };
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) return { error: 'sourceIds must be a non-empty array' };
  if (sourceIds.length > 50) return { error: 'At most 50 categories can be merged at once' };
  const unique = [...new Set(sourceIds.map(s => String(s).toLowerCase()))];
  if (!unique.every(isGuid)) return { error: 'sourceIds must be valid GUIDs' };
  if (unique.includes(String(targetId).toLowerCase())) return { error: 'targetId cannot also be a source' };
  return { value: { sourceIds: unique, targetId: String(targetId).toLowerCase() } };
}