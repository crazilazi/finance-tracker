/**
 * Applies the database schema and optionally seeds data.
 *
 *   node scripts/migrate-to-sql.js          # schema only (idempotent)
 *   node scripts/migrate-to-sql.js --seed   # schema + import expense_data.json
 *
 * Order of work:
 *   1. scripts/migrate.sql            base relational schema + legacy data migration
 *   2. scripts/migrations/*.sql       numbered feature migrations, each applied once
 *                                     (recorded in the SchemaMigrations table)
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

function splitBatches(script) {
  // The files use GO separators, which the driver does not understand.
  return script.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
}

async function runBatches(pool, script) {
  const batches = splitBatches(script);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  return batches.length;
}

async function runBaseSchema(pool) {
  const sqlPath = path.resolve(__dirname, 'migrate.sql');
  const count = await runBatches(pool, fs.readFileSync(sqlPath, 'utf8'));
  console.log(`Base schema: applied ${count} batches from scripts/migrate.sql`);
}

async function runFeatureMigrations(pool) {
  await pool.request().batch(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SchemaMigrations' AND xtype='U')
      CREATE TABLE SchemaMigrations (
        name NVARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT GETDATE()
      );
  `);

  const dir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(dir)) { console.log('No scripts/migrations directory; skipping feature migrations.'); return; }

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.sql')).sort();
  const applied = new Set((await pool.request().query('SELECT name FROM SchemaMigrations')).recordset.map(r => r.name));

  for (const file of files) {
    if (applied.has(file)) { console.log(`  ${file}: already applied`); continue; }
    const count = await runBatches(pool, fs.readFileSync(path.join(dir, file), 'utf8'));
    const rec = pool.request();
    rec.input('name', mssql.NVarChar(200), file);
    await rec.query('INSERT INTO SchemaMigrations (name) VALUES (@name)');
    console.log(`  ${file}: applied (${count} batches)`);
  }
  console.log('Feature migrations are up to date.');
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
    await runBaseSchema(pool);
    await runFeatureMigrations(pool);
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