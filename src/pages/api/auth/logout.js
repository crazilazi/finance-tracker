import { serializeCookie, getSessionUser, SESSION_COOKIE } from '../../../lib/auth';
import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { methodNotAllowed } from '../../../lib/apiUtils';

/**
 * POST /api/auth/logout
 * Clears the cookie and revokes this session's id, so a copy of the cookie
 * taken earlier stops working too. Other devices stay signed in.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const user = getSessionUser(req);
  if (user?.jti && user.user_id && user.exp) {
    try {
      await dbProvider.revokeSession(dbConfig, { jti: user.jti, userId: user.user_id, expiresAt: new Date(user.exp * 1000) });
    } catch (err) {
      // The cookie is still cleared below; a copy of it stays valid until it expires
      console.error('[POST /api/auth/logout] could not revoke the session:', err.message);
    }
  }

  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, req }));
  res.status(200).json({ success: true });
}
