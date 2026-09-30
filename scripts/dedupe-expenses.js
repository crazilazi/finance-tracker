/**
 * Finds expense rows that share a user, month and category, which migration
 * 006 refuses to index, and resolves them with you one group at a time.
 *
 *   node scripts/dedupe-expenses.js           # list duplicates, change nothing
 *   node scripts/dedupe-expenses.js --fix     # choose per group: add together, keep one, or skip
 *
 * "Add together" keeps the first row, sets its amount to the sum and joins the
 * notes: right when the rows are separate spends (for example after merging
 * two categories). "Keep one" deletes the others: right when the same entry was
 * saved twice. Every change is recorded in Expenses_Audit by the existing trigger.
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

async function loadGroups(pool) {
  const res = await pool.request().query(`
    WITH dup AS (
      SELECT user_id, month, category_id FROM Expenses
      GROUP BY user_id, month, category_id HAVING COUNT(*) > 1
    )
    SELECT e.id, e.user_id, u.username, e.month, e.category_id, c.name AS category,
           e.amount, e.notes, e.sheet,
           (SELECT MIN(a.audit_timestamp) FROM Expenses_Audit a WHERE a.id = e.id AND a.audit_action = 'INSERT') AS created
    FROM Expenses e
    JOIN dup d ON d.user_id = e.user_id AND d.month = e.month AND d.category_id = e.category_id
    JOIN Categories c ON c.id = e.category_id
    JOIN Users u ON u.id = e.user_id
    ORDER BY u.username, e.month, c.name, created, e.id
  `);
  const groups = new Map();
  for (const r of res.recordset) {
    const key = `${r.user_id}|${r.month}|${r.category_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.values()];
}

function printGroup(rows, index, total) {
  const g = rows[0];
  console.log(`\n[${index + 1}/${total}] ${g.username} · ${g.month} · ${g.category}`);
  rows.forEach((r, i) => {
    const when = r.created ? new Date(r.created).toISOString().slice(0, 16).replace('T', ' ') : 'unknown';
    console.log(`  ${i + 1}) ${inr(r.amount).padEnd(14)} added ${when}${r.notes ? `  notes: ${String(r.notes).slice(0, 60)}` : ''}`);
  });
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  console.log(`     sum ${inr(sum)}`);
}

async function addTogether(pool, rows) {
  const [keep, ...drop] = rows;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const notes = [...new Set(rows.map(r => r.notes).filter(Boolean))].join(' | ').slice(0, 500) || null;
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    const up = new mssql.Request(tx);
    up.input('id', mssql.UniqueIdentifier, keep.id);
    up.input('amount', mssql.Decimal(18, 2), Math.round(total * 100) / 100);
    up.input('notes', mssql.NVarChar(500), notes);
    await up.query('UPDATE Expenses SET amount = @amount, notes = @notes WHERE id = @id');
    await deleteRows(tx, drop);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function keepOne(pool, rows, keepIndex) {
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    await deleteRows(tx, rows.filter((_, i) => i !== keepIndex));
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function deleteRows(tx, rows) {
  for (const r of rows) {
    const del = new mssql.Request(tx);
    del.input('id', mssql.UniqueIdentifier, r.id);
    await del.query('DELETE FROM Expenses WHERE id = @id');
  }
}

async function run() {
  if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL in .env.'); process.exitCode = 1; return; }
  const pool = await mssql.connect(process.env.DATABASE_URL);
  const rl = FIX ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const groups = await loadGroups(pool);
    if (groups.length === 0) {
      console.log('No duplicate rows. Migration 006 can be applied: node scripts/migrate-to-sql.js');
      return;
    }
    console.log(`${groups.length} month/category ${groups.length === 1 ? 'group has' : 'groups have'} more than one row.`);

    let resolved = 0;
    for (let i = 0; i < groups.length; i++) {
      const rows = groups[i];
      printGroup(rows, i, groups.length);
      if (!FIX) continue;

      const answer = (await rl.question(`  [a]dd together, keep [1-${rows.length}], or [s]kip? `)).trim().toLowerCase();
      if (answer === 'a') {
        await addTogether(pool, rows);
        console.log('  added together into one row');
        resolved++;
      } else if (/^\d+$/.test(answer) && Number(answer) >= 1 && Number(answer) <= rows.length) {
        await keepOne(pool, rows, Number(answer) - 1);
        console.log(`  kept row ${answer}, deleted ${rows.length - 1}`);
        resolved++;
      } else {
        console.log('  skipped');
      }
    }

    if (!FIX) console.log('\nNothing changed. Run with --fix to resolve these groups one by one.');
    else console.log(`\nResolved ${resolved} of ${groups.length}. ${resolved === groups.length ? 'Now run: node scripts/migrate-to-sql.js' : 'Run again to finish the rest.'}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    rl?.close();
    await pool.close();
  }
}

run();
