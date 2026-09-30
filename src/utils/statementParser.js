import * as XLSX from 'xlsx';
import { guessType } from './nlpParser';

// ---- Dates ------------------------------------------------------------------

const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n) => String(n).padStart(2, '0');
const toYm = (y, m) => (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${pad2(m)}` : null);
const fullYear = (y) => (y < 100 ? 2000 + y : y);
const monthByName = (word) => MONTH_NAMES[String(word).slice(0, 3).toLowerCase()] || null;

/** Current month in the browser's local time (toISOString would use UTC). */
export function localMonth(d = new Date()) {
  return toYm(d.getFullYear(), d.getMonth() + 1);
}

/**
 * YYYY-MM from a statement date or month cell, or null when it is not a date.
 *
 * Numeric dates are read day-first (05/09/2026 is 5 September), as Indian banks
 * print them; month-first is used only when the second number cannot be a
 * month (09/15/2026). Date objects from Excel are read in local time (never
 * via toISOString, which would move IST midnight on the 1st into the previous
 * month). A time in the last minute before midnight is rounded up, because
 * converted Excel dates can land a few seconds early.
 */
export function monthFromCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const nearlyMidnight = value.getHours() === 23 && value.getMinutes() === 59;
    return localMonth(nearlyMidnight ? new Date(value.getTime() + 60 * 1000) : value);
  }
  if (typeof value === 'number') {
    // Excel serial day number (1900 date system), for cells not typed as dates
    if (value < 20000 || value > 80000) return null;
    const d = new Date(Math.round((value - 25569) * 86400000));
    return toYm(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  const s = String(value).trim();
  let m;
  // 2026-09, 2026-09-05, 2026/9/5, 2026-09-05T10:00
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[\sT].*)?$/))) return toYm(+m[1], +m[2]);
  // 05/09/2026, 5-9-26, 05.09.2026 10:30
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[\sT,].*)?$/))) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    return b > 12 ? toYm(y, a) : toYm(y, b);
  }
  // 09/2026
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return toYm(+m[2], +m[1]);
  // 05 Sep 2026, 05-Sep-26, 5 September 2026
  if ((m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})\.?[\s\-/.,]+(\d{2}|\d{4})\b/))) {
    const mo = monthByName(m[2]);
    return mo ? toYm(fullYear(+m[3]), mo) : null;
  }
  // Sep 05, 2026 / September 2026 / Sep-26
  if ((m = s.match(/^([A-Za-z]{3,9})\.?[\s\-/.]+(?:\d{1,2}(?:st|nd|rd|th)?[\s,]+)?(\d{2}|\d{4})\b/))) {
    const mo = monthByName(m[1]);
    return mo ? toYm(fullYear(+m[2]), mo) : null;
  }
  return null;
}

// ---- Parsing ----------------------------------------------------------------

/**
 * Reads a statement workbook into transaction rows:
 *   { id, month, category, amount, type, typeSource, description, rawDate }
 * month is null when the file has no date or month column.
 * When the file has a date column, rows without a readable date are footer or
 * summary lines (totals, balances) and are skipped; `skipped` counts them.
 */
export function parseStatementRows(fileBuffer, knownCategories = []) {
  // raw: true keeps CSV cells as typed text, so "05/09/2026" is not reinterpreted
  // month-first by the CSV reader. Real Excel date cells still arrive as Dates.
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true, raw: true });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

  if (!jsonData || jsonData.length < 2) {
    throw new Error('Statement file appears empty or invalid.');
  }

  // Find header row (row containing words like date, description, narration, amount, debit, credit)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
    if (!jsonData[i]) continue;
    const rowStr = jsonData[i].join(' ').toLowerCase();
    if (rowStr.includes('date') || rowStr.includes('month') || rowStr.includes('narration') || rowStr.includes('description') || rowStr.includes('amount') || rowStr.includes('debit') || rowStr.includes('credit')) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0; // fallback

  const headers = jsonData[headerRowIdx].map(h => String(h || '').trim().toLowerCase());
  
  // Detect column indices
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('txn date') || h.includes('value date'));
  const descIdx = headers.findIndex(h => h.includes('narration') || h.includes('description') || h.includes('particulars') || h.includes('details') || h.includes('remarks'));
  const amountIdx = headers.findIndex(h => h === 'amount' || h.includes('amt') || h.includes('transaction amount'));
  const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal') || h.includes('dr'));
  const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit') || h.includes('cr'));
  const typeIdx = headers.findIndex(h => h === 'type' || h.includes('cr/dr'));
  const monthIdx = headers.findIndex(h => h === 'month');
  const catIdx = headers.findIndex(h => h === 'category');

  const parsedRows = [];
  let skipped = 0;

  for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    // Extract raw fields
    const rawDate = dateIdx !== -1 ? row[dateIdx] : null;
    const rawDesc = descIdx !== -1 ? row[descIdx] : row.join(' ');
    let rawAmount = amountIdx !== -1 ? row[amountIdx] : null;
    const rawDebit = debitIdx !== -1 ? row[debitIdx] : null;
    const rawCredit = creditIdx !== -1 ? row[creditIdx] : null;
    const rawMonth = monthIdx !== -1 ? row[monthIdx] : null;
    const rawExplicitCategory = catIdx !== -1 ? row[catIdx] : null;
    const rawExplicitType = typeIdx !== -1 ? row[typeIdx] : null;

    if (!rawDate && !rawMonth && !rawAmount && !rawDebit && !rawCredit) continue;

    // Process Date -> YYYY-MM
    const month = monthFromCell(rawMonth) || monthFromCell(rawDate);
    if (!month && (dateIdx !== -1 || monthIdx !== -1)) { skipped++; continue; }

    // Process Amount & Type
    let amount = 0;
    let type = 'Expense';
    let typeSource = 'guess';

    const numDebit = rawDebit ? parseFloat(String(rawDebit).replace(/[^\d.-]/g, '')) : 0;
    const numCredit = rawCredit ? parseFloat(String(rawCredit).replace(/[^\d.-]/g, '')) : 0;

    if (numDebit > 0) {
      amount = numDebit;
    } else if (numCredit > 0) {
      amount = numCredit;
    } else if (rawAmount) {
      amount = Math.abs(parseFloat(String(rawAmount).replace(/[^\d.-]/g, '')) || 0);
    }

    if (rawExplicitType) {
      typeSource = 'explicit';
      const et = String(rawExplicitType).toLowerCase();
      if (et.includes('expense')) type = 'Expense';
      else if (et.includes('income')) type = 'Income';
      else if (et.includes('saving')) type = 'Saving';
      else if (et.includes('emi')) type = 'EMI';
    } else {
      if (numDebit > 0) {
        type = 'Expense';
      } else if (numCredit > 0) {
        type = 'Income';
        typeSource = 'credit';
      } else if (rawAmount) {
        if (String(rawAmount).includes('-') || (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('dr'))) {
          type = 'Expense';
        } else if (typeIdx !== -1 && String(row[typeIdx]).toLowerCase().includes('cr')) {
          type = 'Income';
        }
      }
    }

    if (!amount || amount === 0) continue;

    // Smart Category Normalization using fuzzy match
    const cleanDesc = String(rawDesc || '').trim();
    let category = 'Uncategorized';
    let highestConfidence = 0;

    const lowerDesc = cleanDesc.toLowerCase();
    
    if (rawExplicitCategory) {
      category = String(rawExplicitCategory).trim();
      highestConfidence = 100;
    } else if (knownCategories && knownCategories.length > 0) {
      for (const known of knownCategories) {
        const knownLower = known.toLowerCase();
        
        // Exact match
        if (lowerDesc === knownLower) {
          category = known;
          highestConfidence = 100;
          break;
        }

        // Substring match
        if (lowerDesc.includes(knownLower)) {
          // longer match is better
          const score = (knownLower.length / lowerDesc.length) * 100;
          if (score > highestConfidence) {
            highestConfidence = score;
            category = known;
          }
        }
      }
    }

    if (highestConfidence === 0) {
      category = cleanDesc.split(/\s+/).slice(0, 3).join(' ') || 'General Expense';
    }

    if (type !== 'Income' && type !== 'Saving' && type !== 'EMI' && !rawExplicitType) {
      type = guessType(category);
    }

    parsedRows.push({
      id: i,
      month,
      category,
      amount: Math.round(amount * 100) / 100,
      type,
      typeSource,
      description: cleanDesc,
      rawDate: rawDate instanceof Date ? rawDate.toLocaleDateString('en-IN') : String(rawDate || '')
    });
  }

  return { rows: parsedRows, skipped };
}

// ---- Grouping ---------------------------------------------------------------

/**
 * The ledger keeps one entry per month and category, so a statement's
 * transactions are added up per (month, category, type) before they are
 * compared or saved. Otherwise five Swiggy debits in September would each
 * overwrite the previous one and only the last amount would survive.
 */
export function groupStatementRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.month || ''}|${String(r.category).trim().toLowerCase()}|${r.type}`;
    let g = groups.get(key);
    if (!g) {
      g = { id: key, month: r.month, category: String(r.category).trim(), type: r.type, typeSource: r.typeSource, amount: 0, count: 0, descriptions: [] };
      groups.set(key, g);
    }
    g.amount = Math.round((g.amount + r.amount) * 100) / 100;
    g.count++;
    if (r.description && !g.descriptions.includes(r.description)) g.descriptions.push(r.description);
    // A type read from the file (type column or credit) wins over a guess
    if (g.typeSource === 'guess' && r.typeSource !== 'guess') g.typeSource = r.typeSource;
  }
  return [...groups.values()]
    .map(({ descriptions, ...g }) => ({ ...g, description: descriptions.join(' | ').slice(0, 500) }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)) || a.category.localeCompare(b.category));
}

