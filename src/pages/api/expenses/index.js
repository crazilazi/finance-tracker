import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateExpense, validateListParams } from '../../../lib/validation';

export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    // Paginated fetch with server-side filtering and sorting
    const { value: params, error } = validateListParams(req.query);
    if (error) { res.status(400).json({ error }); return; }

    try {
      const result = await dbProvider.getExpensesPaginated(dbConfig, params, user.user_id);
      { res.status(200).json(result); return; } // { data: [...], total: N }
    } catch (err) {
      { sendServerError(res, err, 'GET /api/expenses'); return; }
    }
  }

  if (req.method === 'POST') {
    const { value, error } = validateExpense(req.body);
    if (error) { res.status(400).json({ error }); return; }

    try {
      const result = await dbProvider.createExpense(dbConfig, value, user.user_id);
      { res.status(200).json(result); return; }
    } catch (err) {
      { sendServerError(res, err, 'POST /api/expenses'); return; }
    }
  }

  { methodNotAllowed(res, ['GET', 'POST']); return; }
}