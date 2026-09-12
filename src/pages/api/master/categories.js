import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { normalizeType } from '../../../lib/validation';

/**
 * Categories are per-user reference data. Every query is scoped to the
 * session's user_id so one tenant can never read another tenant's names.
 */
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    let typeName;
    if (req.query.type !== undefined && req.query.type !== '') {
      typeName = normalizeType(req.query.type);
      if (!typeName) { res.status(400).json({ error: 'Invalid type' }); return; }
    }
    try {
      const rows = await dbProvider.getCategories(dbConfig, user.user_id, typeName);
      { res.status(200).json(rows); return; }
    } catch (err) {
      { sendServerError(res, err, 'GET /api/master/categories'); return; }
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const name = String(body.name ?? '').trim().slice(0, 100);
    const type = normalizeType(body.type ?? 'Expense');
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    if (!type) { res.status(400).json({ error: 'Invalid type' }); return; }

    try {
      const created = await dbProvider.createCategory(dbConfig, { name, type }, user.user_id);
      { res.status(200).json(created); return; }
    } catch (err) {
      { sendServerError(res, err, 'POST /api/master/categories'); return; }
    }
  }

  { methodNotAllowed(res, ['GET', 'POST']); return; }
}