import { ofType } from 'redux-observable';
import { from, of, EMPTY, concat } from 'rxjs';
import { map, mergeMap, withLatestFrom, switchMap, debounceTime, catchError } from 'rxjs/operators';
import {
  setUser,
  logoutUser,
  setPrivacy,
  syncMode,
  setSettings,
  setUnlockPromptOpen,
  setLoading,
  setTableData,
  setAnalytics,
  setSummary,
  setSummaryLoading,
  setCategories,
  setGoals,
  setLoans,
  setReminders,
  setTableCacheEntry,
  setAnalyticsCacheEntry,
  invalidateCache,
  pushUndoEntry,
  setLastError,
  setLastNotice,
  makeTableCacheKey,
  makeAnalyticsCacheKey,
  isCacheFresh,
  tableRequestParams,
} from './expensesSlice';
import { getUnlockToken, setUnlockToken, clearUnlockToken } from '../../lib/unlockStorage';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * fetch() wrapper: JSON in/out, attaches the unlock grant, surfaces the
 * server's X-Privacy-Mode, 401 → logout, non-2xx → Error with server message.
 * Resolves to { body, mode }.
 */
async function apiFetch(url, options = {}) {
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
  if (res.status === 401) { const e = new Error(body?.error || '401'); e.status = 401; e.auth = url.startsWith('/api/privacy') ; throw e; }
  if (!res.ok) { const e = new Error(body?.error || `Request failed (${res.status})`); e.status = res.status; e.mode = mode; throw e; }
  return { body, mode };
}

function failure(err) {
  if (err && err.status === 401 && !err.auth) return of(logoutUser());
  if (err && err.status === 423) {
    return of(setLastError(err.message), setUnlockPromptOpen(true), ...(err.mode ? [syncMode(err.mode)] : []));
  }
  console.error(err);
  return of(setLastError(err?.message || 'Something went wrong'));
}

const modeSync = (mode) => (mode ? [syncMode(mode)] : []);

/** Everything that must refresh after a write or a privacy-mode change. */
const refreshAll = () => [
  invalidateCache(),
  { type: 'expenses/fetchTableData' },
  { type: 'expenses/fetchAnalytics' },
  { type: 'expenses/fetchSummary' },
  { type: 'expenses/fetchCategories' },
  { type: 'expenses/fetchGoals' },
  { type: 'expenses/fetchReminders' },
];

function buildTableUrl(state) {
  const { dataPage, pageSize } = state.expenses;
  const params = new URLSearchParams({ ...tableRequestParams(state), page: dataPage, pageSize });
  return `/api/expenses?${params.toString()}`;
}

function buildAnalyticsUrl(state) {
  const { filter, query } = state.expenses;
  const params = new URLSearchParams({ filter, query });
  return `/api/expenses/analytics?${params.toString()}`;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const fetchTableDataEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchTableData'),
    withLatestFrom(state$),
    switchMap(([, state]) => {
      const cacheKey = makeTableCacheKey(state);
      const cached = state.expenses.tableCache[cacheKey];
      if (isCacheFresh(cached)) {
        return of(setTableData({ data: cached.data, total: cached.total }));
      }
      return from(apiFetch(buildTableUrl(state))).pipe(
        mergeMap(({ body, mode }) => {
          const { data, total } = body;
          return of(...modeSync(mode), setTableData({ data, total }), setTableCacheEntry({ key: cacheKey, data, total }));
        }),
        catchError(failure)
      );
    })
  );

export const fetchAnalyticsEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchAnalytics'),
    withLatestFrom(state$),
    switchMap(([, state]) => {
      const cacheKey = makeAnalyticsCacheKey(state);
      const cached = state.expenses.analyticsCache[cacheKey];
      if (isCacheFresh(cached)) {
        return of(setAnalytics(cached.analytics));
      }
      return from(apiFetch(buildAnalyticsUrl(state))).pipe(
        mergeMap(({ body, mode }) => of(...modeSync(mode), setAnalytics(body), setAnalyticsCacheEntry({ key: cacheKey, analytics: body }))),
        catchError(failure)
      );
    })
  );

