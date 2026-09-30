/**
 * Finds expense rows that were deleted in the app and later brought back by
 * the legacy import in scripts/migrate.sql, which re-ran on every migration
 * until it was guarded to run once.
 *
 *   node scripts/undo-legacy-reimport.js          # list them, change nothing
 *   node scripts/undo-legacy-reimport.js --fix    # decide per row: delete again, or keep
 *
 * A row is listed when its id comes from Expenses_Legacy and the audit log
 * shows it was deleted and then inserted again. An app Undo of a deletion also
 * restores the same id, so each row is shown with its dates and you choose.
 * Deletions are recorded in Expenses_Audit by the existing trigger.
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

const FIX = process.argv.includes('--fix');
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : 'unknown');

async function findRows(pool) {
  const hasLegacy = (await pool.request().query(
    "SELECT CASE WHEN OBJECT_ID('Expenses_Legacy', 'U') IS NULL THEN 0 ELSE 1 END AS has"
  )).recordset[0].has;
  if (!hasLegacy) return null;

  const res = await pool.request().query(`
    SELECT e.id, u.username, e.month, c.name AS category, t.name AS type, e.amount,
           d.deleted_at, i.back_at,
           (SELECT COUNT(*) FROM Expenses o
             WHERE o.user_id = e.user_id AND o.month = e.month AND o.category_id = e.category_id AND o.id <> e.id) AS others
    FROM Expenses e
    JOIN Users u ON u.id = e.user_id
    JOIN Categories c ON c.id = e.category_id
    JOIN Types t ON t.id = e.type_id
    CROSS APPLY (SELECT MAX(audit_timestamp) AS back_at FROM Expenses_Audit WHERE id = e.id AND audit_action = 'INSERT') i
    CROSS APPLY (SELECT MAX(audit_timestamp) AS deleted_at FROM Expenses_Audit WHERE id = e.id AND audit_action = 'DELETE') d
    WHERE d.deleted_at IS NOT NULL
      AND i.back_at > d.deleted_at
      AND EXISTS (SELECT 1 FROM Expenses_Legacy el WHERE TRY_CAST(el.uuid AS UNIQUEIDENTIFIER) = e.id)
    ORDER BY u.username, e.month, c.name
  `);
  return res.recordset;
}

async function run() {
  if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL in .env.'); process.exitCode = 1; return; }
  const pool = await mssql.connect(process.env.DATABASE_URL);
  const rl = FIX ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const rows = await findRows(pool);
    if (rows === null) { console.log('No Expenses_Legacy table, so nothing can have been re-imported.'); return; }
    if (rows.length === 0) { console.log('No deleted rows were brought back by the legacy import.'); return; }

    console.log(`${rows.length} row${rows.length === 1 ? ' was' : 's were'} deleted in the app and later inserted again with the same id:\n`);
    rows.forEach((r, i) => {
      console.log(`[${i + 1}/${rows.length}] ${r.username} · ${r.month} · ${r.category} (${r.type}) · ${inr(r.amount)}`);
      console.log(`      deleted ${when(r.deleted_at)}, back ${when(r.back_at)}`);
      if (r.others > 0) console.log(`      this month and category also has ${r.others} other row${r.others === 1 ? '' : 's'}, most likely the entry you replaced it with`);
    });

    if (!FIX) { console.log('\nNothing changed. Run with --fix to decide per row.'); return; }

    let deleted = 0;
    for (const r of rows) {
      const answer = (await rl.question(`\n${r.month} · ${r.category} · ${inr(r.amount)}: [d]elete again, or [k]eep? `)).trim().toLowerCase();
      if (answer !== 'd') { console.log('  kept'); continue; }
      const del = pool.request();
      del.input('id', mssql.UniqueIdentifier, r.id);
      const res = await del.query('DELETE FROM Expenses WHERE id = @id');
      if ((res.rowsAffected[0] || 0) === 1) { deleted++; console.log('  deleted'); }
      else console.log('  already gone');
    }
    console.log(`\nDeleted ${deleted} of ${rows.length}.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    rl?.close();
    await pool.close();
  }
}

run();
