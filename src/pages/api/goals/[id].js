import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateGoal, isGuid } from '../../../lib/validation';

export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  const { id } = req.query;
  if (!isGuid(id)) { res.status(400).json({ error: 'Invalid goal id' }); return; }
  if (!assertWrite(ctx, res, 'config')) return;

  try {
    if (req.method === 'PUT') {
      const { value, error } = validateGoal(req.body, true);
      if (error) { res.status(400).json({ error }); return; }
      res.status(200).json(await dbProvider.updateGoal(dbConfig, id, value, ctx.user.user_id));
      return;
    }
    if (req.method === 'DELETE') {
      res.status(200).json(await dbProvider.deleteGoal(dbConfig, id, ctx.user.user_id));
      return;
    }
    methodNotAllowed(res, ['PUT', 'DELETE']);
  } catch (err) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return; }
    sendServerError(res, err, `${req.method} /api/goals/[id]`);
  }
}
