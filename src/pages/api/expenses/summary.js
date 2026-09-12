import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateMonthParam } from '../../../lib/validation';
import { finalizeSummary } from '../../../lib/privacyResponse';

/**
 * GET /api/expenses/summary?month=YYYY-MM
 * The "This month" checklist, shaped by the privacy mode.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;

  const { value: month, error } = validateMonthParam(req.query.month);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const summary = await dbProvider.getMonthSummary(dbConfig, month, ctx.user.user_id, ctx.privacy);
    res.status(200).json(await finalizeSummary(ctx, summary));
  } catch (err) {
    sendServerError(res, err, 'GET /api/expenses/summary');
  }
}
