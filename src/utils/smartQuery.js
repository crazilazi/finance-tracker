/**
 * Smart filter syntax shared by the client (help text) and the server (SQL).
 *
 *   >5000  <=200  =1500      amount comparisons (k / l suffix: 5k = 5000, 1.5l = 150000)
 *   1000-5000                amount range
 *   type:emi                 expense type (Expense | Income | EMI | Saving)
 *   cat:rent  category:rent  category name contains
 *   notes:swiggy             notes contain
 *   sheet:july               sheet name contains
 *   anything else            free text matched against category, type, notes and sheet
 */

export const SMART_QUERY_EXAMPLES = [
  { code: 'rent', text: 'matches category, notes or sheet' },
  { code: '>5000', text: 'amount above 5,000 (also >=, <, <=, =)' },
  { code: '1000-5000', text: 'amount between 1,000 and 5,000' },
  { code: '2k-1.5l', text: 'k = thousand, l = lakh' },
  { code: 'type:emi', text: 'only EMI rows (expense, income, emi, saving)' },
  { code: 'cat:loan', text: 'category contains "loan"' },
  { code: 'notes:swiggy', text: 'notes contain "swiggy"' },
  { code: 'sheet:july', text: 'sheet name contains "july"' },
];

function scale(numStr, suffix) {
  const n = parseFloat(numStr);
  if (!Number.isFinite(n)) return null;
  if (suffix === 'k') return n * 1000;
  if (suffix === 'l') return n * 100000;
  return n;
}

export function parseSmartQuery(text) {
  const out = {
    amountMin: null,
    amountMax: null,
    amountEq: null,
    type: null,
    category: null,
    notes: null,
    sheet: null,
    text: '',
  };
  if (!text) return out;

  const clean = String(text)
    .toLowerCase()
    .replace(/(>=|<=|>|<|=)\s+/g, '$1')
    .trim();
  if (!clean) return out;

  const free = [];
  for (const token of clean.split(/\s+/)) {
    let m;
    if ((m = token.match(/^(>=|<=|>|<|=)(\d+(?:\.\d+)?)(k|l)?$/))) {
      const v = scale(m[2], m[3]);
      if (v === null) continue;
      if (m[1] === '>') out.amountMin = Math.max(out.amountMin ?? -Infinity, v + 0.01);
      else if (m[1] === '>=') out.amountMin = Math.max(out.amountMin ?? -Infinity, v);
      else if (m[1] === '<') out.amountMax = Math.min(out.amountMax ?? Infinity, v - 0.01);
      else if (m[1] === '<=') out.amountMax = Math.min(out.amountMax ?? Infinity, v);
      else out.amountEq = v;
      continue;
    }
    if ((m = token.match(/^(\d+(?:\.\d+)?)(k|l)?-(\d+(?:\.\d+)?)(k|l)?$/))) {
      const lo = scale(m[1], m[2]);
      const hi = scale(m[3], m[4]);
      if (lo !== null && hi !== null) {
        out.amountMin = Math.max(out.amountMin ?? -Infinity, Math.min(lo, hi));
        out.amountMax = Math.min(out.amountMax ?? Infinity, Math.max(lo, hi));
      }
      continue;
    }
    if (token.startsWith('type:')) { out.type = token.slice(5); continue; }
    if (token.startsWith('category:')) { out.category = token.slice(9); continue; }
    if (token.startsWith('cat:')) { out.category = token.slice(4); continue; }
    if (token.startsWith('notes:')) { out.notes = token.slice(6); continue; }
    if (token.startsWith('note:')) { out.notes = token.slice(5); continue; }
    if (token.startsWith('sheet:')) { out.sheet = token.slice(6); continue; }
    free.push(token);
  }

  if (out.amountMin === -Infinity) out.amountMin = null;
  if (out.amountMax === Infinity) out.amountMax = null;
  out.text = free.join(' ').trim();
  return out;
}

export function isEmptySmartQuery(parsed) {
  return !parsed || (
    parsed.amountMin === null && parsed.amountMax === null && parsed.amountEq === null &&
    !parsed.type && !parsed.category && !parsed.notes && !parsed.sheet && !parsed.text
  );
}
