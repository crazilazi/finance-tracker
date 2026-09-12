import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { withDefaults, verifyUnlockToken, issueUnlockToken, revokeUnlockToken, readUnlockHeader } from '../../../lib/privacy';

/**
 * POST /api/privacy/extend
 * Rotates a still-valid unlock grant (sent as X-Unlock) for a fresh one.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  const current = readUnlockHeader(req);
  if (!verifyUnlockToken(current, user.user_id)) {
    res.status(401).json({ error: 'Unlock has expired. Unlock again.' });
    return;
  }

  try {
    const settings = withDefaults(await dbProvider.getUserSettings(dbConfig, user.user_id));
    const grant = issueUnlockToken(user.user_id, settings.privacy.unlockMinutes || 15);
    revokeUnlockToken(current);
    res.status(200).json({ token: grant.token, expiresAt: grant.expiresAt, mode: 'real' });
  } catch (err) {
    sendServerError(res, err, 'POST /api/privacy/extend');
  }
}