export const fetchSummaryEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchSummary', 'expenses/setSummaryMonth'),
    withLatestFrom(state$),
    switchMap(([, state]) => {
      const month = state.expenses.summaryMonth;
      return concat(
        of(setSummaryLoading(true)),
        from(apiFetch(`/api/expenses/summary?month=${encodeURIComponent(month)}`)).pipe(
          mergeMap(({ body, mode }) => of(...modeSync(mode), setSummary(body))),
          catchError(err => concat(of(setSummaryLoading(false)), failure(err)))
        )
      );
    })
  );

export const fetchCategoriesEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchCategories'),
    switchMap(() =>
      from(apiFetch('/api/master/categories')).pipe(
        mergeMap(({ body, mode }) => of(...modeSync(mode), setCategories(body))),
        catchError(failure)
      )
    )
  );

export const fetchGoalsEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchGoals'),
    switchMap(() =>
      from(apiFetch('/api/goals')).pipe(
        mergeMap(({ body, mode }) => of(...modeSync(mode), setGoals(body))),
        catchError(failure)
      )
    )
  );

export const fetchLoansEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchLoans'),
    switchMap(() =>
      from(apiFetch('/api/loans')).pipe(
        mergeMap(({ body, mode }) => of(...modeSync(mode), setLoans(body))),
        catchError(failure)
      )
    )
  );

export const fetchRemindersEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchReminders'),
    switchMap(() =>
      from(apiFetch('/api/reminders')).pipe(
        mergeMap(({ body, mode }) => of(...modeSync(mode), setReminders(body))),
        catchError(failure)
      )
    )
  );

// When global filter changes, re-fetch both table and analytics
export const globalFilterChangeEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setFilter'),
    mergeMap(() => of({ type: 'expenses/fetchTableData' }, { type: 'expenses/fetchAnalytics' }))
  );

export const tableConfigChangeEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setSort', 'expenses/setDataPage', 'expenses/setPageSize', 'expenses/setTableFilters'),
    mergeMap(() => of({ type: 'expenses/fetchTableData' }))
  );

export const queryChangeEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setQuery'),
    debounceTime(350),
    mergeMap(() => of({ type: 'expenses/fetchAnalytics' }, { type: 'expenses/fetchTableData' }))
  );

// ── Expense mutations ────────────────────────────────────────────────────────

export const createExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/createExpense'),
    mergeMap(action => {
      const item = action.payload;
      return from(apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(item) })).pipe(
        mergeMap(({ body }) => {
          const uuid = body?.data?.uuid || item.uuid;
          return of(pushUndoEntry({ action: 'create', uuid, snapshot: item }), ...refreshAll());
        }),
        catchError(failure)
      );
    })
  );

export const updateExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/updateExpense'),
    mergeMap(action => {
      const { uuid, data, oldSnapshot } = action.payload;
      return from(apiFetch(`/api/expenses/${uuid}`, { method: 'PUT', body: JSON.stringify(data) })).pipe(
        mergeMap(() => of(pushUndoEntry({ action: 'update', uuid, snapshot: oldSnapshot }), ...refreshAll())),
        catchError(failure)
      );
    })
  );

export const deleteExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/deleteExpense'),
    mergeMap(action => {
      const { uuid, snapshot } = action.payload;
      return from(apiFetch(`/api/expenses/${uuid}`, { method: 'DELETE' })).pipe(
        mergeMap(() => of(pushUndoEntry({ action: 'delete', uuid, snapshot }), ...refreshAll())),
        catchError(failure)
      );
    })
  );

