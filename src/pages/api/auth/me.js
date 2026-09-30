import { withDefaults, publicSettings } from '../../../lib/privacy';
import { resolveMode } from '../../../lib/unlockGrants';
import { authenticate, clearSessionCookie } from '../../../lib/session';

/**
 * Session probe. Also returns the user's settings and the privacy mode this
 * request would be served in, so the first render is already locked correctly.
 * A cookie that is no longer valid (logged out, signed out elsewhere, account
 * not allowed) is cleared and reported as signed out.
 */
export default async function handler(req, res) {
  let result;
  try {
    result = await authenticate(req);
  } catch (err) {
    console.error('[GET /api/auth/me] session check failed:', err.message);
    res.status(200).json({ authenticated: false });
    return;
  }
  if (result.error) {
    if (result.reason !== 'no-session') clearSessionCookie(req, res);
    res.status(200).json({ authenticated: false });
    return;
  }

  const { user } = result;
  const settings = withDefaults(result.settings);
  const resolved = await resolveMode(req, user.user_id, settings);
  res.setHeader('X-Privacy-Mode', resolved.mode);

  res.status(200).json({
    authenticated: true,
    username: user.username,
    email: user.email,
    settings: publicSettings(settings, resolved.mode),
    privacy: { mode: resolved.mode, unlocked: resolved.unlocked, unlockExpiresAt: resolved.unlockExpiresAt },
  });
}
