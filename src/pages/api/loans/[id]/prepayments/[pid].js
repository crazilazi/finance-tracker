import * as dbProvider from '../../../../../lib/db/dbProvider';
import { dbConfig } from '../../../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../../../lib/apiUtils';
import { isGuid } from '../../../../../lib/validation';

/** DELETE /api/loans/:id/prepayments/:pid */
export default async function handler(req, res) {
  if (req.method !== 'DELETE') { methodNotAllowed(res, ['DELETE']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;

  const { id, pid } = req.query;
  if (!isGuid(id) || !isGuid(pid)) { res.status(400).json({ error: 'Invalid id' }); return; }
  if (!assertWrite(ctx, res, 'config')) return;

  try {
    res.status(200).json(await dbProvider.deletePrepayment(dbConfig, id, pid, ctx.user.user_id));
  } catch (err) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return; }
    sendServerError(res, err, 'DELETE /api/loans/[id]/prepayments/[pid]');
  }
}
