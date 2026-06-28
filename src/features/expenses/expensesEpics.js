import { ofType } from 'redux-observable';
import { from, of, EMPTY } from 'rxjs';
import { map, mergeMap, tap, withLatestFrom, switchMap, debounceTime } from 'rxjs/operators';
import {
  setUser,
  logoutUser,
  setLoading,
  setTableLoading,
  setAnalyticsLoading,
  setTableData,
  setAnalytics,
  setTableCacheEntry,
  setAnalyticsCacheEntry,
  invalidateCache,
  pushUndoEntry,
  makeTableCacheKey,
  makeAnalyticsCacheKey,
  isCacheFresh,
} from './expensesSlice';

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildTableUrl(state) {
  const { filter, query, dataPage, pageSize, sortCol, sortDir, tableFilters } = state.expenses;
  const { type, category, search } = tableFilters;
  const params = new URLSearchParams({
    filter,
    query,
    page: dataPage,
    pageSize,
    sortCol,
    sortDir,
    type,
    category,
    search,
  });
  return `/api/expenses?${params.toString()}`;
}

function buildAnalyticsUrl(state) {
  const { filter, query } = state.expenses;
  const params = new URLSearchParams({ filter, query });
  return `/api/expenses/analytics?${params.toString()}`;
}

// ── Fetch Table Data Epic ────────────────────────────────────────────────────
// Triggers on 'expenses/fetchTableData' — checks cache, else calls paginated API
export const fetchTableDataEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/fetchTableData'),
    withLatestFrom(state$),
    switchMap(([, state]) => {
      const cacheKey = makeTableCacheKey(state);
      const cached = state.expenses.tableCache[cacheKey];
      if (isCacheFresh(cached)) {
        // Cache hit — serve immediately
        return of(setTableData({ data: cached.data, total: cached.total }));
      }
      // Cache miss — fetch from server
      const url = buildTableUrl(state);
      return from(
        fetch(url, { credentials: 'same-origin' }).then(res => {
          if (!res.ok) throw new Error('Table fetch failed: ' + res.status);
          return res.json();
        })
      ).pipe(
        mergeMap(result => {
          const { data, total } = result;
          return of(
            setTableData({ data, total }),
            setTableCacheEntry({ key: cacheKey, data, total })
          );
        })
      );
    })
  );

// ── Fetch Analytics Epic ─────────────────────────────────────────────────────
// Triggers on 'expenses/fetchAnalytics' — checks cache, else calls analytics API
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
      const url = buildAnalyticsUrl(state);
      return from(
        fetch(url, { credentials: 'same-origin' }).then(res => {
          if (!res.ok) throw new Error('Analytics fetch failed: ' + res.status);
          return res.json();
        })
      ).pipe(
        mergeMap(analytics => {
          return of(
            setAnalytics(analytics),
            setAnalyticsCacheEntry({ key: cacheKey, analytics })
          );
        })
      );
    })
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
    mergeMap(() => of(
      { type: 'expenses/fetchTableData' }
    ))
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
// After any CRUD mutation, invalidate cache and re-fetch table + analytics

export const createExpenseEpic = (action$, state$) =>
  action$.pipe(
    ofType('expenses/createExpense'),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const item = action.payload;
      return from(
        fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(item),
        }).then(res => res.json())
      ).pipe(
        mergeMap(result => {
          // Push undo entry with the created uuid
          const uuid = result?.data?.uuid || item.uuid;
          return of(
            pushUndoEntry({ action: 'create', uuid, snapshot: item }),
            invalidateCache(),
            { type: 'expenses/fetchTableData' },
            { type: 'expenses/fetchAnalytics' }
          );
        })
      );
    })
  );

export const updateExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/updateExpense'),
    mergeMap(action => {
      const { uuid, data, oldSnapshot } = action.payload;
      return from(
        fetch(`/api/expenses/${uuid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(data),
        }).then(res => res.json())
      ).pipe(
        mergeMap(() => of(
          pushUndoEntry({ action: 'update', uuid, snapshot: oldSnapshot }),
          invalidateCache(),
          { type: 'expenses/fetchTableData' },
          { type: 'expenses/fetchAnalytics' }
        ))
      );
    })
  );

export const deleteExpenseEpic = (action$) =>
  action$.pipe(
    ofType('expenses/deleteExpense'),
    mergeMap(action => {
      const { uuid, snapshot } = action.payload;
      return from(
        fetch(`/api/expenses/${uuid}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        }).then(res => res.json())
      ).pipe(
        mergeMap(() => of(
          pushUndoEntry({ action: 'delete', uuid, snapshot }),
          invalidateCache(),
          { type: 'expenses/fetchTableData' },
          { type: 'expenses/fetchAnalytics' }
        ))
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
      if (undoStack.length === 0) return EMPTY;
      const last = undoStack[undoStack.length - 1];

      let fetchPromise;
      if (last.action === 'create') {
        // Undo create = delete the created item
        fetchPromise = fetch(`/api/expenses/${last.uuid}`, {
          method: 'DELETE', credentials: 'same-origin'
        });
      } else if (last.action === 'delete') {
        // Undo delete = re-create the deleted item
        fetchPromise = fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(last.snapshot),
        });
      } else if (last.action === 'update') {
        // Undo update = restore old snapshot
        fetchPromise = fetch(`/api/expenses/${last.uuid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(last.snapshot),
        });
      } else {
        return EMPTY;
      }

      return from(fetchPromise.then(r => r.json())).pipe(
        mergeMap(() => of(
          { type: 'expenses/popUndoEntry' },
          invalidateCache(),
          { type: 'expenses/fetchTableData' },
          { type: 'expenses/fetchAnalytics' }
        ))
      );
    })
  );

// ── Bulk Sync Epic ───────────────────────────────────────────────────────────
export const bulkSyncEpic = (action$) =>
  action$.pipe(
    ofType('expenses/bulkSync'),
    mergeMap(action => {
      const items = action.payload;
      return from(
        fetch('/api/expenses/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(items),
        }).then(res => res.json())
      ).pipe(
        mergeMap(() => of(
          invalidateCache(),
          { type: 'expenses/fetchTableData' },
          { type: 'expenses/fetchAnalytics' }
        ))
      );
    })
  );

// ── Auth Epics ───────────────────────────────────────────────────────────────
export const checkAuthSessionEpic = (action$) =>
  action$.pipe(
    ofType('expenses/checkAuthSession'),
    mergeMap(() => {
      return from(
        fetch('/api/auth/me', { credentials: 'same-origin' }).then(res => res.json())
      ).pipe(
        mergeMap(data => {
          if (data.authenticated) {
            return of(
              setUser({ authenticated: true, username: data.username, email: data.email }),
              setLoading(false),
              { type: 'expenses/fetchAnalytics' },
              { type: 'expenses/fetchTableData' }
            );
          } else {
            return of(
              setUser({ authenticated: false, username: null, email: null }),
              setLoading(false)
            );
          }
        })
      );
    })
  );

export const logoutEpic = (action$) =>
  action$.pipe(
    ofType('expenses/logout'),
    mergeMap(() => {
      return from(
        fetch('/api/auth/logout', { method: 'POST' }).then(res => res.json())
      ).pipe(
        map(() => logoutUser())
      );
    })
  );
