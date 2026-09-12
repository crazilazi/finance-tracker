import * as dbProvider from '../../../../lib/db/dbProvider';
import { dbConfig } from '../../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../../lib/apiUtils';
import { validateCategoryPatch, isGuid } from '../../../../lib/validation';

/**
 * PUT    /api/master/categories/:id   partial update (name, type, icon, color, is_recurring,
 *                                      default_amount, budget_amount, cadence, archived)
 * DELETE /api/master/categories/:id   only when the category has no expenses
 */
export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!isGuid(id)) { res.status(400).json({ error: 'Invalid category id' }); return; }

  if (req.method === 'PUT') {
    const { value, error } = validateCategoryPatch(req.body);
    if (error) { res.status(400).json({ error }); return; }
    try {
      const updated = await dbProvider.updateCategory(dbConfig, id, value, user.user_id);
      res.status(200).json(updated);
    } catch (err) {
      if (err.status) { res.status(err.status).json({ error: err.message }); return; }
      sendServerError(res, err, 'PUT /api/master/categories/[id]');
    }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const result = await dbProvider.deleteCategory(dbConfig, id, user.user_id);
      res.status(200).json(result);
    } catch (err) {
      if (err.status) { res.status(err.status).json({ error: err.message }); return; }
      sendServerError(res, err, 'DELETE /api/master/categories/[id]');
    }
    return;
  }

  methodNotAllowed(res, ['PUT', 'DELETE']);
}
