/**
 * The unlock grant lives in sessionStorage only: it dies with the tab and is
 * never shared with other tabs, so every new tab starts locked.
 */
const KEY = 'finance-tracker.unlock.v1';

function storage() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

export function getUnlockToken() {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (!token || (expiresAt && Date.now() > expiresAt)) { s.removeItem(KEY); return null; }
    return token;
  } catch { return null; }
}

export function getUnlockExpiry() {
  const s = storage();
  if (!s) return null;
  try { return JSON.parse(s.getItem(KEY) || 'null')?.expiresAt || null; } catch { return null; }
}

export function setUnlockToken(token, expiresAt) {
  const s = storage();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify({ token, expiresAt })); } catch { /* quota / private mode */ }
}

export function clearUnlockToken() {
  const s = storage();
  if (!s) return;
  try { s.removeItem(KEY); } catch { /* ignore */ }
}
