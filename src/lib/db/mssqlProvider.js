import mssql from 'mssql';
import crypto from 'crypto';
import { normalizeType } from '../validation';
import { parseSmartQuery, isEmptySmartQuery } from '../../utils/smartQuery';
import { demoAmount, demoFactor } from '../privacy';
import { hideRows, hideSummary, hideCategories, demoCategories, demoSummaryConfig } from './privacyTransforms';
import { loanSnapshot, currentMonth as currentMonthStr, addMonths } from '../../utils/loanMath';
import { projectedCompletion, monthlyNeeded } from '../../utils/goalMath';
import { detectYearlyItems, nextDueDate, daysUntil } from '../../utils/cadence';

let poolPromise = null;

async function initPool(config) {
  let pool;
  if (config.connectionString) {
    pool = await mssql.connect(config.connectionString);
  } else {
    let srv = config.server || 'localhost';
    let port = 1433;

    // Clean up Azure connection strings like "tcp:server.database.windows.net,1433"
    if (srv.startsWith('tcp:')) srv = srv.replace('tcp:', '');
    if (srv.includes(',')) {
      const parts = srv.split(',');
      srv = parts[0];
      port = parseInt(parts[1], 10);
    }

    if (!config.user || !config.password) {
      throw new Error('Database credentials are not configured (set DATABASE_URL).');
    }

    const sqlConfig = {
      server: srv,
      port: port,
      database: config.database || 'GaddiTracker',
      user: config.user,
      password: config.password,
      options: {
        encrypt: srv.includes('database.windows.net'),
        trustServerCertificate: String(config.trustServerCertificate) === 'true',
      },
      pool: {
        max: 10,
        min: 1, // Keep a minimum of 1 connection alive to prevent cold starts
        idleTimeoutMillis: 30000
      }
    };

    pool = await mssql.connect(sqlConfig);
  }

  return pool;
}

function getPool(config) {
  if (poolPromise) return poolPromise;
  // Reset on failure so the retry wrapper can establish a fresh connection
  poolPromise = initPool(config).catch(err => {
    poolPromise = null;
    throw err;
  });
  return poolPromise;
}

/** Error carrying an HTTP status so routes can answer 404/409 instead of 500. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const REAL = { mode: 'real', demoSeed: 0, maskCategoryNames: false };
const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
const shiftMonth = (month, delta) => addMonths(month, delta);

// ---- Privacy-aware amount expression --------------------------------------------

/**
 * SQL expression for an expense amount under the given privacy mode.
 * In demo mode every row is scaled by a deterministic factor derived from the
 * row id and the user's seed, so table rows, aggregates and summaries agree.
 * Binds @demoSeed on `req` when needed (once per request object).
 */
function amountExpr(req, privacy = REAL, alias = 'e') {
  if (privacy.mode !== 'demo') return `${alias}.amount`;
  if (!req.parameters || !req.parameters.demoSeed) req.input('demoSeed', mssql.Int, Number(privacy.demoSeed) || 0);
  return `ROUND(${alias}.amount * (0.55 + (ABS(CHECKSUM(CAST(${alias}.id AS NVARCHAR(36)), @demoSeed)) % 1000) / 1000.0), CASE WHEN ${alias}.amount < 5000 THEN -1 ELSE -2 END)`;
}

// ---- WHERE clause builder ---------------------------------------------------

/**
 * Binds inputs on `req` and returns the WHERE clause (without the keyword)
 * for the standard expense query shape: FROM Expenses e JOIN Categories c JOIN Types t.
 * opts: { filter, userId, type, category, search, query, monthNum }
 */
function buildWhere(req, opts, privacy = REAL) {
  const { filter = 'all', userId, type, category, search, query, monthNum } = opts;
  const conditions = ['e.user_id = @userId'];
  req.input('userId', mssql.UniqueIdentifier, userId);
  const AMT = amountExpr(req, privacy);
  const real = privacy.mode === 'real';

  if (filter && filter !== 'all') {
    if (filter.startsWith('last')) {
      const n = parseInt(filter.replace('last', ''), 10);
      const current = currentMonthStr();
      req.input('monthCutoff', mssql.VarChar(7), shiftMonth(current, -(n - 1)));
      req.input('monthCurrent', mssql.VarChar(7), current);
      conditions.push('e.month >= @monthCutoff AND e.month <= @monthCurrent');
    } else if (filter.length === 4) {
      req.input('yearFilter', mssql.VarChar(4), filter);
      conditions.push('e.month LIKE @yearFilter + N\'-%\'');
    } else {
      req.input('monthFilter', mssql.VarChar(7), filter);
      conditions.push('e.month = @monthFilter');
    }
  }

  if (monthNum) {
    req.input('monthNum', mssql.VarChar(2), monthNum);
    conditions.push('RIGHT(e.month, 2) = @monthNum');
  }

  if (type && type !== 'all') {
    req.input('typeFilter', mssql.VarChar(20), type);
    conditions.push('t.name = @typeFilter');
  }
  if (category && category !== 'all') {
    req.input('categoryFilter', mssql.NVarChar(100), category);
    conditions.push('c.name = @categoryFilter');
  }
  if (search) {
    req.input('searchFilter', mssql.NVarChar(100), `%${search}%`);
    conditions.push(real
      ? '(c.name LIKE @searchFilter OR e.month LIKE @searchFilter OR e.notes LIKE @searchFilter)'
      : '(c.name LIKE @searchFilter OR e.month LIKE @searchFilter)');
  }

  const sq = parseSmartQuery(query);
  if (!isEmptySmartQuery(sq)) {
    if (sq.amountEq !== null) { req.input('sqEq', mssql.Decimal(18, 2), sq.amountEq); conditions.push(`${AMT} = @sqEq`); }
    if (sq.amountMin !== null) { req.input('sqMin', mssql.Decimal(18, 2), sq.amountMin); conditions.push(`${AMT} >= @sqMin`); }
    if (sq.amountMax !== null) { req.input('sqMax', mssql.Decimal(18, 2), sq.amountMax); conditions.push(`${AMT} <= @sqMax`); }
    if (sq.type) {
      const t = normalizeType(sq.type);
      if (t) { req.input('sqType', mssql.VarChar(20), t); conditions.push('t.name = @sqType'); }
      else conditions.push('1 = 0');
    }
    if (sq.category) { req.input('sqCat', mssql.NVarChar(120), `%${sq.category}%`); conditions.push('c.name LIKE @sqCat'); }
    if (real) {
      if (sq.notes) { req.input('sqNotes', mssql.NVarChar(220), `%${sq.notes}%`); conditions.push('e.notes LIKE @sqNotes'); }
      if (sq.sheet) { req.input('sqSheet', mssql.NVarChar(120), `%${sq.sheet}%`); conditions.push('e.sheet LIKE @sqSheet'); }
    } else if (sq.notes || sq.sheet) {
      conditions.push('1 = 0');
    }
    if (sq.text) {
      req.input('sqText', mssql.NVarChar(220), `%${sq.text}%`);
      conditions.push(real
        ? '(c.name LIKE @sqText OR t.name LIKE @sqText OR e.notes LIKE @sqText OR e.sheet LIKE @sqText)'
        : '(c.name LIKE @sqText OR t.name LIKE @sqText)');
    }
  }

  return conditions.join(' AND ');
}

