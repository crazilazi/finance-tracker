import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateLoan } from '../../../lib/validation';
import { finalizeRows } from '../../../lib/privacyResponse';

/**
 * GET  /api/loans   loans with amortisation snapshot and schedule (privacy-shaped)
 * POST /api/loans   { name, category_id?, principal, annual_rate, tenure_months, start_month, emi_amount? }
 */
export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    try {
      const loans = await dbProvider.getLoans(dbConfig, ctx.user.user_id, ctx.privacy);
      res.status(200).json(await finalizeRows(ctx, loans));
    } catch (err) {
      sendServerError(res, err, 'GET /api/loans');
    }
    return;
  }

  if (req.method === 'POST') {
    if (!assertWrite(ctx, res, 'config')) return;
    const { value, error } = validateLoan(req.body);
    if (error) { res.status(400).json({ error }); return; }
    try {
      res.status(200).json(await dbProvider.createLoan(dbConfig, value, ctx.user.user_id));
    } catch (err) {
      sendServerError(res, err, 'POST /api/loans');
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
}
