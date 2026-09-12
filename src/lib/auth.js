import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;

export const SESSION_COOKIE = 'auth_session';
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const SESSION_MAX_AGE = 86400; // 1 day, matches the JWT expiry

export function signSession(payload) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
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