export const undoEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/undoLast'),
    withLatestFrom(state$),
    mergeMap(([, state]) => {
      const undoStack = state.expenses.undoStack;
      if (undoStack.length === 0) return of(setLastNotice('Nothing to undo'));
      const last = undoStack[undoStack.length - 1];

      let request;
      if (last.action === 'create') request = apiFetch(`/api/expenses/${last.uuid}`, { method: 'DELETE' });
      else if (last.action === 'delete') request = apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(last.snapshot) });
      else if (last.action === 'update') request = apiFetch(`/api/expenses/${last.uuid}`, { method: 'PUT', body: JSON.stringify(last.snapshot) });
      else return EMPTY;

      return from(request).pipe(
        mergeMap(() => of({ type: 'expenses/popUndoEntry' }, setLastNotice('Undone'), ...refreshAll())),
        catchError(failure)
      );
    })
  );

export const bulkSyncEpic = (action$) =>
  action$.pipe(
    ofType('expenses/bulkSync'),
    mergeMap(action =>
      from(apiFetch('/api/expenses/bulk', { method: 'POST', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(({ body }) => of(setLastNotice(`Synced ${(body?.updated || 0) + (body?.merged || 0)} rows`), ...refreshAll())),
        catchError(failure)
      )
    )
  );

export const fillMonthEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fillMonth'),
    mergeMap(action => {
      const { month, items } = action.payload;
      return from(apiFetch('/api/expenses/fill-month', { method: 'POST', body: JSON.stringify({ month, items }) })).pipe(
        mergeMap(() => of(
          setLastNotice(items.length === 1 ? `Added ${items[0].category}` : `Added ${items.length} entries for ${month}`),
          ...refreshAll()
        )),
        catchError(failure)
      );
    })
  );

// ── Category management ─────────────────────────────────────────────────────
const categoryRefresh = (notice) => [
  setLastNotice(notice),
  invalidateCache(),
  { type: 'expenses/fetchCategories' },
  { type: 'expenses/fetchAnalytics' },
  { type: 'expenses/fetchTableData' },
  { type: 'expenses/fetchSummary' },
  { type: 'expenses/fetchReminders' },
];

export const createCategoryEpic = (action$) =>
  action$.pipe(
    ofType('expenses/createCategory'),
    mergeMap(action =>
      from(apiFetch('/api/master/categories', { method: 'POST', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(({ body }) => of(...categoryRefresh(`Category "${body?.name || action.payload.name}" ready`))),
        catchError(failure)
      )
    )
  );

export const updateCategoryEpic = (action$) =>
  action$.pipe(
    ofType('expenses/updateCategory'),
    mergeMap(action => {
      const { id, patch, silent } = action.payload;
      return from(apiFetch(`/api/master/categories/${id}`, { method: 'PUT', body: JSON.stringify(patch) })).pipe(
        mergeMap(({ body }) => of(...categoryRefresh(silent ? null : `Saved ${body?.name || 'category'}`))),
        catchError(failure)
      );
    })
  );

export const deleteCategoryEpic = (action$) =>
  action$.pipe(
    ofType('expenses/deleteCategory'),
    mergeMap(action =>
      from(apiFetch(`/api/master/categories/${action.payload.id}`, { method: 'DELETE' })).pipe(
        mergeMap(() => of(...categoryRefresh('Category deleted'))),
        catchError(failure)
      )
    )
  );

export const mergeCategoriesEpic = (action$) =>
  action$.pipe(
    ofType('expenses/mergeCategories'),
    mergeMap(action =>
      from(apiFetch('/api/master/categories/merge', { method: 'POST', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(({ body }) => of(...categoryRefresh(
          `Merged ${body?.removed?.length || 0} categories into "${body?.target?.name || 'target'}" (${body?.moved || 0} rows moved)`
        ))),
        catchError(failure)
      )
    )
  );

// ── Goals & loans ────────────────────────────────────────────────────────────

const simpleMutation = (type, build, after) => (action$) =>
  action$.pipe(
    ofType(type),
    mergeMap(action => {
      const { url, options, notice } = build(action.payload);
      return from(apiFetch(url, options)).pipe(
        mergeMap(() => of(setLastNotice(notice), ...after)),
        catchError(failure)
      );
    })
  );

const goalsAfter = [{ type: 'expenses/fetchGoals' }, { type: 'expenses/fetchReminders' }];
const loansAfter = [{ type: 'expenses/fetchLoans' }];

export const createGoalEpic = simpleMutation('expenses/createGoal', p => ({ url: '/api/goals', options: { method: 'POST', body: JSON.stringify(p) }, notice: `Goal "${p.name}" created` }), goalsAfter);
export const updateGoalEpic = simpleMutation('expenses/updateGoal', p => ({ url: `/api/goals/${p.id}`, options: { method: 'PUT', body: JSON.stringify(p.patch) }, notice: 'Goal updated' }), goalsAfter);
export const deleteGoalEpic = simpleMutation('expenses/deleteGoal', p => ({ url: `/api/goals/${p.id}`, options: { method: 'DELETE' }, notice: 'Goal deleted' }), goalsAfter);

export const createLoanEpic = simpleMutation('expenses/createLoan', p => ({ url: '/api/loans', options: { method: 'POST', body: JSON.stringify(p) }, notice: `Loan "${p.name}" added` }), loansAfter);
export const updateLoanEpic = simpleMutation('expenses/updateLoan', p => ({ url: `/api/loans/${p.id}`, options: { method: 'PUT', body: JSON.stringify(p.patch) }, notice: 'Loan updated' }), loansAfter);
export const deleteLoanEpic = simpleMutation('expenses/deleteLoan', p => ({ url: `/api/loans/${p.id}`, options: { method: 'DELETE' }, notice: 'Loan removed' }), loansAfter);
export const addPrepaymentEpic = simpleMutation('expenses/addPrepayment', p => ({ url: `/api/loans/${p.loanId}/prepayments`, options: { method: 'POST', body: JSON.stringify(p.prepayment) }, notice: 'Prepayment recorded' }), loansAfter);
export const deletePrepaymentEpic = simpleMutation('expenses/deletePrepayment', p => ({ url: `/api/loans/${p.loanId}/prepayments/${p.id}`, options: { method: 'DELETE' }, notice: 'Prepayment removed' }), loansAfter);

// ── Settings & privacy ───────────────────────────────────────────────────────

export const fetchSettingsEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchSettings'),
    withLatestFrom(state$),
    switchMap(([, state]) =>
      from(apiFetch('/api/settings')).pipe(
        mergeMap(({ body }) => {
          const before = state.expenses.privacy.mode;
          const actions = [setSettings(body.settings), setPrivacy(body.privacy)];
          // Settings changed elsewhere (another tab or device): reload everything in the new mode
          if (body.privacy?.mode && body.privacy.mode !== before) {
            if (body.privacy.mode !== 'real') clearUnlockToken();
            actions.push(...refreshAll(), { type: 'expenses/fetchLoans' });
          }
          return of(...actions);
        }),
        catchError(failure)
      )
    )
  );

/** Re-sync settings whenever the unlock dialog opens, so PIN / window changes made elsewhere are honoured. */
export const unlockPromptSyncEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setUnlockPromptOpen'),
    mergeMap(action => (action.payload ? of({ type: 'expenses/fetchSettings' }) : EMPTY))
  );

export const saveSettingsEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/saveSettings'),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const previousMode = state.expenses.settings?.privacy?.defaultMode || 'hidden';
      return from(apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(({ body }) => {
          const nextMode = body.settings?.privacy?.defaultMode || 'hidden';
          const changedMode = nextMode !== previousMode;
          return of(
            setSettings(body.settings),
            // A new default only shows once the tab is locked; do that now so the change is visible immediately
            ...(changedMode
              ? [setLastNotice(`Settings saved — this tab is now locked, showing ${nextMode === 'demo' ? 'demo data' : nextMode === 'hidden' ? 'hidden amounts' : 'real data'}`), { type: 'expenses/lock', payload: { silent: true } }]
              : [setLastNotice('Settings saved')])
          );
        }),
        catchError(failure)
      );
    })
  );

