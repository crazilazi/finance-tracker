import mssql from 'mssql';
import crypto from 'crypto';
import { normalizeType } from '../validation';

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

/**
 * Build the WHERE clause conditions and inputs for a filter.
 * filter: 'all' | 'last3' | 'last6' | 'last12' | 'YYYY' | 'YYYY-MM'
 */
function buildFilterConditions(req, filter, userId) {
  const conditions = ['e.user_id = @userId'];
  req.input('userId', mssql.UniqueIdentifier, userId);

  if (filter && filter !== 'all') {
    if (filter.startsWith('last')) {
      const n = parseInt(filter.replace('last', ''));
      const today = new Date();
      let year = today.getFullYear();
      let month = (today.getMonth() + 1) - (n - 1);
      while (month <= 0) { month += 12; year -= 1; }
      const cutoffStr = `${year}-${String(month).padStart(2, '0')}`;
      const currentStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      req.input('monthCutoff', mssql.VarChar(7), cutoffStr);
      req.input('monthCurrent', mssql.VarChar(7), currentStr);
      conditions.push('e.month >= @monthCutoff AND e.month <= @monthCurrent');
    } else if (filter.length === 4) {
      // Year filter e.g. '2025'
      req.input('yearFilter', mssql.VarChar(4), filter);
      conditions.push('e.month LIKE @yearFilter + N\'-%\'');
    } else {
      // Exact month filter e.g. '2025-06'
      req.input('monthFilter', mssql.VarChar(7), filter);
      conditions.push('e.month = @monthFilter');
    }
  }
  return conditions;
}

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
export async function getExpensesPaginated(config, params, userId) {
  const pool = await getPool(config);

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
    isExport = false,
  } = params;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 50));
  const offset = (safePage - 1) * safePageSize;

  const allowedCols = ['month', 'category', 'amount', 'type'];
  const safeCol = allowedCols.includes(sortCol) ? (sortCol === 'category' ? 'c.name' : sortCol === 'type' ? 't.name' : `e.${sortCol}`) : 'e.month';
  const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const req = pool.request();
  req.input('offset', mssql.Int, offset);
  req.input('pageSize', mssql.Int, safePageSize);

  const conditions = buildFilterConditions(req, filter, userId);

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
    conditions.push('(c.name LIKE @searchFilter OR e.month LIKE @searchFilter OR e.notes LIKE @searchFilter)');
  }
  if (query && query.trim()) {
    req.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
    conditions.push('(c.name LIKE @queryFilter OR t.name LIKE @queryFilter OR e.notes LIKE @queryFilter)');
  }

  const whereClause = conditions.join(' AND ');

  const querySql = `
    SELECT e.id as uuid, e.month, c.name as category, e.amount, t.name as type, e.notes as tags, e.sheet
    FROM Expenses e
    JOIN Categories c ON e.category_id = c.id
    JOIN Types t ON e.type_id = t.id
    WHERE ${whereClause}
    ORDER BY ${safeCol} ${safeDir}
    ${(isExport === 'true' || isExport === true) ? '' : 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'}
  `;

  const dataResult = await req.query(querySql);

  const countReq = pool.request();
  buildFilterConditions(countReq, filter, userId);
  if (type && type !== 'all') countReq.input('typeFilter', mssql.VarChar(20), type);
  if (category && category !== 'all') countReq.input('categoryFilter', mssql.NVarChar(100), category);
  if (search) countReq.input('searchFilter', mssql.NVarChar(100), `%${search}%`);
  if (query && query.trim()) countReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);

  const countResult = await countReq.query(`
    SELECT COUNT(*) AS total
    FROM Expenses e
    JOIN Categories c ON e.category_id = c.id
    JOIN Types t ON e.type_id = t.id
    WHERE ${whereClause}
  `);

  const total = countResult.recordset[0]?.total || 0;

  return { data: dataResult.recordset, total };
}

