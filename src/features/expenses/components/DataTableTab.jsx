import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Table, Input, Select, Button, Popconfirm, Tag, Spin, App } from 'antd';
import { SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined, UndoOutlined, CopyOutlined, SyncOutlined, ExportOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import {
  setTableFilters,
  setSort,
  setDataPage,
  setPageSize,
} from '../expensesSlice';

const { Option } = Select;

export default function DataTableTab({ onEdit, onCopyTemplate, onScanMissing, onReconcile }) {
  const { message, notification } = App.useApp();
  const dispatch = useDispatch();
  const tableData = useSelector(state => state.expenses.tableData);
  const tableTotalCount = useSelector(state => state.expenses.tableTotalCount);
  const tableFilters = useSelector(state => state.expenses.tableFilters);
  const sortCol = useSelector(state => state.expenses.sortCol);
  const sortDir = useSelector(state => state.expenses.sortDir);
  const dataPage = useSelector(state => state.expenses.dataPage);
  const pageSize = useSelector(state => state.expenses.pageSize);
  const tableLoading = useSelector(state => state.expenses.tableLoading);
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const anomalies = useSelector(state => state.expenses.analytics.anomalies);
  const allCategories = useSelector(state => state.expenses.analytics.allCategories);
  const allYears = useSelector(state => state.expenses.analytics.allYears);
  const globalFilter = useSelector(state => state.expenses.filter);
  const globalQuery = useSelector(state => state.expenses.query);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys)
  };

  const selectedRows = tableData.filter(d => selectedRowKeys.includes(d.uuid));
  const sumsByType = selectedRows.reduce((acc, row) => {
    acc[row.type] = (acc[row.type] || 0) + row.amount;
    return acc;
  }, {});
  
  const totalIncome = sumsByType['Income'] || 0;
  const totalOutflow = (sumsByType['Expense'] || 0) + (sumsByType['EMI'] || 0) + (sumsByType['Saving'] || 0);
  const netSelected = totalOutflow - totalIncome;

  const formatINR = (num) => hideAmounts ? '₹•••••' : '₹' + Math.round(num).toLocaleString('en-IN');

  const formatMonth = (m) => {
    const [y, mo] = m.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(mo) - 1] + ' ' + y.slice(2);
  };

  const anomalyKeys = new Set((anomalies || []).filter(a => a.type !== 'missing').map(a => `${a.month}-${a.category}`));
  const highAnomalyKeys = new Set((anomalies || []).filter(a => a.severity === 'high').map(a => `${a.month}-${a.category}`));

  const handleDelete = (record) => {
    const key = `delete-${Date.now()}`;
    const btn = (
      <Button
        type="primary"
        size="small"
        onClick={() => {
          dispatch({ type: 'expenses/undoLast' });
          notification.destroy(key);
        }}
        icon={<UndoOutlined />}
      >
        Undo
      </Button>
    );
    dispatch({ type: 'expenses/deleteExpense', payload: { uuid: record.uuid, snapshot: record } });
    notification.success({
      title: 'Expense Deleted',
      description: `Removed ${record.category} — ${formatINR(record.amount)}`,
      actions: btn,
      key,
      duration: 5
    });
  };

  const handleBulkDelete = () => {
    // Get selected rows' UUIDs
    const uuids = selectedRowKeys.map(key => {
      const row = tableData.find(d => d.uuid === key);
      return row?.uuid;
    }).filter(Boolean);

    // Bulk delete via bulk sync with remaining items - for now dispatch individual deletes
    uuids.forEach(uuid => {
      const row = tableData.find(d => d.uuid === uuid);
      if (row) dispatch({ type: 'expenses/deleteExpense', payload: { uuid, snapshot: row } });
    });
    setSelectedRowKeys([]);
    message.success(`Successfully deleted ${uuids.length} selected records!`);
  };

  const handleExport = async () => {
    try {
      message.loading({ content: 'Generating Export...', key: 'exporting' });
      const params = new URLSearchParams({
        filter: globalFilter,
        type: tableFilters.type,
        category: tableFilters.category,
        search: tableFilters.search,
        query: globalQuery,
        sortCol,
        sortDir,
        export: 'true'
      });
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const result = await res.json();
      if (!result.data) throw new Error('No data returned');
      const ws = XLSX.utils.json_to_sheet(result.data.map(row => ({
        Month: formatMonth(row.month),
        Category: row.category,
        Type: row.type,
        Amount: row.amount
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expenses");
      XLSX.writeFile(wb, "GaddiTracker_Export.xlsx");
      message.success({ content: 'Export complete!', key: 'exporting' });
    } catch (e) {
      message.error({ content: 'Export failed: ' + e.message, key: 'exporting' });
    }
  };

  const columns = [
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      sorter: true,
      sortOrder: sortCol === 'month' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (m) => formatMonth(m)
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      sorter: true,
      sortOrder: sortCol === 'category' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      sorter: true,
      sortOrder: sortCol === 'type' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (t) => {
        const colors = { Expense: 'red', EMI: 'blue', Saving: 'green', Income: 'emerald' };
        return <Tag color={colors[t] || 'default'}>{t}</Tag>;
      }
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      sorter: true,
      sortOrder: sortCol === 'amount' ? (sortDir === 'asc' ? 'ascend' : 'descend') : null,
      render: (amt) => <span className="font-semibold text-gray-100">{formatINR(amt)}</span>
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const key = `${record.month}-${record.category}`;
        const isHigh = highAnomalyKeys.has(key);
        const isAnomaly = anomalyKeys.has(key);
        if (isHigh) return <Tag color="error">Anomaly</Tag>;
        if (isAnomaly) return <Tag color="warning">Warning</Tag>;
        return <Tag color="success">Normal</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <div className="flex gap-2">
          <Button
            type="text"
            icon={<EditOutlined className="text-gray-400 hover:text-indigo-400" />}
            onClick={() => onEdit(record)}
            className="hover:bg-gray-800"
          />
          <Popconfirm
            title="Delete Expense?"
            description="Are you sure you want to delete this record?"
            onConfirm={() => handleDelete(record)}
            okText="Yes"
            cancelText="No"
            placement="topRight"
          >
            <span className="cursor-pointer p-2 hover:bg-gray-800 rounded-md inline-flex items-center justify-center">
              <DeleteOutlined className="text-gray-400 hover:text-red-400 text-base" />
            </span>
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <Card className="bg-dark-card border-dark-border text-white shadow-xl">
      {/* Controls Bar — mobile-first: all filters wrap naturally */}
      <div className="flex flex-col gap-2 mb-5">
        {/* Filters row — wraps on mobile */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined className="text-gray-500" />}
            value={tableFilters.search}
            onChange={(e) => dispatch(setTableFilters({ search: e.target.value }))}
            style={{ flex: '1 1 140px', minWidth: 0 }}
            className="search-input"
          />
          <Select
            value={tableFilters.type}
            onChange={(val) => dispatch(setTableFilters({ type: val }))}
            style={{ flex: '1 1 100px', minWidth: 0 }}
            classNames={{ popup: { root: "dark-dropdown" } }}
          >
            <Option value="all">All Types</Option>
            <Option value="Expense">Expenses</Option>
            <Option value="EMI">EMIs</Option>
            <Option value="Saving">Savings</Option>
            <Option value="Income">Income</Option>
          </Select>
          <Select
            value={tableFilters.category}
            onChange={(val) => dispatch(setTableFilters({ category: val }))}
            style={{ flex: '1 1 130px', minWidth: 0 }}
            classNames={{ popup: { root: "dark-dropdown" } }}
            showSearch
            filterOption={(input, option) =>
              (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            <Option value="all">All Categories</Option>
            {allCategories.map(c => (
              <Option key={c} value={c}>{c}</Option>
            ))}
          </Select>
          <Select
            value={tableFilters.year}
            onChange={(val) => dispatch(setTableFilters({ year: val }))}
            style={{ flex: '0 1 90px', minWidth: 0 }}
            classNames={{ popup: { root: "dark-dropdown" } }}
          >
            <Option value="all">All Years</Option>
            {allYears.map(yr => (
              <Option key={yr} value={yr}>{yr}</Option>
            ))}
          </Select>
          <Select
            value={tableFilters.month}
            onChange={(val) => dispatch(setTableFilters({ month: val }))}
            style={{ flex: '0 1 90px', minWidth: 0 }}
            classNames={{ popup: { root: "dark-dropdown" } }}
          >
            <Option value="all">All Months</Option>
            <Option value="01">Jan</Option><Option value="02">Feb</Option>
            <Option value="03">Mar</Option><Option value="04">Apr</Option>
            <Option value="05">May</Option><Option value="06">Jun</Option>
            <Option value="07">Jul</Option><Option value="08">Aug</Option>
            <Option value="09">Sep</Option><Option value="10">Oct</Option>
            <Option value="11">Nov</Option><Option value="12">Dec</Option>
          </Select>
        </div>
        {/* Action buttons row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onCopyTemplate && (
            <Button type="primary" icon={<CopyOutlined />} onClick={onCopyTemplate}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, height: 34 }}>
              {!isMobile && 'Copy Month'}
            </Button>
          )}
          {onScanMissing && (
            <Button type="default" icon={<SearchOutlined />} onClick={onScanMissing}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 8, height: 34 }}>
              {!isMobile && 'Scan Missing'}
            </Button>
          )}
          <Button type="default" icon={<ExportOutlined />} onClick={handleExport}
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 8, height: 34 }}>
            {!isMobile && 'Export'}
          </Button>
          {onReconcile && (
            <Button type="primary" icon={<SyncOutlined />} onClick={onReconcile}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, height: 34 }}>
              {!isMobile && 'Reconcile'}
            </Button>
          )}
        </div>
      </div>

      {/* Main Table — server-paginated */}
      <Table
        dataSource={tableData.slice(0, pageSize)}
        columns={columns}
        rowKey="uuid"
        rowSelection={rowSelection}
        loading={tableLoading}
        scroll={{ x: 480 }}
        pagination={{
          current: dataPage,
          pageSize: pageSize,
          total: tableTotalCount,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100', '500'],
          showTotal: (total) => `${total} records`,
          className: 'dark-pagination'
        }}
        onChange={(pagination, filters, sorter, extra) => {
          if (extra && extra.action === 'paginate') {
            if (pagination.current !== dataPage) {
              dispatch(setDataPage(pagination.current));
            }
            if (pagination.pageSize !== pageSize) {
              dispatch(setPageSize(pagination.pageSize));
            }
          } else if (extra && extra.action === 'sort') {
            if (sorter && (sorter.columnKey || sorter.field)) {
              dispatch(setSort(sorter.columnKey || sorter.field));
            }
          }
        }}
        className="dark-table"
        locale={{ emptyText: <div className="text-gray-500">No records found.</div> }}
      />

      {/* Floating Selection Bar */}
      {selectedRowKeys.length > 0 && (
        <div
          style={{
            position: 'fixed',
            zIndex: 50,
            bottom: isMobile ? 12 : 24,
            left: isMobile ? 12 : '50%',
            right: isMobile ? 12 : 'auto',
            transform: isMobile ? 'none' : 'translateX(-50%)',
            minWidth: isMobile ? 'auto' : '480px',
            background: 'rgba(10, 15, 30, 0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
            padding: isMobile ? '10px 12px' : '12px 16px',
            animation: 'slideUpFadeFixed 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <style>{`
            @keyframes slideUpFadeFixed {
              from { opacity: 0; transform: ${isMobile ? 'translateY(20px)' : 'translateX(-50%) translateY(20px)'}; }
              to   { opacity: 1; transform: ${isMobile ? 'translateY(0)' : 'translateX(-50%) translateY(0)'}; }
            }
          `}</style>

          {/* Top Row: Summary Pill + Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            {/* Left: selection count + net flow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                fontSize: 10, fontWeight: 800, padding: '3px 8px',
                borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.06em',
                border: '1px solid rgba(99,102,241,0.3)', flexShrink: 0
              }}>
                {selectedRowKeys.length} selected
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Net Flow
                </span>
                <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1, color: netSelected < 0 ? '#34d399' : '#f9fafb' }}>
                  {netSelected < 0 ? '+' : ''}{formatINR(Math.abs(netSelected))}
                </span>
              </div>
              {!isMobile && totalOutflow > 0 && (
                <>
                  <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Spent</span>
                    <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1, color: '#f9fafb' }}>{formatINR(totalOutflow)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Right: Action buttons */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Button
                type="text"
                size="small"
                onClick={() => setSelectedRowKeys([])}
                style={{ color: '#9ca3af', borderRadius: 8, height: 30, padding: '0 10px', fontSize: 12 }}
              >
                Clear
              </Button>
              <Popconfirm
                title={`Delete ${selectedRowKeys.length} items?`}
                description="This action cannot be undone."
                onConfirm={handleBulkDelete}
                okText="Delete"
                cancelText="Cancel"
                placement="top"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="primary" danger icon={<DeleteOutlined />}
                  size="small"
                  style={{ borderRadius: 8, height: 30, padding: '0 10px', fontSize: 12 }}
                >
                  {!isMobile && 'Delete'}
                </Button>
              </Popconfirm>
            </div>
          </div>

          {/* Bottom Row: Type breakdowns */}
          {Object.keys(sumsByType).length > 0 && (
            <div style={{
              display: 'flex', gap: isMobile ? 10 : 16, marginTop: 8,
              paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)',
              flexWrap: 'wrap'
            }}>
              {isMobile && totalOutflow > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Spent</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#f9fafb' }}>{formatINR(totalOutflow)}</span>
                </div>
              )}
              {Object.entries(sumsByType).map(([type, amount]) => {
                let color = '#d1d5db';
                if (type === 'Income') color = '#34d399';
                else if (type === 'Expense') color = '#f87171';
                else if (type === 'Saving') color = '#60a5fa';
                else if (type === 'EMI') color = '#fb923c';
                return (
                  <div key={type} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{type}</span>
                    <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 700, color }}>{formatINR(amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </Card>
  );
}