const EXPENSE_FROM = `
    FROM Expenses e
    JOIN Categories c ON e.category_id = c.id
    JOIN Types t ON e.type_id = t.id`;

// ---- Reads ------------------------------------------------------------------

export async function getExpenses(config, userId) {
  const pool = await getPool(config);
  const request = pool.request();
  request.input('userId', mssql.UniqueIdentifier, userId);
  const result = await request.query(`
    SELECT e.id as uuid, e.month, c.name as category, e.amount, t.name as type, e.notes as tags, e.sheet, u.username, e.category_id, e.type_id
    FROM Expenses e
    JOIN Categories c ON e.category_id = c.id
    JOIN Types t ON e.type_id = t.id
    JOIN Users u ON e.user_id = u.id
    WHERE e.user_id = @userId
    ORDER BY e.month ASC
  `);
  return result.recordset;
}

/**
 * Paginated expense fetch with server-side filtering, sorting, and pagination.
 * `params` is expected to be pre-validated by validateListParams.
 */
export async function getExpensesPaginated(config, params, userId, privacy = REAL) {
  const pool = await getPool(config);

  const {
    filter = 'all', page = 1, pageSize = 50, sortCol = 'month', sortDir = 'desc',
    type = 'all', category = 'all', search = '', query = '', monthNum = null, isExport = false,
  } = params;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 50));
  const offset = (safePage - 1) * safePageSize;
  const whereOpts = { filter, userId, type, category, search, query, monthNum };

  const req = pool.request();
  req.input('offset', mssql.Int, offset);
  req.input('pageSize', mssql.Int, safePageSize);
  const whereClause = buildWhere(req, whereOpts, privacy);
  const AMT = amountExpr(req, privacy);

  const allowedCols = ['month', 'category', 'amount', 'type'];
  const safeCol = allowedCols.includes(sortCol)
    ? (sortCol === 'category' ? 'c.name' : sortCol === 'type' ? 't.name' : sortCol === 'amount' ? AMT : 'e.month')
    : 'e.month';
  const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const dataResult = await req.query(`
    SELECT e.id as uuid, e.month, c.name as category, ${AMT} as amount, t.name as type, e.notes as tags, e.sheet
    ${EXPENSE_FROM}
    WHERE ${whereClause}
    ORDER BY ${safeCol} ${safeDir}, e.id
    ${(isExport === 'true' || isExport === true) ? '' : 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'}
  `);

  const countReq = pool.request();
  const countWhere = buildWhere(countReq, whereOpts, privacy);
  const countResult = await countReq.query(`SELECT COUNT(*) AS total ${EXPENSE_FROM} WHERE ${countWhere}`);

  let data = dataResult.recordset;
  if (privacy.mode === 'hidden') data = hideRows(data);
  else if (privacy.mode === 'demo') data = data.map(r => ({ ...r, tags: null, sheet: null }));

  return { data, total: countResult.recordset[0]?.total || 0 };
}

export async function getAnalytics(config, params, userId, privacy = REAL) {
  const pool = await getPool(config);
  const { filter = 'all', query = '' } = params;
  const whereOpts = { filter, userId, query };

  const scoped = (sql) => {
    const r = pool.request();
    const where = buildWhere(r, whereOpts, privacy);
    const AMT = amountExpr(r, privacy);
    return r.query(sql.replace(/\{\{WHERE\}\}/g, where).replace(/\{\{AMT\}\}/g, AMT));
  };
  const byUser = (sql) => {
    const r = pool.request();
    r.input('userId', mssql.UniqueIdentifier, userId);
    return r.query(sql);
  };

  const [monthlyResult, catResult, matrixResult, allCatResult, allYearsResult, allMonthsResult, anomalyRaw] = await Promise.all([
    scoped(`SELECT e.month, t.name as type, SUM({{AMT}}) AS total ${EXPENSE_FROM} WHERE {{WHERE}} GROUP BY e.month, t.name ORDER BY e.month ASC`),
    scoped(`SELECT c.name as category, t.name as type, SUM({{AMT}}) AS total ${EXPENSE_FROM} WHERE {{WHERE}} GROUP BY c.name, t.name ORDER BY total DESC`),
    scoped(`SELECT e.month, c.name as category, SUM({{AMT}}) AS total ${EXPENSE_FROM} WHERE {{WHERE}} GROUP BY e.month, c.name`),
    byUser(`SELECT DISTINCT c.name as category FROM Expenses e JOIN Categories c ON e.category_id = c.id WHERE e.user_id = @userId ORDER BY c.name ASC`),
    byUser(`SELECT DISTINCT LEFT(e.month, 4) AS year FROM Expenses e WHERE e.user_id = @userId ORDER BY year DESC`),
    byUser(`SELECT DISTINCT e.month FROM Expenses e WHERE e.user_id = @userId ORDER BY e.month DESC`),
    scoped(`SELECT e.id as uuid, e.month, c.name as category, {{AMT}} as amount, t.name as type ${EXPENSE_FROM} WHERE {{WHERE}} ORDER BY e.month ASC`),
  ]);

  const monthlyTotals = {};
  for (const row of monthlyResult.recordset) {
    if (!monthlyTotals[row.month]) monthlyTotals[row.month] = { Expense: 0, EMI: 0, Saving: 0, Income: 0, total: 0 };
    monthlyTotals[row.month][row.type] = parseFloat(row.total);
    if (row.type !== 'Income') monthlyTotals[row.month].total += parseFloat(row.total);
  }

  const matrixValues = {};
  const catGrand = {};
  for (const row of matrixResult.recordset) {
    const amt = parseFloat(row.total);
    if (!matrixValues[row.month]) matrixValues[row.month] = {};
    matrixValues[row.month][row.category] = amt;
    catGrand[row.category] = (catGrand[row.category] || 0) + amt;
  }
  const categoryMatrix = {
    months: Object.keys(matrixValues).sort(),
    categories: Object.entries(catGrand).sort((a, b) => b[1] - a[1]).map(([name]) => name),
    values: matrixValues,
  };

  const months = Object.keys(monthlyTotals).sort();
  const categoryTotals = catResult.recordset.map(r => [r.category, parseFloat(r.total), r.type]);
  const allCategories = allCatResult.recordset.map(r => r.category);
  const allYears = allYearsResult.recordset.map(r => r.year);
  const allMonths = allMonthsResult.recordset.map(r => r.month);

  let openingBalance = 0;
  if (filter && filter !== 'all') {
    let cutoffStr;
    if (filter.startsWith('last')) cutoffStr = shiftMonth(currentMonthStr(), -(parseInt(filter.replace('last', ''), 10) - 1));
    else if (filter.length === 4) cutoffStr = `${filter}-01`;
    else cutoffStr = filter;
    const obReq = pool.request();
    obReq.input('userId', mssql.UniqueIdentifier, userId);
    obReq.input('cutoffStr', mssql.VarChar(7), cutoffStr);
    const AMT = amountExpr(obReq, privacy);
    const obResult = await obReq.query(`
      SELECT SUM(CASE WHEN t.name = 'Income' THEN ${AMT} ELSE -${AMT} END) as bal
      FROM Expenses e
      JOIN Types t ON e.type_id = t.id
      WHERE e.user_id = @userId AND e.month < @cutoffStr
    `);
    openingBalance = obResult.recordset[0]?.bal || 0;
  }

  const [usual, budgetStatus] = await Promise.all([
    getUsualCategories(pool, userId, currentMonthStr()),
    getBudgetStatus(pool, userId, currentMonthStr(), privacy),
  ]);

  return {
    monthlyTotals, months, categoryTotals, categoryMatrix, allCategories, allYears, allMonths, openingBalance,
    usualCategories: usual.map(c => c.name),
    budgetStatus,
    rawForAnomalies: anomalyRaw.recordset,
  };
}

