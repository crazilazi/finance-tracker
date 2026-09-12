/**
 * Applies scripts/migrate.sql (relational schema + legacy data migration) and
 * optionally seeds the relational tables from expense_data.json.
 *
 *   node scripts/migrate-to-sql.js          # schema only (idempotent)
 *   node scripts/migrate-to-sql.js --seed   # schema + import JSON seed data
 *
 * Connection comes from DATABASE_URL in .env (or DB_SERVER / DB_DATABASE /
 * DB_USER / DB_PASSWORD). No default credentials are assumed.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mssql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SEED = process.argv.includes('--seed');
const TYPES = ['Expense', 'Income', 'EMI', 'Saving'];
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function buildConfig() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const { DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE } = process.env;
  if (!DB_SERVER || !DB_USER || !DB_PASSWORD) {
    throw new Error('Set DATABASE_URL (or DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD) in .env');
  }
  return {
    server: DB_SERVER,
    database: DB_DATABASE || 'GaddiTracker',
    user: DB_USER,
    password: DB_PASSWORD,
    options: {
      encrypt: DB_SERVER.includes('database.windows.net'),
      trustServerCertificate: DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
  };
}

function normalizeType(value) {
  const needle = String(value ?? '').trim().toLowerCase();
  return TYPES.find(t => t.toLowerCase() === needle) || 'Expense';
}

async function runSchema(pool) {
  const sqlPath = path.resolve(__dirname, 'migrate.sql');
  const script = fs.readFileSync(sqlPath, 'utf8');
  // The file uses GO separators, which the driver does not understand.
  const batches = script.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
  console.log(`Applying ${batches.length} schema batches from scripts/migrate.sql ...`);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  console.log('Schema is up to date.');
}

async function seedFromJson(pool) {
  const candidates = [
    path.resolve(__dirname, '../public/expense_data.json'),
    path.resolve(__dirname, '../expense_data.json'),
  ];
  const jsonPath = candidates.find(p => fs.existsSync(p));
  if (!jsonPath) {
    console.log('No expense_data.json found; skipping seed.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Seeding ${data.length} rows from ${jsonPath} ...`);

  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    const typeIds = {};
    for (const row of (await new mssql.Request(tx).query('SELECT id, name FROM Types')).recordset) {
      typeIds[row.name] = row.id;
    }

    const userIds = {};
    const catIds = {};
    let inserted = 0;
    let skipped = 0;

    for (const item of data) {
      const username = String(item.username || 'Default User').trim();
      const type = normalizeType(item.type);
      const category = String(item.category || '').trim().slice(0, 100);
      const month = String(item.month || '').trim();
      const amount = Number(item.amount);
      if (!category || !MONTH_RE.test(month) || !Number.isFinite(amount)) { skipped++; continue; }

      if (!userIds[username]) {
        const find = new mssql.Request(tx);
        find.input('u', mssql.NVarChar(100), username);
        let id = (await find.query('SELECT TOP 1 id FROM Users WHERE username = @u')).recordset[0]?.id;
        if (!id) {
          id = crypto.randomUUID();
          const ins = new mssql.Request(tx);
          ins.input('id', mssql.UniqueIdentifier, id);
          ins.input('u', mssql.NVarChar(100), username);
          await ins.query('INSERT INTO Users (id, username) VALUES (@id, @u)');
        }
        userIds[username] = id;
      }
      const userId = userIds[username];
      const typeId = typeIds[type];
      if (!typeId) throw new Error(`Type "${type}" is missing; run the schema migration first.`);

      const catKey = `${userId}|${typeId}|${category.toLowerCase()}`;
      if (!catIds[catKey]) {
        const find = new mssql.Request(tx);
        find.input('n', mssql.NVarChar(100), category);
        find.input('t', mssql.UniqueIdentifier, typeId);
        find.input('u', mssql.UniqueIdentifier, userId);
        let id = (await find.query('SELECT id FROM Categories WHERE name = @n AND type_id = @t AND user_id = @u')).recordset[0]?.id;
        if (!id) {
          id = crypto.randomUUID();
          const ins = new mssql.Request(tx);
          ins.input('id', mssql.UniqueIdentifier, id);
          ins.input('n', mssql.NVarChar(100), category);
          ins.input('t', mssql.UniqueIdentifier, typeId);
          ins.input('u', mssql.UniqueIdentifier, userId);
          await ins.query('INSERT INTO Categories (id, name, type_id, user_id) VALUES (@id, @n, @t, @u)');
        }
        catIds[catKey] = id;
      }
      const catId = catIds[catKey];

      const id = GUID_RE.test(String(item.uuid || '')) ? item.uuid : crypto.randomUUID();
      const ins = new mssql.Request(tx);
      ins.input('id', mssql.UniqueIdentifier, id);
      ins.input('month', mssql.VarChar(7), month);
      ins.input('cid', mssql.UniqueIdentifier, catId);
      ins.input('amount', mssql.Decimal(18, 2), amount);
      ins.input('tid', mssql.UniqueIdentifier, typeId);
      ins.input('notes', mssql.NVarChar(500), item.tags || null);
      ins.input('sheet', mssql.NVarChar(100), item.sheet || null);
      ins.input('userId', mssql.UniqueIdentifier, userId);
      const res = await ins.query(`
        IF NOT EXISTS (SELECT 1 FROM Expenses WHERE id = @id)
           AND NOT EXISTS (SELECT 1 FROM Expenses WHERE month = @month AND category_id = @cid AND user_id = @userId)
          INSERT INTO Expenses (id, month, category_id, amount, type_id, notes, sheet, user_id)
          VALUES (@id, @month, @cid, @amount, @tid, @notes, @sheet, @userId);
      `);
      if ((res.rowsAffected[0] || 0) > 0) inserted++; else skipped++;

      if ((inserted + skipped) % 200 === 0) console.log(`  processed ${inserted + skipped}/${data.length} ...`);
    }

    await tx.commit();
    console.log(`Seed complete: ${inserted} inserted, ${skipped} skipped (invalid or already present).`);
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function run() {
  try {
    const config = buildConfig();
    console.log('Connecting to SQL Server ...');
    const pool = await mssql.connect(config);
    await runSchema(pool);
    if (SEED) {
      await seedFromJson(pool);
    } else {
      console.log('Tip: pass --seed to import public/expense_data.json into the relational schema.');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mssql.close();
  }
}

run();