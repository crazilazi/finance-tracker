/**
 * Persists the user's UI preferences (not data) to localStorage so a reload
 * restores the exact view. Only whitelisted keys are stored.
 */

const STORAGE_KEY = 'finance-tracker.ui.v1';

export const PERSISTED_KEYS = [
  'theme',
  'currentPage',
  'filter',
  'sortCol',
  'sortDir',
  'pageSize',
  'tableFilters',
  'hideAmounts',
];

function currentMonthParts() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
  };
}

/** Defaults applied when nothing has been saved yet: the table opens on the current month. */
export function firstRunUiState() {
  const { year, month } = currentMonthParts();
  return {
    tableFilters: { search: '', type: 'all', category: 'all', year, month },
  };
}

export function loadUiState() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return firstRunUiState();
    const parsed = JSON.parse(raw);
    const out = {};
    for (const key of PERSISTED_KEYS) {
      if (parsed[key] !== undefined) out[key] = parsed[key];
    }
    return out;
  } catch {
    return firstRunUiState();
  }
}

export function attachUiPersistence(store) {
  if (typeof window === 'undefined') return () => {};
  let timer = null;
  let last = null;
  return store.subscribe(() => {
    const s = store.getState().expenses;
    const snapshot = {};
    for (const key of PERSISTED_KEYS) snapshot[key] = s[key];
    const serialised = JSON.stringify(snapshot);
    if (serialised === last) return;
    last = serialised;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, serialised); } catch { /* quota or private mode */ }
    }, 300);
  });
}
