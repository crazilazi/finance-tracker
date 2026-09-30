/**
 * Links a pre-OAuth user row (created by the legacy migration or a --seed
 * import) to a GitHub account, so that GitHub sign-in opens that data.
 *
 *   node scripts/link-legacy-user.js --user-id <guid> --github-id <number> [--github-login <name>] [--yes]
 *
 * Sign-in no longer links such rows automatically by username, because a
 * matching username proves nothing about who owns the data.
 *
 * Find candidates with:
 *   SELECT id, username, created_at FROM Users WHERE oauth_provider IS NULL;
 * Find your numeric GitHub id at https://api.github.com/users/<login> ("id").
 *
 * If that GitHub account already signed in and got a new, empty user row, the
 * script removes the empty row and links the legacy one instead. It refuses
 * when the existing row has any expenses, categories, goals or loans.
 *
 * Connection comes from DATABASE_URL in .env, as for migrate-to-sql.js.
 */
import path from 'path';
import readline from 'readline/promises';
import mssql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function ownedRowCounts(tx, userId) {
  const r = new mssql.Request(tx);
  r.input('id', mssql.UniqueIdentifier, userId);
  const res = await r.query(`
    SELECT
      (SELECT COUNT(*) FROM Expenses WHERE user_id = @id)     AS expenses,
      (SELECT COUNT(*) FROM Categories WHERE user_id = @id)   AS categories,
      (SELECT COUNT(*) FROM SavingsGoals WHERE user_id = @id) AS goals,
      (SELECT COUNT(*) FROM Loans WHERE user_id = @id)        AS loans
  `);
  return res.recordset[0];
}

async function run() {
  const userId = arg('user-id');
  const githubId = arg('github-id');
  const githubLogin = arg('github-login');
  const assumeYes = process.argv.includes('--yes');

  if (!GUID_RE.test(String(userId || ''))) return fail('--user-id must be the GUID of the legacy Users row.');
  if (!/^\d+$/.test(String(githubId || ''))) return fail('--github-id must be the numeric GitHub user id.');
  if (githubLogin !== undefined && !/^[A-Za-z0-9-]{1,39}$/.test(githubLogin)) return fail('--github-login is not a valid GitHub login.');
  if (!process.env.DATABASE_URL) return fail('Set DATABASE_URL in .env.');

  const pool = await mssql.connect(process.env.DATABASE_URL);
  const tx = new mssql.Transaction(pool);
  try {
    await tx.begin();

    const legacyReq = new mssql.Request(tx);
    legacyReq.input('id', mssql.UniqueIdentifier, userId);
    const legacy = (await legacyReq.query('SELECT id, username, oauth_provider, oauth_id FROM Users WITH (UPDLOCK) WHERE id = @id')).recordset[0];
    if (!legacy) throw new Error(`No user with id ${userId}.`);
    if (legacy.oauth_provider) throw new Error(`User ${userId} is already linked to ${legacy.oauth_provider}:${legacy.oauth_id}.`);

    const existingReq = new mssql.Request(tx);
    existingReq.input('gid', mssql.VarChar(100), githubId);
    const existing = (await existingReq.query(`SELECT id, username FROM Users WITH (UPDLOCK) WHERE oauth_provider = 'github' AND oauth_id = @gid`)).recordset[0];

    const legacyCounts = await ownedRowCounts(tx, legacy.id);
    console.log(`Legacy user: ${legacy.username} (${legacy.id})`);
    console.log(`  owns ${legacyCounts.expenses} expenses, ${legacyCounts.categories} categories, ${legacyCounts.goals} goals, ${legacyCounts.loans} loans`);

    if (existing) {
      const counts = await ownedRowCounts(tx, existing.id);
      const owned = counts.expenses + counts.categories + counts.goals + counts.loans;
      console.log(`GitHub id ${githubId} is already signed up as ${existing.username} (${existing.id}), owning ${owned} rows.`);
      if (owned > 0) throw new Error('That account already has data. Refusing to replace it; merge the data by hand.');
      console.log('  That row is empty and will be deleted, with its settings and unlock records.');
    }

    if (!assumeYes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Link GitHub id ${githubId} to ${legacy.username}? Type "link" to confirm: `);
      rl.close();
      if (answer.trim() !== 'link') throw new Error('Aborted; nothing changed.');
    }

    if (existing) {
      const del = new mssql.Request(tx);
      del.input('id', mssql.UniqueIdentifier, existing.id);
      await del.query(`
        IF OBJECT_ID('UnlockAttempts') IS NOT NULL DELETE FROM UnlockAttempts WHERE user_id = @id;
        IF OBJECT_ID('RevokedUnlockGrants') IS NOT NULL DELETE FROM RevokedUnlockGrants WHERE user_id = @id;
        DELETE FROM UserSettings WHERE user_id = @id;
        DELETE FROM Users WHERE id = @id;
      `);
    }

    const link = new mssql.Request(tx);
    link.input('id', mssql.UniqueIdentifier, legacy.id);
    link.input('gid', mssql.VarChar(100), githubId);
    link.input('login', mssql.NVarChar(100), githubLogin || null);
    const res = await link.query(`
      UPDATE Users
      SET oauth_provider = 'github', oauth_id = @gid, username = COALESCE(@login, username)
      WHERE id = @id AND oauth_provider IS NULL AND oauth_id IS NULL
    `);
    if ((res.rowsAffected[0] || 0) !== 1) throw new Error('The legacy row changed while linking; nothing was changed.');

    await tx.commit();
    console.log(`Linked. Signing in with GitHub id ${githubId} now opens ${legacy.username}'s data.`);
  } catch (err) {
    try { await tx.rollback(); } catch { /* not started or already rolled back */ }
    fail(err.message);
  } finally {
    await pool.close();
  }
}

run();
