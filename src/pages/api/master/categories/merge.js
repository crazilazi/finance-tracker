import * as dbProvider from '../../../../lib/db/dbProvider';
import { dbConfig } from '../../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../../lib/apiUtils';
import { validateMerge } from '../../../../lib/validation';

/**
 * POST /api/master/categories/merge  { sourceIds: [guid], targetId: guid }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;
  if (!assertWrite(ctx, res, 'config')) return;

  const { value, error } = validateMerge(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const result = await dbProvider.mergeCategories(dbConfig, value.sourceIds, value.targetId, ctx.user.user_id);
    res.status(200).json(result);
  } catch (err) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return; }
    sendServerError(res, err, 'POST /api/master/categories/merge');
  }
}
