import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;

export const SESSION_COOKIE = 'auth_session';
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const SESSION_MAX_AGE = 86400; // 1 day, matches the JWT expiry

/**
 * Signs a session cookie. Every session gets its own id (jti), so Log out can
 * revoke exactly that session, and carries the user's session version (sv),
 * so "Sign out other devices" can end all older sessions at once.
 */
export function signSession({ user_id, username, email, sessionVersion = 0 }) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(
    { user_id, username, email, sv: Number(sessionVersion) || 0 },
    JWT_SECRET,
    { expiresIn: '1d', jwtid: crypto.randomUUID() }
  );
}

export function verifySession(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/** Parse the Cookie header into a name -> value map (first occurrence wins). */
export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}

export function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return token ? verifySession(token) : null;
}

/**
 * True when the request is served over HTTPS. Behind Azure's proxy the
 * scheme arrives in x-forwarded-proto; in production any non-localhost host
 * is assumed to be HTTPS so cookies always carry the Secure flag there.
 */
export function isSecureRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https') return true;
  if (process.env.NODE_ENV !== 'production') return false;
  const host = String(req.headers.host || '');
  return !(host.startsWith('localhost') || host.startsWith('127.0.0.1'));
}

export function serializeCookie(name, value, { maxAge, req }) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Base URL used to build the OAuth redirect URI. Prefer the explicit
 * APP_BASE_URL setting so the Host header cannot influence the redirect.
 */
export function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const host = req.headers.host || 'localhost:3000';
  const protocol = isSecureRequest(req) ? 'https' : 'http';
  return `${protocol}://${host}`;
}

/** Constant-time string comparison for OAuth state values. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---- Who may use the app ---------------------------------------------------

/**
 * GitHub accounts allowed to use this app when ALLOWED_GITHUB_IDS is not set:
 * the owner only (crazilazi). Numeric ids are used rather than logins because a
 * login can be renamed and then registered by someone else.
 */
export const DEFAULT_ALLOWED_GITHUB_IDS = ['24241036'];

let warnedOpenSignup = false;

/**
 * Allowed GitHub ids. ALLOWED_GITHUB_IDS (comma or space separated) replaces
 * the default list; the single value "*" allows every GitHub account.
 * Returns null for "everyone".
 */
export function allowedGithubIds() {
  const raw = String(process.env.ALLOWED_GITHUB_IDS || '').trim();
  if (raw === '*') return null;
  const ids = raw.split(/[\s,]+/).map(x => x.trim()).filter(x => /^\d+$/.test(x));
  return new Set(ids.length > 0 ? ids : DEFAULT_ALLOWED_GITHUB_IDS);
}

/**
 * True when this GitHub account may sign in and keep using the app. Checked at
 * sign-in and again on every request, so removing an id takes effect at once.
 */
export function isGithubIdAllowed(githubId) {
  const allowed = allowedGithubIds();
  if (allowed === null) {
    if (process.env.NODE_ENV === 'production' && !warnedOpenSignup) {
      warnedOpenSignup = true;
      console.warn('[auth] ALLOWED_GITHUB_IDS is "*": any GitHub account can sign up.');
    }
    return true;
  }
  return allowed.has(String(githubId));
}
