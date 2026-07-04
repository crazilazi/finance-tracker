import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Menu, Drawer } from 'antd';
import { CloseOutlined,
  PieChartOutlined,
  LineChartOutlined,
  WarningOutlined,
  PartitionOutlined,
  BulbOutlined,
  TableOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { setCurrentPage } from '../../features/expenses/expensesSlice';
import { DARK } from '../ThemeProvider';

export default function Sidebar({ mobileOpen, setMobileOpen, palette }) {
  const c = palette || DARK;
  const currentPage = useSelector(state => state.expenses.currentPage);
  const anomalies   = useSelector(state => state.expenses.analytics.anomalies || []);
  const dispatch    = useDispatch();

  const menuItems = [
    { key: 'dashboard', icon: <PieChartOutlined />, label: 'Dashboard' },
    { key: 'trends',    icon: <LineChartOutlined />, label: 'Trends' },
    {
      key: 'anomalies',
      icon: <WarningOutlined />,
      label: (
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span>Anomalies</span>
          {anomalies.length > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 99, lineHeight: 1.6
            }}>
              {anomalies.length}
            </span>
          )}
        </span>
      )
    },
    { key: 'breakdown', icon: <PartitionOutlined />, label: 'Breakdown' },
    { key: 'insights',  icon: <BulbOutlined />,     label: 'AI Insights' },
    { key: 'simulator', icon: <RocketOutlined />,   label: 'What-If SIP' },
    { key: 'data',      icon: <TableOutlined />,    label: 'Data Table' },
  ];

  const handleMenuClick = ({ key }) => {
    dispatch(setCurrentPage(key));
    if (setMobileOpen) setMobileOpen(false);
  };

  const SidebarContent = () => (
    <div style={{
      width: '100%',
      height: '100%',
      background: c.BG_CARD,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Logo / Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', borderBottom: `1px solid ${c.BORDER}`,
        userSelect: 'none', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 18,
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}>
            ₹
          </div>
          <span style={{ color: c.TEXT_BASE, fontWeight: 700, fontSize: 17, letterSpacing: '0.05em' }}>
            Finance Tracker
          </span>
        </div>
        {/* Close button — only shown inside the mobile Drawer */}
        {mobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: c.TEXT_MUTED, fontSize: 18, padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CloseOutlined />
          </button>
        )}
      </div>

      {/* Nav Menu — fills remaining height */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          theme={c === DARK ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ background: 'transparent', border: 'none', paddingTop: 16 }}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: always-visible sidebar ─────────────────────── */}
      <div
        className="sidebar-desktop"
        style={{
          width: 240,
          flexShrink: 0,
          height: '100vh',
          background: c.BG_CARD,
          borderRight: `1px solid ${c.BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 40,
        }}
      >
        <SidebarContent />
      </div>

      {/* ── Mobile: slide-over Drawer ───────────────────────────── */}
      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        closable={false}
        className="sidebar-mobile-drawer"
        styles={{
          body: { padding: 0, background: c.BG_CARD },
          header: { display: 'none' },
          mask: { background: 'rgba(0,0,0,0.6)' },
        }}
      >
        <SidebarContent />
      </Drawer>
    </>
  );
}
