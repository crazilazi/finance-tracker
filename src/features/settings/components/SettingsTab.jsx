import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Radio, Switch, InputNumber, Input, Button, Alert, Divider, Tag, Space } from 'antd';
import { LockOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { selectCan, setUnlockPromptOpen } from '../../expenses/expensesSlice';

const MODE_HELP = {
  hidden: 'Every amount is removed before it leaves the server. Charts keep their shape, numbers show as ₹•••••.',
  demo: 'Plausible fake amounts, consistent across the whole app. Good for screen-sharing. All edits are blocked.',
  real: 'Real data without unlocking. Only choose this on a device nobody else uses.',
};

export default function SettingsTab() {
  const dispatch = useDispatch();
  const settings = useSelector(s => s.expenses.settings);
  const privacy = useSelector(s => s.expenses.privacy);
  const can = useSelector(selectCan);

  const saved = settings?.privacy || {};
  const [form, setForm] = useState({ defaultMode: 'hidden', maskCategoryNames: false, unlockMinutes: 15, demoSeed: 20260912 });
  const [pin, setPin] = useState('');
  const [clearPin, setClearPin] = useState(false);

  useEffect(() => {
    setForm({
      defaultMode: saved.defaultMode || 'hidden',
      maskCategoryNames: !!saved.maskCategoryNames,
      unlockMinutes: saved.unlockMinutes ?? 15,
      demoSeed: saved.demoSeed ?? 20260912,
    });
    setPin('');
    setClearPin(false);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form.defaultMode !== (saved.defaultMode || 'hidden')
    || form.maskCategoryNames !== !!saved.maskCategoryNames
    || form.unlockMinutes !== (saved.unlockMinutes ?? 15)
    || form.demoSeed !== (saved.demoSeed ?? 20260912)
    || pin.length > 0 || clearPin;

  const save = () => {
    if (!can.settings) { dispatch(setUnlockPromptOpen(true)); return; }
    const payload = { privacy: { ...form } };
    if (pin) payload.privacy.pin = pin;
    if (clearPin) payload.privacy.clearPin = true;
    dispatch({ type: 'expenses/saveSettings', payload });
  };

  const sample = 12345;
  const preview = {
    hidden: '₹•••••',
    demo: `₹${Math.round(sample * (0.55 + ((form.demoSeed * 7919) % 1000) / 1000) / 10) * 10}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    real: '₹12,345',
  };

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 820 }}>
      {!can.settings && (
        <Alert
          type="info" showIcon icon={<LockOutlined />}
          message="Unlock to change privacy settings"
          description="Settings can only be changed while real data is unlocked in this tab, so a passer-by cannot switch the app to show your real numbers."
          action={<Button size="small" type="primary" onClick={() => dispatch(setUnlockPromptOpen(true))}>Unlock</Button>}
        />
      )}

      <Card title="🔒 Privacy & demo data" className="bg-dark-card border-dark-border text-white shadow-xl">
        <div className="flex flex-col gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Default mode (what the API returns until you unlock)</div>
            <Radio.Group value={form.defaultMode} onChange={e => setForm(f => ({ ...f, defaultMode: e.target.value }))} disabled={!can.settings}>
              <Space direction="vertical">
                {['hidden', 'demo', 'real'].map(m => (
                  <Radio key={m} value={m}>
                    <b style={{ textTransform: 'capitalize' }}>{m}</b> <span className="text-gray-400 text-xs">— {MODE_HELP[m]}</span>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
            <div className="text-xs text-gray-500 mt-2" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Currently serving: <Tag style={{ margin: 0 }}>{privacy.mode}</Tag></span>
              {privacy.unlocked && (
                <>
                  <span>This tab is unlocked, so it shows real data until it locks (a page refresh keeps the unlock). Saving a new default mode locks this tab automatically.</span>
                  <Button size="small" icon={<LockOutlined />} onClick={() => dispatch({ type: 'expenses/lock' })}>Lock now</Button>
                </>
              )}
            </div>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="font-semibold text-sm">Mask category names</div>
              <div className="text-xs text-gray-400">In hidden and demo modes show “Category 01…” instead of your names.</div>
            </div>
            <Switch checked={form.maskCategoryNames} onChange={v => setForm(f => ({ ...f, maskCategoryNames: v }))} disabled={!can.settings} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="font-semibold text-sm">Unlock window</div>
              <div className="text-xs text-gray-400">Minutes of activity before a tab re-locks. 0 disables unlocking entirely.</div>
            </div>
            <InputNumber min={0} max={240} value={form.unlockMinutes} onChange={v => setForm(f => ({ ...f, unlockMinutes: v ?? 0 }))} disabled={!can.settings} addonAfter="min" style={{ width: 130 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="font-semibold text-sm">Unlock PIN {saved.hasPin && <Tag color="green" style={{ marginLeft: 6 }}>set</Tag>}</div>
              <div className="text-xs text-gray-400">4–8 digits asked for on every unlock. Leave blank to keep the current PIN.</div>
            </div>
            <Space>
              <Input.Password placeholder={saved.hasPin ? 'New PIN' : 'Set a PIN'} value={pin} maxLength={8} inputMode="numeric"
                onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setClearPin(false); }} disabled={!can.settings} style={{ width: 150 }} />
              {saved.hasPin && <Button danger size="small" onClick={() => { setClearPin(true); setPin(''); }} disabled={!can.settings}>{clearPin ? 'Will remove' : 'Remove PIN'}</Button>}
            </Space>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="font-semibold text-sm">Demo seed</div>
              <div className="text-xs text-gray-400">Drives the fake numbers. Same seed = same numbers on every device. Reshuffle to change them all.</div>
            </div>
            <Space>
              <Tag style={{ margin: 0, fontFamily: 'monospace' }}>{form.demoSeed}</Tag>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => setForm(f => ({ ...f, demoSeed: Math.floor(Math.random() * 2147483647) }))} disabled={!can.settings}>Reshuffle</Button>
            </Space>
          </div>

          <Divider style={{ margin: '4px 0' }} />

          <div className="text-xs text-gray-400">
            Preview of a ₹12,345 row: hidden <b className="text-gray-200">{preview.hidden}</b> · demo <b className="text-gray-200">≈ {preview.demo}</b> · real <b className="text-gray-200">{preview.real}</b>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={save} disabled={!dirty}>Save settings</Button>
          </div>
        </div>
      </Card>

      <Card title="How locking works" className="bg-dark-card border-dark-border text-white shadow-xl">
        <ul className="text-sm text-gray-300 list-disc pl-5 space-y-1 m-0">
          <li>The server decides what every response contains from these settings. Nothing in the browser can widen it.</li>
          <li>Unlocking issues a short-lived grant for the current tab only. New tabs, closed tabs and idle time all re-lock.</li>
          <li>While hidden you can still add entries you type yourself; editing existing rows needs an unlock.</li>
          <li>While demo data is showing, every change is blocked so real records are never edited by mistake.</li>
        </ul>
      </Card>
    </div>
  );
}
