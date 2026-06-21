import fs from 'fs';
import path from 'path';
import mssql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'GaddiTracker',
  options: {
    encrypt: false,
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  },
};

if (process.env.DB_USER && process.env.DB_PASSWORD) {
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
} else {
  // Local dev credential defaults
  config.user = 'sa';
  config.password = 'sa';
}

async function run() {
  console.log('Connecting to SQL Server:', config.server);
  try {
    const pool = await mssql.connect(config);

    console.log('Ensuring database table exists...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Expenses' AND xtype='U')
      CREATE TABLE Expenses (
        id INT IDENTITY(1,1) PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        category NVARCHAR(100) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        type VARCHAR(20) NOT NULL,
        sheet NVARCHAR(100) NULL
      )
    `);

    const jsonPath = path.resolve(__dirname, '../public/expense_data.json');
    console.log('Reading seed data from:', jsonPath);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    console.log(`Clearing existing table records and inserting ${data.length} items...`);
    const transaction = new mssql.Transaction(pool);
    await transaction.begin();

    try {
      const clearReq = new mssql.Request(transaction);
      await clearReq.query('DELETE FROM Expenses');

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
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
        
        if ((i + 1) % 100 === 0) {
          console.log(`Inserted ${i + 1}/${data.length} records...`);
        }
      }

      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
    } catch (err) {
      await transaction.rollback();
      console.error('❌ Data insert failed during transaction:', err.message);
    }
  } catch (err) {
    console.error('❌ Failed to connect to SQL Server:', err.message);
    console.log('\n💡 Please check that:');
    console.log('1. Your SQL Server instance is running.');
    console.log('2. SQL Server Authentication (sa / password) is enabled, or correct credentials are set in .env.');
    console.log('3. TCP/IP is enabled in SQL Server Configuration Manager (default port 1433).');
  } finally {
    await mssql.close();
  }
}

run();