/** Unlock: obtain a grant, store it for this tab only, then reload everything as real data. */
export const unlockEpic = (action$) =>
  action$.pipe(
    ofType('expenses/unlock'),
    mergeMap(action =>
      from(apiFetch('/api/privacy/unlock', { method: 'POST', body: JSON.stringify({ pin: action.payload?.pin || undefined }) })).pipe(
        mergeMap(({ body }) => {
          setUnlockToken(body.token, body.expiresAt);
          return of(
            setUnlockPromptOpen(false),
            setPrivacy({ mode: 'real', unlocked: true, unlockExpiresAt: body.expiresAt }),
            setLastNotice('Unlocked for this tab'),
            ...refreshAll(),
            { type: 'expenses/fetchLoans' },
          );
        }),
        catchError(err => of(setLastError(err.message)))
      )
    )
  );

export const extendUnlockEpic = (action$) =>
  action$.pipe(
    ofType('expenses/extendUnlock'),
    switchMap(() =>
      from(apiFetch('/api/privacy/extend', { method: 'POST' })).pipe(
        mergeMap(({ body }) => {
          setUnlockToken(body.token, body.expiresAt);
          return of(setPrivacy({ mode: 'real', unlocked: true, unlockExpiresAt: body.expiresAt }));
        }),
        catchError(() => of({ type: 'expenses/lock', payload: { silent: true } }))
      )
    )
  );

