import React, { useEffect, useState, Suspense, lazy, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Spin } from 'antd';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';

const DashboardTab = lazy(() => import('./features/dashboard/components/DashboardTab'));
const TrendsTab = lazy(() => import('./features/trends/components/TrendsTab'));
const AnomaliesTab = lazy(() => import('./features/anomalies/components/AnomaliesTab'));
const BreakdownTab = lazy(() => import('./features/breakdown/components/BreakdownTab'));
const InsightsTab = lazy(() => import('./features/insights/components/InsightsTab'));
const SimulatorTab = lazy(() => import('./features/simulator/components/SimulatorTab'));
const DataTableTab = lazy(() => import('./features/expenses/components/DataTableTab'));

import ExpenseModal from './features/expenses/components/ExpenseModal';
import CopyMonthModal from './features/expenses/components/CopyMonthModal';
import MissingScannerModal from './features/expenses/components/MissingScannerModal';
import StatementReconcilerModal from './features/expenses/components/StatementReconcilerModal';
import Login from './components/Login';
import { DARK, LIGHT } from './components/ThemeProvider';
import { setCurrentPage } from './features/expenses/expensesSlice';

export default function App() {
  const dispatch    = useDispatch();
  const currentPage = useSelector(state => state.expenses.currentPage);
  const loading     = useSelector(state => state.expenses.loading);
  const themeMode   = useSelector(state => state.expenses.theme);
  const user        = useSelector(state => state.expenses.user);
  const isDark      = themeMode === 'dark';
  const c           = isDark ? DARK : LIGHT;  // active palette

  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      dispatch({ type: 'expenses/checkAuthSession' });
    }
  }, [dispatch]);

  // Sync hash routing changes to Redux and vice versa
  useEffect(() => {
    const handleHashChange = () => {
      const page = window.location.hash.replace('#/', '') || 'dashboard';
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

  const handleEdit = (record) => {
    setEditRecord(record);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditRecord(null);
    setModalOpen(true);
  };

  const renderActiveTab = () => {
    let TabComponent;
    switch (currentPage) {
      case 'dashboard':  TabComponent = <DashboardTab />; break;
      case 'trends':     TabComponent = <TrendsTab />; break;
      case 'anomalies':  TabComponent = <AnomaliesTab />; break;
      case 'breakdown':  TabComponent = <BreakdownTab />; break;
      case 'insights':   TabComponent = <InsightsTab />; break;
      case 'simulator':  TabComponent = <SimulatorTab />; break;
      case 'data':       TabComponent = <DataTableTab onEdit={handleEdit} onCopyTemplate={() => setCopyModalOpen(true)} onScanMissing={() => setScannerModalOpen(true)} onReconcile={() => setReconcileModalOpen(true)} />; break;
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
      <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 50 }}>
        <Button
          type="primary"
          shape="circle"
          icon={<PlusOutlined />}
          onClick={handleAdd}
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

      {/* ── Missing Expenses Scanner modal ─────────────────────── */}
      <MissingScannerModal
        open={scannerModalOpen}
        onClose={() => setScannerModalOpen(false)}
        onOpenCopyTemplate={() => setCopyModalOpen(true)}
      />

      {/* ── Bank Statement Reconciler modal ────────────────────── */}
      <StatementReconcilerModal
        open={reconcileModalOpen}
        onClose={() => setReconcileModalOpen(false)}
      />
    </div>
  );
}
