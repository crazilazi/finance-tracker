import React, { useState } from 'react';
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

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys)
  };

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
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <Input
            placeholder="Search expenses..."
            prefix={<SearchOutlined className="text-gray-500" />}
            value={tableFilters.search}
            onChange={(e) => dispatch(setTableFilters({ search: e.target.value }))}
            className="w-full sm:w-60 search-input"
          />
          <Select
            value={tableFilters.type}
            onChange={(val) => dispatch(setTableFilters({ type: val }))}
            className="w-full sm:w-36"
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
            className="w-full sm:w-44"
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
            className="w-full sm:w-28"
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
            className="w-full sm:w-36"
            classNames={{ popup: { root: "dark-dropdown" } }}
          >
            <Option value="all">All Months</Option>
            <Option value="01">January</Option>
            <Option value="02">February</Option>
            <Option value="03">March</Option>
            <Option value="04">April</Option>
            <Option value="05">May</Option>
            <Option value="06">June</Option>
            <Option value="07">July</Option>
            <Option value="08">August</Option>
            <Option value="09">September</Option>
            <Option value="10">October</Option>
            <Option value="11">November</Option>
            <Option value="12">December</Option>
          </Select>
          {onCopyTemplate && (
            <Button
              type="primary"
              icon={<CopyOutlined />}
              onClick={onCopyTemplate}
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, height: 38 }}
            >
              Copy Month Template
            </Button>
          )}
          {onScanMissing && (
            <Button
              type="default"
              icon={<SearchOutlined />}
              onClick={onScanMissing}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #374151', color: '#f3f4f6', borderRadius: 8, height: 38 }}
            >
              Scan Missing
            </Button>
          )}
          <Button
            type="default"
            icon={<ExportOutlined />}
            onClick={handleExport}
            style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', borderRadius: 8, height: 38 }}
          >
            Export
          </Button>
          {onReconcile && (
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={onReconcile}
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, height: 38 }}
            >
              Reconcile Statement
            </Button>
          )}
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`Delete ${selectedRowKeys.length} selected items?`}
              description="Are you sure you want to delete these records?"
              onConfirm={handleBulkDelete}
              okText="Yes"
              cancelText="No"
              placement="topRight"
            >
              <span className="inline-flex">
                <Button
                  type="primary"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ borderRadius: 8, height: 38 }}
                >
                  Delete Selected ({selectedRowKeys.length})
                </Button>
              </span>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* Main Table — server-paginated */}
      <Table
        // Slice to pageSize to prevent Antd warnings during transient state updates when changing page sizes
        dataSource={tableData.slice(0, pageSize)}
        columns={columns}
        rowKey="uuid"
        rowSelection={rowSelection}
        loading={tableLoading}
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
    </Card>
  );
}
