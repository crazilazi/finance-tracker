import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button, Select, Badge, Drawer, Switch, Input, Tooltip, Avatar, Popover } from 'antd';
import { MenuOutlined, BellOutlined, SunOutlined, MoonOutlined, EyeOutlined, EyeInvisibleOutlined, LogoutOutlined, SearchOutlined } from '@ant-design/icons';
import { setTheme, setFilter, setQuery, toggleHideAmounts } from '../../features/expenses/expensesSlice';
import { DARK } from '../ThemeProvider';
import useViewport from '../../hooks/useViewport';

const { Option } = Select;

const SMART_FILTER_HELP = (
  <div style={{ fontSize: 11, lineHeight: 1.5 }}>
    <strong>💡 Smart Filter syntax examples:</strong>
    <ul style={{ paddingLeft: 14, margin: '4px 0 0 0' }}>
      <li><code>rent</code> (matches category)</li>
      <li><code>&gt;5000</code> or <code>1000-5000</code> (matches amount)</li>
      <li><code>type:emi</code> or <code>type:saving</code></li>
      <li><code>sheet:july</code> (matches sheet name)</li>
    </ul>
  </div>
);

export default function TopBar({ setMobileOpen, palette }) {
  const dispatch    = useDispatch();
  const currentPage = useSelector(state => state.expenses.currentPage);
  const themeMode   = useSelector(state => state.expenses.theme);
  const analytics   = useSelector(state => state.expenses.analytics || {});
  const filter      = useSelector(state => state.expenses.filter);
  const query       = useSelector(state => state.expenses.query || '');
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const alerts      = analytics.alerts || [];
  const user        = useSelector(state => state.expenses.user);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // isSmall: phones. isCompact: anything narrower than ~1100px, where the
  // sidebar plus the full control cluster no longer fit side by side.
  const { isMobile: isSmall, isCompact } = useViewport();

  const c = palette || DARK;

  const uniqueMonths = analytics.allMonths || [];

  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.style.background = '#0b0f19';
      document.body.style.color      = '#f3f4f6';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.style.background = '#f0f2f8';
      document.body.style.color      = '#1e293b';
    }
  }, [themeMode]);

  const titles = {
    dashboard: ['Dashboard', 'Overview of your financial health'],
    trends:    ['Trends', 'Track spending patterns over time'],
    anomalies: ['Anomalies', 'Smart detection of unusual spending'],
    breakdown: ['Breakdown', 'Detailed category analysis'],
    insights:  ['AI Insights', 'Smart observations about your finances'],
    simulator: ['What-If SIP Simulator', 'Simulate investing your expenses in mutual funds'],
    reconcile: ['Reconcile', 'Match bank statements to your records'],
    data:      ['Data Table', 'Browse all expense records'],
  };
  const currentTitle = titles[currentPage] || ['Tracker', 'Smart analytics'];

  const alertStyle = {
    danger:  { borderLeft: '4px solid #ef4444', background: 'rgba(239,68,68,0.08)',  color: '#fca5a5' },
    warning: { borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: '#fcd34d' },
    success: { borderLeft: '4px solid #10b981', background: 'rgba(16,185,129,0.08)', color: '#6ee7b7' },
    info:    { borderLeft: '4px solid #3b82f6', background: 'rgba(59,130,246,0.08)', color: '#93c5fd' },
  };

  const iconButtonStyle = {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, flexShrink: 0,
  };

  const smartQueryInput = (
    <Input
      placeholder="🔍 Smart filter..."
      value={query}
      onChange={(e) => dispatch(setQuery(e.target.value))}
      allowClear
      autoFocus={isCompact}
      style={{ width: isCompact ? 'min(260px, 80vw)' : 190 }}
      className="smart-query-input"
    />
  );

  return (
    <>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 12px',
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(56px + env(safe-area-inset-top))',
        flexShrink: 0,
        borderBottom: `1px solid ${c.BORDER}`,
        background: c.BG_CARD,
        position: 'sticky', top: 0, zIndex: 30,
        transition: 'background 0.3s ease, border-color 0.3s ease',
        gap: 8,
      }}>

        {/* ── Left: Hamburger + Page Title ─────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 60, flex: '1 1 auto', overflow: 'hidden' }}>
          {/* Hamburger — always visible on mobile, hidden on desktop */}
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(prev => !prev)}
            style={{ color: c.TEXT_MUTED, flexShrink: 0 }}
            className="topbar-hamburger"
          />
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <h1 style={{
              margin: 0, fontWeight: 800, color: c.TEXT_BASE, lineHeight: 1.2,
              fontSize: isSmall ? 15 : 18,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentTitle[0]}
            </h1>
            {!isCompact && (
              <p style={{ margin: 0, fontSize: 11, color: c.TEXT_MUTED, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentTitle[1]}
              </p>
            )}
          </div>
        </div>

        {/* ── Right: Controls ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: isSmall ? 2 : isCompact ? 6 : 10,
          flex: '0 1 auto', minWidth: 0,
        }}>

          {/* Smart Query Search — inline on wide screens, behind an icon otherwise */}
          {isCompact ? (
            <Popover
              open={searchOpen}
              onOpenChange={setSearchOpen}
              trigger="click"
              placement="bottomRight"
              content={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {smartQueryInput}
                  {SMART_FILTER_HELP}
                </div>
              }
            >
              <Badge dot={!!query} offset={[-4, 4]}>
                <Button
                  type="text"
                  icon={<SearchOutlined style={{ fontSize: 16, color: query ? '#6366f1' : c.TEXT_MUTED }} />}
                  title="Smart filter"
                  style={iconButtonStyle}
                />
              </Badge>
            </Popover>
          ) : (
            <Tooltip title={SMART_FILTER_HELP} placement="bottomLeft">
              {smartQueryInput}
            </Tooltip>
          )}

          {/* Time/Month Filter */}
          <Select
            value={filter}
            onChange={(val) => dispatch(setFilter(val))}
            style={{ width: isSmall ? 104 : isCompact ? 130 : 170, flexShrink: 0 }}
            size={isSmall ? 'small' : 'middle'}
          >
            <Option value="all">All Time</Option>
            <Select.OptGroup label="Ranges">
              <Option value="last3">Last 3 Months</Option>
              <Option value="last6">Last 6 Months</Option>
              <Option value="last12">Last 12 Months</Option>
            </Select.OptGroup>
            <Select.OptGroup label="Years">
              <Option value="2026">2026</Option>
              <Option value="2025">2025</Option>
              <Option value="2024">2024</Option>
              <Option value="2023">2023</Option>
            </Select.OptGroup>
            <Select.OptGroup label="Months">
              {uniqueMonths.map(m => {
                const [y, mo] = m.split('-');
                const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const label = `${names[parseInt(mo) - 1]} ${y}`;
                return <Option key={m} value={m}>{label}</Option>;
              })}
            </Select.OptGroup>
          </Select>

          {/* Privacy Mode */}
          <Button
            type="text"
            icon={hideAmounts
              ? <EyeInvisibleOutlined style={{ fontSize: 16, color: c.TEXT_MUTED }} />
              : <EyeOutlined style={{ fontSize: 16, color: c.TEXT_MUTED }} />}
            onClick={() => dispatch(toggleHideAmounts())}
            title={hideAmounts ? 'Show Amounts' : 'Hide Amounts'}
            style={iconButtonStyle}
          />

          {/* Theme Toggle */}
          <Switch
            checked={themeMode === 'dark'}
            onChange={(checked) => dispatch(setTheme(checked ? 'dark' : 'light'))}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            size={isSmall ? 'small' : 'default'}
            style={{ flexShrink: 0 }}
          />

          {/* Alert Bell */}
          <Badge count={alerts.length} size="small" offset={[-2, 2]}>
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 16, color: c.TEXT_MUTED }} />}
              onClick={() => setDrawerVisible(true)}
              style={iconButtonStyle}
            />
          </Badge>

          {/* User Avatar + Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: `1px solid ${c.BORDER}`, paddingLeft: isSmall ? 4 : 8, flexShrink: 0 }}>
            <Tooltip title={isCompact ? `${user.username || 'User'}${user.email ? ` · ${user.email}` : ''}` : null}>
              <Avatar
                style={{ backgroundColor: '#6366f1', verticalAlign: 'middle', flexShrink: 0 }}
                size="small"
              >
                {user.username ? user.username[0].toUpperCase() : 'U'}
              </Avatar>
            </Tooltip>
            {!isCompact && (
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', maxWidth: 140, overflow: 'hidden' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.TEXT_BASE, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.username}
                </span>
                <span style={{ fontSize: 10, color: c.TEXT_MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email || 'authenticated'}
                </span>
              </div>
            )}
            <Tooltip title="Log Out">
              <Button
                type="text"
                icon={<LogoutOutlined style={{ color: '#ef4444' }} />}
                onClick={() => dispatch({ type: 'expenses/logout' })}
                style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
              />
            </Tooltip>
          </div>
        </div>
      </header>

      {/* ── Slide-in Notifications Drawer ──────────────────────── */}
      <Drawer
        title="🔔 Smart Alerts"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width="min(360px, 100vw)"
        styles={{ body: { padding: 16, background: c.BG_CARD }, header: { background: c.BG_CARD, borderBottom: `1px solid ${c.BORDER}` } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.length === 0 ? (
            <div style={{ textAlign: 'center', color: c.TEXT_MUTED, padding: '40px 0', fontSize: 14 }}>
              No active alerts. Your finances look stable! 🎉
            </div>
          ) : (
            alerts.map((a, idx) => {
              const s = alertStyle[a.type] || alertStyle.info;
              return (
                <div key={idx} style={{
                  ...s, padding: 16, borderRadius: 10,
                  border: `1px solid ${c.BORDER}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 6, color: c.TEXT_MUTED }}>{a.detail}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.TEXT_MUTED }}>{a.meta}</div>
                </div>
              );
            })
          )}
        </div>
      </Drawer>
    </>
  );
}