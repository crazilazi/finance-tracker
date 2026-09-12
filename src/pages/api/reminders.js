import * as dbProvider from '../../lib/db/dbProvider';
import { dbConfig } from '../../lib/db/config';
import { requireContext, sendServerError, methodNotAllowed } from '../../lib/apiUtils';
import { finalizeRows } from '../../lib/privacyResponse';

/**
 * GET /api/reminders
 * { yearly: [...coming due within ~2 months], cards: [...next due dates], budgets: [...at/over 80%] }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;

  try {
    const reminders = await dbProvider.getReminders(dbConfig, ctx.user.user_id, ctx.privacy);
    res.status(200).json(await finalizeRows(ctx, reminders));
  } catch (err) {
    sendServerError(res, err, 'GET /api/reminders');
  }
}
