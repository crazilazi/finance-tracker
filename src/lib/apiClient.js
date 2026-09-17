import { getUnlockToken } from './unlockStorage';

/**
 * fetch() wrapper shared by the epics and any component that talks to the
 * API directly: JSON in/out, attaches the per-tab unlock grant, surfaces the
 * server's X-Privacy-Mode, 401 → Error{status:401}, other non-2xx → Error
 * with the server message. Resolves to { body, mode }.
 */
export async function apiFetch(url, options = {}) {
  const token = getUnlockToken();
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Unlock': token } : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  const mode = res.headers.get('X-Privacy-Mode') || null;
  if (res.status === 401) { const e = new Error(body?.error || '401'); e.status = 401; e.auth = url.startsWith('/api/privacy'); throw e; }
  if (!res.ok) { const e = new Error(body?.error || `Request failed (${res.status})`); e.status = res.status; e.mode = mode; throw e; }
  return { body, mode };
}
