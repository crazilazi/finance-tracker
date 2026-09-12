import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Input, Tag } from 'antd';
import { SearchOutlined, EnterOutlined } from '@ant-design/icons';

/**
 * Keyboard-first launcher. `actions` is an array of
 *   { id, label, hint?, group?, keywords?, shortcut?, run: () => void }
 * Open with Ctrl/⌘+K; type to filter; ↑/↓ to move; Enter to run; Esc to close.
 */
export default function CommandPalette({ open, onClose, actions, isDark = true }) {
  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus?.(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return actions.slice(0, 14);
    const words = q.split(/\s+/);
    return actions
      .map(a => {
        const hay = `${a.label} ${a.hint || ''} ${a.group || ''} ${(a.keywords || []).join(' ')}`.toLowerCase();
        const score = words.reduce((s, w) => {
          if (!hay.includes(w)) return -Infinity;
          return s + (a.label.toLowerCase().startsWith(w) ? 3 : a.label.toLowerCase().includes(w) ? 2 : 1);
        }, 0);
        return { a, score };
      })
      .filter(x => x.score > -Infinity)
      .sort((x, y) => y.score - x.score)
      .slice(0, 14)
      .map(x => x.a);
  }, [text, actions]);

  useEffect(() => { setIndex(0); }, [text]);

  useEffect(() => {
    const el = listRef.current?.children?.[index];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);

  const run = (action) => {
    if (!action) return;
    onClose();
    // let the modal close before the action mutates layout / focus
    setTimeout(() => action.run(), 20);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const bg = isDark ? '#161d30' : '#ffffff';
  const border = isDark ? '#25304b' : '#e5e7eb';
  const muted = isDark ? '#9ca3af' : '#6b7280';
  const text1 = isDark ? '#f3f4f6' : '#111827';
  const hover = isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.10)';

  let lastGroup = null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width="min(620px, 94vw)"
      style={{ top: 'clamp(24px, 12vh, 120px)' }}
      styles={{ body: { padding: 0 }, content: { padding: 0, background: bg, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden' } }}
      destroyOnHidden
    >
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${border}` }}>
        <Input
          ref={inputRef}
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ color: muted }} />}
          placeholder="Type a command or page…  (↑↓ to move, Enter to run)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ color: text1, background: 'transparent' }}
        />
      </div>

      <div ref={listRef} style={{ maxHeight: 'min(420px, 60vh)', overflowY: 'auto', padding: 6 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>No matching commands.</div>
        )}
        {filtered.map((a, i) => {
          const showGroup = a.group && a.group !== lastGroup && !text.trim();
          lastGroup = a.group;
          return (
            <React.Fragment key={a.id}>
              {showGroup && (
                <div style={{ padding: '8px 10px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted }}>
                  {a.group}
                </div>
              )}
              <div
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(a)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                  background: i === index ? hover : 'transparent',
                  color: text1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>{a.icon || '•'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</div>
                    {a.hint && <div style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.hint}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {a.shortcut && <Tag style={{ margin: 0, fontFamily: 'monospace', fontSize: 10 }}>{a.shortcut}</Tag>}
                  {i === index && <EnterOutlined style={{ color: muted, fontSize: 12 }} />}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ padding: '8px 14px', borderTop: `1px solid ${border}`, fontSize: 11, color: muted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span><b>N</b> new expense</span>
        <span><b>/</b> smart filter</span>
        <span><b>G</b> then <b>D T A B I S R C X</b> jump to a tab</span>
        <span><b>Ctrl+Z</b> undo</span>
      </div>
    </Modal>
  );
}
