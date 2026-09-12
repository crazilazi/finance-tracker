import React, { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { setTableFilters, setCurrentPage } from '../../expenses/expensesSlice';

const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const label = (m) => { const [y, mo] = m.split('-'); return `${SHORT[parseInt(mo, 10) - 1]} ${y.slice(2)}`; };

/**
 * Five categories whose amount changed most between the two latest months in
 * the current filter. Click a row to open that category in the Data Table.
 */
export default function TopMoversCard() {
  const dispatch = useDispatch();
  const matrix = useSelector(s => s.expenses.analytics.categoryMatrix);
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const fmt = (n) => hideAmounts ? '₹•••••' : '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

  const { movers, curr, prev } = useMemo(() => {
    const months = matrix?.months || [];
    if (months.length < 2) return { movers: [], curr: null, prev: null };
    const curr = months[months.length - 1];
    const prev = months[months.length - 2];
    const cats = new Set([...Object.keys(matrix.values[curr] || {}), ...Object.keys(matrix.values[prev] || {})]);
    const rows = [...cats].map(cat => {
      const a = matrix.values[curr]?.[cat] || 0;
      const b = matrix.values[prev]?.[cat] || 0;
      return { cat, a, b, delta: a - b, pct: b > 0 ? ((a - b) / b) * 100 : null };
    }).filter(r => Math.abs(r.delta) >= 1)
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      .slice(0, 5);
    return { movers: rows, curr, prev };
  }, [matrix]);

  if (movers.length === 0) return null;

  const open = (cat) => {
    dispatch(setTableFilters({ category: cat, type: 'all', search: '', year: 'all', month: 'all' }));
    dispatch(setCurrentPage('data'));
  };

  return (
    <Card title={`📊 Top movers · ${label(prev)} → ${label(curr)}`} className="bg-dark-card border-dark-border text-white shadow-xl h-full">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {movers.map(r => {
          const up = r.delta > 0;
          const color = up ? '#f87171' : '#34d399';
          return (
            <div
              key={r.cat}
              onClick={() => open(r.cat)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
              className="hover:bg-white/5"
              title="Open in Data Table"
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.cat}</div>
                <div className="text-gray-500" style={{ fontSize: 11 }}>{fmt(r.b)} → {fmt(r.a)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, color, fontWeight: 700, fontSize: 13 }}>
                {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {fmt(r.delta)}
                <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{r.pct === null ? 'new' : `${up ? '+' : '−'}${Math.abs(r.pct).toFixed(0)}%`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
