import mssql from 'mssql';

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
    // If no credentials, configure it to attempt trusted local connection using domain auth
    // Note: tedious requires username/password. Users can use SQL Login or sa.
    // If no user is specified, we try standard local port defaults.
    sqlConfig.user = 'sa'; 
    sqlConfig.password = 'sa'; 
  }

  poolPromise = mssql.connect(sqlConfig);
  return poolPromise;
}

async function ensureTableExists(pool) {
  const query = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses' AND xtype='U')
    CREATE TABLE Expenses (
      id INT IDENTITY(1,1) PRIMARY KEY,
      month VARCHAR(7) NOT NULL,
      category NVARCHAR(100) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      type VARCHAR(20) NOT NULL,
      sheet NVARCHAR(100) NULL
    )
  `;
  await pool.request().query(query);
}

export async function getExpenses(config) {
  const pool = await getPool(config);
  await ensureTableExists(pool);
  const result = await pool.request().query('SELECT month, category, amount, type, sheet FROM Expenses ORDER BY month ASC');
  return result.recordset;
}

export async function saveExpenses(config, data) {
  const pool = await getPool(config);
  await ensureTableExists(pool);

  const transaction = new mssql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new mssql.Request(transaction);
    await request.query('DELETE FROM Expenses');

    for (const item of data) {
      const insertReq = new mssql.Request(transaction);
      insertReq.input('month', mssql.VarChar(7), item.month);
      insertReq.input('category', mssql.NVarChar(100), item.category);
      insertReq.input('amount', mssql.Decimal(18, 2), item.amount);
      insertReq.input('type', mssql.VarChar(20), item.type);
      insertReq.input('sheet', mssql.NVarChar(100), item.sheet || null);

      await insertReq.query(`
        INSERT INTO Expenses (month, category, amount, type, sheet)
        VALUES (@month, @category, @amount, @type, @sheet)
      `);
    }

    await transaction.commit();
    return { success: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