/** Distinct years in the grouped rows, for loading the matching ledger entries. */
export function statementYears(groups) {
  return [...new Set(groups.map(g => g.month && g.month.slice(0, 4)).filter(Boolean))].sort();
}

/** Reads, groups and reconciles in one step (kept for callers that have the ledger rows already). */
export function parseStatementFile(fileBuffer, knownCategories = [], existingData = []) {
  const { rows } = parseStatementRows(fileBuffer, knownCategories);
  return reconcileWithDatabase(groupStatementRows(rows), existingData);
}

// ---- Reconciliation -----------------------------------------------------------

const catKey = (name) => String(name || '').trim().toLowerCase();

/** Lookup structures over the ledger rows loaded for the statement's years. */
export function indexLedger(existingData = []) {
  const byMonthCategory = new Map();
  const typeByCategory = new Map();
  for (const d of existingData) {
    const k = `${d.month}|${catKey(d.category)}`;
    if (!byMonthCategory.has(k)) byMonthCategory.set(k, []);
    byMonthCategory.get(k).push(d);
    if (!typeByCategory.has(catKey(d.category))) typeByCategory.set(catKey(d.category), d.type);
  }
  return { byMonthCategory, typeByCategory };
}

/**
 * A guessed type follows the type the category already has in the ledger, so
 * saving updates that category instead of creating a same-named one of another
 * type. Types read from the file (a type column, or a credit) are kept.
 */
