/**
 * Creates (or re-keys) a least-privilege database user for the running app.
 *
 *   node scripts/create-app-db-user.js [--user tracker_app]
 *
 * The app only reads and writes rows; it never changes the schema. So it
 * should not connect as the server admin: a leaked connection string would
 * then allow dropping tables, reading other databases, or creating logins.
 * This script, run with the admin DATABASE_URL from .env:
 *
 *   1. creates a contained database user with a random 32-byte password
 *      (or, after confirmation, gives an existing one a new password),
 *   2. grants it db_datareader and db_datawriter only,
 *   3. signs in as that user and checks it can read and write but not alter,
 *   4. prints the connection string to put in the App Service DATABASE_URL.
 *
 * Keep the admin connection string in your local .env for migrations
 * (migrate-to-sql.js needs to change the schema). The password is shown once.
 */
import path from 'path';
import crypto from 'crypto';
import readline from 'readline/promises';
import mssql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const USER = arg('user', 'tracker_app');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

/** Password with letters, digits and symbols, safe inside a connection string (no ; = ' " { }). */
function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.~!@#%^*+';
  const bytes = crypto.randomBytes(40);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // Azure SQL complexity: upper, lower, digit and symbol
  return `Aa9!${out}`;
}

function connectionString(parsed, user, password) {
  const parts = [
    `Server=tcp:${parsed.server},${parsed.port || 1433}`,
    `Database=${parsed.database}`,
    `User Id=${user}`,
    `Password=${password}`,
    'Encrypt=true',
    'TrustServerCertificate=false',
    'Connection Timeout=30',
  ];
  return parts.join(';') + ';';
}

async function run() {
  if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(USER)) return fail('--user must be 3 to 64 letters, digits or underscores.');
  if (!process.env.DATABASE_URL) return fail('Set the admin DATABASE_URL in .env.');

  const parsed = mssql.ConnectionPool.parseConnectionString(process.env.DATABASE_URL);
  if (!parsed.database || parsed.database === 'master') return fail('DATABASE_URL must name the app database, not master.');

  const admin = await mssql.connect(process.env.DATABASE_URL);
  const password = generatePassword();
  try {
    const who = (await admin.request().query('SELECT SUSER_SNAME() AS login, DB_NAME() AS db')).recordset[0];
    console.log(`Connected to ${parsed.server} / ${who.db} as ${who.login}.`);
    if (who.login.toLowerCase() === USER.toLowerCase()) return fail(`You are already connected as ${USER}; use the admin connection string.`);

    const existsReq = admin.request();
    existsReq.input('name', mssql.NVarChar(128), USER);
    const exists = (await existsReq.query("SELECT 1 AS x FROM sys.database_principals WHERE name = @name AND type IN ('S', 'U', 'E')")).recordset.length > 0;

    if (exists) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`User ${USER} already exists. Give it a new password? The app stops working until DATABASE_URL is updated. Type "rotate": `);
      rl.close();
      if (answer.trim() !== 'rotate') return fail('Aborted; nothing changed.');
    }

    const quoted = `[${USER}]`;
    const pwLiteral = `N'${password.replace(/'/g, "''")}'`;
    await admin.request().batch(exists
      ? `ALTER USER ${quoted} WITH PASSWORD = ${pwLiteral};`
      : `CREATE USER ${quoted} WITH PASSWORD = ${pwLiteral};`);
    await admin.request().batch(`
      ALTER ROLE db_datareader ADD MEMBER ${quoted};
      ALTER ROLE db_datawriter ADD MEMBER ${quoted};
    `);
    console.log(`${exists ? 'Re-keyed' : 'Created'} ${USER} with db_datareader and db_datawriter.`);

    // Prove the new login works and is limited
    const appConn = connectionString(parsed, USER, password);
    const app = await new mssql.ConnectionPool(appConn).connect();
    try {
      const check = (await app.request().query(`
        SELECT (SELECT COUNT(*) FROM Expenses) AS expenses,
               HAS_PERMS_BY_NAME('Expenses', 'OBJECT', 'UPDATE') AS can_write,
               HAS_PERMS_BY_NAME('Expenses', 'OBJECT', 'ALTER') AS can_alter,
               HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
               IS_ROLEMEMBER('db_owner') AS is_owner
      `)).recordset[0];
      const ok = check.can_write === 1 && check.can_alter === 0 && check.can_create_table === 0 && check.is_owner === 0;
      console.log(`Signed in as ${USER}: reads ${check.expenses} expenses, can write: ${check.can_write === 1}, can alter tables: ${check.can_alter === 1}, can create tables: ${check.can_create_table === 1}.`);
      if (!ok) return fail('The new user has more rights than expected. Check its role memberships before using it.');
    } finally {
      await app.close();
    }

    console.log('\nSet this as DATABASE_URL in the App Service settings (shown once, keep it secret):\n');
    console.log(appConn);
    console.log('\nKeep the admin connection string in your local .env for migrations.');
  } catch (err) {
    fail(err.message);
  } finally {
    await admin.close();
  }
}

run();
