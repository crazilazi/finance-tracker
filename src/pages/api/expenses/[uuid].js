import * as dbProvider from '../../../lib/db/dbProvider';
import path from 'path';

const dbConfig = {
  dataSource: process.env.DATA_SOURCE || 'json',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'GaddiTracker',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'sa',
  trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
};

function getSessionUser(req) {
  const cookieStr = req.headers.cookie;
  if (!cookieStr) return null;
  const match = cookieStr.match(/auth_session=([^;]+)/);
  if (match) {
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch (e) {
      return null;
    }
  }
  return null;
}

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
