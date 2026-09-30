import { requireSession, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { withDefaults, issueUnlockToken } from '../../../lib/privacy';
import { verifyUnlockGrant, revokeUnlockGrant } from '../../../lib/unlockGrants';

/**
 * POST /api/privacy/extend
 * Rotates a still-valid unlock grant (sent as X-Unlock) for a fresh one.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }

  const session = await requireSession(req, res);
  if (!session) return;
  const { user } = session;

  if (!(await verifyUnlockGrant(req, user.user_id))) {
    res.status(401).json({ error: 'Unlock has expired. Unlock again.' });
    return;
  }

  try {
    const settings = withDefaults(session.settings);
    const grant = issueUnlockToken(user.user_id, settings.privacy.unlockMinutes || 15);
    await revokeUnlockGrant(req, user.user_id);
    res.status(200).json({ token: grant.token, expiresAt: grant.expiresAt, mode: 'real' });
  } catch (err) {
    sendServerError(res, err, 'POST /api/privacy/extend');
  }
}
