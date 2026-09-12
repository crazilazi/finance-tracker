import { getSessionUser } from '../../../lib/auth';
import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { resolveMode, withDefaults, publicSettings } from '../../../lib/privacy';

/**
 * Session probe. Also returns the user's settings and the privacy mode this
 * request would be served in, so the first render is already locked correctly.
 */
export default async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user || !user.user_id) {
    res.status(200).json({ authenticated: false });
    return;
  }

  let settings;
  try {
    settings = withDefaults(await dbProvider.getUserSettings(dbConfig, user.user_id));
  } catch (err) {
    // Settings table unavailable (e.g. migration not yet applied): fail closed to defaults
    console.error('[GET /api/auth/me] settings unavailable, using defaults:', err.message);
    settings = withDefaults(null);
  }
  const resolved = resolveMode(req, user.user_id, settings);
  res.setHeader('X-Privacy-Mode', resolved.mode);

  res.status(200).json({
    authenticated: true,
    username: user.username,
    email: user.email,
    settings: publicSettings(settings),
    privacy: { mode: resolved.mode, unlocked: resolved.unlocked, unlockExpiresAt: resolved.unlockExpiresAt },
  });
}
