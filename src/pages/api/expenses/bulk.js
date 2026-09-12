import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateExpenseList } from '../../../lib/validation';

export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }
  // Bulk sync can overwrite existing rows, so it needs an unlocked session
  if (!assertWrite(ctx, res, 'edit')) return;

  const { value, error } = validateExpenseList(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const result = await dbProvider.bulkSyncExpenses(dbConfig, value, ctx.user.user_id);
    res.status(200).json(result);
  } catch (err) {
    sendServerError(res, err, 'POST /api/expenses/bulk');
  }
}
