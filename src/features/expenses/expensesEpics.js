import { ofType } from 'redux-observable';
import { from, of } from 'rxjs';
import { map, mergeMap, tap, withLatestFrom, catchError } from 'rxjs/operators';
import {
  setUser,
  logoutUser,
  setExpenses,
  setLoading,
  setAnalyticsResults,
  addExpense,
  updateExpense,
  deleteExpense,
  deleteBulkExpenses,
  undoAction,
  propagateYearlyExpense,
  propagateRangeExpense,
  copyMonthExpenses
} from './expensesSlice';
import { detectAnomalies, generateAlerts, calculateHealthScore } from '../../utils/financeEngine';

export const fetchExpensesEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchExpenses'),
    mergeMap(() => {
      return from(
        fetch('/api/expenses', { credentials: 'same-origin' })
          .then(res => {
            if (!res.ok) throw new Error('Backend returned status ' + res.status);
            return res.json();
          })
      ).pipe(
        mergeMap(data => {
          if (Array.isArray(data) && data.length > 0) {
            try {
              localStorage.setItem('gaddi_expense_data', JSON.stringify(data));
            } catch (e) {}
            return of(setExpenses(data), setLoading(false));
          }
          throw new Error('Empty or invalid data from API');
        }),
        catchError(err => {
          console.warn('Failed to fetch from /api/expenses, trying localStorage:', err);
          const saved = localStorage.getItem('gaddi_expense_data');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                return of(setExpenses(parsed), setLoading(false));
              }
            } catch (e) {
              console.warn('Failed to parse localStorage data:', e);
            }
          }
          
          // Fallback to fetch seed json from public folder
          return from(
            fetch('/expense_data.json')
              .then(res => res.json())
          ).pipe(
            mergeMap(data => of(setExpenses(data), setLoading(false))),
            catchError(fetchErr => {
              console.error('Final fallback to seed JSON failed:', fetchErr);
              return of(setLoading(false));
            })
          );
        })
      );
    })
  );

export const saveExpensesEpic = (action$, state$) =>
  action$.pipe(
    ofType(
      addExpense.type,
      updateExpense.type,
      deleteExpense.type,
      deleteBulkExpenses.type,
      undoAction.type,
      propagateYearlyExpense.type,
      propagateRangeExpense.type,
      copyMonthExpenses.type
    ),
    withLatestFrom(state$),
    tap(([action, state]) => {
      const rawData = state.expenses.rawData;

      // Local storage backup
      try {
        localStorage.setItem('gaddi_expense_data', JSON.stringify(rawData));
      } catch (e) {}

      if (action.type === addExpense.type) {
        fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action.payload)
        }).catch(err => console.error('Failed to create expense via REST API:', err));
      } else if (action.type === updateExpense.type) {
        // Reducer has already updated state.expenses.rawData!
        // We can just grab the updated item using the index.
        const { index, data } = action.payload;
        const updatedItem = state.expenses.rawData[index]; 
        
        // If data form didn't pass UUID, we use the one from state which still has it.
        const payloadToSave = { ...data, uuid: updatedItem ? updatedItem.uuid : (data.uuid || null) };

        if (payloadToSave.uuid) {
          fetch(`/api/expenses/${payloadToSave.uuid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadToSave)
          }).catch(err => console.error('Failed to update expense via REST API:', err));
        }
      } else if (action.type === deleteExpense.type) {
        // payload could be a number (index) or { index, uuid }
        let uuid = typeof action.payload === 'object' ? action.payload.uuid : null;
        
        // if uuid is missing from payload, we can't reliably get it from state.rawData because the item is already deleted!
        // but if it's missing, we fallback to bulk sync.
        if (uuid) {
          fetch(`/api/expenses/${uuid}`, {
            method: 'DELETE'
          }).catch(err => console.error('Failed to delete expense via REST API:', err));
        } else {
          // fallback if UI didn't pass uuid
          fetch('/api/expenses/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rawData)
          }).catch(err => console.error('Failed bulk sync on delete:', err));
        }
      } else {
        // Bulk operations sync
        fetch('/api/expenses/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rawData)
        }).catch(err => console.error('Failed to sync bulk operation:', err));
      }
    }),
    mergeMap(() => of({ type: 'expenses/noop' }))
  );

export const analyticsEpic = (action$, state$) =>
  action$.pipe(
    ofType(
      addExpense.type,
      updateExpense.type,
      deleteExpense.type,
      deleteBulkExpenses.type,
      undoAction.type,
      setExpenses.type,
      propagateYearlyExpense.type,
      propagateRangeExpense.type,
      copyMonthExpenses.type
    ),
    withLatestFrom(state$),
    map(([action, state]) => {
      const rawData = state.expenses.rawData;
      const anomalies = detectAnomalies(rawData);
      const alerts = generateAlerts(rawData, anomalies);
      const health = calculateHealthScore(rawData, anomalies);
      
      return setAnalyticsResults({
        anomalies,
        alerts,
        healthScore: health.score,
        healthMetrics: {
          savingsRate: health.savingsRate,
          emiBurden: health.emiBurden,
          stability: health.stability,
          anomalyScore: health.anomalyScore
        }
      });
    })
  );

export const checkAuthSessionEpic = (action$) =>
  action$.pipe(
    ofType('expenses/checkAuthSession'),
    mergeMap(() => {
      return from(
        fetch('/api/auth/me', { credentials: 'same-origin' })
          .then(res => res.json())
      ).pipe(
        mergeMap(data => {
          if (data.authenticated) {
            return of(
              setUser({ authenticated: true, username: data.username, email: data.email }),
              { type: 'expenses/fetchExpenses' }
            );
          } else {
            return of(
              setUser({ authenticated: false, username: null, email: null }),
              setLoading(false)
            );
          }
        }),
        catchError(err => {
          console.error('Check auth session failed:', err);
          return of(
            setUser({ authenticated: false, username: null, email: null }),
            setLoading(false)
          );
        })
      );
    })
  );

export const logoutEpic = (action$) =>
  action$.pipe(
    ofType('expenses/logout'),
    mergeMap(() => {
      return from(
        fetch('/api/auth/logout', { method: 'POST' })
          .then(res => res.json())
      ).pipe(
        map(() => logoutUser())
      );
    })
  );