/** Spent vs budget for every category that has a budget, for one month. */
async function getBudgetStatus(pool, userId, month, privacy = REAL) {
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('month', mssql.VarChar(7), month);
  const AMT = amountExpr(req, privacy);
  const res = await req.query(`
    SELECT c.id AS category_id, c.name AS category, c.icon, c.budget_amount,
           ISNULL((SELECT SUM(${AMT}) FROM Expenses e WHERE e.category_id = c.id AND e.user_id = c.user_id AND e.month = @month), 0) AS spent
    FROM Categories c
    WHERE c.user_id = @userId AND c.archived = 0 AND c.budget_amount IS NOT NULL AND c.budget_amount > 0
    ORDER BY c.name
  `);
  return res.recordset.map(r => {
    const budget = privacy.mode === 'demo' ? demoAmount(num(r.budget_amount), privacy.demoSeed, `cat-budget:${r.category_id}`) : num(r.budget_amount);
    const spent = num(r.spent) || 0;
    return { categoryId: r.category_id, category: r.category, icon: r.icon, month, budget, spent, pct: budget ? Math.round((spent / budget) * 100) : 0 };
  });
}

// ---- Month summary ("This month" card) --------------------------------------

/**
 * Categories the user records every month: flagged recurring, or present in
 * at least 4 of the 6 months before `refMonth`. Archived categories are excluded.
 */
async function getUsualCategories(pool, userId, refMonth) {
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('fromMonth', mssql.VarChar(7), shiftMonth(refMonth, -6));
  req.input('refMonth', mssql.VarChar(7), refMonth);
  const res = await req.query(`
    SELECT c.id, c.name, t.name AS type, c.icon, c.color, c.is_recurring, c.default_amount, c.budget_amount,
           COUNT(DISTINCT CASE WHEN e.month >= @fromMonth AND e.month < @refMonth THEN e.month END) AS recent_months
    FROM Categories c
    JOIN Types t ON c.type_id = t.id
    LEFT JOIN Expenses e ON e.category_id = c.id AND e.user_id = c.user_id
    WHERE c.user_id = @userId AND c.archived = 0
    GROUP BY c.id, c.name, t.name, c.icon, c.color, c.is_recurring, c.default_amount, c.budget_amount
    HAVING c.is_recurring = 1
        OR COUNT(DISTINCT CASE WHEN e.month >= @fromMonth AND e.month < @refMonth THEN e.month END) >= 4
    ORDER BY c.name ASC
  `);
  return res.recordset;
}

export async function getMonthSummary(config, month, userId, privacy = REAL) {
  const pool = await getPool(config);
  const usual = await getUsualCategories(pool, userId, month);

  const recordedReq = pool.request();
  recordedReq.input('userId', mssql.UniqueIdentifier, userId);
  recordedReq.input('month', mssql.VarChar(7), month);
  const AMT1 = amountExpr(recordedReq, privacy);
  const recorded = (await recordedReq.query(`
    SELECT e.id AS uuid, c.id AS category_id, c.name AS category, t.name AS type, ${AMT1} AS amount, e.notes
    ${EXPENSE_FROM}
    WHERE e.user_id = @userId AND e.month = @month
  `)).recordset;

  const lastReq = pool.request();
  lastReq.input('userId', mssql.UniqueIdentifier, userId);
  lastReq.input('month', mssql.VarChar(7), month);
  lastReq.input('fromMonth', mssql.VarChar(7), shiftMonth(month, -12));
  const AMT2 = amountExpr(lastReq, privacy);
  const history = (await lastReq.query(`
    SELECT c.id AS category_id, e.month, ${AMT2} AS amount
    ${EXPENSE_FROM}
    WHERE e.user_id = @userId AND e.month < @month AND e.month >= @fromMonth
    ORDER BY e.month DESC
  `)).recordset;

  const lastByCategory = {};
  for (const row of history) {
    const key = String(row.category_id).toLowerCase();
    if (!lastByCategory[key]) lastByCategory[key] = { amount: parseFloat(row.amount), month: row.month };
  }
  const recordedByCategory = {};
  for (const row of recorded) {
    const key = String(row.category_id).toLowerCase();
    if (!recordedByCategory[key]) recordedByCategory[key] = { uuid: row.uuid, amount: parseFloat(row.amount), notes: row.notes };
  }

  const items = usual.map(c => {
    const key = String(c.id).toLowerCase();
    const rec = recordedByCategory[key] || null;
    const last = lastByCategory[key] || null;
    const defaultAmount = num(c.default_amount);
    return {
      categoryId: c.id, category: c.name, type: c.type, icon: c.icon, color: c.color,
      isRecurring: !!c.is_recurring, budget: num(c.budget_amount),
      recorded: !!rec, uuid: rec?.uuid || null, amount: rec ? rec.amount : null,
      lastAmount: last ? last.amount : null, lastMonth: last ? last.month : null,
      suggestedAmount: defaultAmount ?? (last ? last.amount : null),
    };
  });

  const monthTotal = recorded.filter(r => r.type !== 'Income').reduce((s, r) => s + parseFloat(r.amount), 0);
  const monthIncome = recorded.filter(r => r.type === 'Income').reduce((s, r) => s + parseFloat(r.amount), 0);
  const missing = items.filter(i => !i.recorded);
  const extras = recorded
    .filter(r => !usual.some(c => String(c.id).toLowerCase() === String(r.category_id).toLowerCase()))
    .map(r => ({ category: r.category, type: r.type, amount: parseFloat(r.amount), uuid: r.uuid }));

  let summary = {
    month, items, extras,
    usualCount: items.length,
    recordedCount: items.length - missing.length,
    missingCount: missing.length,
    missingSuggestedTotal: missing.reduce((s, i) => s + (i.suggestedAmount || 0), 0),
    monthTotal, monthIncome,
    recordedRows: recorded.length,
  };
  if (privacy.mode === 'hidden') summary = hideSummary(summary);
  else if (privacy.mode === 'demo') summary = demoSummaryConfig(summary, privacy.demoSeed);
  return summary;
}

