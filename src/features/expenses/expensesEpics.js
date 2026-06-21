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
  undoAction,
  propagateYearlyExpense,
  propagateRangeExpense
} from './expensesSlice';
import { detectAnomalies, generateAlerts, calculateHealthScore } from '../../utils/financeEngine';

export const fetchExpensesEpic = (action$) =>
  action$.pipe(
    ofType('expenses/fetchExpenses'),
    mergeMap(() => {
      return from(
        fetch('/api/get-expenses')
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
          console.warn('Failed to fetch from /api/get-expenses, trying localStorage:', err);
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
      undoAction.type,
      setExpenses.type,
      propagateYearlyExpense.type,
      propagateRangeExpense.type
    ),
    withLatestFrom(state$),
    tap(([action, state]) => {
      const rawData = state.expenses.rawData;

      // 1. Save to LocalStorage
      try {
        localStorage.setItem('gaddi_expense_data', JSON.stringify(rawData));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }

      // 2. Save to JSON File via Vite endpoint
      fetch('/api/save-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rawData)
      })
      .then(res => res.json())
      .then(resData => {
        if (!resData.success) {
          console.error('Failed to write to public/expense_data.json:', resData.error);
        }
      })
      .catch(err => {
        console.error('Error writing to public/expense_data.json:', err);
      });
    }),
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
        fetch('/api/auth/me')
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
