import { addMonths, diffMonths, currentMonth } from './loanMath';

/**
 * Savings goal projections. Contributions are monthly, returns compound monthly.
 */

/** Month in which `saved` grows to `target` at `monthlyContribution` per month and `annualRate` %. */
export function projectedCompletion({ saved, target, monthlyContribution, annualRate = 0, fromMonth = currentMonth(), maxMonths = 600 }) {
  let balance = Number(saved) || 0;
  const goal = Number(target) || 0;
  const c = Number(monthlyContribution) || 0;
  const r = (Number(annualRate) || 0) / 1200;
  if (balance >= goal) return { month: fromMonth, months: 0 };
  if (c <= 0 && r <= 0) return { month: null, months: null };
  for (let i = 1; i <= maxMonths; i++) {
    balance = balance * (1 + r) + c;
    if (balance >= goal) return { month: addMonths(fromMonth, i), months: i };
  }
  return { month: null, months: null };
}

/** Monthly amount needed to reach `target` by `targetMonth`. */
export function monthlyNeeded({ saved, target, annualRate = 0, fromMonth = currentMonth(), targetMonth }) {
  if (!targetMonth) return null;
  const n = diffMonths(fromMonth, targetMonth);
  const gap = (Number(target) || 0) - (Number(saved) || 0);
  if (gap <= 0) return 0;
  if (n <= 0) return null;
  const r = (Number(annualRate) || 0) / 1200;
  if (r === 0) return gap / n;
  const growth = Math.pow(1 + r, n);
  const futureSaved = (Number(saved) || 0) * growth;
  const need = (Number(target) || 0) - futureSaved;
  if (need <= 0) return 0;
  return need * r / (growth - 1);
}
