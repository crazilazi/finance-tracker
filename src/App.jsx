import React, { useEffect, useState, Suspense, lazy, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Spin, App as AntApp } from 'antd';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import CommandPalette from './components/CommandPalette';
import UnlockDialog from './components/UnlockDialog';
import useHotkeys from './hooks/useHotkeys';
import { exportExpensesToExcel } from './utils/exportExpenses';

const DashboardTab = lazy(() => import('./features/dashboard/components/DashboardTab'));
const TrendsTab = lazy(() => import('./features/trends/components/TrendsTab'));
const AnomaliesTab = lazy(() => import('./features/anomalies/components/AnomaliesTab'));
const BreakdownTab = lazy(() => import('./features/breakdown/components/BreakdownTab'));
const InsightsTab = lazy(() => import('./features/insights/components/InsightsTab'));
const SimulatorTab = lazy(() => import('./features/simulator/components/SimulatorTab'));
const ReconcileTab = lazy(() => import('./features/expenses/components/StatementReconcilerTab'));
const CategoriesTab = lazy(() => import('./features/categories/components/CategoryManagerTab'));
const LoansTab = lazy(() => import('./features/loans/components/LoansTab'));
const GoalsTab = lazy(() => import('./features/goals/components/GoalsTab'));
const SettingsTab = lazy(() => import('./features/settings/components/SettingsTab'));
const DataTableTab = lazy(() => import('./features/expenses/components/DataTableTab'));

import ExpenseModal from './features/expenses/components/ExpenseModal';
import CopyMonthModal from './features/expenses/components/CopyMonthModal';
import MissingScannerModal from './features/expenses/components/MissingScannerModal';
import Login from './components/Login';
import { DARK, LIGHT } from './components/ThemeProvider';
import {
  setCurrentPage, setPaletteOpen, togglePalette, setTheme, setUnlockPromptOpen,
  setLastError, setLastNotice, tableRequestParams, selectCan,
} from './features/expenses/expensesSlice';

const PAGES = [
  { key: 'dashboard',  label: 'Dashboard',        icon: '📊', shortcut: 'G D' },
  { key: 'trends',     label: 'Trends',           icon: '📈', shortcut: 'G T' },
  { key: 'anomalies',  label: 'Anomalies',        icon: '⚠️', shortcut: 'G A' },
  { key: 'breakdown',  label: 'Breakdown',        icon: '🧩', shortcut: 'G B' },
  { key: 'insights',   label: 'AI Insights',      icon: '💡', shortcut: 'G I' },
  { key: 'simulator',  label: 'What-If SIP',      icon: '🚀', shortcut: 'G S' },
  { key: 'reconcile',  label: 'Reconcile',        icon: '🔄', shortcut: 'G R' },
  { key: 'loans',      label: 'Loans',            icon: '🏦', shortcut: 'G L' },
  { key: 'goals',      label: 'Goals',            icon: '🎯', shortcut: 'G O' },
  { key: 'categories', label: 'Categories',       icon: '🏷️', shortcut: 'G C' },
  { key: 'data',       label: 'Data Table',       icon: '📋', shortcut: 'G X' },
  { key: 'settings',   label: 'Settings',         icon: '⚙️', shortcut: 'G E' },
];
const PAGE_KEYS = new Set(PAGES.map(p => p.key));

