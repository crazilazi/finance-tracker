import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireSession, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { withDefaults, verifyPin, issueUnlockToken } from '../../../lib/privacy';

/** Wrong PINs allowed before unlocking is paused (see migration 005). */
const PIN_MAX_ATTEMPTS = 5;

const INVALID_OBJECT_NAME = 208;
let warnedMissingTable = false;

function minutesUntil(date) {
  return Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 60000));
}

function sendLockedOut(res, lockedUntil) {
  const retryAfter = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
  const mins = minutesUntil(lockedUntil);
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    error: `Too many incorrect PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
    retryAt: new Date(lockedUntil).getTime(),
  });
}

/**
 * Reserves a PIN attempt. Returns { attempt, lockedUntil } or, when migration
 * 005 has not been applied yet, { attempt: 0 } so unlocking keeps working
 * (without the limit) and the problem is logged.
 */
async function reserve(userId) {
  try {
    return await dbProvider.reservePinAttempt(dbConfig, userId);
  } catch (err) {
    if (err?.number !== INVALID_OBJECT_NAME) throw err;
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.error('[POST /api/privacy/unlock] UnlockAttempts table missing: run migration 005. PIN attempts are NOT rate limited.');
    }
    return { attempt: 0, lockedUntil: null, untracked: true };
  }
}

/**
 * POST /api/privacy/unlock  { pin? }
 * Issues a short-lived unlock grant (JWT) bound to the session's user.
 * The client keeps it in sessionStorage and sends it as X-Unlock.
 *
 * When a PIN is set, each attempt is reserved atomically before the PIN is
 * checked, so at most PIN_MAX_ATTEMPTS guesses are evaluated per lockout
 * window even when requests are sent in parallel.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const session = await requireSession(req, res);
  if (!session) return;
  const { user } = session;

  try {
    const settings = withDefaults(session.settings);
    const { unlockMinutes, unlockPinHash } = settings.privacy;

    if (!unlockMinutes) {
      res.status(403).json({ error: 'Unlocking is disabled in your privacy settings.' });
      return;
    }

    if (unlockPinHash) {
      const { attempt, lockedUntil, untracked } = await reserve(user.user_id);
      if (attempt === null) { sendLockedOut(res, lockedUntil); return; }
      if (attempt > PIN_MAX_ATTEMPTS) {
        sendLockedOut(res, await dbProvider.lockPinAttempts(dbConfig, user.user_id));
        return;
      }

      if (!verifyPin(req.body?.pin, unlockPinHash)) {
        // Small delay blunts sequential guessing on top of the attempt limit
        await new Promise(r => setTimeout(r, 400));
        if (!untracked && attempt >= PIN_MAX_ATTEMPTS) {
          sendLockedOut(res, await dbProvider.lockPinAttempts(dbConfig, user.user_id));
          return;
        }
        const left = untracked ? null : PIN_MAX_ATTEMPTS - attempt;
        res.status(401).json({
          error: left === null ? 'Incorrect PIN.' : `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} left.`,
          attemptsLeft: left,
        });
        return;
      }

      if (!untracked) await dbProvider.resetPinAttempts(dbConfig, user.user_id);
    }

    const grant = issueUnlockToken(user.user_id, unlockMinutes);
    res.status(200).json({ token: grant.token, expiresAt: grant.expiresAt, mode: 'real' });
  } catch (err) {
    sendServerError(res, err, 'POST /api/privacy/unlock');
  }
}
