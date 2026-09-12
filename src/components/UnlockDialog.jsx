import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, Input, Button, Alert } from 'antd';
import { UnlockOutlined } from '@ant-design/icons';
import { setUnlockPromptOpen, setCurrentPage } from '../features/expenses/expensesSlice';

/**
 * Asks for confirmation (and the PIN when one is set) before requesting a
 * server-issued unlock grant for this tab.
 */
export default function UnlockDialog() {
  const dispatch = useDispatch();
  const open = useSelector(s => s.expenses.unlockPromptOpen);
  const privacy = useSelector(s => s.expenses.privacy);
  const settings = useSelector(s => s.expenses.settings);
  const [pin, setPin] = useState('');

  const p = settings?.privacy || {};
  const minutes = p.unlockMinutes ?? 15;
  const hasPin = !!p.hasPin;
  const disabled = minutes === 0;

  useEffect(() => { if (open) setPin(''); }, [open]);

  const close = () => dispatch(setUnlockPromptOpen(false));
  const submit = () => {
    if (disabled) return;
    if (hasPin && !/^\d{4,8}$/.test(pin)) return;
    dispatch({ type: 'expenses/unlock', payload: { pin: hasPin ? pin : undefined } });
  };

  const what = privacy.mode === 'demo' ? 'Demo data is showing.' : 'Amounts are hidden.';

  return (
    <Modal
      open={open}
      onCancel={close}
      title={<span><UnlockOutlined /> Unlock real data</span>}
      className="dark-modal"
      footer={[
        <Button key="cancel" onClick={close}>Cancel</Button>,
        <Button key="ok" type="primary" onClick={submit} disabled={disabled || (hasPin && !/^\d{4,8}$/.test(pin))}>
          Unlock for {minutes} min
        </Button>,
      ]}
    >
      <p className="text-sm text-gray-300">
        {what} Unlocking shows your real amounts <b>in this tab only</b>, for {minutes} minutes of activity.
        A page refresh keeps it; other tabs stay locked and this tab re-locks automatically when the time is up or you click the lock.
      </p>
      {disabled && (
        <Alert
          type="warning" showIcon style={{ marginTop: 8 }}
          message="Unlocking is turned off in your settings."
          action={<Button size="small" onClick={() => { close(); dispatch(setCurrentPage('settings')); }}>Settings</Button>}
        />
      )}
      {hasPin && !disabled && (
        <Input.Password
          autoFocus
          placeholder="Enter your PIN"
          value={pin}
          inputMode="numeric"
          maxLength={8}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onPressEnter={submit}
          style={{ marginTop: 12 }}
        />
      )}
    </Modal>
  );
}
