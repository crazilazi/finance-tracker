import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Progress, Button } from 'antd';
import { setCurrentPage } from '../../expenses/expensesSlice';

/** Spent vs budget for the current month, per category with a budget. */
export default function BudgetsCard() {
  const dispatch = useDispatch();
  const budgets = useSelector(s => s.expenses.analytics.budgetStatus) || [];
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const fmt = (n) => (hideAmounts || n === null || n === undefined) ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');

  const totalBudget = budgets.reduce((s, b) => s + (b.budget || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);

  return (
    <Card
      title={<span>🎯 Budgets this month {budgets.length > 0 && !hideAmounts && <span className="text-xs text-gray-400 font-normal">· {fmt(totalSpent)} of {fmt(totalBudget)}</span>}</span>}
      className="bg-dark-card border-dark-border text-white shadow-xl h-full"
    >
      {budgets.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="text-sm text-gray-400">No budgets yet. Set a monthly budget on any category to track it here and get alerts at 80% and 100%.</span>
          <Button size="small" onClick={() => dispatch(setCurrentPage('categories'))}>Set budgets</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {budgets.map(b => {
            const over = b.pct >= 100;
            const warn = b.pct >= 80 && !over;
            return (
              <div key={b.categoryId}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-gray-300">{b.icon ? `${b.icon} ` : ''}{b.category}</span>
                  <span className={over ? 'text-red-400' : warn ? 'text-amber-400' : 'text-gray-400'}>
                    {fmt(b.spent)} / {fmt(b.budget)} · {b.pct}%
                  </span>
                </div>
                <Progress percent={Math.min(100, b.pct)} showInfo={false} size="small"
                  strokeColor={over ? '#ef4444' : warn ? '#f59e0b' : '#10b981'} railColor="rgba(255,255,255,0.06)" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