// ---- Reference data resolution ---------------------------------------------

const UNIQUE_VIOLATION = new Set([2601, 2627]);

/**
 * Resolve (and lazily create) the Types / Categories rows for an expense.
 * `executor` is either a ConnectionPool or a Transaction so that the lookups
 * participate in the caller's transaction and roll back with it.
 * Category names match case- and accent-insensitively.
 */
async function resolveRelations(executor, categoryName, typeName, userId) {
  const type = normalizeType(typeName || 'Expense');
  if (!type) throw new Error(`Unsupported expense type "${typeName}"`);

  const name = String(categoryName || '').trim().slice(0, 100);
  if (!name) throw new Error('Category name is required');

  const typeReq = new mssql.Request(executor);
  typeReq.input('tname', mssql.VarChar(50), type);
  let typeId = (await typeReq.query('SELECT id FROM Types WHERE name = @tname')).recordset[0]?.id;
  if (!typeId) {
    typeId = crypto.randomUUID();
    const insertType = new mssql.Request(executor);
    insertType.input('tid', mssql.UniqueIdentifier, typeId);
    insertType.input('tname', mssql.VarChar(50), type);
    await insertType.query('INSERT INTO Types (id, name) VALUES (@tid, @tname)');
  }

  const findCategory = async () => {
    const r = new mssql.Request(executor);
    r.input('cname', mssql.NVarChar(100), name);
    r.input('tid', mssql.UniqueIdentifier, typeId);
    r.input('uid', mssql.UniqueIdentifier, userId);
    const res = await r.query(`
      SELECT TOP 1 id FROM Categories
      WHERE name COLLATE Latin1_General_CI_AI = @cname COLLATE Latin1_General_CI_AI
        AND type_id = @tid AND user_id = @uid
      ORDER BY CASE WHEN name = @cname THEN 0 ELSE 1 END
    `);
    return res.recordset[0]?.id;
  };

  let catId = await findCategory();
  if (!catId) {
    const newCatId = crypto.randomUUID();
    const insertCat = new mssql.Request(executor);
    insertCat.input('cid', mssql.UniqueIdentifier, newCatId);
    insertCat.input('cname', mssql.NVarChar(100), name);
    insertCat.input('tid', mssql.UniqueIdentifier, typeId);
    insertCat.input('uid', mssql.UniqueIdentifier, userId);
    try {
      await insertCat.query('INSERT INTO Categories (id, name, type_id, user_id) VALUES (@cid, @cname, @tid, @uid)');
      catId = newCatId;
    } catch (err) {
      if (!UNIQUE_VIOLATION.has(err.number)) throw err;
      catId = await findCategory();
      if (!catId) throw err;
    }
  }

  return { typeId, catId };
}

/** Insert or overwrite the single expense row for (month, category, user). */
async function upsertByMonthCategory(executor, item, typeId, catId, userId) {
  const id = item.uuid || crypto.randomUUID();
  const req = new mssql.Request(executor);
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('month', mssql.VarChar(7), item.month);
  req.input('cid', mssql.UniqueIdentifier, catId);
  req.input('amount', mssql.Decimal(18, 2), item.amount);
  req.input('tid', mssql.UniqueIdentifier, typeId);
  req.input('notes', mssql.NVarChar(500), item.tags || null);
  req.input('sheet', mssql.NVarChar(100), item.sheet || null);
  req.input('userId', mssql.UniqueIdentifier, userId);

  const res = await req.query(`
    DECLARE @existingId UNIQUEIDENTIFIER;
    SELECT TOP 1 @existingId = id FROM Expenses WHERE month = @month AND category_id = @cid AND user_id = @userId;

    IF @existingId IS NOT NULL
    BEGIN
      UPDATE Expenses
      SET amount = @amount, type_id = @tid, notes = @notes, sheet = @sheet
      WHERE id = @existingId;
      SELECT @existingId AS finalUuid;
    END
    ELSE
    BEGIN
      INSERT INTO Expenses (id, month, category_id, amount, type_id, notes, sheet, user_id)
      VALUES (@id, @month, @cid, @amount, @tid, @notes, @sheet, @userId);
      SELECT @id AS finalUuid;
    END
  `);

  return res.recordset[0]?.finalUuid || id;
}

async function updateOwnedExpense(executor, uuid, item, typeId, catId, userId) {
  const req = new mssql.Request(executor);
  req.input('id', mssql.UniqueIdentifier, uuid);
  req.input('month', mssql.VarChar(7), item.month);
  req.input('cid', mssql.UniqueIdentifier, catId);
  req.input('amount', mssql.Decimal(18, 2), item.amount);
  req.input('tid', mssql.UniqueIdentifier, typeId);
  req.input('notes', mssql.NVarChar(500), item.tags || null);
  req.input('sheet', mssql.NVarChar(100), item.sheet || null);
  req.input('userId', mssql.UniqueIdentifier, userId);

  const res = await req.query(`
    UPDATE Expenses
    SET month = @month, category_id = @cid, amount = @amount, type_id = @tid, notes = @notes, sheet = @sheet
    WHERE id = @id AND user_id = @userId
  `);
  return (res.rowsAffected[0] || 0) > 0;
}

async function withTransaction(pool, work) {
  const transaction = new mssql.Transaction(pool);
  await transaction.begin();
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

// ---- Expense mutations -----------------------------------------------------

export async function createExpense(config, item, userId) {
  const pool = await getPool(config);
  const finalUuid = await withTransaction(pool, async (tx) => {
    const { typeId, catId } = await resolveRelations(tx, item.category, item.type, userId);
    return upsertByMonthCategory(tx, item, typeId, catId, userId);
  });
  return { success: true, data: { ...item, uuid: finalUuid } };
}

export async function updateExpense(config, uuid, item, userId) {
  const pool = await getPool(config);
  const updated = await withTransaction(pool, async (tx) => {
    const { typeId, catId } = await resolveRelations(tx, item.category, item.type, userId);
    return updateOwnedExpense(tx, uuid, item, typeId, catId, userId);
  });
  return { success: updated, updated };
}

export async function deleteExpense(config, uuid, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, uuid);
  req.input('userId', mssql.UniqueIdentifier, userId);
  const res = await req.query('DELETE FROM Expenses WHERE id = @id AND user_id = @userId');
  const deleted = (res.rowsAffected[0] || 0) > 0;
  return { success: deleted, deleted };
}

/**
 * Bulk upsert used by the statement reconciler and fill-month.
 * Items carrying a uuid update that row when the caller owns it; everything
 * else is merged by (month, category) exactly like createExpense.
 */
export async function bulkSyncExpenses(config, items, userId) {
  const pool = await getPool(config);
  let updated = 0;
  let merged = 0;

  await withTransaction(pool, async (tx) => {
    for (const item of items) {
      const { typeId, catId } = await resolveRelations(tx, item.category, item.type, userId);
      if (item.uuid) {
        const ok = await updateOwnedExpense(tx, item.uuid, item, typeId, catId, userId);
        if (ok) { updated++; continue; }
      }
      await upsertByMonthCategory(tx, { ...item, uuid: undefined }, typeId, catId, userId);
      merged++;
    }
  });

  return { success: true, updated, merged };
}