/** Lock: revoke the grant server-side (best effort), drop it locally, reload as the default mode. */
export const lockEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/lock'),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const hadToken = !!getUnlockToken();
      const request = hadToken ? apiFetch('/api/privacy/lock', { method: 'POST' }).catch(() => null) : Promise.resolve(null);
      clearUnlockToken();
      const defaultMode = state.expenses.settings?.privacy?.defaultMode || 'hidden';
      return from(request).pipe(
        mergeMap(() => of(
          setPrivacy({ mode: defaultMode, unlocked: false, unlockExpiresAt: null }),
          ...(action.payload?.silent ? [] : [setLastNotice('Locked')]),
          ...refreshAll(),
          { type: 'expenses/fetchLoans' },
        ))
      );
    })
  );

// ── Auth ─────────────────────────────────────────────────────────────────────

export const checkAuthSessionEpic = (action$) =>
  action$.pipe(
    ofType('expenses/checkAuthSession'),
    mergeMap(() =>
      from(apiFetch('/api/auth/me')).pipe(
        mergeMap(({ body: data }) => {
          if (data.authenticated) {
            // A stale grant from a previous session is dropped if the server did not honour it
            if (!data.privacy?.unlocked) clearUnlockToken();
            return of(
              setUser({ authenticated: true, username: data.username, email: data.email }),
              setSettings(data.settings || null),
              setPrivacy(data.privacy || { mode: 'hidden', unlocked: false, unlockExpiresAt: null }),
              setLoading(false),
              { type: 'expenses/fetchAnalytics' },
              { type: 'expenses/fetchTableData' },
              { type: 'expenses/fetchSummary' },
              { type: 'expenses/fetchCategories' },
              { type: 'expenses/fetchGoals' },
              { type: 'expenses/fetchLoans' },
              { type: 'expenses/fetchReminders' }
            );
          }
          return of(setUser({ authenticated: false, username: null, email: null }), setLoading(false));
        }),
        catchError(() => of(setUser({ authenticated: false, username: null, email: null }), setLoading(false)))
      )
    )
  );

export const logoutEpic = (action$) =>
  action$.pipe(
    ofType('expenses/logout'),
    mergeMap(() => {
      clearUnlockToken();
      return from(fetch('/api/auth/logout', { method: 'POST' }).then(res => res.json())).pipe(
        map(() => logoutUser()),
        catchError(() => of(logoutUser()))
      );
    })
  );
