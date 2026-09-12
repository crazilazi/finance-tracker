import { addMonths, diffMonths, currentMonth } from './loanMath';

/**
 * Detects categories that recur roughly once a year and predicts the next due month.
 * rows: [{ category, categoryId, month, amount }]
 * flagged: Set of categoryIds whose cadence is explicitly 'yearly'
 */
export function detectYearlyItems(rows, flagged = new Set(), asOf = currentMonth()) {
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, { category: r.category, categoryId: r.categoryId, months: new Map() });
    const e = byCat.get(r.categoryId);
    e.months.set(r.month, (e.months.get(r.month) || 0) + Number(r.amount || 0));
  }

  const out = [];
  for (const e of byCat.values()) {
    const months = [...e.months.keys()].sort();
    const last = months[months.length - 1];
    const lastAmount = e.months.get(last);
    const explicit = flagged.has(e.categoryId);

    let yearly = explicit;
    if (!yearly && months.length >= 2) {
      const gaps = [];
      for (let i = 1; i < months.length; i++) gaps.push(diffMonths(months[i - 1], months[i]));
      yearly = gaps.every(g => g >= 10 && g <= 14);
    }
    if (!yearly) continue;

    let nextMonth = addMonths(last, 12);
    while (diffMonths(asOf, nextMonth) < -1) nextMonth = addMonths(nextMonth, 12);
    out.push({
      category: e.category,
      categoryId: e.categoryId,
      lastMonth: last,
      lastAmount,
      nextMonth,
      monthsAway: diffMonths(asOf, nextMonth),
      occurrences: months.length,
      explicit,
    });
  }
  return out.sort((a, b) => a.monthsAway - b.monthsAway);
}

/** Next due date for a card given its due day-of-month. */
export function nextDueDate(dueDay, today = new Date()) {
  const d = Math.min(28, Math.max(1, Number(dueDay) || 1));
  const candidate = new Date(today.getFullYear(), today.getMonth(), d);
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return new Date(today.getFullYear(), today.getMonth() + 1, d);
  }
  return candidate;
}

export function daysUntil(date, today = new Date()) {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date - a) / 86400000);
}
