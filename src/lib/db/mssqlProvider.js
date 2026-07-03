import mssql from 'mssql';
import crypto from 'crypto';

let poolPromise = null;

function getPool(config) {
  if (poolPromise) return poolPromise;

  let srv = config.server || 'localhost';
  let port = 1433;
  
  // Clean up Azure connection strings like "tcp:server.database.windows.net,1433"
  if (srv.startsWith('tcp:')) srv = srv.replace('tcp:', '');
  if (srv.includes(',')) {
    const parts = srv.split(',');
    srv = parts[0];
    port = parseInt(parts[1], 10);
  }

  const sqlConfig = {
    server: srv,
    port: port,
    database: config.database || 'GaddiTracker',
    options: {
      encrypt: srv.includes('database.windows.net') ? true : false,
      trustServerCertificate: String(config.trustServerCertificate) === 'true',
    },
  };

  if (config.user && config.password) {
    sqlConfig.user = config.user;
    sqlConfig.password = config.password;
  } else {
    sqlConfig.user = 'sa';
    sqlConfig.password = 'sa';
  }

  poolPromise = mssql.connect(sqlConfig);
  return poolPromise;
}

async function ensureTableExists(pool) {
  const query = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses' AND xtype='U')
    BEGIN
      CREATE TABLE Expenses (
        id INT IDENTITY(1,1) PRIMARY KEY,
        uuid VARCHAR(50) NULL,
        month VARCHAR(7) NOT NULL,
        category NVARCHAR(100) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        type VARCHAR(20) NOT NULL,
        sheet NVARCHAR(100) NULL,
        username NVARCHAR(100) NOT NULL DEFAULT 'Default User'
      );
    END
    ELSE
    BEGIN
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Expenses') AND name = 'username')
      BEGIN
        ALTER TABLE Expenses ADD username NVARCHAR(100) NOT NULL DEFAULT 'Default User';
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Expenses') AND name = 'uuid')
      BEGIN
        ALTER TABLE Expenses ADD uuid VARCHAR(50) NULL;
      END
    END
  `;
  await pool.request().query(query);

  // Migration step for existing rows without UUID
  const unmigratedReq = pool.request();
  const unmigrated = await unmigratedReq.query("SELECT id FROM Expenses WHERE uuid IS NULL OR uuid = ''");
  if (unmigrated.recordset && unmigrated.recordset.length > 0) {
    for (const row of unmigrated.recordset) {
      const updateReq = pool.request();
      updateReq.input('id', mssql.Int, row.id);
      updateReq.input('uuid', mssql.VarChar(50), crypto.randomUUID());
      await updateReq.query("UPDATE Expenses SET uuid = @uuid WHERE id = @id");
    }
  }
}

/**
 * Build the WHERE clause conditions and inputs for a filter.
 * filter: 'all' | 'last3' | 'last6' | 'last12' | 'YYYY' | 'YYYY-MM'
 */
function buildFilterConditions(req, filter, username) {
  const conditions = ['username = @username'];
  req.input('username', mssql.NVarChar(100), username || 'Default User');

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
      conditions.push('month >= @monthCutoff AND month <= @monthCurrent');
    } else if (filter.length === 4) {
      // Year filter e.g. '2025'
      req.input('yearFilter', mssql.VarChar(4), filter);
      conditions.push('month LIKE @yearFilter + N\'-%\'');
    } else {
      // Exact month filter e.g. '2025-06'
      req.input('monthFilter', mssql.VarChar(7), filter);
      conditions.push('month = @monthFilter');
    }
  }
  return conditions;
}

export async function getExpenses(config, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);

  const request = pool.request();
  request.input('username', mssql.NVarChar(100), username || 'Default User');
  const result = await request.query(
    'SELECT uuid, month, category, amount, type, sheet, username FROM Expenses WHERE username = @username ORDER BY month ASC'
  );
  return result.recordset;
}

/**
 * Paginated expense fetch with server-side filtering, sorting, and pagination.
 */
export async function getExpensesPaginated(config, params, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);

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

  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  // Validate sort column to prevent SQL injection
  const allowedCols = ['month', 'category', 'amount', 'type'];
  const safeCol = allowedCols.includes(sortCol) ? sortCol : 'month';
  const safeDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const req = pool.request();
  req.input('offset', mssql.Int, offset);
  req.input('pageSize', mssql.Int, parseInt(pageSize));

  const conditions = buildFilterConditions(req, filter, username);

  if (type && type !== 'all') {
    req.input('typeFilter', mssql.VarChar(20), type);
    conditions.push('type = @typeFilter');
  }
  if (category && category !== 'all') {
    req.input('categoryFilter', mssql.NVarChar(100), category);
    conditions.push('category = @categoryFilter');
  }
  if (search) {
    req.input('searchFilter', mssql.NVarChar(100), `%${search}%`);
    conditions.push('(category LIKE @searchFilter OR month LIKE @searchFilter)');
  }
  // Smart query — simple text match across category
  if (query && query.trim()) {
    req.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
    conditions.push('(category LIKE @queryFilter OR type LIKE @queryFilter)');
  }

  const whereClause = conditions.join(' AND ');

  const querySql = `
    SELECT uuid, month, category, amount, type, sheet
    FROM Expenses
    WHERE ${whereClause}
    ORDER BY ${safeCol} ${safeDir}
    ${(isExport === 'true' || isExport === true) ? '' : 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY'}
  `;

  const dataResult = await req.query(querySql);

  const countReq = pool.request();
  buildFilterConditions(countReq, filter, username);
  if (type && type !== 'all') {
    countReq.input('typeFilter', mssql.VarChar(20), type);
  }
  if (category && category !== 'all') {
    countReq.input('categoryFilter', mssql.NVarChar(100), category);
  }
  if (search) {
    countReq.input('searchFilter', mssql.NVarChar(100), `%${search}%`);
  }
  if (query && query.trim()) {
    countReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
  }
  const countResult = await countReq.query(`SELECT COUNT(*) AS total FROM Expenses WHERE ${whereClause}`);
  const total = countResult.recordset[0]?.total || 0;

  return { data: dataResult.recordset, total };
}

/**
 * Server-side aggregated analytics for the given filter.
 * Returns monthly totals, category totals, and anomaly inputs.
 */
export async function getAnalytics(config, params, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);

  const { filter = 'all', query = '' } = params;

  const req = pool.request();
  const conditions = buildFilterConditions(req, filter, username);

  if (query && query.trim()) {
    req.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
    conditions.push('(category LIKE @queryFilter OR type LIKE @queryFilter)');
  }

  const whereClause = conditions.join(' AND ');

  // Monthly totals by type
  const monthlyReq = pool.request();
  buildFilterConditions(monthlyReq, filter, username);
  if (query && query.trim()) {
    monthlyReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
  }
  const monthlyResult = await monthlyReq.query(`
    SELECT month, type, SUM(amount) AS total
    FROM Expenses
    WHERE ${whereClause}
    GROUP BY month, type
    ORDER BY month ASC
  `);

  // Category totals
  const catReq = pool.request();
  buildFilterConditions(catReq, filter, username);
  if (query && query.trim()) {
    catReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
  }
  const catResult = await catReq.query(`
    SELECT category, type, SUM(amount) AS total
    FROM Expenses
    WHERE ${whereClause}
    GROUP BY category, type
    ORDER BY total DESC
  `);

  // All categories list (unfiltered, for dropdowns)
  const allCatReq = pool.request();
  allCatReq.input('username', mssql.NVarChar(100), username || 'Default User');
  const allCatResult = await allCatReq.query(`
    SELECT DISTINCT category FROM Expenses WHERE username = @username ORDER BY category ASC
  `);

  // All years list (unfiltered, for dropdowns)
  const allYearsReq = pool.request();
  allYearsReq.input('username', mssql.NVarChar(100), username || 'Default User');
  const allYearsResult = await allYearsReq.query(`
    SELECT DISTINCT LEFT(month, 4) AS year FROM Expenses WHERE username = @username ORDER BY year DESC
  `);

  // All months list (unfiltered, for dropdowns)
  const allMonthsReq = pool.request();
  allMonthsReq.input('username', mssql.NVarChar(100), username || 'Default User');
  const allMonthsResult = await allMonthsReq.query(`
    SELECT DISTINCT month FROM Expenses WHERE username = @username ORDER BY month DESC
  `);

  // Raw data for anomaly detection (limited to filtered scope, max 500 rows)
  const anomalyReq = pool.request();
  buildFilterConditions(anomalyReq, filter, username);
  if (query && query.trim()) {
    anomalyReq.input('queryFilter', mssql.NVarChar(200), `%${query.trim()}%`);
  }
  const anomalyRaw = await anomalyReq.query(`
    SELECT uuid, month, category, amount, type
    FROM Expenses
    WHERE ${whereClause}
    ORDER BY month ASC
  `);

  // Build monthlyTotals object
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

  // Calculate opening balance based on filter start month
  let openingBalance = 0;
  if (filter && filter !== 'all') {
    const obReq = pool.request();
    obReq.input('username', mssql.NVarChar(100), username || 'Default User');
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
      cutoffStr = filter; // e.g. '2025-06'
    }

    if (cutoffStr) {
      obReq.input('cutoffStr', mssql.VarChar(7), cutoffStr);
      const obResult = await obReq.query(`
        SELECT SUM(CASE WHEN type = 'Income' THEN amount ELSE -amount END) as bal
        FROM Expenses
        WHERE username = @username AND month < @cutoffStr
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

export async function saveExpenses(config, data, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);

  const userVal = username || 'Default User';

  const transaction = new mssql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new mssql.Request(transaction);
    request.input('username', mssql.NVarChar(100), userVal);
    await request.query('DELETE FROM Expenses WHERE username = @username');

    for (const item of data) {
      const insertReq = new mssql.Request(transaction);
      insertReq.input('uuid', mssql.VarChar(50), item.uuid || crypto.randomUUID());
      insertReq.input('month', mssql.VarChar(7), item.month);
      insertReq.input('category', mssql.NVarChar(100), item.category);
      insertReq.input('amount', mssql.Decimal(18, 2), item.amount);
      insertReq.input('type', mssql.VarChar(20), item.type);
      insertReq.input('sheet', mssql.NVarChar(100), item.sheet || null);
      insertReq.input('username', mssql.NVarChar(100), userVal);

      await insertReq.query(`
        INSERT INTO Expenses (uuid, month, category, amount, type, sheet, username)
        VALUES (@uuid, @month, @category, @amount, @type, @sheet, @username)
      `);
    }

    await transaction.commit();
    return { success: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function createExpense(config, item, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);
  const userVal = username || 'Default User';

  const uuidVal = item.uuid || crypto.randomUUID();
  const req = pool.request();
  req.input('uuid', mssql.VarChar(50), uuidVal);
  req.input('month', mssql.VarChar(7), item.month);
  req.input('category', mssql.NVarChar(100), item.category);
  req.input('amount', mssql.Decimal(18, 2), item.amount);
  req.input('type', mssql.VarChar(20), item.type);
  req.input('sheet', mssql.NVarChar(100), item.sheet || null);
  req.input('username', mssql.NVarChar(100), userVal);

  const res = await req.query(`
    DECLARE @existingUuid VARCHAR(50);
    SELECT @existingUuid = uuid FROM Expenses WHERE month = @month AND category = @category AND username = @username;

    IF @existingUuid IS NOT NULL
    BEGIN
      UPDATE Expenses
      SET amount = @amount, type = @type, sheet = @sheet
      WHERE uuid = @existingUuid;
      SELECT @existingUuid AS finalUuid;
    END
    ELSE
    BEGIN
      INSERT INTO Expenses (uuid, month, category, amount, type, sheet, username)
      VALUES (@uuid, @month, @category, @amount, @type, @sheet, @username);
      SELECT @uuid AS finalUuid;
    END
  `);

  const finalUuid = res.recordset[0]?.finalUuid || uuidVal;

  return { success: true, data: { ...item, uuid: finalUuid, username: userVal } };
}

export async function updateExpense(config, uuid, item, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);
  const userVal = username || 'Default User';

  const req = pool.request();
  req.input('uuid', mssql.VarChar(50), uuid);
  req.input('month', mssql.VarChar(7), item.month);
  req.input('category', mssql.NVarChar(100), item.category);
  req.input('amount', mssql.Decimal(18, 2), item.amount);
  req.input('type', mssql.VarChar(20), item.type);
  req.input('sheet', mssql.NVarChar(100), item.sheet || null);
  req.input('username', mssql.NVarChar(100), userVal);

  await req.query(`
    UPDATE Expenses
    SET month = @month, category = @category, amount = @amount, type = @type, sheet = @sheet
    WHERE uuid = @uuid AND username = @username
  `);

  return { success: true };
}

export async function deleteExpense(config, uuid, username) {
  const pool = await getPool(config);
  await ensureTableExists(pool);
  const userVal = username || 'Default User';

  const req = pool.request();
  req.input('uuid', mssql.VarChar(50), uuid);
  req.input('username', mssql.NVarChar(100), userVal);

  await req.query('DELETE FROM Expenses WHERE uuid = @uuid AND username = @username');
  return { success: true };
}

export async function bulkSyncExpenses(config, items, username) {
  return saveExpenses(config, items, username);
}
