import { getSessionUser } from './auth';

/**
 * Log the real error server-side and return a generic message to the client.
 * Raw driver/SQL error text must never reach the browser.
 */
export function sendServerError(res, err, context = 'api') {
  console.error(`[${context}]`, err);
  res.status(500).json({ error: 'Internal server error' });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Returns the authenticated user or writes a 401 and returns null.
 * Sessions issued before the relational migration carry no user_id and are rejected.
 */
export function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user || !user.user_id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}
