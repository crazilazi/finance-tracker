import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, Select, Input, Checkbox, Table, Button, Form, message } from 'antd';
import { copyMonthExpenses } from '../expensesSlice';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';

const { Option } = Select;

export default function CopyMonthModal({ open, onClose }) {
  const dispatch = useDispatch();
  const rawData = useSelector(state => state.expenses.rawData);
  const theme = useSelector(state => state.expenses.theme);
  const isDark = theme === 'dark';

  const [sourceMonth, setSourceMonth] = useState(null);
  const [targetMonth, setTargetMonth] = useState('');
  const [items, setItems] = useState([]);
  const [isMaximized, setIsMaximized] = useState(false);

  // Extract unique months descending
  const uniqueMonths = [...new Set(rawData.map(d => d.month))].sort().reverse();

  // Populate items when source month changes
  useEffect(() => {
    if (sourceMonth) {
      const sourceData = rawData.filter(d => d.month === sourceMonth);
      setItems(
        sourceData.map((d, idx) => ({
          key: idx,
          id: idx,
          category: d.category,
          amount: d.amount,
          type: d.type,
          sheet: d.sheet,
          checked: true,
        }))
      );
    } else {
      setItems([]);
    }
  }, [sourceMonth, rawData]);

  // Handle saving
  const handleSave = () => {
    if (!sourceMonth) {
      message.error('Please select a source month');
      return;
    }
    if (!targetMonth) {
      message.error('Please select or specify a target month');
      return;
    }
    // Validate target month format: YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      message.error('Target month must be in YYYY-MM format (e.g. 2026-06)');
      return;
    }

    const activeItems = items.filter(item => item.checked);
    if (activeItems.length === 0) {
      message.error('Please check at least one item to copy');
      return;
    }

    // Dispatch the action
    dispatch(
      copyMonthExpenses({
        targetMonth,
        items: activeItems.map(item => ({
          category: item.category,
          amount: parseFloat(item.amount) || 0,
          type: item.type,
          sheet: item.sheet,
        })),
      })
    );

    message.success(`Copied template to ${targetMonth} successfully!`);
    onClose();
  };

  const handleAmountChange = (id, value) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, amount: value } : item))
    );
  };

  const handleCheckChange = (id, checked) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, checked } : item))
    );
  };

  const toggleAll = (checked) => {
    setItems(prev => prev.map(item => ({ ...item, checked })));
  };

  const columns = [
    {
      title: (
        <Checkbox
          checked={items.length > 0 && items.every(item => item.checked)}
          indeterminate={items.length > 0 && items.some(item => item.checked) && !items.every(item => item.checked)}
          onChange={e => toggleAll(e.target.checked)}
        />
      ),
      dataIndex: 'checked',
      key: 'checked',
      width: 50,
      render: (checked, record) => (
        <Checkbox
          checked={checked}
          onChange={e => handleCheckChange(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (t) => {
        const style = {
          Expense: 'text-red-400 font-medium',
          EMI: 'text-blue-400 font-medium',
          Saving: 'text-green-400 font-medium'
        };
        return <span className={style[t] || ''}>{t}</span>;
      }
    },
    {
      title: 'Amount (₹)',
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      render: (amt, record) => (
        <Input
          type="number"
          value={amt}
          onChange={e => handleAmountChange(record.id, e.target.value)}
          size="small"
          className="bg-slate-900 text-white border-slate-700"
          style={{ width: 120 }}
          disabled={!record.checked}
        />
      ),
    },
  ];

  const modalTitle = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '92%' }}>
      <span>📋 Copy Month Expense Template</span>
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
      onOk={handleSave}
      okText="Copy & Save"
      cancelText="Cancel"
      width={isMaximized ? '95%' : 680}
      className={isDark ? 'dark-modal' : ''}
      styles={{
        body: { padding: '16px 0', background: isDark ? '#161d30' : '#ffffff' },
        header: { background: isDark ? '#161d30' : '#ffffff', color: isDark ? '#ffffff' : '#000000' }
      }}
    >
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: isDark ? '#9ca3af' : '#4b5563', marginBottom: 6 }}>
              Source Month
            </label>
            <Select
              placeholder="Select source month..."
              style={{ width: '100%' }}
              value={sourceMonth}
              onChange={val => setSourceMonth(val)}
              popupClassName={isDark ? 'dark-dropdown' : ''}
            >
              {uniqueMonths.map(m => {
                const [y, mo] = m.split('-');
                const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return (
                  <Option key={m} value={m}>
                    {names[parseInt(mo) - 1]} {y}
                  </Option>
                );
              })}
            </Select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: isDark ? '#9ca3af' : '#4b5563', marginBottom: 6 }}>
              Target Month (YYYY-MM)
            </label>
            <Input
              type="month"
              placeholder="Select target month..."
              value={targetMonth}
              onChange={e => setTargetMonth(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {sourceMonth && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#f3f4f6' : '#1f2937' }}>
                Template Preview ({items.length} items found)
              </span>
              <span style={{ fontSize: 11, color: isDark ? '#9ca3af' : '#6b7280' }}>
                Check items to copy and modify amounts as needed
              </span>
            </div>

            <Table
              dataSource={items}
              columns={columns}
              pagination={false}
              scroll={{ y: isMaximized ? 480 : 280 }}
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
