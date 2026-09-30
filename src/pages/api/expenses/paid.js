import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validatePaidItems } from '../../../lib/validation';

/**
 * POST /api/expenses/paid  { items: [{ uuid, paid, paidAt? }] }
 * Marks rows paid or pending: single toggles, "mark all paid", the statement
 * reconciler and undo all use this. Paid state reveals no amount, so it is
 * allowed while amounts are hidden; demo mode refuses it with 423.
 * Returns { updated, changes: [{ uuid, previous, current }] }.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;
  if (!assertWrite(ctx, res, 'status')) return;

  const { value, error } = validatePaidItems(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const result = await dbProvider.setExpensesPaid(dbConfig, value, ctx.user.user_id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    sendServerError(res, err, 'POST /api/expenses/paid');
  }
}
