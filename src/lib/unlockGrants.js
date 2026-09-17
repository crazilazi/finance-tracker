import * as dbProvider from './db/dbProvider';
import { dbConfig } from './db/config';
import { decodeUnlockToken, readUnlockHeader, defaultModeOf } from './privacy';

/**
 * Unlock-grant lifecycle with durable revocation.
 *
 * Lock / extend record the grant's jti in the RevokedUnlockGrants table, so a
 * revoked grant stays revoked across app instances and restarts (previously
 * the list lived in process memory only). A small in-memory set is kept as a
 * fast path so a jti revoked by this instance never needs a database round trip.
 */

const revokedHere = new Map(); // jti -> exp (ms)

function sweep() {
  const now = Date.now();
  for (const [jti, exp] of revokedHere) if (exp < now) revokedHere.delete(jti);
}

async function isRevoked(jti) {
  sweep();
  if (revokedHere.has(jti)) return true;
  try {
    return await dbProvider.isUnlockGrantRevoked(dbConfig, jti);
  } catch (err) {
    // Revocation table unavailable (migration 004 not applied yet): the grant is still
    // signature- and expiry-checked, so keep serving rather than locking everyone out.
    console.error('[unlockGrants] revocation lookup failed, treating grant as active:', err.message);
    return false;
  }
}

/** Decoded grant when the request carries a valid, unrevoked token for this user; else null. */
export async function verifyUnlockGrant(req, userId) {
  const grant = decodeUnlockToken(readUnlockHeader(req), userId);
  if (!grant) return null;
  return (await isRevoked(grant.jti)) ? null : grant;
}

/** Revoke the grant carried by the request (best effort, idempotent). */
export async function revokeUnlockGrant(req, userId) {
  const grant = decodeUnlockToken(readUnlockHeader(req), userId);
  if (!grant) return false;
  const expiresAt = grant.exp * 1000;
  revokedHere.set(grant.jti, expiresAt);
  try {
    await dbProvider.revokeUnlockGrant(dbConfig, { jti: grant.jti, userId, expiresAt: new Date(expiresAt) });
  } catch (err) {
    console.error('[unlockGrants] failed to persist revocation:', err.message);
  }
  return true;
}

/** Effective mode for a request given the user's settings. */
export async function resolveMode(req, userId, settings) {
  const grant = await verifyUnlockGrant(req, userId);
  if (grant) return { mode: 'real', unlocked: true, unlockExpiresAt: grant.exp * 1000 };
  return { mode: defaultModeOf(settings), unlocked: false, unlockExpiresAt: null };
}
