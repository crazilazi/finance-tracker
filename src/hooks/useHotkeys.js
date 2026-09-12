import { useEffect, useRef } from 'react';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target) {
  if (!target) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return !!target.closest?.('.ant-select, .ant-picker, .ant-input-number, [role="combobox"]');
}

/**
 * Global keyboard shortcuts.
 *   Ctrl/⌘ + K   command palette (works even while typing)
 *   N            new expense
 *   /            focus smart filter
 *   Ctrl/⌘ + Z   undo last change (outside inputs)
 *   G then D/T/A/B/I/S/R/C/X   jump to a tab
 *   ?            show the shortcut list (opens palette)
 */
export default function useHotkeys({ onPalette, onNew, onSearch, onUndo, onGoto, enabled = true }) {
  const pendingG = useRef(0);
  const handlers = useRef({});
  handlers.current = { onPalette, onNew, onSearch, onUndo, onGoto };

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (e) => {
      const h = handlers.current;
      const meta = e.ctrlKey || e.metaKey;

      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        h.onPalette?.();
        return;
      }

      if (isTypingTarget(e.target) || e.altKey) return;
      if (document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) return;

      if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        h.onUndo?.();
        return;
      }
      if (meta) return;

      const now = Date.now();
      if (pendingG.current && now - pendingG.current < 1000) {
        pendingG.current = 0;
        const map = { d: 'dashboard', t: 'trends', a: 'anomalies', b: 'breakdown', i: 'insights', s: 'simulator', r: 'reconcile', c: 'categories', x: 'data' };
        const page = map[e.key.toLowerCase()];
        if (page) { e.preventDefault(); h.onGoto?.(page); }
        return;
      }

      switch (e.key) {
        case 'g': case 'G': pendingG.current = now; break;
        case 'n': case 'N': e.preventDefault(); h.onNew?.(); break;
        case '/': e.preventDefault(); h.onSearch?.(); break;
        case '?': e.preventDefault(); h.onPalette?.(); break;
        default: break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