// ---- Users -----------------------------------------------------------------

/**
 * Find the user for an OAuth identity, or create one. Matching is by
 * (provider, provider id) only; a legacy row with no provider may be claimed
 * once by a real provider login with the same username.
 */
export async function verifyOrCreateUser(config, profile) {
  const pool = await getPool(config);
  const { oauth_provider, oauth_id, username, email } = profile;

  if (!oauth_provider || !oauth_id || !username) {
    throw new Error('Incomplete OAuth profile');
  }

  const byIdentity = pool.request();
  byIdentity.input('oauth_provider', mssql.VarChar(50), oauth_provider);
  byIdentity.input('oauth_id', mssql.VarChar(100), oauth_id);
  const existing = await byIdentity.query(`
    SELECT TOP 1 id, username, email FROM Users
    WHERE oauth_provider = @oauth_provider AND oauth_id = @oauth_id
  `);
  if (existing.recordset.length > 0) return existing.recordset[0];

  const legacyReq = pool.request();
  legacyReq.input('username', mssql.NVarChar(100), username);
  const legacy = await legacyReq.query(`
    SELECT TOP 1 id, username, email FROM Users
    WHERE username = @username AND oauth_provider IS NULL AND oauth_id IS NULL
  `);
  if (legacy.recordset.length > 0) {
    const row = legacy.recordset[0];
    if (oauth_provider === 'mock') return row;
    const claim = pool.request();
    claim.input('id', mssql.UniqueIdentifier, row.id);
    claim.input('oauth_provider', mssql.VarChar(50), oauth_provider);
    claim.input('oauth_id', mssql.VarChar(100), oauth_id);
    claim.input('email', mssql.VarChar(255), email || null);
    const claimed = await claim.query(`
      UPDATE Users
      SET oauth_provider = @oauth_provider, oauth_id = @oauth_id, email = COALESCE(email, @email)
      OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
      WHERE id = @id AND oauth_provider IS NULL AND oauth_id IS NULL
    `);
    if (claimed.recordset.length > 0) return claimed.recordset[0];
  }

  const newUserId = crypto.randomUUID();
  const insertReq = pool.request();
  insertReq.input('id', mssql.UniqueIdentifier, newUserId);
  insertReq.input('oauth_provider', mssql.VarChar(50), oauth_provider);
  insertReq.input('oauth_id', mssql.VarChar(100), oauth_id);
  insertReq.input('username', mssql.NVarChar(100), username);
  insertReq.input('email', mssql.VarChar(255), email || null);
  const insertRes = await insertReq.query(`
    INSERT INTO Users (id, oauth_provider, oauth_id, username, email)
    OUTPUT INSERTED.id, INSERTED.username, INSERTED.email
    VALUES (@id, @oauth_provider, @oauth_id, @username, @email)
  `);
  return insertRes.recordset[0];
}

// ---- User settings ---------------------------------------------------------

export async function getUserSettings(config, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  const res = await req.query('SELECT settings FROM UserSettings WHERE user_id = @userId');
  if (!res.recordset[0]) return null;
  try { return JSON.parse(res.recordset[0].settings); } catch { return null; }
}

export async function saveUserSettings(config, userId, settings) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('settings', mssql.NVarChar(mssql.MAX), JSON.stringify(settings));
  await req.query(`
    MERGE UserSettings AS target
    USING (SELECT @userId AS user_id) AS src ON target.user_id = src.user_id
    WHEN MATCHED THEN UPDATE SET settings = @settings, updated_at = GETDATE()
    WHEN NOT MATCHED THEN INSERT (user_id, settings) VALUES (@userId, @settings);
  `);
  return settings;
}

// ---- Master data -----------------------------------------------------------

export async function getTypes(config) {
  const pool = await getPool(config);
  const result = await pool.request().query('SELECT id, name FROM Types ORDER BY name ASC');
  return result.recordset;
}

/** id + name for every category; used to build the name masker. */
export async function getCategoryNameList(config, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  return (await req.query('SELECT id, name FROM Categories WHERE user_id = @userId')).recordset;
}

function categorySelect(AMT) {
  return `
  SELECT c.id, c.name, c.type_id, t.name AS type, c.icon, c.color, c.is_recurring, c.default_amount,
         c.budget_amount, c.cadence, c.archived, c.card_statement_day, c.card_due_day,
         ISNULL(s.usage_count, 0) AS usage_count, s.last_month, la.amount AS last_amount
  FROM Categories c
  JOIN Types t ON c.type_id = t.id
  OUTER APPLY (SELECT COUNT(*) AS usage_count, MAX(e.month) AS last_month FROM Expenses e WHERE e.category_id = c.id) s
  OUTER APPLY (SELECT TOP 1 ${AMT} AS amount FROM Expenses e WHERE e.category_id = c.id ORDER BY e.month DESC) la`;
}

function shapeCategory(row) {
  return {
    id: row.id,
    name: row.name,
    type_id: row.type_id,
    type: row.type,
    icon: row.icon || null,
    color: row.color || null,
    is_recurring: !!row.is_recurring,
    default_amount: num(row.default_amount),
    budget_amount: num(row.budget_amount),
    cadence: row.cadence || null,
    archived: !!row.archived,
    card_statement_day: row.card_statement_day ?? null,
    card_due_day: row.card_due_day ?? null,
    usage_count: row.usage_count || 0,
    last_month: row.last_month || null,
    last_amount: num(row.last_amount),
  };
}

export async function getCategories(config, userId, typeName, privacy = REAL) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  const AMT = amountExpr(req, privacy);

  let where = 'c.user_id = @userId';
  if (typeName) {
    req.input('tname', mssql.VarChar(50), typeName);
    where += ' AND t.name = @tname';
  }

  const result = await req.query(`${categorySelect(AMT)} WHERE ${where} ORDER BY c.archived ASC, c.name ASC`);
  let rows = result.recordset.map(shapeCategory);
  if (privacy.mode === 'hidden') rows = hideCategories(rows);
  else if (privacy.mode === 'demo') rows = demoCategories(rows, privacy.demoSeed);
  return rows;
}

async function getCategoryById(executor, id, userId) {
  const r = new mssql.Request(executor);
  r.input('id', mssql.UniqueIdentifier, id);
  r.input('userId', mssql.UniqueIdentifier, userId);
  const res = await r.query(`${categorySelect('e.amount')} WHERE c.id = @id AND c.user_id = @userId`);
  return res.recordset[0] ? shapeCategory(res.recordset[0]) : null;
}

export async function createCategory(config, { name, type }, userId) {
  const pool = await getPool(config);
  const { catId } = await withTransaction(pool, (tx) => resolveRelations(tx, name, type, userId));
  return getCategoryById(pool, catId, userId);
}

/**
 * Partial update. Renames are checked case-insensitively against the user's
 * other categories of the same type and answer 409 on a clash.
 */