export function adoptLedgerType(item, index) {
  if (item.typeSource !== 'guess') return item;
  const known = index.typeByCategory.get(catKey(item.category));
  return known && known !== item.type ? { ...item, type: known } : item;
}

/** { status: 'new' | 'mismatch' | 'synced', existingItem } for one grouped row. */
export function classifyStatementRow(item, index) {
  if (!item.month) return { status: 'new', existingItem: null };
  const candidates = (index.byMonthCategory.get(`${item.month}|${catKey(item.category)}`) || [])
    .filter(d => d.type === item.type);
  const existingItem = candidates[0] || null;
  if (!existingItem) return { status: 'new', existingItem: null };
  const same = Math.abs(Number(existingItem.amount) - Number(item.amount)) < 1;
  return { status: same ? 'synced' : 'mismatch', existingItem };
}

export function reconcileWithDatabase(groups, existingData = []) {
  const index = indexLedger(existingData);
  return groups.map(g => {
    const item = adoptLedgerType(g, index);
    const { status, existingItem } = classifyStatementRow(item, index);
    return { ...item, status, checked: status !== 'synced', existingItem };
  });
}

/**
 * Sync payload from the ticked rows: rows that now share a month, category and
 * type (after inline edits) are added together, and no uuid is sent, so the
 * server upserts each (month, category) exactly once.
 */
export function buildSyncPayload(items) {
  const byKey = new Map();
  for (const it of items) {
    const key = `${it.month}|${catKey(it.category)}|${it.type}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.amount = Math.round((prev.amount + Number(it.amount)) * 100) / 100;
      if (it.description) prev.tags = [prev.tags, it.description].filter(Boolean).join(' | ').slice(0, 500);
    } else {
      byKey.set(key, {
        month: it.month,
        category: String(it.category).trim(),
        amount: Math.round(Number(it.amount) * 100) / 100,
        type: it.type,
        tags: it.description ? String(it.description).slice(0, 500) : undefined,
      });
    }
  }
  return [...byKey.values()];
}

/** First problem that would make the server reject the sync, or null. */
export function syncProblem(items) {
  for (const it of items) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(it.month || ''))) return `Set a month (YYYY-MM) for ${it.category || 'every row'}.`;
    if (!String(it.category || '').trim()) return 'Every row needs a category.';
    const n = Number(it.amount);
    if (it.amount === null || it.amount === '' || !Number.isFinite(n) || n < 0) return `Enter an amount for ${it.category}.`;
  }
  return null;
}
