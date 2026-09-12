import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { withDefaults, verifyPin, issueUnlockToken } from '../../../lib/privacy';

/**
 * POST /api/privacy/unlock  { pin? }
 * Issues a short-lived unlock grant (JWT) bound to the session's user.
 * The client keeps it in sessionStorage and sends it as X-Unlock.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  try {
    const settings = withDefaults(await dbProvider.getUserSettings(dbConfig, user.user_id));
    const { unlockMinutes, unlockPinHash } = settings.privacy;

    if (!unlockMinutes) {
      res.status(403).json({ error: 'Unlocking is disabled in your privacy settings.' });
      return;
    }
    const pin = req.body?.pin;
    if (unlockPinHash && !verifyPin(pin, unlockPinHash)) {
      // Small delay blunts brute force on a 4–8 digit PIN
      await new Promise(r => setTimeout(r, 400));
      res.status(401).json({ error: 'Incorrect PIN.' });
      return;
    }

    const grant = issueUnlockToken(user.user_id, unlockMinutes);
    res.status(200).json({ token: grant.token, expiresAt: grant.expiresAt, mode: 'real' });
  } catch (err) {
    sendServerError(res, err, 'POST /api/privacy/unlock');
  }
}