export async function updateCategory(config, id, patch, userId) {
  const pool = await getPool(config);
  return withTransaction(pool, async (tx) => {
    const existing = await getCategoryById(tx, id, userId);
    if (!existing) throw httpError(404, 'Category not found');

    let typeId = existing.type_id;
    if (patch.type && patch.type !== existing.type) {
      const tr = new mssql.Request(tx);
      tr.input('tname', mssql.VarChar(50), patch.type);
      typeId = (await tr.query('SELECT id FROM Types WHERE name = @tname')).recordset[0]?.id;
      if (!typeId) throw httpError(400, 'Unknown type');
    }

    const newName = patch.name ?? existing.name;
    if (patch.name !== undefined || patch.type !== undefined) {
      const dup = new mssql.Request(tx);
      dup.input('id', mssql.UniqueIdentifier, id);
      dup.input('userId', mssql.UniqueIdentifier, userId);
      dup.input('tid', mssql.UniqueIdentifier, typeId);
      dup.input('cname', mssql.NVarChar(100), newName);
      const clash = await dup.query(`
        SELECT TOP 1 id FROM Categories
        WHERE user_id = @userId AND type_id = @tid AND id <> @id
          AND name COLLATE Latin1_General_CI_AI = @cname COLLATE Latin1_General_CI_AI
      `);
      if (clash.recordset.length > 0) {
        throw httpError(409, `A ${patch.type || existing.type} category named "${newName}" already exists. Use merge instead.`);
      }
    }

    const sets = [];
    const req = new mssql.Request(tx);
    req.input('id', mssql.UniqueIdentifier, id);
    req.input('userId', mssql.UniqueIdentifier, userId);
    if (patch.name !== undefined) { req.input('name', mssql.NVarChar(100), patch.name); sets.push('name = @name'); }
    if (patch.type !== undefined) { req.input('typeId', mssql.UniqueIdentifier, typeId); sets.push('type_id = @typeId'); }
    if (patch.icon !== undefined) { req.input('icon', mssql.NVarChar(16), patch.icon); sets.push('icon = @icon'); }
    if (patch.color !== undefined) { req.input('color', mssql.VarChar(16), patch.color); sets.push('color = @color'); }
    if (patch.is_recurring !== undefined) { req.input('isRecurring', mssql.Bit, patch.is_recurring); sets.push('is_recurring = @isRecurring'); }
    if (patch.default_amount !== undefined) { req.input('defaultAmount', mssql.Decimal(18, 2), patch.default_amount); sets.push('default_amount = @defaultAmount'); }
    if (patch.budget_amount !== undefined) { req.input('budgetAmount', mssql.Decimal(18, 2), patch.budget_amount); sets.push('budget_amount = @budgetAmount'); }
    if (patch.cadence !== undefined) { req.input('cadence', mssql.VarChar(10), patch.cadence); sets.push('cadence = @cadence'); }
    if (patch.archived !== undefined) { req.input('archived', mssql.Bit, patch.archived); sets.push('archived = @archived'); }
    if (patch.card_statement_day !== undefined) { req.input('csd', mssql.TinyInt, patch.card_statement_day); sets.push('card_statement_day = @csd'); }
    if (patch.card_due_day !== undefined) { req.input('cdd', mssql.TinyInt, patch.card_due_day); sets.push('card_due_day = @cdd'); }

    if (sets.length > 0) {
      await req.query(`UPDATE Categories SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`);
    }
    if (patch.type !== undefined && typeId !== existing.type_id) {
      const sync = new mssql.Request(tx);
      sync.input('id', mssql.UniqueIdentifier, id);
      sync.input('typeId', mssql.UniqueIdentifier, typeId);
      sync.input('userId', mssql.UniqueIdentifier, userId);
      await sync.query('UPDATE Expenses SET type_id = @typeId WHERE category_id = @id AND user_id = @userId');
    }

    return getCategoryById(tx, id, userId);
  });
}

/** Deletes a category that has no expenses; used categories must be archived or merged. */
export async function deleteCategory(config, id, userId) {
  const pool = await getPool(config);
  return withTransaction(pool, async (tx) => {
    const existing = await getCategoryById(tx, id, userId);
    if (!existing) throw httpError(404, 'Category not found');
    if (existing.usage_count > 0) throw httpError(409, 'Category is in use. Archive it or merge it into another category.');
    const req = new mssql.Request(tx);
    req.input('id', mssql.UniqueIdentifier, id);
    req.input('userId', mssql.UniqueIdentifier, userId);
    await req.query('DELETE FROM Categories WHERE id = @id AND user_id = @userId');
    return { success: true, deleted: true };
  });
}

/**
 * Moves every expense of the source categories onto the target category
 * (adopting the target's type) and deletes the sources, all in one transaction.
 */
export async function mergeCategories(config, sourceIds, targetId, userId) {
  const pool = await getPool(config);
  return withTransaction(pool, async (tx) => {
    const target = await getCategoryById(tx, targetId, userId);
    if (!target) throw httpError(404, 'Target category not found');

    let moved = 0;
    const removed = [];
    for (const sourceId of sourceIds) {
      const source = await getCategoryById(tx, sourceId, userId);
      if (!source) throw httpError(404, `Source category ${sourceId} not found`);

      const mv = new mssql.Request(tx);
      mv.input('source', mssql.UniqueIdentifier, sourceId);
      mv.input('target', mssql.UniqueIdentifier, targetId);
      mv.input('typeId', mssql.UniqueIdentifier, target.type_id);
      mv.input('userId', mssql.UniqueIdentifier, userId);
      const res = await mv.query(`
        UPDATE Expenses SET category_id = @target, type_id = @typeId
        WHERE category_id = @source AND user_id = @userId
      `);
      moved += res.rowsAffected[0] || 0;

      // Goals and loans pointing at the source follow it to the target
      const relink = new mssql.Request(tx);
      relink.input('source', mssql.UniqueIdentifier, sourceId);
      relink.input('target', mssql.UniqueIdentifier, targetId);
      relink.input('userId', mssql.UniqueIdentifier, userId);
      await relink.query(`
        UPDATE SavingsGoals SET category_id = @target WHERE category_id = @source AND user_id = @userId;
        UPDATE Loans SET category_id = @target WHERE category_id = @source AND user_id = @userId;
      `);

      const remove = new mssql.Request(tx);
      remove.input('source', mssql.UniqueIdentifier, sourceId);
      remove.input('userId', mssql.UniqueIdentifier, userId);
      await remove.query('DELETE FROM Categories WHERE id = @source AND user_id = @userId');
      removed.push(source.name);
    }

    return { success: true, moved, removed, target: await getCategoryById(tx, targetId, userId) };
  });
}

// ---- Savings goals ---------------------------------------------------------

function shapeGoal(row) {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id || null,
    category: row.category || null,
    target_amount: num(row.target_amount),
    target_month: row.target_month || null,
    expected_annual_rate: num(row.expected_annual_rate),
    starting_amount: num(row.starting_amount) || 0,
    created_at: row.created_at,
  };
}

