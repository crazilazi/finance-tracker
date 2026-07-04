import * as dbProvider from '../../../lib/db/dbProvider';
import path from 'path';

const dbConfig = {
  dataSource: process.env.DATA_SOURCE || 'json',
  connectionString: process.env.DATABASE_URL,
};

import { getSessionUser } from '../../../lib/auth';

export default async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { uuid } = req.query;
  const rootDir = process.cwd();

  if (req.method === 'PUT') {
    try {
      const result = await dbProvider.updateExpense(dbConfig, uuid, req.body, rootDir, user.username);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  } 
  
  if (req.method === 'DELETE') {
    try {
      const result = await dbProvider.deleteExpense(dbConfig, uuid, rootDir, user.username);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', ['PUT', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
