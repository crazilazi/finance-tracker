import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, Upload, Table, Tag, Button, Select, Input, InputNumber, Checkbox, Radio, message, Alert } from 'antd';
import { InboxOutlined, CheckCircleOutlined, SyncOutlined, FullscreenOutlined, FullscreenExitOutlined, RocketOutlined } from '@ant-design/icons';
import { parseStatementFile } from '../../../utils/statementParser';

const { Option } = Select;

export default function StatementReconcilerModal({ open, onClose }) {
  const dispatch = useDispatch();
  const allCategories = useSelector(state => state.expenses.analytics.allCategories);
  const tableData = useSelector(state => state.expenses.tableData);
  const theme = useSelector(state => state.expenses.theme);
  const isDark = theme === 'dark';

  const knownCategories = allCategories;

  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [isMaximized, setIsMaximized] = useState(false);
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

    let addCount = 0;
    let updateCount = 0;

    activeItems.forEach(item => {
      const payload = {
        month: item.month,
        category: item.category,
        amount: parseFloat(item.amount) || 0,
        type: item.type
      };

      if (item.status === 'mismatch' && item.existingItem) {
        // Update: use the existingItem's uuid for the update action
        const uuid = item.existingItem?.uuid;
        if (uuid) {
          dispatch({ type: 'expenses/updateExpense', payload: { uuid, data: payload, oldSnapshot: item.existingItem } });
          updateCount++;
        } else {
          dispatch({ type: 'expenses/createExpense', payload });
          addCount++;
        }
      } else {
        dispatch({ type: 'expenses/createExpense', payload });
        addCount++;
      }
    });

    message.success(`Database Synced! Added ${addCount} items, updated ${updateCount} items.`);
    setItems([]);
    onClose();
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
        if (st === 'mismatch') return <Tag color="gold">🟡 Mismatch</Tag>;
        return <Tag color="default">⚪ Synced</Tag>;
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
          style={{ width: 95 }}
        />
      )
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
      render: (val, record) => (
        <Input
          size="small"
          value={val}
          onChange={e => handleFieldChange(record.id, 'category', e.target.value)}
          style={{ width: 145 }}
        />
      )
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (val, record) => (
        <Select
          size="small"
          value={val}
          onChange={v => handleFieldChange(record.id, 'type', v)}
          style={{ width: 95 }}
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
          style={{ width: 100 }}
        />
      )
    },
    {
      title: 'Statement Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc) => <span className="text-xs text-gray-400">{desc}</span>
    }
  ];

  const modalTitle = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '92%' }}>
      <span>📊 Smart Bank Statement Reconciliation Wizard</span>
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
      onCancel={() => { setItems([]); onClose(); }}
      footer={
        items.length > 0 ? [
          <Button key="reset" onClick={() => setItems([])}>
            Upload Another File
          </Button>,
          <Button
            key="sync"
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleSync}
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
          >
            Sync & Save to Database ({items.filter(i => i.checked).length} Items)
          </Button>
        ] : null
      }
      width={isMaximized ? '95%' : 820}
      className={isDark ? 'dark-modal' : ''}
      styles={{
        body: { padding: '16px 0', background: isDark ? '#161d30' : '#ffffff' },
        header: { background: isDark ? '#161d30' : '#ffffff', color: isDark ? '#ffffff' : '#000000' }
      }}
    >
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.length === 0 ? (
          <div style={{ padding: '24px 0' }}>
            <Upload.Dragger
              beforeUpload={handleFileUpload}
              showUploadList={false}
              accept=".xlsx,.xls,.csv"
              style={{ background: isDark ? '#1f293d' : '#f9fafb', border: `2px dashed ${isDark ? '#374151' : '#d1d5db'}`, borderRadius: 12, padding: 32 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 48, color: '#6366f1' }} />
              </p>
              <p style={{ fontSize: 16, fontWeight: 600, color: isDark ? '#f3f4f6' : '#1f2937' }}>
                Click or Drag Bank Statement Excel (.xlsx, .xls, .csv) here
              </p>
              <p style={{ fontSize: 13, color: isDark ? '#9ca3af' : '#6b7280', marginTop: 8 }}>
                Our AI engine automatically normalizes dates, matches narrations to existing categories, and cross-references your database!
              </p>
            </Upload.Dragger>
          </div>
        ) : (
          <div>
            {/* Header Metrics */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isDark ? '#1f293d' : '#f3f4f6', padding: '12px 16px', borderRadius: 8, marginBottom: 12 }}>
              <Radio.Group value={activeFilter} onChange={e => setActiveFilter(e.target.value)} size="small">
                <Radio.Button value="all">All ({items.length})</Radio.Button>
                <Radio.Button value="new">🟢 New ({newCount})</Radio.Button>
                <Radio.Button value="mismatch">🟡 Mismatches ({mismatchCount})</Radio.Button>
                <Radio.Button value="synced">⚪ Synced ({syncedCount})</Radio.Button>
              </Radio.Group>

              <span style={{ fontSize: 12, color: isDark ? '#9ca3af' : '#6b7280' }}>
                Double check inline values before saving
              </span>
            </div>

            {/* Reconciliation Table */}
            <Table
              dataSource={displayItems}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 6 }}
              scroll={{ y: isMaximized ? 460 : 280 }}
              size="small"
              className={isDark ? 'dark-table' : ''}
              style={{ border: `1px solid ${isDark ? '#232e4c' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden' }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
