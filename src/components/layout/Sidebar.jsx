import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Menu } from 'antd';
import {
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
  const c = palette || DARK;  // fallback to dark if not passed
  const currentPage = useSelector(state => state.expenses.currentPage);
  const anomalies   = useSelector(state => state.expenses.anomalies);
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

  return (
    /* ── Plain div as the sidebar container ───────────────────── */
    <div style={{
      width: 240,
      flexShrink: 0,
      height: '100vh',
      background: c.BG_CARD,
      borderRight: `1px solid ${c.BORDER}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 40,
    }}>
      {/* Logo / Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '24px', borderBottom: `1px solid ${c.BORDER}`,
        userSelect: 'none', flexShrink: 0,
      }}>
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
          Gaddi Tracker
        </span>
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
}
