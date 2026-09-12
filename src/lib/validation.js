/**
 * Request validation shared by the API routes and the DB layer.
 * Every value that reaches SQL is normalised here first so that bad input
 * becomes a 400 instead of a driver error, and so that free-form strings
 * cannot pollute shared reference tables.
 */

export const EXPENSE_TYPES = ['Expense', 'Income', 'EMI', 'Saving'];
export const SORT_COLUMNS = ['month', 'category', 'amount', 'type'];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const FILTER_RE = /^(all|last\d{1,2}|\d{4}|\d{4}-(0[1-9]|1[0-2]))$/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_AMOUNT = 999999999999; // comfortably inside DECIMAL(18,2)

export function isGuid(value) {
  return typeof value === 'string' && GUID_RE.test(value);
}

export function isValidMonth(value) {
  return typeof value === 'string' && MONTH_RE.test(value);
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