export async function getGoals(config, userId, privacy = REAL) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('sixAgo', mssql.VarChar(7), shiftMonth(currentMonthStr(), -6));
  req.input('now', mssql.VarChar(7), currentMonthStr());
  const AMT = amountExpr(req, privacy);
  const res = await req.query(`
    SELECT g.*, c.name AS category,
           ISNULL((SELECT SUM(${AMT}) FROM Expenses e WHERE e.category_id = g.category_id AND e.user_id = g.user_id), 0) AS saved_from_ledger,
           ISNULL((SELECT SUM(${AMT}) FROM Expenses e WHERE e.category_id = g.category_id AND e.user_id = g.user_id AND e.month >= @sixAgo AND e.month < @now), 0) AS last6
    FROM SavingsGoals g
    LEFT JOIN Categories c ON c.id = g.category_id
    WHERE g.user_id = @userId
    ORDER BY g.created_at ASC
  `);

  return res.recordset.map(row => {
    const g = shapeGoal(row);
    let target = g.target_amount;
    let starting = g.starting_amount;
    if (privacy.mode === 'demo') {
      target = demoAmount(target, privacy.demoSeed, `goal:${g.id}`);
      starting = demoAmount(starting, privacy.demoSeed, `goal-start:${g.id}`);
    }
    const saved = starting + (num(row.saved_from_ledger) || 0);
    const monthlyAvg = (num(row.last6) || 0) / 6;
    const projection = projectedCompletion({ saved, target, monthlyContribution: monthlyAvg, annualRate: g.expected_annual_rate || 0 });
    const needed = monthlyNeeded({ saved, target, annualRate: g.expected_annual_rate || 0, targetMonth: g.target_month });
    const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    const out = {
      ...g,
      target_amount: target,
      starting_amount: starting,
      saved,
      monthlyAvg,
      progressPct: pct,
      projectedMonth: projection.month,
      monthsToGo: projection.months,
      monthlyNeeded: needed,
      onTrack: g.target_month ? (projection.month !== null && projection.month <= g.target_month) : null,
    };
    if (privacy.mode === 'hidden') {
      return { ...out, target_amount: null, starting_amount: null, saved: null, monthlyAvg: null, monthlyNeeded: null };
    }
    return out;
  });
}

export async function createGoal(config, input, userId) {
  const pool = await getPool(config);
  const id = crypto.randomUUID();
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('name', mssql.NVarChar(100), input.name);
  req.input('cid', mssql.UniqueIdentifier, input.category_id || null);
  req.input('target', mssql.Decimal(18, 2), input.target_amount);
  req.input('tmonth', mssql.VarChar(7), input.target_month || null);
  req.input('rate', mssql.Decimal(5, 2), input.expected_annual_rate ?? null);
  req.input('start', mssql.Decimal(18, 2), input.starting_amount ?? 0);
  await req.query(`
    INSERT INTO SavingsGoals (id, user_id, name, category_id, target_amount, target_month, expected_annual_rate, starting_amount)
    VALUES (@id, @userId, @name, @cid, @target, @tmonth, @rate, @start)
  `);
  return { id };
}

export async function updateGoal(config, id, patch, userId) {
  const pool = await getPool(config);
  const sets = [];
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  if (patch.name !== undefined) { req.input('name', mssql.NVarChar(100), patch.name); sets.push('name = @name'); }
  if (patch.category_id !== undefined) { req.input('cid', mssql.UniqueIdentifier, patch.category_id); sets.push('category_id = @cid'); }
  if (patch.target_amount !== undefined) { req.input('target', mssql.Decimal(18, 2), patch.target_amount); sets.push('target_amount = @target'); }
  if (patch.target_month !== undefined) { req.input('tmonth', mssql.VarChar(7), patch.target_month); sets.push('target_month = @tmonth'); }
  if (patch.expected_annual_rate !== undefined) { req.input('rate', mssql.Decimal(5, 2), patch.expected_annual_rate); sets.push('expected_annual_rate = @rate'); }
  if (patch.starting_amount !== undefined) { req.input('start', mssql.Decimal(18, 2), patch.starting_amount); sets.push('starting_amount = @start'); }
  if (sets.length === 0) return { updated: false };
  const res = await req.query(`UPDATE SavingsGoals SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`);
  if ((res.rowsAffected[0] || 0) === 0) throw httpError(404, 'Goal not found');
  return { updated: true };
}

export async function deleteGoal(config, id, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  const res = await req.query('DELETE FROM SavingsGoals WHERE id = @id AND user_id = @userId');
  if ((res.rowsAffected[0] || 0) === 0) throw httpError(404, 'Goal not found');
  return { deleted: true };
}

// ---- Loans ------------------------------------------------------------------

function shapeLoan(row, prepayments) {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id || null,
    category: row.category || null,
    principal: num(row.principal),
    annualRate: num(row.annual_rate),
    tenureMonths: row.tenure_months,
    startMonth: row.start_month,
    emiAmount: num(row.emi_amount),
    created_at: row.created_at,
    prepayments: prepayments.map(p => ({ id: p.id, month: p.month, amount: num(p.amount), mode: p.mode })),
  };
}

export async function getLoans(config, userId, privacy = REAL) {
  const pool = await getPool(config);
  const loansReq = pool.request();
  loansReq.input('userId', mssql.UniqueIdentifier, userId);
  const preReq = pool.request();
  preReq.input('userId', mssql.UniqueIdentifier, userId);
  const [loansRes, preRes] = await Promise.all([
    loansReq.query(`
      SELECT l.*, c.name AS category FROM Loans l
      LEFT JOIN Categories c ON c.id = l.category_id
      WHERE l.user_id = @userId ORDER BY l.created_at ASC
    `),
    preReq.query(`
      SELECT p.* FROM LoanPrepayments p JOIN Loans l ON l.id = p.loan_id WHERE l.user_id = @userId ORDER BY p.month ASC
    `),
  ]);

  const preByLoan = {};
  for (const p of preRes.recordset) {
    const k = String(p.loan_id).toLowerCase();
    (preByLoan[k] = preByLoan[k] || []).push(p);
  }

  return loansRes.recordset.map(row => {
    let loan = shapeLoan(row, preByLoan[String(row.id).toLowerCase()] || []);
    if (privacy.mode === 'demo') {
      const f = demoFactor(privacy.demoSeed, `loan:${loan.id}`);
      const scale = (v) => (v === null || v === undefined ? v : Math.round(v * f / 100) * 100);
      loan = { ...loan, principal: scale(loan.principal), emiAmount: scale(loan.emiAmount), prepayments: loan.prepayments.map(p => ({ ...p, amount: scale(p.amount) })) };
    }
    const snap = loanSnapshot(loan);
    const out = { ...loan, ...snap };
    if (privacy.mode === 'hidden') {
      return {
        ...out, principal: null, emiAmount: null, emi: null, totalInterest: null, outstanding: null,
        interestPaid: null, principalPaid: null, schedule: [], prepayments: out.prepayments.map(p => ({ ...p, amount: null })),
      };
    }
    return out;
  });
}

