import { ofType } from 'redux-observable';
import { from, of, EMPTY, concat } from 'rxjs';
import { map, mergeMap, withLatestFrom, switchMap, debounceTime, catchError } from 'rxjs/operators';
import {
  setUser,
  logoutUser,
  setLoading,
  setTableData,
  setAnalytics,
  setSummary,
  setSummaryLoading,
  setCategories,
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

// ── Helpers ─────────────────────────────────────────────────────────────────

/** fetch() wrapper: JSON in/out, 401 → logout, non-2xx → Error with server message. */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (res.status === 401) { const e = new Error('401'); e.status = 401; throw e; }
  if (!res.ok) { const e = new Error(body?.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return body;
}

function failure(err) {
  if (err && err.status === 401) return of(logoutUser());
  console.error(err);
  return of(setLastError(err?.message || 'Something went wrong'));
}

/** Everything that must refresh after a write. */
const refreshAll = () => [
  invalidateCache(),
  { type: 'expenses/fetchTableData' },
  { type: 'expenses/fetchAnalytics' },
  { type: 'expenses/fetchSummary' },
  { type: 'expenses/fetchCategories' },
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

// ── Fetch Table Data Epic ────────────────────────────────────────────────────
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
        mergeMap(result => {
          const { data, total } = result;
          return of(
            setTableData({ data, total }),
            setTableCacheEntry({ key: cacheKey, data, total })
          );
        }),
        catchError(failure)
      );
    })
  );

// ── Fetch Analytics Epic ─────────────────────────────────────────────────────
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
        mergeMap(analytics => of(
          setAnalytics(analytics),
          setAnalyticsCacheEntry({ key: cacheKey, analytics })
        )),
        catchError(failure)
      );
    })
  );

// ── Month summary ("This month" card) ───────────────────────────────────────
export const fetchSummaryEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchSummary', 'expenses/setSummaryMonth'),
    withLatestFrom(state$),
    switchMap(([, state]) => {
      const month = state.expenses.summaryMonth;
      return concat(
        of(setSummaryLoading(true)),
        from(apiFetch(`/api/expenses/summary?month=${encodeURIComponent(month)}`)).pipe(
          map(summary => setSummary(summary)),
          catchError(err => concat(of(setSummaryLoading(false)), failure(err)))
        )
      );
    })
  );

// ── Categories (full objects with icons, flags and usage) ───────────────────
export const fetchCategoriesEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchCategories'),
    switchMap(() =>
      from(apiFetch('/api/master/categories')).pipe(
        map(rows => setCategories(rows)),
        catchError(failure)
      )
    )
  );

// When global filter changes, re-fetch both table and analytics
export const globalFilterChangeEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setFilter'),
    mergeMap(() => of(
      { type: 'expenses/fetchTableData' },
      { type: 'expenses/fetchAnalytics' }
    ))
  );

// When table-specific state changes (sort/page/size/table-filters), re-fetch only table data
export const tableConfigChangeEpic = (action$) =>
  action$.pipe(
    ofType(
      'expenses/setSort',
      'expenses/setDataPage',
      'expenses/setPageSize',
      'expenses/setTableFilters',
    ),
    mergeMap(() => of({ type: 'expenses/fetchTableData' }))
  );

// Query has a debounce to avoid firing on every keystroke
export const queryChangeEpic = (action$) =>
  action$.pipe(
    ofType('expenses/setQuery'),
    debounceTime(350),
    mergeMap(() => of(
      { type: 'expenses/fetchAnalytics' },
      { type: 'expenses/fetchTableData' }
    ))
  );

// ── Expense Mutation Epics ───────────────────────────────────────────────────

export const createExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/createExpense'),
    mergeMap(action => {
      const item = action.payload;
      return from(apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(item) })).pipe(
        mergeMap(result => {
          const uuid = result?.data?.uuid || item.uuid;
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

// ── Undo Epic ────────────────────────────────────────────────────────────────
export const undoEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/undoLast'),
    withLatestFrom(state$),
    mergeMap(([, state]) => {
      const undoStack = state.expenses.undoStack;
      if (undoStack.length === 0) return of(setLastNotice('Nothing to undo'));
      const last = undoStack[undoStack.length - 1];

      let request;
      if (last.action === 'create') {
        request = apiFetch(`/api/expenses/${last.uuid}`, { method: 'DELETE' });
      } else if (last.action === 'delete') {
        request = apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(last.snapshot) });
      } else if (last.action === 'update') {
        request = apiFetch(`/api/expenses/${last.uuid}`, { method: 'PUT', body: JSON.stringify(last.snapshot) });
      } else {
        return EMPTY;
      }

      return from(request).pipe(
        mergeMap(() => of({ type: 'expenses/popUndoEntry' }, setLastNotice('Undone'), ...refreshAll())),
        catchError(failure)
      );
    })
  );

// ── Bulk Sync Epic (reconciler) ─────────────────────────────────────────────
export const bulkSyncEpic = (action$) =>
  action$.pipe(
    ofType('expenses/bulkSync'),
    mergeMap(action =>
      from(apiFetch('/api/expenses/bulk', { method: 'POST', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(result => of(
          setLastNotice(`Synced ${(result?.updated || 0) + (result?.merged || 0)} rows`),
          ...refreshAll()
        )),
        catchError(failure)
      )
    )
  );

// ── Fill month (This-month card) ────────────────────────────────────────────
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
];

export const createCategoryEpic = (action$) =>
  action$.pipe(
    ofType('expenses/createCategory'),
    mergeMap(action =>
      from(apiFetch('/api/master/categories', { method: 'POST', body: JSON.stringify(action.payload) })).pipe(
        mergeMap(created => of(...categoryRefresh(`Category "${created?.name || action.payload.name}" ready`))),
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
        mergeMap(updated => of(...categoryRefresh(silent ? null : `Saved ${updated?.name || 'category'}`))),
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
        mergeMap(result => of(...categoryRefresh(
          `Merged ${result?.removed?.length || 0} categories into "${result?.target?.name || 'target'}" (${result?.moved || 0} rows moved)`
        ))),
        catchError(failure)
      )
    )
  );

// ── Auth Epics ───────────────────────────────────────────────────────────────
export const checkAuthSessionEpic = (action$) =>
  action$.pipe(
    ofType('expenses/checkAuthSession'),
    mergeMap(() =>
      from(fetch('/api/auth/me', { credentials: 'same-origin' }).then(res => res.json())).pipe(
        mergeMap(data => {
          if (data.authenticated) {
            return of(
              setUser({ authenticated: true, username: data.username, email: data.email }),
              setLoading(false),
              { type: 'expenses/fetchAnalytics' },
              { type: 'expenses/fetchTableData' },
              { type: 'expenses/fetchSummary' },
              { type: 'expenses/fetchCategories' }
            );
          }
          return of(
            setUser({ authenticated: false, username: null, email: null }),
            setLoading(false)
          );
        }),
        catchError(() => of(setUser({ authenticated: false, username: null, email: null }), setLoading(false)))
      )
    )
  );

export const logoutEpic = (action$) =>
  action$.pipe(
    ofType('expenses/logout'),
    mergeMap(() =>
      from(fetch('/api/auth/logout', { method: 'POST' }).then(res => res.json())).pipe(
        map(() => logoutUser()),
        catchError(() => of(logoutUser()))
      )
    )
  );
