import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateExpenseList } from '../../../lib/validation';

export default async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const { value, error } = validateExpenseList(req.body);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const result = await dbProvider.bulkSyncExpenses(dbConfig, value, user.user_id);
    { res.status(200).json(result); return; }
  } catch (err) {
    { sendServerError(res, err, 'POST /api/expenses/bulk'); return; }
  }
}