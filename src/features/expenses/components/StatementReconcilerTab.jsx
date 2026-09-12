import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Upload, Table, Tag, Button, Select, Input, InputNumber, Checkbox, Radio, App, Spin, Typography, Tooltip } from 'antd';
import { InboxOutlined, RocketOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import { parseStatementFile } from '../../../utils/statementParser';
import { DARK } from '../../../components/ThemeProvider';
import useViewport from '../../../hooks/useViewport';

const { Option } = Select;
const { Title, Text } = Typography;

export default function StatementReconcilerTab() {
  const { message } = App.useApp();
  const dispatch = useDispatch();
  const allCategories = useSelector(state => state.expenses.analytics.allCategories);
  const tableData = useSelector(state => state.expenses.tableData);
  const theme = useSelector(state => state.expenses.theme);
  const isDark = theme === 'dark';
  const c = isDark ? DARK : { BG_BASE: '#f9fafb', BG_CARD: '#ffffff', TEXT_BASE: '#1f2937', TEXT_MUTED: '#6b7280', BORDER: '#e5e7eb' };
  const { isMobile } = useViewport();

  const knownCategories = allCategories;

  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (file) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const reconciled = parseStatementFile(buffer, knownCategories, tableData);
        setItems(reconciled);
        message.success(`Parsed ${reconciled.length} statement rows successfully!`);
      } catch (err) {
        console.error(err);
        message.error(`Failed to parse statement: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
    return false; // prevent upload post
  };

  const handleSync = () => {
    const activeItems = items.filter(item => item.checked);
    if (activeItems.length === 0) {
      message.error('Please select at least one transaction to sync!');
      return;
    }

    const payloads = activeItems.map(item => ({
      uuid: (item.status === 'mismatch' && item.existingItem) ? item.existingItem.uuid : undefined,
      month: item.month,
      category: item.category,
      amount: parseFloat(item.amount) || 0,
      type: item.type,
      tags: item.description // map description to tags (notes)
    }));

    dispatch({ type: 'expenses/bulkSync', payload: payloads });

    message.success(`Sent ${payloads.length} items to database! They are being bulk synced.`);
    setItems([]);
  };

  const handleFieldChange = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const toggleCheck = (id, checked) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked } : item));
  };

  const toggleAll = (checked) => {
    setItems(prev => prev.map(item => ({ ...item, checked })));
  };

  // Filtered dataset for table view
  const displayItems = items.filter(item => {
    if (activeFilter === 'new') return item.status === 'new';
    if (activeFilter === 'mismatch') return item.status === 'mismatch';
    if (activeFilter === 'synced') return item.status === 'synced';
    return true;
  });

  const newCount = items.filter(i => i.status === 'new').length;
  const mismatchCount = items.filter(i => i.status === 'mismatch').length;
  const syncedCount = items.filter(i => i.status === 'synced').length;
  const checkedCount = items.filter(i => i.checked).length;

  const columns = [
    {
      title: (
        <Checkbox
          checked={displayItems.length > 0 && displayItems.every(i => i.checked)}
          indeterminate={displayItems.length > 0 && displayItems.some(i => i.checked) && !displayItems.every(i => i.checked)}
          onChange={e => toggleAll(e.target.checked)}
        />
      ),
      key: 'checked',
      width: 45,
      fixed: isMobile ? undefined : 'left',
      render: (_, record) => (
        <Checkbox
          checked={record.checked}
          onChange={e => toggleCheck(record.id, e.target.checked)}
        />
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (st) => {
        if (st === 'new') return <Tag color="green">🟢 New</Tag>;
        if (st === 'mismatch') return <Tag color="gold">🟡 Conflict</Tag>;
        return <Tag color="default">⚪ Ignored</Tag>;
      }
    },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 110,
      render: (val, record) => (
        <Input
          size="small"
          value={val}
          onChange={e => handleFieldChange(record.id, 'month', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 170,
      render: (val, record) => (
        <Input
          size="small"
          value={val}
          onChange={e => handleFieldChange(record.id, 'category', e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 115,
      render: (val, record) => (
        <Select
          size="small"
          value={val}
          onChange={v => handleFieldChange(record.id, 'type', v)}
          style={{ width: '100%' }}
          classNames={{ popup: { root: isDark ? 'dark-dropdown' : '' } }}
        >
          <Option value="Expense">Expense</Option>
          <Option value="EMI">EMI</Option>
          <Option value="Saving">Saving</Option>
          <Option value="Income">Income</Option>
        </Select>
      )
    },
    {
      title: 'Amount (₹)',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (val, record) => (
        <InputNumber
          size="small"
          value={val}
          onChange={v => handleFieldChange(record.id, 'amount', v)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: 'Statement Notes',
      dataIndex: 'description',
      key: 'description',
      ellipsis: { showTitle: false },
      render: (desc) => (
        <Tooltip title={desc} placement="topLeft">
          <span className="text-xs text-gray-400">{desc}</span>
        </Tooltip>
      )
    }
  ];

  const panelShadow = isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 4px 20px rgba(0,0,0,0.05)';

  return (
    <div style={{ animation: 'fadeIn 0.5s ease-out', color: c.TEXT_BASE }}>
      {/* Header: title on the left, actions on the right; wraps onto two rows on phones */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
        background: isDark ? '#1f293d' : '#ffffff',
        padding: isMobile ? 16 : '24px 32px', borderRadius: 16, marginBottom: isMobile ? 16 : 24,
        boxShadow: panelShadow,
        border: `1px solid ${c.BORDER}`
      }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Title level={isMobile ? 4 : 2} style={{ margin: 0, color: c.TEXT_BASE, display: 'flex', alignItems: 'center', gap: 12 }}>
            <SyncOutlined spin={loading} style={{ color: '#10b981' }} />
            Smart Reconciler
          </Title>
          <Text style={{ color: c.TEXT_MUTED, fontSize: isMobile ? 13 : 16 }}>
            Upload your bank statement and our AI will automatically match it against your custom categories.
          </Text>
        </div>

        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', width: isMobile ? '100%' : 'auto' }}>
            <Button size={isMobile ? 'middle' : 'large'} icon={<DeleteOutlined />} onClick={() => setItems([])}>
              {isMobile ? 'Clear' : 'Clear Data'}
            </Button>
            <Button
              size={isMobile ? 'middle' : 'large'}
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleSync}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
            >
              {isMobile ? `Sync (${checkedCount})` : `Sync & Save (${checkedCount} Selected)`}
            </Button>
          </div>
        )}
      </div>

      <Spin spinning={loading} size="large">
        <div style={{
          background: isDark ? '#161d30' : '#ffffff',
          padding: isMobile ? 12 : 24, borderRadius: 16,
          boxShadow: panelShadow,
          border: `1px solid ${c.BORDER}`,
          minHeight: 500
        }}>

          {items.length === 0 ? (
            <div style={{ padding: isMobile ? '32px 4px' : '64px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
              <Upload.Dragger
                beforeUpload={handleFileUpload}
                showUploadList={false}
                accept=".xlsx,.xls,.csv"
                style={{
                  background: isDark ? '#1f293d' : '#f9fafb',
                  border: `2px dashed ${isDark ? '#374151' : '#d1d5db'}`,
                  borderRadius: 16, padding: isMobile ? 20 : 48
                }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ fontSize: isMobile ? 48 : 64, color: '#10b981' }} />
                </p>
                <Title level={4} style={{ color: c.TEXT_BASE, marginTop: 16 }}>
                  {isMobile ? 'Tap to choose a statement file' : 'Drag & Drop Statement File'}
                </Title>
                <Text style={{ color: c.TEXT_MUTED }}>
                  Supports Excel (.xlsx, .xls) and CSV files. The engine automatically detects debit/credit columns, amount fields, and normalizes dates.
                </Text>
              </Upload.Dragger>
            </div>
          ) : (
            <div>
              {/* Header Metrics: filter buttons wrap; helper text hidden on phones */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 12,
                background: isDark ? '#1f293d' : '#f3f4f6',
                padding: isMobile ? '12px' : '16px 24px', borderRadius: 12, marginBottom: 16
              }}>
                <Radio.Group
                  value={activeFilter}
                  onChange={e => setActiveFilter(e.target.value)}
                  size={isMobile ? 'small' : 'middle'}
                  style={{ display: 'flex', flexWrap: 'wrap' }}
                >
                  <Radio.Button value="all">All ({items.length})</Radio.Button>
                  <Radio.Button value="new">🟢 New ({newCount})</Radio.Button>
                  <Radio.Button value="mismatch">🟡 {isMobile ? '' : 'Conflicts '}({mismatchCount})</Radio.Button>
                  <Radio.Button value="synced">⚪ {isMobile ? '' : 'Ignored '}({syncedCount})</Radio.Button>
                </Radio.Group>

                {!isMobile && (
                  <Text style={{ color: c.TEXT_MUTED }}>
                    Review and edit items inline before committing.
                  </Text>
                )}
              </div>

              {/* Reconciliation Table: scrolls horizontally when narrower than its columns */}
              <Table
                dataSource={displayItems}
                columns={columns}
                rowKey="id"
                scroll={{ x: 760 }}
                pagination={{
                  defaultPageSize: 15,
                  showSizeChanger: !isMobile,
                  simple: isMobile,
                  pageSizeOptions: ['15', '30', '50', '100', '500'],
                  showTotal: isMobile ? undefined : (total, range) => `${range[0]}-${range[1]} of ${total} items`
                }}
                size={isMobile ? 'small' : 'middle'}
                className={isDark ? 'dark-table' : ''}
                style={{ border: `1px solid ${c.BORDER}`, borderRadius: 12, overflow: 'hidden' }}
              />
            </div>
          )}
        </div>
      </Spin>
    </div>
  );
}