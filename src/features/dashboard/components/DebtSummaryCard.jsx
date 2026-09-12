import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Progress } from 'antd';
import { setCurrentPage } from '../../expenses/expensesSlice';

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => m ? `${SHORT[parseInt(m.split('-')[1], 10) - 1]} ${m.split('-')[0]}` : '—';

/** Total outstanding debt across loans, with the next payoff. Hidden when there are no loans. */
export default function DebtSummaryCard() {
  const dispatch = useDispatch();
  const loans = useSelector(s => s.expenses.loans) || [];
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  if (loans.length === 0) return null;

  const fmt = (n) => (hideAmounts || n === null || n === undefined) ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');
  const active = loans.filter(l => l.monthsLeft > 0);
  const outstanding = active.reduce((s, l) => s + (l.outstanding || 0), 0);
  const emi = active.reduce((s, l) => s + (l.emi || 0), 0);
  const principal = loans.reduce((s, l) => s + (l.principal || 0), 0);
  const paid = loans.reduce((s, l) => s + (l.principalPaid || 0), 0);
  const pct = principal > 0 ? Math.round((paid / principal) * 100) : (loans.length ? Math.round(loans.reduce((s, l) => s + l.progressPct, 0) / loans.length) : 0);
  const next = [...active].sort((a, b) => (a.payoffMonth || '').localeCompare(b.payoffMonth || ''))[0];

  return (
    <Card
      title="🏦 Debt"
      className="bg-dark-card border-dark-border text-white shadow-xl cursor-pointer"
      onClick={() => dispatch(setCurrentPage('loans'))}
      styles={{ body: { padding: 16 } }}
    >
      <div className="flex justify-between items-end gap-3">
        <div>
          <div className="text-xs text-gray-400 font-semibold">Outstanding · {active.length} loan{active.length === 1 ? '' : 's'}</div>
          <div className="text-2xl font-black text-orange-400">{fmt(outstanding)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">EMIs / month</div>
          <div className="text-sm font-bold">{fmt(emi)}</div>
        </div>
      </div>
      <Progress percent={pct} size="small" showInfo={false} strokeColor="#f97316" railColor="rgba(255,255,255,0.06)" style={{ margin: '8px 0 4px' }} />
      <div className="text-xs text-gray-500">{pct}% of principal repaid{next ? ` · next payoff ${next.name} in ${monthLabel(next.payoffMonth)}` : ''}</div>
    </Card>
  );
}
