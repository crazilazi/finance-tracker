import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Server-side privacy enforcement.
 *
 * The user's saved settings decide what every API response contains:
 *   hidden  amounts removed (rows: null, aggregates: 0–100 index)
 *   demo    deterministic fake amounts seeded per user
 *   real    actual data
 * Real data is only returned while a short-lived, server-issued unlock grant
 * (X-Unlock header) is present, valid for this user and not revoked
 * (see ./unlockGrants.js).
 */

export const MODES = ['hidden', 'demo', 'real'];

export const DEFAULT_PRIVACY = {
  defaultMode: 'hidden',
  maskCategoryNames: false,
  unlockMinutes: 15,
  unlockPinHash: null,
  demoSeed: 20260912,
};

export function withDefaults(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  return { ...s, privacy: { ...DEFAULT_PRIVACY, ...(s.privacy || {}) } };
}

/**
 * Settings as returned to the client. The PIN hash is never exposed, only
 * whether one exists. The demo seed is only included for an unlocked (real)
 * request: it is an input to the demo-amount derivation, so a locked tab has
 * no reason to see it.
 */
export function publicSettings(settings, mode = 'hidden') {
  const s = withDefaults(settings);
  const { unlockPinHash, demoSeed, ...privacy } = s.privacy;
  return {
    ...s,
    privacy: { ...privacy, hasPin: !!unlockPinHash, ...(mode === 'real' ? { demoSeed } : {}) },
  };
}

// ---- Unlock grants ---------------------------------------------------------
//
// Pure token helpers. Revocation (DB-backed) and per-request mode resolution
// live in ./unlockGrants.js so this module stays free of database imports.

const UNLOCK_PURPOSE = 'unlock';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured.');
  return s;
}

export function issueUnlockToken(userId, minutes) {
  const mins = Math.max(1, Math.min(240, Number(minutes) || 15));
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(userId), purpose: UNLOCK_PURPOSE, jti }, secret(), { expiresIn: `${mins}m` });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: exp * 1000, jti };
}

/**
 * Signature / expiry / audience check only. Returns the decoded grant or null.
 * Callers that need revocation awareness use verifyUnlockGrant in ./unlockGrants.js.
 */
export function decodeUnlockToken(token, userId) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, secret());
    if (payload.purpose !== UNLOCK_PURPOSE) return null;
    if (String(payload.sub).toLowerCase() !== String(userId).toLowerCase()) return null;
    if (!payload.jti || !payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readUnlockHeader(req) {
  const h = req.headers['x-unlock'];
  return Array.isArray(h) ? h[0] : h || null;
}

/** Default mode from settings, ignoring any unlock grant. */
export function defaultModeOf(settings) {
  const s = withDefaults(settings);
  return MODES.includes(s.privacy.defaultMode) ? s.privacy.defaultMode : 'hidden';
}

// ---- Write gating -----------------------------------------------------------
//
// op: 'create'   new expense / fill-month with typed amounts   → blocked only in demo
//     'edit'     update/delete/bulk sync/undo                  → needs real
//     'config'   categories, loans, goals                      → blocked only in demo
//     'settings' privacy settings / PIN                        → needs real

export function isWriteAllowed(mode, op) {
  if (mode === 'real') return true;
  if (mode === 'demo') return false;
  // hidden
  return op === 'create' || op === 'config';
}

// ---- PIN ---------------------------------------------------------------------

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return true;
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(pin ?? ''), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// ---- Deterministic fake numbers ------------------------------------------------
//
// Demo amounts are real amounts scaled by a per-value factor. The factor is
// keyed by a per-user secret (demoKey) derived server-side from DEMO_SECRET,
// the user id and the user's demo seed. Without the server secret a viewer
// cannot recompute the factor from the row id and seed, so demo amounts
// cannot be divided back into real ones.

let warnedDemoSecret = false;

function demoSecret() {
  if (process.env.DEMO_SECRET) return process.env.DEMO_SECRET;
  if (process.env.NODE_ENV === 'production' && !warnedDemoSecret) {
    warnedDemoSecret = true;
    console.warn('[privacy] DEMO_SECRET is not set; demo amounts are keyed with JWT_SECRET instead.');
  }
  return secret();
}

/** 64-char hex key for one user's demo amounts. Changes when the seed is reshuffled. */
export function deriveDemoKey(userId, seed) {
  return crypto
    .createHmac('sha256', demoSecret())
    .update(`${String(userId).toLowerCase()}|${Number(seed) || 0}`)
    .digest('hex');
}

/** Stable factor in [0.55, 1.55) from a demo key and a value key (loan principal, goal target, budgets…). */
export function demoFactor(demoKey, key) {
  const h = crypto.createHash('sha256').update(`${demoKey}|${key}`).digest();
  const n = h.readUInt32BE(0) % 1000;
  return 0.55 + n / 1000;
}

export function demoAmount(value, demoKey, key) {
  if (value === null || value === undefined) return value;
  const v = Number(value) * demoFactor(demoKey, key);
  const step = Math.abs(v) < 5000 ? 10 : 100;
  return Math.round(v / step) * step;
}

/** Replace rupee figures inside free text (anomaly / alert details). */
export function maskAmountsInText(text) {
  return typeof text === 'string' ? text.replace(/₹\s?[\d,]+(\.\d+)?/g, '₹•••••') : text;
}
