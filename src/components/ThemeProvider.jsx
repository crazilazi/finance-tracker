import React from 'react';
import { useSelector } from 'react-redux';
import { ConfigProvider, theme } from 'antd';

// ── Shared palette ──────────────────────────────────────────
const DARK = {
  BG_BASE:    '#0b0f19',
  BG_CARD:    '#161d30',
  BG_INPUT:   '#1f293d',
  BORDER:     '#25304b',
  TEXT_BASE:  '#f3f4f6',
  TEXT_MUTED: '#9ca3af',
  ACCENT:     '#6366f1',
};

const LIGHT = {
  BG_BASE:    '#f0f2f8',
  BG_CARD:    '#ffffff',
  BG_INPUT:   '#f9fafb',
  BORDER:     '#e2e8f0',
  TEXT_BASE:  '#1e293b',
  TEXT_MUTED: '#64748b',
  ACCENT:     '#6366f1',
};

function buildTokens(c) {
  return {
    token: {
      colorPrimary:          c.ACCENT,
      colorPrimaryHover:     '#818cf8',
      colorPrimaryActive:    '#4f46e5',
      colorPrimaryBg:        'rgba(99, 102, 241, 0.08)',
      colorPrimaryBorder:    'rgba(99, 102, 241, 0.3)',
      colorBgBase:           c.BG_CARD,
      colorBgContainer:      c.BG_CARD,
      colorBgElevated:       c.BG_INPUT,
      colorBgLayout:         c.BG_BASE,
      colorBgSpotlight:      c.BG_INPUT,
      colorBorder:           c.BORDER,
      colorBorderSecondary:  c.BORDER,
      colorSplit:            c.BORDER,
      colorText:             c.TEXT_BASE,
      colorTextSecondary:    c.TEXT_MUTED,
      colorTextTertiary:     '#6b7280',
      colorTextPlaceholder:  '#9ca3af',
      colorTextHeading:      c.TEXT_BASE,
      fontFamily:            "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize:              14,
      borderRadius:          8,
      borderRadiusLG:        12,
      borderRadiusSM:        6,
    },
    components: {
      Layout: {
        bodyBg:   c.BG_BASE,
        headerBg: c.BG_CARD,
        siderBg:  c.BG_CARD,
      },
      Card: {
        colorBgContainer:     c.BG_CARD,
        headerBg:             'transparent',
        colorBorderSecondary: c.BORDER,
        colorText:            c.TEXT_BASE,
        colorTextHeading:     c.TEXT_BASE,
      },
      Table: {
        colorBgContainer: c.BG_CARD,
        headerBg:         c.BG_INPUT,
        headerColor:      c.TEXT_MUTED,
        rowHoverBg:       c === DARK ? 'rgba(255,255,255,0.025)' : '#f8fafc',
        borderColor:      c.BORDER,
        colorText:        c.TEXT_BASE,
        footerBg:         c.BG_CARD,
      },
      Modal: {
        contentBg:  c.BG_CARD,
        headerBg:   'transparent',
        titleColor: c.TEXT_BASE,
        colorText:  c.TEXT_BASE,
      },
      Drawer: {
        colorBgElevated: c.BG_CARD,
      },
      Select: {
        optionSelectedBg: c === DARK ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)',
        colorBgContainer: c.BG_INPUT,
        colorBgElevated:  c.BG_CARD,
        colorText:        c.TEXT_BASE,
        optionActiveBg:   c === DARK ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
        selectorBg:       c.BG_INPUT,
      },
      Input: {
        colorBgContainer: c.BG_INPUT,
        colorText:        c.TEXT_BASE,
      },
      InputNumber: {
        colorBgContainer: c.BG_INPUT,
        colorText:        c.TEXT_BASE,
      },
      DatePicker: {
        colorBgContainer: c.BG_INPUT,
        colorBgElevated:  c.BG_CARD,
        colorText:        c.TEXT_BASE,
      },
      Slider: {
        railBg:           c === DARK ? '#334155' : '#e2e8f0',
        trackBg:          c.ACCENT,
        trackHoverBg:     '#818cf8',
        handleColor:      c.ACCENT,
        handleActiveColor:'#818cf8',
      },
      Collapse: {
        colorBgContainer: c.BG_CARD,
        headerBg:         c.BG_CARD,
        colorBorder:      c.BORDER,
        colorText:        c.TEXT_BASE,
      },
      Switch: {
        colorPrimary:     c.ACCENT,
        colorPrimaryHover:'#818cf8',
      },
      Progress: {
        remainingColor: c === DARK ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
      },
      Notification: {
        colorBgElevated: c.BG_CARD,
        colorText:       c.TEXT_BASE,
      },
      Popover: {
        colorBgElevated: c.BG_CARD,
        colorText:       c.TEXT_BASE,
      },
      Menu: {
        darkItemBg:           'transparent',
        darkSubMenuItemBg:    c.BG_CARD,
        darkItemColor:        c.TEXT_MUTED,
        darkItemHoverColor:   c.TEXT_BASE,
        darkItemSelectedColor:'#ffffff',
        darkItemSelectedBg:   'rgba(99,102,241,0.15)',
        darkItemHoverBg:      c === DARK ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        // Light-mode Menu
        itemBg:               'transparent',
        itemColor:            c.TEXT_MUTED,
        itemHoverColor:       c.TEXT_BASE,
        itemSelectedColor:    c.ACCENT,
        itemSelectedBg:       'rgba(99,102,241,0.1)',
        itemHoverBg:          c === DARK ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
      },
      Button: {
        defaultBg:              c.BG_CARD,
        defaultColor:           c.TEXT_BASE,
        defaultBorderColor:     c.BORDER,
        defaultHoverBorderColor:c.ACCENT,
        defaultHoverColor:      c.ACCENT,
        textHoverBg:            c === DARK ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
      },
      Pagination: {
        colorBgContainer: c.BG_CARD,
        colorPrimary:     c.ACCENT,
        colorBorder:      c.BORDER,
        colorText:        c.TEXT_BASE,
      },
      Badge: {
        colorError: '#ef4444',
      },
    },
  };
}

export default function ThemeProvider({ children }) {
  const themeMode = useSelector(state => state.expenses.theme);
  const isDark    = themeMode === 'dark';
  const palette   = isDark ? DARK : LIGHT;
  const tokens    = buildTokens(palette);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        ...tokens,
      }}
    >
      {children}
    </ConfigProvider>
  );
}

// Export palette so App can use the same values for inline styles
export { DARK, LIGHT };