export default function App() {
  const dispatch    = useDispatch();
  const { message } = AntApp.useApp();
  const currentPage = useSelector(state => state.expenses.currentPage);
  const loading     = useSelector(state => state.expenses.loading);
  const themeMode   = useSelector(state => state.expenses.theme);
  const user        = useSelector(state => state.expenses.user);
  const paletteOpen = useSelector(state => state.expenses.paletteOpen);
  const lastError   = useSelector(state => state.expenses.lastError);
  const lastNotice  = useSelector(state => state.expenses.lastNotice);
  const summary     = useSelector(state => state.expenses.summary);
  const summaryMonth = useSelector(state => state.expenses.summaryMonth);
  const privacy     = useSelector(state => state.expenses.privacy);
  const settings    = useSelector(state => state.expenses.settings);
  const can         = useSelector(selectCan);
  const exportParams = useSelector(tableRequestParams);
  const isDark      = themeMode === 'dark';
  const c           = isDark ? DARK : LIGHT;  // active palette

  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalPreset, setModalPreset] = useState(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      dispatch({ type: 'expenses/checkAuthSession' });
    }
  }, [dispatch]);

  // Hash routing ⇄ Redux. On first load an empty hash falls back to the persisted page.
  const persistedPage = useRef(currentPage);
  useEffect(() => {
    const handleHashChange = () => {
      const fromHash = window.location.hash.replace('#/', '');
      const page = PAGE_KEYS.has(fromHash) ? fromHash : (PAGE_KEYS.has(persistedPage.current) ? persistedPage.current : 'dashboard');
      dispatch(setCurrentPage(page));
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [dispatch]);

  useEffect(() => {
    if (currentPage && window.location.hash !== `#/${currentPage}`) {
      window.location.hash = `/${currentPage}`;
    }
  }, [currentPage]);

  // Toasts for epic outcomes
  useEffect(() => {
    if (lastError?.text) { message.error(lastError.text); dispatch(setLastError(null)); }
  }, [lastError, message, dispatch]);
  useEffect(() => {
    if (lastNotice?.text) { message.success(lastNotice.text); dispatch(setLastNotice(null)); }
  }, [lastNotice, message, dispatch]);

  // ── Unlock lifecycle: auto re-lock at expiry, extend while the user is active ──
  useEffect(() => {
    if (!privacy.unlocked || !privacy.unlockExpiresAt) return undefined;
    const windowMs = Math.max(60000, (settings?.privacy?.unlockMinutes || 15) * 60000);
    let lastExtend = 0;
    const relockAt = setTimeout(() => dispatch({ type: 'expenses/lock', payload: { silent: false } }), Math.max(0, privacy.unlockExpiresAt - Date.now()));
    const onActivity = () => {
      const remaining = privacy.unlockExpiresAt - Date.now();
      // Renew when less than half the window is left, at most once a minute
      if (remaining < windowMs / 2 && Date.now() - lastExtend > 60000) {
        lastExtend = Date.now();
        dispatch({ type: 'expenses/extendUnlock' });
      }
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearTimeout(relockAt);
      events.forEach(e => window.removeEventListener(e, onActivity));
    };
  }, [privacy.unlocked, privacy.unlockExpiresAt, settings, dispatch]);

  const handleEdit = (record) => {
    if (!can.edit) { dispatch(setUnlockPromptOpen(true)); return; }
    setEditRecord(record);
    setModalPreset(null);
    setModalOpen(true);
  };

  const handleAdd = (preset = null) => {
    if (!can.create) { dispatch(setUnlockPromptOpen(true)); return; }
    setEditRecord(null);
    setModalPreset(preset && typeof preset === 'object' && !preset.nativeEvent ? preset : null);
    setModalOpen(true);
  };

  // Other components (e.g. the income nudge) can request a pre-filled new-expense form
  useEffect(() => {
    const onNew = (e) => handleAdd(e.detail || null);
    window.addEventListener('app:new-expense', onNew);
    return () => window.removeEventListener('app:new-expense', onNew);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can.create]);

  // Settings and privacy mode are authoritative on the server; re-sync when this tab comes back to the front
  useEffect(() => {
    if (!user.authenticated) return undefined;
    let last = 0;
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 30000) return;
      last = Date.now();
      dispatch({ type: 'expenses/fetchSettings' });
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [user.authenticated, dispatch]);

  const focusSmartFilter = () => window.dispatchEvent(new CustomEvent('app:focus-smart-filter'));

  useHotkeys({
    enabled: user.authenticated,
    onPalette: () => dispatch(togglePalette()),
    onNew: () => handleAdd(null),
    onSearch: focusSmartFilter,
    onUndo: () => (can.edit ? dispatch({ type: 'expenses/undoLast' }) : dispatch(setUnlockPromptOpen(true))),
    onGoto: (page) => dispatch(setCurrentPage(page)),
  });

  const paletteActions = useMemo(() => {
    const missing = (summary?.items || []).filter(i => !i.recorded && i.suggestedAmount > 0);
    const guard = (allowed, fn) => () => (allowed ? fn() : dispatch(setUnlockPromptOpen(true)));
    return [
      privacy.unlocked
        ? { id: 'lock', group: 'Privacy', label: 'Lock now', hint: 'Back to your default mode for this tab', icon: '🔒', run: () => dispatch({ type: 'expenses/lock' }) }
        : { id: 'unlock', group: 'Privacy', label: 'Unlock real data', hint: privacy.mode === 'demo' ? 'Demo data is showing' : 'Amounts are hidden', icon: '🔓', run: () => dispatch(setUnlockPromptOpen(true)) },
      { id: 'new', group: 'Actions', label: 'New expense', hint: 'Open the add-expense form', icon: '➕', shortcut: 'N', keywords: ['add', 'create'], run: () => handleAdd(null) },
      {
        id: 'fill', group: 'Actions', label: `Fill this month's missing entries${missing.length ? ` (${missing.length})` : ''}`,
        hint: missing.length ? `Adds ${missing.map(i => i.category).slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''} for ${summaryMonth}` : 'Nothing missing right now (or amounts hidden)',
        icon: '⚡', keywords: ['usual', 'recurring', 'checklist'],
        run: guard(can.create, () => {
          if (!missing.length) { message.info('Nothing to fill for this month'); return; }
          dispatch({ type: 'expenses/fillMonth', payload: { month: summaryMonth, items: missing.map(i => ({ category: i.category, amount: i.suggestedAmount, type: i.type })) } });
        }),
      },
      { id: 'copy', group: 'Actions', label: 'Copy month template…', hint: 'Clone a previous month into another', icon: '📋', run: guard(can.real, () => setCopyModalOpen(true)) },
      { id: 'scan', group: 'Actions', label: 'Scan for missing entries…', hint: 'Yearly gap scanner', icon: '🔍', run: () => setScannerModalOpen(true) },
      {
        id: 'export', group: 'Actions', label: 'Export current view to Excel', hint: can.export ? 'Uses the Data Table filters' : 'Unlock to export real data', icon: '📤',
        run: guard(can.export, async () => {
          try { const n = await exportExpensesToExcel(exportParams); message.success(`Exported ${n} rows`); }
          catch (e) { message.error(e.message); }
        }),
      },
      { id: 'search', group: 'Actions', label: 'Focus smart filter', hint: '>5000  type:emi  cat:rent  notes:swiggy', icon: '🔎', shortcut: '/', run: focusSmartFilter },
      { id: 'undo', group: 'Actions', label: 'Undo last change', icon: '↩️', shortcut: 'Ctrl+Z', run: guard(can.edit, () => dispatch({ type: 'expenses/undoLast' })) },
      { id: 'theme', group: 'Preferences', label: `Switch to ${isDark ? 'light' : 'dark'} theme`, icon: isDark ? '☀️' : '🌙', run: () => dispatch(setTheme(isDark ? 'light' : 'dark')) },
      ...PAGES.map(p => ({ id: `go-${p.key}`, group: 'Go to', label: p.label, icon: p.icon, shortcut: p.shortcut, keywords: ['go', 'open', 'tab'], run: () => dispatch(setCurrentPage(p.key)) })),
      { id: 'logout', group: 'Account', label: 'Log out', icon: '🚪', run: () => dispatch({ type: 'expenses/logout' }) },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, summaryMonth, isDark, exportParams, privacy.unlocked, privacy.mode, can.create, can.edit, can.export, can.real]);

  const renderActiveTab = () => {
    let TabComponent;
    switch (currentPage) {
      case 'dashboard':  TabComponent = <DashboardTab />; break;
      case 'trends':     TabComponent = <TrendsTab />; break;
      case 'anomalies':  TabComponent = <AnomaliesTab />; break;
      case 'breakdown':  TabComponent = <BreakdownTab />; break;
      case 'insights':   TabComponent = <InsightsTab />; break;
      case 'simulator':  TabComponent = <SimulatorTab />; break;
      case 'reconcile':  TabComponent = <ReconcileTab />; break;
      case 'loans':      TabComponent = <LoansTab />; break;
      case 'goals':      TabComponent = <GoalsTab />; break;
      case 'categories': TabComponent = <CategoriesTab />; break;
      case 'settings':   TabComponent = <SettingsTab />; break;
      case 'data':       TabComponent = <DataTableTab onEdit={handleEdit} onCopyTemplate={() => setCopyModalOpen(true)} onScanMissing={() => setScannerModalOpen(true)} />; break;
      default:           TabComponent = <DashboardTab />;
    }

    return (
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48, color: '#6366f1' }} spin />} />
        </div>
      }>
        {TabComponent}
      </Suspense>
    );
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: c.BG_BASE, color: c.TEXT_BASE
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `4px solid ${c.ACCENT}`, borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', marginBottom: 16
        }} />
        <div style={{ color: c.TEXT_MUTED, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em' }}>
          Loading Your Finances...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user.authenticated) {
    return <Login />;
  }

  return (
    /* ── Root shell: full-viewport row, no overflow ─────────── */
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: c.BG_BASE,
      position: 'relative',
      color: c.TEXT_BASE,
    }}>

      {/* ── Left: sidebar (hidden on mobile via CSS) ─────────── */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} palette={c} />

      {/* ── Right: column that fills the rest ─────────────────── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        height: '100vh',
        overflow: 'hidden',
        background: 'transparent',
      }}>

        {/* sticky topbar – explicit height so column layout works */}
        <TopBar setMobileOpen={setMobileOpen} palette={c} />

        {/* demo-mode ribbon: make it unmistakable that numbers are fake */}
        {privacy.mode === 'demo' && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(167,139,250,0.22), rgba(99,102,241,0.18))',
            borderBottom: '1px solid rgba(167,139,250,0.35)',
            padding: '6px 14px', fontSize: 12, fontWeight: 600, textAlign: 'center', flexShrink: 0,
          }}>
            🧪 Demo data — every amount is fake and edits are disabled. Click the lock to see real numbers in this tab.
          </div>
        )}

        {/* scrollable content area */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 'clamp(12px, 3vw, 24px)',
          background: c.BG_BASE,
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 100 }}>
            {renderActiveTab()}
          </div>
        </main>
      </div>

      {/* ── FAB: Add Expense button ────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(24px + env(safe-area-inset-bottom))',
        right: 'calc(24px + env(safe-area-inset-right))',
        zIndex: 50,
      }}>
        <Button
          type="primary"
          shape="circle"
          icon={<PlusOutlined />}
          onClick={() => handleAdd(null)}
          title={can.create ? 'New expense (N)' : 'Unlock to add entries'}
          style={{
            width: 56, height: 56,
            background: can.create ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(107,114,128,0.6)',
            border: 'none',
            boxShadow: '0 8px 30px rgba(99, 102, 241, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1) rotate(90deg)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}
        />
      </div>

      {/* ── Command palette (Ctrl/⌘+K) ─────────────────────────── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => dispatch(setPaletteOpen(false))}
        actions={paletteActions}
        isDark={isDark}
      />

      {/* ── Unlock dialog (opened by the lock icon or any 423 response) ── */}
      <UnlockDialog />

      {/* ── Add / Edit Expense modal ───────────────────────────── */}
      <ExpenseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditRecord(null); setModalPreset(null); }}
        editRecord={editRecord}
        preset={modalPreset}
      />

      {/* ── Copy Month Template modal ──────────────────────────── */}
      <CopyMonthModal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
      />

      <MissingScannerModal
        open={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        onOpenCopyTemplate={() => setCopyModalOpen(true)}
      />
    </div>
  );
}
