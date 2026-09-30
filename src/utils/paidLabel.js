/**
 * Words for the paid state, by expense type. Stored as one column (paid_at);
 * only the wording differs.
 *
 *   Expense, EMI   Paid         / Pending
 *   Income         Received     / Expected
 *   Saving         Transferred  / Planned
 */
const LABELS = {
  Income: { done: 'Received', pending: 'Expected', verb: 'received' },
  Saving: { done: 'Transferred', pending: 'Planned', verb: 'transferred' },
};
const DEFAULT = { done: 'Paid', pending: 'Pending', verb: 'paid' };

export const labelsFor = (type) => LABELS[type] || DEFAULT;

export function paidLabel(type, paid) {
  const l = labelsFor(type);
  return paid ? l.done : l.pending;
}

/** "Mark paid", "Mark received", "Mark transferred" */
export function markLabel(type) {
  return `Mark ${labelsFor(type).verb}`;
}

/** Current month (YYYY-MM) in the browser's local time. */
export function localMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Default for a new entry, matching the server: past months paid, current and future pending. */
export function defaultPaidForMonth(month, now = localMonth()) {
  return typeof month === 'string' && month < now;
}

/** "3 Sep 2026" for a paid date, or '' */
export function formatPaidDate(paidAt) {
  if (!paidAt) return '';
  const d = new Date(paidAt);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
