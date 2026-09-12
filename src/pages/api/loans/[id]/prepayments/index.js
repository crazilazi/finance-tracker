import * as dbProvider from '../../../../../lib/db/dbProvider';
import { dbConfig } from '../../../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../../../lib/apiUtils';
import { validatePrepayment, isGuid } from '../../../../../lib/validation';

/** POST /api/loans/:id/prepayments  { month, amount, mode: 'tenure' | 'emi' } */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;

  const { id } = req.query;
  if (!isGuid(id)) { res.status(400).json({ error: 'Invalid loan id' }); return; }
  if (!assertWrite(ctx, res, 'config')) return;

  const { value, error } = validatePrepayment(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    res.status(200).json(await dbProvider.addPrepayment(dbConfig, id, value, ctx.user.user_id));
  } catch (err) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return; }
    sendServerError(res, err, 'POST /api/loans/[id]/prepayments');
  }
}
