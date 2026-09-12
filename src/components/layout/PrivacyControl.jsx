import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Tag, Tooltip } from 'antd';
import { LockOutlined, UnlockOutlined, EyeInvisibleOutlined, ExperimentOutlined } from '@ant-design/icons';
import { setUnlockPromptOpen } from '../../features/expenses/expensesSlice';

/**
 * Top-bar lock control. Shows what the server is currently returning
 * (hidden / demo / real) and toggles the per-tab unlock grant.
 */
export default function PrivacyControl({ compact = false, muted = '#9ca3af' }) {
  const dispatch = useDispatch();
  const privacy = useSelector(s => s.expenses.privacy);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!privacy.unlocked) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [privacy.unlocked]);

  const remainingMs = privacy.unlockExpiresAt ? Math.max(0, privacy.unlockExpiresAt - now) : 0;
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');

  const label = privacy.mode === 'hidden' ? 'Amounts hidden' : privacy.mode === 'demo' ? 'Demo data' : 'Unlocked';
  const color = privacy.mode === 'hidden' ? 'default' : privacy.mode === 'demo' ? 'purple' : 'success';
  const Icon = privacy.mode === 'hidden' ? EyeInvisibleOutlined : privacy.mode === 'demo' ? ExperimentOutlined : UnlockOutlined;

  const onClick = () => {
    if (privacy.unlocked) dispatch({ type: 'expenses/lock' });
    else dispatch(setUnlockPromptOpen(true));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 2 : 6, flexShrink: 0 }}>
      {!compact && (
        <Tag color={color} style={{ margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon /> {label}{privacy.unlocked && remainingMs > 0 ? ` · ${mm}:${ss}` : ''}
        </Tag>
      )}
      <Tooltip title={privacy.unlocked ? 'Lock now' : `${label} — click to unlock real data for this tab`}>
        <Button
          type="text"
          onClick={onClick}
          icon={privacy.unlocked
            ? <UnlockOutlined style={{ fontSize: 16, color: '#10b981' }} />
            : <LockOutlined style={{ fontSize: 16, color: privacy.mode === 'demo' ? '#a78bfa' : muted }} />}
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexShrink: 0 }}
        />
      </Tooltip>
    </div>
  );
}
