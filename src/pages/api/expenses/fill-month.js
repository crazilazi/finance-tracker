import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateFillMonth } from '../../../lib/validation';

/**
 * POST /api/expenses/fill-month  { month, items: [{ category, amount, type? }] }
 * Records the given usual categories for a month in one transaction.
 * Existing rows for the same (month, category) are overwritten, so it is safe to repeat.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  const { value, error } = validateFillMonth(req.body);
  if (error) { res.status(400).json({ error }); return; }

  if (value.items.length === 0) {
    res.status(200).json({ success: true, updated: 0, merged: 0, month: value.month });
    return;
  }

  try {
    const result = await dbProvider.bulkSyncExpenses(dbConfig, value.items, user.user_id);
    res.status(200).json({ ...result, month: value.month });
  } catch (err) {
    sendServerError(res, err, 'POST /api/expenses/fill-month');
  }
}
