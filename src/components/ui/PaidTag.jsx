import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import { paidLabel, markLabel, formatPaidDate } from '../../utils/paidLabel';

/**
 * One-tap paid / pending toggle for an expense row.
 *
 *   type      Expense | EMI | Saving | Income (drives the wording)
 *   paid      current state
 *   paidAt    ISO date shown in the tooltip
 *   onToggle  called with the new state
 *   locked    true in demo mode: clicking calls onLocked (opens the unlock prompt) instead
 */
export default function PaidTag({ type, paid, paidAt, onToggle, locked = false, onLocked, compact = false }) {
  const label = paidLabel(type, paid);
  const date = formatPaidDate(paidAt);
  const title = locked
    ? 'Demo data is showing. Unlock to change it.'
    : paid
      ? `${label}${date ? ` on ${date}` : ''}. Tap to undo.`
      : `${markLabel(type)}`;

  const activate = () => (locked ? onLocked?.() : onToggle?.(!paid));
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  };

  return (
    <Tooltip title={title}>
      <Tag
        role="button"
        tabIndex={0}
        aria-pressed={!!paid}
        aria-label={`${label}. ${title}`}
        onClick={(e) => { e.stopPropagation(); activate(); }}
        onKeyDown={onKeyDown}
        color={paid ? 'success' : 'warning'}
        icon={paid ? <CheckCircleFilled /> : <ClockCircleOutlined />}
        style={{ margin: 0, cursor: 'pointer', userSelect: 'none', opacity: locked ? 0.7 : 1, fontSize: compact ? 11 : undefined }}
      >
        {label}
      </Tag>
    </Tooltip>
  );
}
