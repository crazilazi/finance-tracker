import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateExpense, isGuid } from '../../../lib/validation';

export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  const { uuid } = req.query;
  if (!isGuid(uuid)) { res.status(400).json({ error: 'Invalid expense id' }); return; }

  if (req.method === 'PUT') {
    const { value, error } = validateExpense(req.body);
    if (error) { res.status(400).json({ error }); return; }

    try {
      const result = await dbProvider.updateExpense(dbConfig, uuid, value, user.user_id);
      if (!result.updated) { res.status(404).json({ error: 'Expense not found' }); return; }
      { res.status(200).json(result); return; }
    } catch (err) {
      { sendServerError(res, err, 'PUT /api/expenses/[uuid]'); return; }
    }
  }

  if (req.method === 'DELETE') {
    try {
      const result = await dbProvider.deleteExpense(dbConfig, uuid, user.user_id);
      if (!result.deleted) { res.status(404).json({ error: 'Expense not found' }); return; }
      { res.status(200).json(result); return; }
    } catch (err) {
      { sendServerError(res, err, 'DELETE /api/expenses/[uuid]'); return; }
    }
  }

  { methodNotAllowed(res, ['PUT', 'DELETE']); return; }
}