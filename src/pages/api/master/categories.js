import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { normalizeType } from '../../../lib/validation';
import { finalizeCategories } from '../../../lib/privacyResponse';

/**
 * Categories are per-user reference data, shaped by the privacy mode
 * (amounts hidden or fake, names optionally masked).
 *
 * GET  /api/master/categories[?type=Expense]
 * POST /api/master/categories { name, type }
 */
export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    let typeName;
    if (req.query.type !== undefined && req.query.type !== '') {
      typeName = normalizeType(req.query.type);
      if (!typeName) { res.status(400).json({ error: 'Invalid type' }); return; }
    }
    try {
      const rows = await dbProvider.getCategories(dbConfig, ctx.user.user_id, typeName, ctx.privacy);
      res.status(200).json(await finalizeCategories(ctx, rows));
    } catch (err) {
      sendServerError(res, err, 'GET /api/master/categories');
    }
    return;
  }

  if (req.method === 'POST') {
    if (!assertWrite(ctx, res, 'config')) return;
    const body = req.body || {};
    const name = String(body.name ?? '').trim().slice(0, 100);
    const type = normalizeType(body.type ?? 'Expense');
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    if (!type) { res.status(400).json({ error: 'Invalid type' }); return; }

    try {
      const created = await dbProvider.createCategory(dbConfig, { name, type }, ctx.user.user_id);
      res.status(200).json(created);
    } catch (err) {
      sendServerError(res, err, 'POST /api/master/categories');
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'POST']);
}
