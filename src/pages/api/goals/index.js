import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateGoal } from '../../../lib/validation';
import { finalizeRows } from '../../../lib/privacyResponse';

/**
 * GET  /api/goals   goals with progress and projections (privacy-shaped)
 * POST /api/goals   { name, category_id?, target_amount, target_month?, expected_annual_rate?, starting_amount? }
 */
export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    try {
      const goals = await dbProvider.getGoals(dbConfig, ctx.user.user_id, ctx.privacy);
      res.status(200).json(await finalizeRows(ctx, goals));
    } catch (err) {
      sendServerError(res, err, 'GET /api/goals');
    }
    return;
  }

  if (req.method === 'POST') {
    if (!assertWrite(ctx, res, 'config')) return;
    const { value, error } = validateGoal(req.body);
    if (error) { res.status(400).json({ error }); return; }
    try {
      const created = await dbProvider.createGoal(dbConfig, value, ctx.user.user_id);
      res.status(200).json(created);
    } catch (err) {
      sendServerError(res, err, 'POST /api/goals');
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
}
