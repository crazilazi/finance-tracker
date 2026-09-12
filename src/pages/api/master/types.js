import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';

export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  try {
    const rows = await dbProvider.getTypes(dbConfig);
    { res.status(200).json(rows); return; }
  } catch (err) {
    { sendServerError(res, err, 'GET /api/master/types'); return; }
  }
}