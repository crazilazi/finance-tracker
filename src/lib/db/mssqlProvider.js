import mssql from 'mssql';
import crypto from 'crypto';

let poolPromise = null;

function getPool(config) {
  if (poolPromise) return poolPromise;

  const sqlConfig = {
    server: config.server || 'localhost',
    database: config.database || 'GaddiTracker',
    options: {
      encrypt: false,
      trustServerCertificate: config.trustServerCertificate === 'true',
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

  await req.query(`
    INSERT INTO Expenses (uuid, month, category, amount, type, sheet, username)
    VALUES (@uuid, @month, @category, @amount, @type, @sheet, @username)
  `);

  return { success: true, data: { ...item, uuid: uuidVal, username: userVal } };
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
