import { getSessionUser } from './auth';
import * as dbProvider from './db/dbProvider';
import { dbConfig } from './db/config';
import { resolveMode, withDefaults, isWriteAllowed } from './privacy';

/**
 * Log the real error server-side and return a generic message to the client.
 * Raw driver/SQL error text must never reach the browser.
 */
export function sendServerError(res, err, context = 'api') {
  console.error(`[${context}]`, err);
  res.status(500).json({ error: 'Internal server error' });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed);
  res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Returns the authenticated user or writes a 401 and returns null.
 * Sessions issued before the relational migration carry no user_id and are rejected.
 */
export function requireUser(req, res) {
  const user = getSessionUser(req);
  if (!user || !user.user_id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}

/**
 * Like requireUser, but also loads the user's settings and resolves the
 * privacy mode for this request. Sets the X-Privacy-Mode response header.
 *
 * Returns { user, settings, privacy: { mode, unlocked, unlockExpiresAt, demoSeed, maskCategoryNames } }
 * or null after writing a 401 / 500.
 */
export async function requireContext(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  try {
    const settings = withDefaults(await dbProvider.getUserSettings(dbConfig, user.user_id));
    const resolved = resolveMode(req, user.user_id, settings);
    const privacy = {
      ...resolved,
      demoSeed: settings.privacy.demoSeed,
      maskCategoryNames: resolved.mode !== 'real' && !!settings.privacy.maskCategoryNames,
      unlockMinutes: settings.privacy.unlockMinutes,
    };
    res.setHeader('X-Privacy-Mode', privacy.mode);
    res.setHeader('Access-Control-Expose-Headers', 'X-Privacy-Mode');
    return { user, settings, privacy };
  } catch (err) {
    sendServerError(res, err, 'requireContext');
    return null;
  }
}

/**
 * Enforces the write matrix for the current mode. Writes a 423 and returns
 * false when the operation is not allowed while locked.
 * op: 'create' | 'edit' | 'config' | 'settings'
 */
export function assertWrite(ctx, res, op) {
  if (isWriteAllowed(ctx.privacy.mode, op)) return true;
  res.status(423).json({
    error: ctx.privacy.mode === 'demo'
      ? 'Demo data is showing. Unlock to make changes.'
      : 'Amounts are hidden. Unlock to edit existing records.',
    locked: true,
    mode: ctx.privacy.mode,
  });
  return false;
}