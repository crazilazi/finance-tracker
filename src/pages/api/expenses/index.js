import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateExpense, validateListParams } from '../../../lib/validation';
import { finalizeRows } from '../../../lib/privacyResponse';

export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    // Paginated fetch with server-side filtering and sorting, shaped by the privacy mode
    const { value: params, error } = validateListParams(req.query);
    if (error) { res.status(400).json({ error }); return; }

    try {
      const result = await dbProvider.getExpensesPaginated(dbConfig, params, ctx.user.user_id, ctx.privacy);
      res.status(200).json(await finalizeRows(ctx, result)); // { data: [...], total: N, mode }
    } catch (err) {
      sendServerError(res, err, 'GET /api/expenses');
    }
    return;
  }

  if (req.method === 'POST') {
    if (!assertWrite(ctx, res, 'create')) return;
    const { value, error } = validateExpense(req.body);
    if (error) { res.status(400).json({ error }); return; }

    try {
      // While locked the user may add entries they typed themselves, but must
      // never change an existing row: collisions on (month, category) are refused.
      const insertOnly = ctx.privacy.mode !== 'real';
      const result = await dbProvider.createExpense(dbConfig, value, ctx.user.user_id, { insertOnly });
      res.status(200).json(result);
    } catch (err) {
      if (err.status) { res.status(err.status).json({ error: err.message, locked: ctx.privacy.mode !== 'real' }); return; }
      sendServerError(res, err, 'POST /api/expenses');
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
}
