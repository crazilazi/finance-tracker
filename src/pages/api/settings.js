import * as dbProvider from '../../lib/db/dbProvider';
import { dbConfig } from '../../lib/db/config';
import { requireContext, assertWrite, sendServerError, methodNotAllowed } from '../../lib/apiUtils';
import { validateSettingsPatch } from '../../lib/validation';
import { publicSettings, withDefaults, hashPin } from '../../lib/privacy';

/**
 * GET /api/settings          current settings (PIN hash never returned)
 * PUT /api/settings          { privacy: { defaultMode, maskCategoryNames, unlockMinutes, demoSeed, pin, clearPin } }
 * Changing privacy settings requires an unlocked (real-mode) session.
 */
export default async function handler(req, res) {
  const ctx = await requireContext(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    res.status(200).json({ settings: publicSettings(ctx.settings), privacy: { mode: ctx.privacy.mode, unlocked: ctx.privacy.unlocked, unlockExpiresAt: ctx.privacy.unlockExpiresAt } });
    return;
  }

  if (req.method === 'PUT') {
    if (!assertWrite(ctx, res, 'settings')) return;
    const { value, error } = validateSettingsPatch(req.body);
    if (error) { res.status(400).json({ error }); return; }

    try {
      const current = withDefaults(ctx.settings);
      const next = { ...current, privacy: { ...current.privacy } };
      if (value.privacy) {
        const { pin, clearPin, ...rest } = value.privacy;
        Object.assign(next.privacy, rest);
        if (clearPin) next.privacy.unlockPinHash = null;
        if (pin) next.privacy.unlockPinHash = hashPin(pin);
      }
      await dbProvider.saveUserSettings(dbConfig, ctx.user.user_id, next);
      res.status(200).json({ settings: publicSettings(next) });
    } catch (err) {
      sendServerError(res, err, 'PUT /api/settings');
    }
    return;
  }

  methodNotAllowed(res, ['GET', 'PUT']);
}