export async function getAnalytics(config, params, userId) {
  const pool = await getPool(config);
  const { filter = 'all', query = '' } = params;

  const req = pool.request();
  const conditions = buildFilterConditions(req, filter, userId);

  if (query && query.trim()) {
    req.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
    conditions.push('(c.name LIKE @queryFilter OR t.name LIKE @queryFilter)');
  }

  const whereClause = conditions.join(' AND ');

  // Monthly totals by type
  const monthlyReq = pool.request();
  buildFilterConditions(monthlyReq, filter, userId);
  if (query && query.trim()) monthlyReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);

  const monthlyResult = await monthlyReq.query(`
    SELECT e.month, t.name as type, SUM(e.amount) AS total
    FROM Expenses e
    JOIN Types t ON e.type_id = t.id
    JOIN Categories c ON e.category_id = c.id
    WHERE ${whereClause}
    GROUP BY e.month, t.name
    ORDER BY e.month ASC
  `);

  // Category totals
  const catReq = pool.request();
  buildFilterConditions(catReq, filter, userId);
  if (query && query.trim()) catReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);

  const catResult = await catReq.query(`
    SELECT c.name as category, t.name as type, SUM(e.amount) AS total
    FROM Expenses e
    JOIN Types t ON e.type_id = t.id
    JOIN Categories c ON e.category_id = c.id
    WHERE ${whereClause}
    GROUP BY c.name, t.name
    ORDER BY total DESC
  `);

  // All categories list
  const allCatReq = pool.request();
  allCatReq.input('userId', mssql.UniqueIdentifier, userId);
  const allCatResult = await allCatReq.query(`
    SELECT DISTINCT c.name as category
    FROM Expenses e JOIN Categories c ON e.category_id = c.id
    WHERE e.user_id = @userId ORDER BY c.name ASC
  `);

  // All years list
  const allYearsReq = pool.request();
  allYearsReq.input('userId', mssql.UniqueIdentifier, userId);
  const allYearsResult = await allYearsReq.query(`
    SELECT DISTINCT LEFT(e.month, 4) AS year
    FROM Expenses e
    WHERE e.user_id = @userId ORDER BY year DESC
  `);

  // All months list
  const allMonthsReq = pool.request();
  allMonthsReq.input('userId', mssql.UniqueIdentifier, userId);
  const allMonthsResult = await allMonthsReq.query(`
    SELECT DISTINCT e.month
    FROM Expenses e
    WHERE e.user_id = @userId ORDER BY e.month DESC
  `);

  // Raw data for anomaly detection
  const anomalyReq = pool.request();
  buildFilterConditions(anomalyReq, filter, userId);
  if (query && query.trim()) anomalyReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);

  const anomalyRaw = await anomalyReq.query(`
    SELECT e.id as uuid, e.month, c.name as category, e.amount, t.name as type
    FROM Expenses e
    JOIN Categories c ON e.category_id = c.id
    JOIN Types t ON e.type_id = t.id
    WHERE ${whereClause}
    ORDER BY e.month ASC
  `);

  const monthlyTotals = {};
  for (const row of monthlyResult.recordset) {
    if (!monthlyTotals[row.month]) {
      monthlyTotals[row.month] = { Expense: 0, EMI: 0, Saving: 0, Income: 0, total: 0 };
    }
    monthlyTotals[row.month][row.type] = parseFloat(row.total);
    if (row.type !== 'Income') {
      monthlyTotals[row.month].total += parseFloat(row.total);
    }
  }

  const months = Object.keys(monthlyTotals).sort();
  const categoryTotals = catResult.recordset.map(r => [r.category, parseFloat(r.total), r.type]);
  const allCategories = allCatResult.recordset.map(r => r.category);
  const allYears = allYearsResult.recordset.map(r => r.year);
  const allMonths = allMonthsResult.recordset.map(r => r.month);

  let openingBalance = 0;
  if (filter && filter !== 'all') {
    const obReq = pool.request();
    obReq.input('userId', mssql.UniqueIdentifier, userId);
    let cutoffStr = null;
    if (filter.startsWith('last')) {
      const n = parseInt(filter.replace('last', ''));
      const today = new Date();
      let year = today.getFullYear();
      let month = (today.getMonth() + 1) - (n - 1);
      while (month <= 0) { month += 12; year -= 1; }
      cutoffStr = `${year}-${String(month).padStart(2, '0')}`;
    } else if (filter.length === 4) {
      cutoffStr = `${filter}-01`;
    } else {
      cutoffStr = filter;
    }

    if (cutoffStr) {
      obReq.input('cutoffStr', mssql.VarChar(7), cutoffStr);
      const obResult = await obReq.query(`
        SELECT SUM(CASE WHEN t.name = 'Income' THEN e.amount ELSE -e.amount END) as bal
        FROM Expenses e
        JOIN Types t ON e.type_id = t.id
        WHERE e.user_id = @userId AND e.month < @cutoffStr
      `);
      openingBalance = obResult.recordset[0]?.bal || 0;
    }
  }

  return {
    monthlyTotals,
    months,
    categoryTotals,
    allCategories,
    allYears,
    allMonths,
    openingBalance,
    rawForAnomalies: anomalyRaw.recordset,
  };
}

