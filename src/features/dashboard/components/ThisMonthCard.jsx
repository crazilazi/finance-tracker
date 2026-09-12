import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Button, InputNumber, Progress, Tag, Collapse, Spin, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, CheckCircleFilled, PlusOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import { setSummaryMonth, setCurrentPage } from '../../expenses/expensesSlice';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function labelFor(month, short = false) {
  if (!month) return '';
  const [y, m] = month.split('-');
  return `${(short ? SHORT : MONTHS)[parseInt(m, 10) - 1]} ${y}`;
}

function shift(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const TYPE_COLORS = { Expense: 'red', EMI: 'blue', Saving: 'green', Income: 'cyan' };

/**
 * "This month" checklist. Shows which usual categories are recorded for the
 * selected month, lets the user add the missing ones with a pre-filled amount,
 * or fill them all in one click.
 *
 * compact: single-line banner (used above the Data Table); hidden when nothing is missing.
 */
export default function ThisMonthCard({ compact = false }) {
  const dispatch = useDispatch();
  const summary = useSelector(s => s.expenses.summary);
  const loading = useSelector(s => s.expenses.summaryLoading);
  const month = useSelector(s => s.expenses.summaryMonth);
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const [drafts, setDrafts] = useState({});

  const fmt = (n) => hideAmounts ? '₹•••••' : '₹' + Math.round(n || 0).toLocaleString('en-IN');

  useEffect(() => {
    if (!summary) return;
    const next = {};
    summary.items.forEach(i => { if (!i.recorded) next[i.categoryId] = i.suggestedAmount ?? null; });
    setDrafts(next);
  }, [summary]);

  const missing = useMemo(() => (summary?.items || []).filter(i => !i.recorded), [summary]);
  const recorded = useMemo(() => (summary?.items || []).filter(i => i.recorded), [summary]);

  const draftTotal = missing.reduce((s, i) => s + (Number(drafts[i.categoryId]) || 0), 0);
  const fillable = missing.filter(i => Number(drafts[i.categoryId]) > 0);

  const addOne = (item) => {
    const amount = Number(drafts[item.categoryId]);
    if (!(amount >= 0)) return;
    dispatch({ type: 'expenses/fillMonth', payload: { month, items: [{ category: item.category, amount, type: item.type }] } });
  };

  const fillAll = () => {
    if (fillable.length === 0) return;
    dispatch({
      type: 'expenses/fillMonth',
      payload: { month, items: fillable.map(i => ({ category: i.category, amount: Number(drafts[i.categoryId]), type: i.type })) },
    });
  };

  // ── Compact banner ────────────────────────────────────────────────────────
  if (compact) {
    if (!summary || summary.missingCount === 0) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px', marginBottom: 12, borderRadius: 12,
        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
      }}>
        <div style={{ fontSize: 13 }}>
          <b>{labelFor(month, true)}</b>: {summary.missingCount} of {summary.usualCount} usual entries still missing
          {summary.missingSuggestedTotal > 0 && <span className="text-gray-400"> · suggested {fmt(summary.missingSuggestedTotal)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={() => dispatch(setCurrentPage('dashboard'))}>Review</Button>
          <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={fillAll} disabled={fillable.length === 0}>
            Fill all
          </Button>
        </div>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  const pct = summary && summary.usualCount > 0 ? Math.round((summary.recordedCount / summary.usualCount) * 100) : 0;
  const complete = summary && summary.usualCount > 0 && summary.missingCount === 0;

  return (
    <Card
      className="bg-dark-card border-dark-border text-white shadow-xl"
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => dispatch(setSummaryMonth(shift(month, -1)))} />
            <span style={{ fontWeight: 700 }}>📅 {labelFor(month)}</span>
            <Button size="small" type="text" icon={<RightOutlined />} onClick={() => dispatch(setSummaryMonth(shift(month, 1)))} />
          </div>
          {summary && summary.usualCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 500 }}>
              <span className="text-gray-400">{summary.recordedCount} / {summary.usualCount} usual entries</span>
              <Progress percent={pct} size="small" showInfo={false} strokeColor={complete ? '#10b981' : '#6366f1'} style={{ width: 120, margin: 0 }} />
              <span className="text-gray-400">Total {fmt(summary.monthTotal)}</span>
            </div>
          )}
        </div>
      }
    >
      {!summary && loading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}

      {summary && summary.usualCount === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="text-gray-400 text-sm">
            No usual categories yet. Categories recorded in 4 of the last 6 months appear here automatically,
            or mark any category as <b>recurring</b> to pin it.
          </div>
          <Button icon={<SettingOutlined />} onClick={() => dispatch(setCurrentPage('categories'))}>Manage categories</Button>
        </div>
      )}

      {summary && summary.usualCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          {complete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#34d399', fontWeight: 600 }}>
              <CheckCircleFilled /> All usual entries are recorded for {labelFor(month)}.
              {summary.extras.length > 0 && <span className="text-gray-400 font-normal">+ {summary.extras.length} other entries</span>}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Missing ({missing.length})</span>
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={fillAll}
                  disabled={fillable.length === 0}
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}
                >
                  Fill all missing{fillable.length > 0 ? ` (${fmt(draftTotal)})` : ''}
                </Button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 8 }}>
                {missing.map(item => (
                  <div key={item.categoryId} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>{item.icon || '•'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.category} <Tag color={TYPE_COLORS[item.type] || 'default'} style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }}>{item.type}</Tag>
                      </div>
                      <div className="text-gray-500" style={{ fontSize: 11 }}>
                        {item.lastAmount !== null ? `last ${fmt(item.lastAmount)} (${labelFor(item.lastMonth, true)})` : 'no history'}
                        {item.isRecurring && ' · recurring'}
                      </div>
                    </div>
                    <InputNumber
                      size="small"
                      min={0}
                      value={drafts[item.categoryId]}
                      onChange={v => setDrafts(d => ({ ...d, [item.categoryId]: v }))}
                      onPressEnter={() => addOne(item)}
                      style={{ width: 104 }}
                      controls={false}
                      formatter={v => (v === undefined || v === null || v === '' ? '' : `₹${Number(v).toLocaleString('en-IN')}`)}
                      parser={v => String(v).replace(/[^\d.]/g, '')}
                    />
                    <Tooltip title="Add for this month">
                      <Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => addOne(item)} disabled={!(Number(drafts[item.categoryId]) >= 0)} />
                    </Tooltip>
                  </div>
                ))}
              </div>
            </>
          )}

          {(recorded.length > 0 || summary.extras.length > 0) && (
            <Collapse
              size="small"
              ghost
              items={[{
                key: 'recorded',
                label: <span className="text-xs text-gray-400">Recorded this month · {recorded.length} usual{summary.extras.length ? ` + ${summary.extras.length} other` : ''}</span>,
                children: (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {recorded.map(i => (
                      <Tag key={i.categoryId} style={{ margin: 0 }}>
                        {i.icon ? `${i.icon} ` : ''}{i.category}: <b>{fmt(i.amount)}</b>
                        {i.budget ? <span style={{ color: i.amount > i.budget ? '#f87171' : '#9ca3af' }}> / {fmt(i.budget)}</span> : null}
                      </Tag>
                    ))}
                    {summary.extras.map(e => (
                      <Tag key={e.uuid} color="default" style={{ margin: 0, opacity: 0.8 }}>{e.category}: <b>{fmt(e.amount)}</b></Tag>
                    ))}
                  </div>
                ),
              }]}
            />
          )}
        </div>
      )}
    </Card>
  );
}
