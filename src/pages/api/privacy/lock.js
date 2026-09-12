import { requireUser, methodNotAllowed } from '../../../lib/apiUtils';
import { revokeUnlockToken, readUnlockHeader } from '../../../lib/privacy';

/** POST /api/privacy/lock — revokes the grant carried in X-Unlock. */
export default function handler(req, res) {
  if (req.method !== 'POST') { methodNotAllowed(res, ['POST']); return; }
  const user = requireUser(req, res);
  if (!user) return;
  const token = readUnlockHeader(req);
  if (token) revokeUnlockToken(token);
  res.status(200).json({ locked: true });
}