// ---- Reference data resolution ---------------------------------------------

const UNIQUE_VIOLATION = new Set([2601, 2627]);

/**
 * Resolve (and lazily create) the Types / Categories rows for an expense.
 * `executor` is either a ConnectionPool or a Transaction so that the lookups
 * participate in the caller's transaction and roll back with it.
 *
 * Type names are restricted to the fixed allow-list: the Types table is
 * shared by every tenant and must not be polluted with free-form input.
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
    const res = await r.query('SELECT id FROM Categories WHERE name = @cname AND type_id = @tid AND user_id = @uid');
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
      // Concurrent request created the same category first: reuse it.
      if (!UNIQUE_VIOLATION.has(err.number)) throw err;
      catId = await findCategory();
      if (!catId) throw err;
    }
  }

  return { typeId, catId };
}

/**
 * Insert or overwrite the single expense row for (month, category, user).
 * The data model holds one amount per category per month, so both the
 * create endpoint and bulk sync share this behaviour.
 */
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
 * Bulk upsert used by the statement reconciler.
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

      // Unknown or foreign uuid: never insert a client-chosen id, merge instead.
      await upsertByMonthCategory(tx, { ...item, uuid: undefined }, typeId, catId, userId);
      merged++;
    }
  });

  return { success: true, updated, merged };
}

// ---- Users -----------------------------------------------------------------

/**
 * Find the user for an OAuth identity, or create one.
 *
 * Matching is by (provider, provider id) only. A row that has no provider yet
 * (data migrated from the legacy flat table) may be claimed once by a real
 * provider login with the same username; it is then bound to that identity.
 * The mock provider (development only) may read such a row but never binds it,
 * so a later GitHub login can still claim it.
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
  if (existing.recordset.length > 0) {
    return existing.recordset[0];
  }

  // Legacy row (no provider bound yet) with the same username
  const legacyReq = pool.request();
  legacyReq.input('username', mssql.NVarChar(100), username);
  const legacy = await legacyReq.query(`
    SELECT TOP 1 id, username, email FROM Users
    WHERE username = @username AND oauth_provider IS NULL AND oauth_id IS NULL
  `);
  if (legacy.recordset.length > 0) {
    const row = legacy.recordset[0];
    if (oauth_provider === 'mock') {
      return row;
    }
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
    if (claimed.recordset.length > 0) {
      return claimed.recordset[0];
    }
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

// ---- Master data -----------------------------------------------------------

export async function getTypes(config) {
  const pool = await getPool(config);
  const result = await pool.request().query('SELECT id, name FROM Types ORDER BY name ASC');
  return result.recordset;
}

export async function getCategories(config, userId, typeName) {
  const pool = await getPool(config);
  const req = pool.request();
  req.input('userId', mssql.UniqueIdentifier, userId);

  let where = 'c.user_id = @userId';
  if (typeName) {
    req.input('tname', mssql.VarChar(50), typeName);
    where += ' AND t.name = @tname';
  }

  const result = await req.query(`
    SELECT c.id, c.name, c.type_id, t.name AS type
    FROM Categories c
    JOIN Types t ON c.type_id = t.id
    WHERE ${where}
    ORDER BY c.name ASC
  `);
  return result.recordset;
}

export async function createCategory(config, { name, type }, userId) {
  const pool = await getPool(config);
  const { typeId, catId } = await withTransaction(pool, (tx) => resolveRelations(tx, name, type, userId));
  return { id: catId, name: String(name).trim(), type_id: typeId, type: normalizeType(type || 'Expense') };
}