export async function createLoan(config, input, userId) {
  const pool = await getPool(config);
  const id = crypto.randomUUID();
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  req.input('name', mssql.NVarChar(100), input.name);
  req.input('cid', mssql.UniqueIdentifier, input.category_id || null);
  req.input('principal', mssql.Decimal(18, 2), input.principal);
  req.input('rate', mssql.Decimal(6, 3), input.annual_rate);
  req.input('tenure', mssql.Int, input.tenure_months);
  req.input('start', mssql.VarChar(7), input.start_month);
  req.input('emi', mssql.Decimal(18, 2), input.emi_amount ?? null);
  await req.query(`
    INSERT INTO Loans (id, user_id, name, category_id, principal, annual_rate, tenure_months, start_month, emi_amount)
    VALUES (@id, @userId, @name, @cid, @principal, @rate, @tenure, @start, @emi)
  `);
  return { id };
}

export async function updateLoan(config, id, patch, userId) {
  const pool = await getPool(config);
  const sets = [];
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  if (patch.name !== undefined) { req.input('name', mssql.NVarChar(100), patch.name); sets.push('name = @name'); }
  if (patch.category_id !== undefined) { req.input('cid', mssql.UniqueIdentifier, patch.category_id); sets.push('category_id = @cid'); }
  if (patch.principal !== undefined) { req.input('principal', mssql.Decimal(18, 2), patch.principal); sets.push('principal = @principal'); }
  if (patch.annual_rate !== undefined) { req.input('rate', mssql.Decimal(6, 3), patch.annual_rate); sets.push('annual_rate = @rate'); }
  if (patch.tenure_months !== undefined) { req.input('tenure', mssql.Int, patch.tenure_months); sets.push('tenure_months = @tenure'); }
  if (patch.start_month !== undefined) { req.input('start', mssql.VarChar(7), patch.start_month); sets.push('start_month = @start'); }
  if (patch.emi_amount !== undefined) { req.input('emi', mssql.Decimal(18, 2), patch.emi_amount); sets.push('emi_amount = @emi'); }
  if (sets.length === 0) return { updated: false };
  const res = await req.query(`UPDATE Loans SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`);
  if ((res.rowsAffected[0] || 0) === 0) throw httpError(404, 'Loan not found');
  return { updated: true };
}

export async function deleteLoan(config, id, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('userId', mssql.UniqueIdentifier, userId);
  const res = await req.query('DELETE FROM Loans WHERE id = @id AND user_id = @userId');
  if ((res.rowsAffected[0] || 0) === 0) throw httpError(404, 'Loan not found');
  return { deleted: true };
}

export async function addPrepayment(config, loanId, input, userId) {
  const pool = await getPool(config);
  const own = pool.request();
  own.input('id', mssql.UniqueIdentifier, loanId);
  own.input('userId', mssql.UniqueIdentifier, userId);
  const exists = (await own.query('SELECT 1 AS ok FROM Loans WHERE id = @id AND user_id = @userId')).recordset.length > 0;
  if (!exists) throw httpError(404, 'Loan not found');
  const id = crypto.randomUUID();
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, id);
  req.input('loanId', mssql.UniqueIdentifier, loanId);
  req.input('month', mssql.VarChar(7), input.month);
  req.input('amount', mssql.Decimal(18, 2), input.amount);
  req.input('mode', mssql.VarChar(10), input.mode);
  await req.query('INSERT INTO LoanPrepayments (id, loan_id, month, amount, mode) VALUES (@id, @loanId, @month, @amount, @mode)');
  return { id };
}

export async function deletePrepayment(config, loanId, prepaymentId, userId) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('id', mssql.UniqueIdentifier, prepaymentId);
  req.input('loanId', mssql.UniqueIdentifier, loanId);
  req.input('userId', mssql.UniqueIdentifier, userId);
  const res = await req.query(`
    DELETE p FROM LoanPrepayments p JOIN Loans l ON l.id = p.loan_id
    WHERE p.id = @id AND p.loan_id = @loanId AND l.user_id = @userId
  `);
  if ((res.rowsAffected[0] || 0) === 0) throw httpError(404, 'Prepayment not found');
  return { deleted: true };
}

// ---- Reminders --------------------------------------------------------------

/** YYYY-MM-DD in local time (toISOString would shift IST dates to the previous day). */
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Upcoming items for the next ~60 days: yearly categories coming due, card due
 * dates, and budgets at or above 80% this month.
 */
export async function getReminders(config, userId, privacy = REAL) {
  const pool = await getPool(config);
  const now = currentMonthStr();

  const rowsReq = pool.request();
  rowsReq.input('userId', mssql.UniqueIdentifier, userId);
  const AMT = amountExpr(rowsReq, privacy);
  const rows = (await rowsReq.query(`
    SELECT c.id AS categoryId, c.name AS category, e.month, ${AMT} AS amount
    ${EXPENSE_FROM}
    WHERE e.user_id = @userId AND c.archived = 0
  `)).recordset.map(r => ({ ...r, amount: num(r.amount) }));

  const catReq = pool.request();
  catReq.input('userId', mssql.UniqueIdentifier, userId);
  const cats = (await catReq.query(`
    SELECT id, name, icon, cadence, card_statement_day, card_due_day FROM Categories WHERE user_id = @userId AND archived = 0
  `)).recordset;

  const flagged = new Set(cats.filter(c => c.cadence === 'yearly').map(c => c.id));
  const yearly = detectYearlyItems(rows, flagged, now).filter(y => y.monthsAway <= 2 && y.monthsAway >= -1);

  const today = new Date();
  const lastByCat = {};
  for (const r of rows) {
    const k = String(r.categoryId).toLowerCase();
    if (!lastByCat[k] || lastByCat[k].month < r.month) lastByCat[k] = { month: r.month, amount: r.amount };
  }
  const cards = cats.filter(c => c.card_due_day).map(c => {
    const due = nextDueDate(c.card_due_day, today);
    const last = lastByCat[String(c.id).toLowerCase()];
    return {
      categoryId: c.id, category: c.name, icon: c.icon,
      dueDay: c.card_due_day, statementDay: c.card_statement_day || null,
      dueDate: localDate(due), daysUntil: daysUntil(due, today),
      lastAmount: last ? last.amount : null, lastMonth: last ? last.month : null,
    };
  }).sort((a, b) => a.daysUntil - b.daysUntil);

  const budgets = (await getBudgetStatus(pool, userId, now, privacy)).filter(b => b.pct >= 80);

  const iconByName = Object.fromEntries(cats.map(c => [c.name, c.icon]));
  let out = {
    asOf: localDate(today),
    yearly: yearly.map(y => ({ ...y, icon: iconByName[y.category] || null })),
    cards,
    budgets,
  };
  if (privacy.mode === 'hidden') {
    out = {
      ...out,
      yearly: out.yearly.map(y => ({ ...y, lastAmount: null })),
      cards: out.cards.map(c => ({ ...c, lastAmount: null })),
      budgets: out.budgets.map(b => ({ ...b, spent: null, budget: null })),
    };
  }
  return out;
}
