import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, Input, Button, Alert } from 'antd';
import { UnlockOutlined } from '@ant-design/icons';
import { setUnlockPromptOpen, setCurrentPage } from '../features/expenses/expensesSlice';

const minutesLeft = (retryAt, now) => Math.max(1, Math.ceil((retryAt - now) / 60000));

/**
 * Asks for confirmation (and the PIN when one is set) before requesting a
 * server-issued unlock grant for this tab.
 */
export default function UnlockDialog() {
  const dispatch = useDispatch();
  const open = useSelector(s => s.expenses.unlockPromptOpen);
  const privacy = useSelector(s => s.expenses.privacy);
  const settings = useSelector(s => s.expenses.settings);
  const unlockError = useSelector(s => s.expenses.unlockError);
  const [pin, setPin] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const p = settings?.privacy || {};
  const minutes = p.unlockMinutes ?? 15;
  const hasPin = !!p.hasPin;
  const disabled = minutes === 0;

  useEffect(() => { if (open) setPin(''); }, [open]);

  // Clear the PIN after a failed attempt so the next guess starts empty.
  // Adjusted during render (not in an effect) when the error object changes.
  const [seenError, setSeenError] = useState(unlockError);
  if (unlockError !== seenError) {
    setSeenError(unlockError);
    if (unlockError) setPin('');
  }

  // Tick while a lockout is showing, so the countdown and button state update
  const retryAt = unlockError?.retryAt || null;
  useEffect(() => {
    if (!open || !retryAt) return undefined;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [open, retryAt]);
  const lockedOut = !!retryAt && retryAt > now;
  const errorText = retryAt
    ? (lockedOut ? `Too many incorrect PINs. Try again in ${minutesLeft(retryAt, now)} minute${minutesLeft(retryAt, now) === 1 ? '' : 's'}.` : null)
    : unlockError?.text || null;

  const close = () => dispatch(setUnlockPromptOpen(false));
  const submit = () => {
    if (disabled || lockedOut) return;
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
        <Button key="ok" type="primary" onClick={submit} disabled={disabled || lockedOut || (hasPin && !/^\d{4,8}$/.test(pin))}>
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
          title="Unlocking is turned off in your settings."
          action={<Button size="small" onClick={() => { close(); dispatch(setCurrentPage('settings')); }}>Settings</Button>}
        />
      )}
      {errorText && (
        <Alert type={lockedOut ? 'warning' : 'error'} showIcon style={{ marginTop: 8 }} title={errorText} />
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
          disabled={lockedOut}
          style={{ marginTop: 12 }}
        />
      )}
    </Modal>
  );
}
