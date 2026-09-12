import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Tag, Button } from 'antd';
import { setCurrentPage } from '../../expenses/expensesSlice';

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => m ? `${SHORT[parseInt(m.split('-')[1], 10) - 1]} ${m.split('-')[0]}` : '';

/** Yearly items coming due, card due dates, and budgets near their limit. */
export default function UpcomingCard() {
  const dispatch = useDispatch();
  const reminders = useSelector(s => s.expenses.reminders);
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const fmt = (n) => (hideAmounts || n === null || n === undefined) ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');

  const yearly = reminders?.yearly || [];
  const cards = reminders?.cards || [];
  const budgets = reminders?.budgets || [];
  const empty = yearly.length === 0 && cards.length === 0 && budgets.length === 0;

  const rows = [
    ...cards.map(c => ({
      key: `card-${c.categoryId}`, icon: c.icon || '💳', title: `${c.category} due`,
      when: c.daysUntil === 0 ? 'today' : c.daysUntil === 1 ? 'tomorrow' : `in ${c.daysUntil} days`,
      urgency: c.daysUntil <= 3 ? 'red' : c.daysUntil <= 7 ? 'orange' : 'blue',
      detail: c.lastAmount !== null ? `last bill ${fmt(c.lastAmount)}` : '',
      sort: c.daysUntil,
    })),
    ...yearly.map(y => ({
      key: `yr-${y.categoryId}`, icon: y.icon || '📅', title: y.category,
      when: y.monthsAway <= 0 ? 'due this month' : y.monthsAway === 1 ? 'due next month' : `due ${monthLabel(y.nextMonth)}`,
      urgency: y.monthsAway <= 0 ? 'red' : 'gold',
      detail: `yearly · last ${monthLabel(y.lastMonth)}${y.lastAmount !== null ? ` ${fmt(y.lastAmount)}` : ''}`,
      sort: 30 * (y.monthsAway + 1),
    })),
    ...budgets.map(b => ({
      key: `bud-${b.categoryId}`, icon: b.icon || '🎯', title: `${b.category} budget`,
      when: b.pct >= 100 ? `over by ${b.pct - 100}%` : `${b.pct}% used`,
      urgency: b.pct >= 100 ? 'red' : 'orange',
      detail: b.budget !== null ? `${fmt(b.spent)} of ${fmt(b.budget)}` : '',
      sort: b.pct >= 100 ? 0 : 5,
    })),
  ].sort((a, b) => a.sort - b.sort);

  return (
    <Card title="⏰ Upcoming" className="bg-dark-card border-dark-border text-white shadow-xl h-full">
      {empty ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="text-sm text-gray-400">
            Nothing due soon. Yearly items are detected from your history; add card due days or budgets in Categories.
          </span>
          <Button size="small" onClick={() => dispatch(setCurrentPage('categories'))}>Categories</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 8).map(r => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span>{r.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="text-sm font-semibold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  {r.detail && <div className="text-xs text-gray-500">{r.detail}</div>}
                </div>
              </div>
              <Tag color={r.urgency} style={{ margin: 0, flexShrink: 0 }}>{r.when}</Tag>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
