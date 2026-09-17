import { requireUser, methodNotAllowed } from '../../../lib/apiUtils';
import { revokeUnlockGrant } from '../../../lib/unlockGrants';

/** POST /api/privacy/lock — revokes the grant carried in X-Unlock (durably, across instances). */
export default async function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }
  const user = requireUser(req, res);
  if (!user) return;
  await revokeUnlockGrant(req, user.user_id);
  res.status(200).json({ locked: true });
}
