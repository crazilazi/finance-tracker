import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { signSession, serializeCookie, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../lib/auth';

/**
 * POST /api/auth/signout-others
 * Ends every session of this user except the current one: the session
 * version is bumped, which invalidates all existing cookies, and this browser
 * gets a fresh cookie with the new version. Needs an unlocked tab, like other
 * account settings.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;
  if (!assertWrite(ctx, res, 'settings')) return;

  try {
    const sessionVersion = await dbProvider.bumpSessionVersion(dbConfig, ctx.user.user_id);
    const token = signSession({ user_id: ctx.user.user_id, username: ctx.user.username, email: ctx.user.email, sessionVersion });
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE, req }));
    res.status(200).json({ success: true });
  } catch (err) {
    if (err.status) { res.status(err.status).json({ error: err.message }); return; }
    sendServerError(res, err, 'POST /api/auth/signout-others');
  }
}
