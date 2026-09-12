import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateMonthParam } from '../../../lib/validation';

/**
 * GET /api/expenses/summary?month=YYYY-MM
 * The "This month" checklist: which usual categories are recorded, which are
 * missing, and a suggested amount for each missing one.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  const { value: month, error } = validateMonthParam(req.query.month);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const summary = await dbProvider.getMonthSummary(dbConfig, month, user.user_id);
    res.status(200).json(summary);
  } catch (err) {
    sendServerError(res, err, 'GET /api/expenses/summary');
  }
}
