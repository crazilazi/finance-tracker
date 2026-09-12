import React, { useEffect, useState, Suspense, lazy, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Spin, App as AntApp } from 'antd';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import CommandPalette from './components/CommandPalette';
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
const DataTableTab = lazy(() => import('./features/expenses/components/DataTableTab'));

import ExpenseModal from './features/expenses/components/ExpenseModal';
import CopyMonthModal from './features/expenses/components/CopyMonthModal';
import MissingScannerModal from './features/expenses/components/MissingScannerModal';
import Login from './components/Login';
import { DARK, LIGHT } from './components/ThemeProvider';
import {
  setCurrentPage, setPaletteOpen, togglePalette, setTheme, toggleHideAmounts,
  setLastError, setLastNotice, tableRequestParams,
} from './features/expenses/expensesSlice';

const PAGES = [
  { key: 'dashboard',  label: 'Dashboard',        icon: '📊', shortcut: 'G D' },
  { key: 'trends',     label: 'Trends',           icon: '📈', shortcut: 'G T' },
  { key: 'anomalies',  label: 'Anomalies',        icon: '⚠️', shortcut: 'G A' },
  { key: 'breakdown',  label: 'Breakdown',        icon: '🧩', shortcut: 'G B' },
  { key: 'insights',   label: 'AI Insights',      icon: '💡', shortcut: 'G I' },
  { key: 'simulator',  label: 'What-If SIP',      icon: '🚀', shortcut: 'G S' },
  { key: 'reconcile',  label: 'Reconcile',        icon: '🔄', shortcut: 'G R' },
  { key: 'categories', label: 'Categories',       icon: '🏷️', shortcut: 'G C' },
  { key: 'data',       label: 'Data Table',       icon: '📋', shortcut: 'G X' },
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
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const lastError   = useSelector(state => state.expenses.lastError);
  const lastNotice  = useSelector(state => state.expenses.lastNotice);
  const summary     = useSelector(state => state.expenses.summary);
  const summaryMonth = useSelector(state => state.expenses.summaryMonth);
  const exportParams = useSelector(tableRequestParams);
  const isDark      = themeMode === 'dark';
  const c           = isDark ? DARK : LIGHT;  // active palette

  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
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

  const handleEdit = (record) => {
    setEditRecord(record);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditRecord(null);
    setModalOpen(true);
  };

  const focusSmartFilter = () => window.dispatchEvent(new CustomEvent('app:focus-smart-filter'));

  useHotkeys({
    enabled: user.authenticated,
    onPalette: () => dispatch(togglePalette()),
    onNew: handleAdd,
    onSearch: focusSmartFilter,
    onUndo: () => dispatch({ type: 'expenses/undoLast' }),
    onGoto: (page) => dispatch(setCurrentPage(page)),
  });

  const paletteActions = useMemo(() => {
    const missing = (summary?.items || []).filter(i => !i.recorded && i.suggestedAmount > 0);
    return [
      { id: 'new', group: 'Actions', label: 'New expense', hint: 'Open the add-expense form', icon: '➕', shortcut: 'N', keywords: ['add', 'create'], run: handleAdd },
      {
        id: 'fill', group: 'Actions', label: `Fill this month's missing entries${missing.length ? ` (${missing.length})` : ''}`,
        hint: missing.length ? `Adds ${missing.map(i => i.category).slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''} for ${summaryMonth}` : 'Nothing missing right now',
        icon: '⚡', keywords: ['usual', 'recurring', 'checklist'],
        run: () => {
          if (!missing.length) { message.info('Nothing to fill for this month'); return; }
          dispatch({ type: 'expenses/fillMonth', payload: { month: summaryMonth, items: missing.map(i => ({ category: i.category, amount: i.suggestedAmount, type: i.type })) } });
        },
      },
      { id: 'copy', group: 'Actions', label: 'Copy month template…', hint: 'Clone a previous month into another', icon: '📋', run: () => setCopyModalOpen(true) },
      { id: 'scan', group: 'Actions', label: 'Scan for missing entries…', hint: 'Yearly gap scanner', icon: '🔍', run: () => setScannerModalOpen(true) },
      {
        id: 'export', group: 'Actions', label: 'Export current view to Excel', hint: 'Uses the Data Table filters', icon: '📤',
        run: async () => {
          try { const n = await exportExpensesToExcel(exportParams); message.success(`Exported ${n} rows`); }
          catch (e) { message.error(e.message); }
        },
      },
      { id: 'search', group: 'Actions', label: 'Focus smart filter', hint: '>5000  type:emi  cat:rent  notes:swiggy', icon: '🔎', shortcut: '/', run: focusSmartFilter },
      { id: 'undo', group: 'Actions', label: 'Undo last change', icon: '↩️', shortcut: 'Ctrl+Z', run: () => dispatch({ type: 'expenses/undoLast' }) },
      { id: 'theme', group: 'Preferences', label: `Switch to ${isDark ? 'light' : 'dark'} theme`, icon: isDark ? '☀️' : '🌙', run: () => dispatch(setTheme(isDark ? 'light' : 'dark')) },
      { id: 'privacy', group: 'Preferences', label: hideAmounts ? 'Show amounts' : 'Hide amounts (privacy mode)', icon: hideAmounts ? '👁️' : '🙈', run: () => dispatch(toggleHideAmounts()) },
      ...PAGES.map(p => ({ id: `go-${p.key}`, group: 'Go to', label: p.label, icon: p.icon, shortcut: p.shortcut, keywords: ['go', 'open', 'tab'], run: () => dispatch(setCurrentPage(p.key)) })),
      { id: 'logout', group: 'Account', label: 'Log out', icon: '🚪', run: () => dispatch({ type: 'expenses/logout' }) },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, summaryMonth, isDark, hideAmounts, exportParams]);

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
      case 'categories': TabComponent = <CategoriesTab />; break;
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
          onClick={handleAdd}
          title="New expense (N)"
          style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
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

      {/* ── Add / Edit Expense modal ───────────────────────────── */}
      <ExpenseModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditRecord(null); }}
        editRecord={editRecord}
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
