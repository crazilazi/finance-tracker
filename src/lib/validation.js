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

  const cards = validateCardDays(body);
  if (cards.error) return cards;
  Object.assign(patch, cards.value);

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
// ---- Phase B ------------------------------------------------------------------

const PRIVACY_MODES = ['hidden', 'demo', 'real'];

/** Body of PUT /api/settings: { privacy: {...} } — allow-listed keys only. */
export function validateSettingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object' };
  const allowedTop = ['privacy'];
  const unknownTop = Object.keys(body).filter(k => !allowedTop.includes(k));
  if (unknownTop.length) return { error: `Unknown settings: ${unknownTop.join(', ')}` };

  const out = {};
  if (body.privacy !== undefined) {
    const p = body.privacy;
    if (!p || typeof p !== 'object') return { error: 'privacy must be an object' };
    const allowed = ['defaultMode', 'maskCategoryNames', 'unlockMinutes', 'demoSeed', 'pin', 'clearPin'];
    const unknown = Object.keys(p).filter(k => !allowed.includes(k));
    if (unknown.length) return { error: `Unknown privacy settings: ${unknown.join(', ')}` };
    const privacy = {};
    if (p.defaultMode !== undefined) {
      if (!PRIVACY_MODES.includes(p.defaultMode)) return { error: `defaultMode must be one of ${PRIVACY_MODES.join(', ')}` };
      privacy.defaultMode = p.defaultMode;
    }
    if (p.maskCategoryNames !== undefined) privacy.maskCategoryNames = Boolean(p.maskCategoryNames);
    if (p.unlockMinutes !== undefined) {
      const n = parseInt(p.unlockMinutes, 10);
      if (!Number.isFinite(n) || n < 0 || n > 240) return { error: 'unlockMinutes must be between 0 and 240' };
      privacy.unlockMinutes = n;
    }
    if (p.demoSeed !== undefined) {
      const n = parseInt(p.demoSeed, 10);
      if (!Number.isFinite(n) || n < 0) return { error: 'demoSeed must be a non-negative integer' };
      privacy.demoSeed = n;
    }
    if (p.pin !== undefined && p.pin !== null && p.pin !== '') {
      const pin = String(p.pin);
      if (!/^\d{4,8}$/.test(pin)) return { error: 'pin must be 4 to 8 digits' };
      privacy.pin = pin;
    }
    if (p.clearPin !== undefined) privacy.clearPin = Boolean(p.clearPin);
    out.privacy = privacy;
  }
  if (Object.keys(out).length === 0) return { error: 'No settings supplied' };
  return { value: out };
}

/** Body of POST /api/goals and PUT /api/goals/:id */
export function validateGoal(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object' };
  const out = {};
  if (body.name !== undefined || !partial) {
    const name = cleanString(body.name, 100);
    if (!name) return { error: 'name is required' };
    out.name = name;
  }
  if (body.category_id !== undefined) {
    if (body.category_id !== null && !isGuid(body.category_id)) return { error: 'category_id must be a GUID or null' };
    out.category_id = body.category_id;
  }
  if (body.target_amount !== undefined || !partial) {
    const r = optionalAmount(body.target_amount, 'target_amount');
    if (r.error) return r;
    if (r.value === null || r.value <= 0) return { error: 'target_amount must be greater than zero' };
    out.target_amount = r.value;
  }
  if (body.target_month !== undefined) {
    if (body.target_month === null || body.target_month === '') out.target_month = null;
    else if (!MONTH_RE.test(String(body.target_month))) return { error: 'target_month must be YYYY-MM' };
    else out.target_month = String(body.target_month);
  }
  if (body.expected_annual_rate !== undefined) {
    if (body.expected_annual_rate === null || body.expected_annual_rate === '') out.expected_annual_rate = null;
    else {
      const n = Number(body.expected_annual_rate);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'expected_annual_rate must be between 0 and 100' };
      out.expected_annual_rate = Math.round(n * 100) / 100;
    }
  }
  if (body.starting_amount !== undefined) {
    const r = optionalAmount(body.starting_amount, 'starting_amount');
    if (r.error) return r;
    out.starting_amount = r.value ?? 0;
  }
  if (partial && Object.keys(out).length === 0) return { error: 'No updatable fields supplied' };
  return { value: out };
}

/** Body of POST /api/loans and PUT /api/loans/:id */
export function validateLoan(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be an object' };
  const out = {};
  if (body.name !== undefined || !partial) {
    const name = cleanString(body.name, 100);
    if (!name) return { error: 'name is required' };
    out.name = name;
  }
  if (body.category_id !== undefined) {
    if (body.category_id !== null && !isGuid(body.category_id)) return { error: 'category_id must be a GUID or null' };
    out.category_id = body.category_id;
  }
  if (body.principal !== undefined || !partial) {
    const r = optionalAmount(body.principal, 'principal');
    if (r.error) return r;
    if (r.value === null || r.value <= 0) return { error: 'principal must be greater than zero' };
    out.principal = r.value;
  }
  if (body.annual_rate !== undefined || !partial) {
    const n = Number(body.annual_rate);
    if (!Number.isFinite(n) || n < 0 || n > 60) return { error: 'annual_rate must be between 0 and 60' };
    out.annual_rate = Math.round(n * 1000) / 1000;
  }
  if (body.tenure_months !== undefined || !partial) {
    const n = parseInt(body.tenure_months, 10);
    if (!Number.isFinite(n) || n < 1 || n > 600) return { error: 'tenure_months must be between 1 and 600' };
    out.tenure_months = n;
  }
  if (body.start_month !== undefined || !partial) {
    const m = cleanString(body.start_month, 7);
    if (!MONTH_RE.test(m)) return { error: 'start_month must be YYYY-MM' };
    out.start_month = m;
  }
  if (body.emi_amount !== undefined) {
    const r = optionalAmount(body.emi_amount, 'emi_amount');
    if (r.error) return r;
    out.emi_amount = r.value && r.value > 0 ? r.value : null;
  }
  if (partial && Object.keys(out).length === 0) return { error: 'No updatable fields supplied' };
  return { value: out };
}

/** Body of POST /api/loans/:id/prepayments */
export function validatePrepayment(body) {
  if (!body || typeof body !== 'object') return { error: 'Request body must be an object' };
  const month = cleanString(body.month, 7);
  if (!MONTH_RE.test(month)) return { error: 'month must be YYYY-MM' };
  const r = optionalAmount(body.amount, 'amount');
  if (r.error) return r;
  if (r.value === null || r.value <= 0) return { error: 'amount must be greater than zero' };
  const mode = body.mode === 'emi' ? 'emi' : 'tenure';
  return { value: { month, amount: r.value, mode } };
}

/** Card fields on a category (statement / due day of month). */
export function validateCardDays(body) {
  const out = {};
  for (const key of ['card_statement_day', 'card_due_day']) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === '') { out[key] = null; continue; }
    const n = parseInt(body[key], 10);
    if (!Number.isFinite(n) || n < 1 || n > 31) return { error: `${key} must be between 1 and 31` };
    out[key] = n;
  }
  return { value: out };
}