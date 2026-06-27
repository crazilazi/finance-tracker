import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Modal, Select, Table, Tag, Button, Card, Row, Col, Alert, Tooltip } from 'antd';
import { SearchOutlined, AlertOutlined, CheckCircleOutlined, CopyOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';

const { Option } = Select;

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MissingScannerModal({ open, onClose, onOpenCopyTemplate }) {
  const rawData = useSelector(state => state.expenses.rawData);
  const theme = useSelector(state => state.expenses.theme);
  const isDark = theme === 'dark';

  const currentYear = new Date().getFullYear().toString();
  const dataYears = [...new Set(rawData.map(d => d.month.split('-')[0]))];
  if (!dataYears.includes(currentYear)) dataYears.push(currentYear);
  const years = dataYears.sort().reverse();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isMaximized, setIsMaximized] = useState(false);

  // 1. All 12 month strings for selectedYear
  const all12Months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);

  // 2. Identify completely missing months
  const missingMonths = all12Months.filter(m => !rawData.some(d => d.month === m));

  // 3. Category gap analysis
  const yearData = rawData.filter(d => d.month.startsWith(selectedYear));
  const yearCategories = [...new Set(yearData.map(d => d.category))].sort();

  const categoryGaps = yearCategories.map(cat => {
    const recordedMonths = new Set(yearData.filter(d => d.category === cat).map(d => d.month));
    const missing = all12Months.filter(m => !recordedMonths.has(m));
    return {
      key: cat,
      category: cat,
      recordedCount: recordedMonths.size,
      missingCount: missing.length,
      missingMonths: missing
    };
  }).filter(item => item.missingCount > 0);

  const columns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (text) => <span className="font-semibold">{text}</span>
    },
    {
      title: 'Recorded Months',
      dataIndex: 'recordedCount',
      key: 'recordedCount',
      width: 130,
      render: (count) => <Tag color={count > 8 ? 'blue' : 'orange'}>{count} / 12 Months</Tag>
    },
    {
      title: 'Missing Months',
      dataIndex: 'missingMonths',
      key: 'missingMonths',
      render: (missing) => (
        <div className="flex flex-wrap gap-1">
          {missing.map(m => {
            const [y, mo] = m.split('-');
            const name = monthNames[parseInt(mo) - 1];
            return (
              <Tag key={m} color="volcano" className="text-xs">
                {name}
              </Tag>
            );
          })}
        </div>
      )
    },
    {
      title: 'Action',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Button
          size="small"
          type="primary"
          ghost
          icon={<CopyOutlined />}
          onClick={() => {
            onClose();
            if (onOpenCopyTemplate) onOpenCopyTemplate();
          }}
        >
          Copy Template
        </Button>
      )
    }
  ];

  const modalTitle = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '92%' }}>
      <span>🔍 Yearly Missing Expenses & Gap Scanner</span>
      <Button 
        type="text" 
        size="small" 
        onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }}
        style={{ color: isDark ? '#9ca3af' : '#4b5563', display: 'flex', alignItems: 'center', gap: 4 }}
        icon={isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
      >
        {isMaximized ? 'Minimize' : 'Maximize'}
      </Button>
    </div>
  );

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Close Audit
        </Button>
      ]}
      width={isMaximized ? '95%' : 750}
      className={isDark ? 'dark-modal' : ''}
      styles={{
        body: { padding: '16px 0', background: isDark ? '#161d30' : '#ffffff' },
        header: { background: isDark ? '#161d30' : '#ffffff', color: isDark ? '#ffffff' : '#000000' }
      }}
    >
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? '#1f293d' : '#f3f4f6', padding: '12px 16px', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#d1d5db' : '#374151' }}>Audit Target Year:</span>
            <Select
              value={selectedYear}
              onChange={val => setSelectedYear(val)}
              style={{ width: 120 }}
              popupClassName={isDark ? 'dark-dropdown' : ''}
            >
              {years.map(y => (
                <Option key={y} value={y}>{y}</Option>
              ))}
            </Select>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontSize: 12, color: missingMonths.length > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
              {missingMonths.length > 0 ? `⚠️ ${missingMonths.length} Months Missing` : '✅ All Months Active'}
            </span>
            <span style={{ fontSize: 12, color: categoryGaps.length > 0 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
              {categoryGaps.length > 0 ? `⚡ ${categoryGaps.length} Category Gaps` : '✅ No Category Gaps'}
            </span>
          </div>
        </div>

        {/* 1. Missing Months Alert / Banner */}
        {missingMonths.length > 0 ? (
          <Alert
            message={`Completely Missing Months in ${selectedYear}`}
            description={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
                {missingMonths.map(m => {
                  const [y, mo] = m.split('-');
                  const name = monthNames[parseInt(mo) - 1];
                  return (
                    <Tag key={m} color="error" style={{ padding: '4px 8px', fontSize: 12 }}>
                      {name} {y} (0 Records)
                    </Tag>
                  );
                })}
              </div>
            }
            type="error"
            showIcon
            style={{ borderRadius: 8 }}
          />
        ) : (
          <Alert
            message={`All 12 Months Recorded for ${selectedYear}`}
            description="You have active financial entries recorded across all calendar months for this year."
            type="success"
            showIcon
            style={{ borderRadius: 8 }}
          />
        )}

        {/* 2. Category Gaps Breakdown */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#f3f4f6' : '#1f2937' }}>
              📋 Recurring Category Gaps ({categoryGaps.length} categories)
            </span>
            <span style={{ fontSize: 11, color: isDark ? '#9ca3af' : '#6b7280' }}>
              Shows entries recorded in some months but missing in others
            </span>
          </div>

          <Table
            dataSource={categoryGaps}
            columns={columns}
            pagination={{ pageSize: 5 }}
            size="small"
            className={isDark ? 'dark-table' : ''}
            style={{ border: `1px solid ${isDark ? '#232e4c' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}
            locale={{ emptyText: <div style={{ padding: 16, textAlign: 'center', color: '#10b981' }}>🎉 Great job! No category gaps found for {selectedYear}.</div> }}
          />
        </div>
      </div>
    </Modal>
  );
}
