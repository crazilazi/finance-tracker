import { getSessionUser, serializeCookie, isGithubIdAllowed, SESSION_COOKIE } from './auth';
import * as dbProvider from './db/dbProvider';
import { dbConfig } from './db/config';

/**
 * Verifies a request's session cookie against the database. A valid signature
 * is not enough: the user must still exist, the cookie's session version must
 * match (Sign out other devices bumps it), the session must not have been
 * logged out, and the account must still be allowed to use the app.
 *
 * Resolves to { user, settings } or { error: 401, reason }.
 * One query per request; it also returns the settings that requireContext
 * would otherwise load separately.
 */
export async function authenticate(req) {
  const user = getSessionUser(req);
  if (!user || !user.user_id) return { error: 401, reason: 'no-session' };

  const state = await dbProvider.getSessionState(dbConfig, user.user_id, user.jti);
  if (!state) return { error: 401, reason: 'unknown-user' };

  const production = process.env.NODE_ENV === 'production';
  if (state.oauthProvider === 'github') {
    if (!isGithubIdAllowed(state.oauthId)) return { error: 401, reason: 'not-allowed' };
  } else if (production || state.oauthProvider !== 'mock') {
    // Mock sign-in exists only in development; legacy rows have no identity at all
    return { error: 401, reason: 'no-identity' };
  }

  if (state.sessionVersion !== null && (Number(user.sv) || 0) !== state.sessionVersion) {
    return { error: 401, reason: 'signed-out-elsewhere' };
  }
  if (state.revoked) return { error: 401, reason: 'logged-out' };

  return { user, settings: state.settings };
}

/** Drops the session cookie from the browser along with a 401. */
export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, req }));
}
