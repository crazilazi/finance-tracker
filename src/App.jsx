import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import DashboardTab from './features/dashboard/components/DashboardTab';
import TrendsTab from './features/trends/components/TrendsTab';
import AnomaliesTab from './features/anomalies/components/AnomaliesTab';
import BreakdownTab from './features/breakdown/components/BreakdownTab';
import InsightsTab from './features/insights/components/InsightsTab';
import SimulatorTab from './features/simulator/components/SimulatorTab';
import DataTableTab from './features/expenses/components/DataTableTab';
import ExpenseModal from './features/expenses/components/ExpenseModal';
import CopyMonthModal from './features/expenses/components/CopyMonthModal';
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
  const [editIndex, setEditIndex]   = useState(null);

  useEffect(() => {
    dispatch({ type: 'expenses/checkAuthSession' });
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

  const handleEdit = (index) => {
    setEditIndex(index);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditIndex(null);
    setModalOpen(true);
  };

  const renderActiveTab = () => {
    switch (currentPage) {
      case 'dashboard':  return <DashboardTab />;
      case 'trends':     return <TrendsTab />;
      case 'anomalies':  return <AnomaliesTab />;
      case 'breakdown':  return <BreakdownTab />;
      case 'insights':   return <InsightsTab />;
      case 'simulator':  return <SimulatorTab />;
      case 'data':       return <DataTableTab onEdit={handleEdit} onCopyTemplate={() => setCopyModalOpen(true)} />;
      default:           return <DashboardTab />;
    }
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

      {/* ── Left: fixed-width sidebar ──────────────────────────── */}
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
          padding: '24px',
          background: c.BG_BASE,
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 80 }}>
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
        onClose={() => { setModalOpen(false); setEditIndex(null); }}
        editIndex={editIndex}
      />

      {/* ── Copy Month Template modal ──────────────────────────── */}
      <CopyMonthModal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
      />
    </div>
  );
}
