import React, { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Table, Input, InputNumber, Select, Switch, Button, Popover, Popconfirm, Tag, Modal, Tooltip, Alert } from 'antd';
import { PlusOutlined, MergeCellsOutlined, DeleteOutlined, InboxOutlined, UndoOutlined } from '@ant-design/icons';
import useViewport from '../../../hooks/useViewport';
import { selectCan, setUnlockPromptOpen } from '../../expenses/expensesSlice';

const { Option } = Select;

const EMOJIS = ['🏠','👛','🏢','⚡','🌐','🔥','🏡','🚗','💳','🛡️','📈','🏗️','💎','🍽️','🛒','🎓','💊','🎁','✈️','📱','⛽','🧾','💰','🐷','🏦','👶','🐾','🎬','🧹','🔧','💡','🚌','🏥','🎉','📚','🧘'];
const TYPES = ['Expense', 'EMI', 'Saving', 'Income'];
const TYPE_COLORS = { Expense: 'red', EMI: 'blue', Saving: 'green', Income: 'cyan' };
const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => m ? `${SHORT[parseInt(m.split('-')[1], 10) - 1]} ${m.split('-')[0].slice(2)}` : '—';
const normKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

export default function CategoryManagerTab() {
  const dispatch = useDispatch();
  const categories = useSelector(s => s.expenses.categories);
  const loaded = useSelector(s => s.expenses.categoriesLoaded);
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const { isMobile } = useViewport();
  const can = useSelector(selectCan);
  const mutate = (action) => (can.config ? dispatch(action) : dispatch(setUnlockPromptOpen(true)));

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);      // { id, field }
  const [draft, setDraft] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Expense');

  const fmt = (n) => n === null || n === undefined ? '—' : hideAmounts ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');

  const update = (id, patch, silent = false) => mutate({ type: 'expenses/updateCategory', payload: { id, patch, silent } });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter(c => showArchived || !c.archived)
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [categories, search, showArchived]);

  // Names that differ only by case, spacing or punctuation → merge candidates
  const duplicateGroups = useMemo(() => {
    const groups = {};
    categories.filter(c => !c.archived).forEach(c => {
      const k = normKey(c.name);
      (groups[k] = groups[k] || []).push(c);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }, [categories]);

  const startEdit = (record, field) => {
    setEditing({ id: record.id, field });
    setDraft(record[field] ?? '');
  };
  const commitEdit = () => {
    if (!editing) return;
    const record = categories.find(c => c.id === editing.id);
    const { field } = editing;
    setEditing(null);
    if (!record) return;
    const value = field === 'name' ? String(draft).trim() : (draft === '' || draft === null ? null : Number(draft));
    if (field === 'name' && !value) return;
    if (value === record[field]) return;
    update(record.id, { [field]: value });
  };
  const cancelEdit = () => setEditing(null);

  const openMerge = () => {
    if (selected.length < 2) return;
    setMergeTarget(selected[0]);
    setMergeOpen(true);
  };
  const doMerge = () => {
    const sourceIds = selected.filter(id => id !== mergeTarget);
    if (!mergeTarget || sourceIds.length === 0) return;
    mutate({ type: 'expenses/mergeCategories', payload: { sourceIds, targetId: mergeTarget } });
    setMergeOpen(false);
    setSelected([]);
  };

  const createNew = () => {
    const name = newName.trim();
    if (!name) return;
    mutate({ type: 'expenses/createCategory', payload: { name, type: newType } });
    setNewName('');
  };

  const editableNumber = (record, field) => {
    const isEditing = editing?.id === record.id && editing?.field === field;
    if (isEditing) {
      return (
        <InputNumber
          size="small" autoFocus min={0} value={draft} controls={false} style={{ width: 110 }}
          onChange={setDraft}
          onPressEnter={commitEdit}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
        />
      );
    }
    return (
      <span onClick={() => startEdit(record, field)} style={{ cursor: 'text', borderBottom: '1px dashed rgba(255,255,255,0.15)' }} title="Click to edit">
        {fmt(record[field])}
      </span>
    );
  };

  const columns = [
    {
      title: '', dataIndex: 'icon', key: 'icon', width: 52,
      render: (icon, record) => (
        <Popover
          trigger="click"
          content={
            <div style={{ width: 232 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
                {EMOJIS.map(e => (
                  <span key={e} onClick={() => update(record.id, { icon: e }, true)}
                    style={{ cursor: 'pointer', fontSize: 18, textAlign: 'center', padding: 2, borderRadius: 6, background: e === icon ? 'rgba(99,102,241,0.25)' : 'transparent' }}>
                    {e}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Input size="small" placeholder="Any emoji" maxLength={4} onPressEnter={e => update(record.id, { icon: e.target.value.trim() || null }, true)} />
                <Button size="small" onClick={() => update(record.id, { icon: null }, true)}>Clear</Button>
              </div>
            </div>
          }
        >
          <span style={{ cursor: 'pointer', fontSize: 20, display: 'inline-block', width: 32, textAlign: 'center' }} title="Change icon">{icon || '•'}</span>
        </Popover>
      ),
    },
    {
      title: 'Category', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, record) => {
        const isEditing = editing?.id === record.id && editing?.field === 'name';
        if (isEditing) {
          return (
            <Input size="small" autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onPressEnter={commitEdit} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }} />
          );
        }
        return (
          <span onClick={() => startEdit(record, 'name')} style={{ cursor: 'text', fontWeight: 600, opacity: record.archived ? 0.5 : 1 }} title="Click to rename">
            {name}{record.archived && <Tag style={{ marginLeft: 6 }}>archived</Tag>}
          </span>
        );
      },
    },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 120, responsive: ['sm'],
      render: (type, record) => (
        <Select size="small" value={type} style={{ width: 100 }} onChange={v => update(record.id, { type: v })} classNames={{ popup: { root: 'dark-dropdown' } }}>
          {TYPES.map(t => <Option key={t} value={t}><Tag color={TYPE_COLORS[t]} style={{ margin: 0 }}>{t}</Tag></Option>)}
        </Select>
      ),
    },
    {
      title: <Tooltip title="Recurring categories are always proposed in the monthly checklist">Recurring</Tooltip>,
      dataIndex: 'is_recurring', key: 'rec', width: 100, align: 'center',
      render: (v, record) => <Switch size="small" checked={v} onChange={val => update(record.id, { is_recurring: val }, true)} />,
    },
    {
      title: <Tooltip title="Pre-filled amount when adding this category from the checklist">Default</Tooltip>,
      dataIndex: 'default_amount', key: 'def', width: 130, responsive: ['md'],
      render: (_, record) => editableNumber(record, 'default_amount'),
    },
    {
      title: <Tooltip title="Monthly budget (used by the budget card, Phase B)">Budget</Tooltip>,
      dataIndex: 'budget_amount', key: 'bud', width: 130, responsive: ['lg'],
      render: (_, record) => editableNumber(record, 'budget_amount'),
    },
    {
      title: 'Used', key: 'used', width: 170, responsive: ['md'],
      sorter: (a, b) => a.usage_count - b.usage_count,
      render: (_, r) => (
        <span className="text-gray-400 text-xs">
          {r.usage_count} rows{r.last_month ? ` · last ${monthLabel(r.last_month)} ${fmt(r.last_amount)}` : ''}
        </span>
      ),
    },
    {
      title: '', key: 'actions', width: 90, align: 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Tooltip title={r.archived ? 'Unarchive' : 'Archive (hide from checklist and dropdowns)'}>
            <Button size="small" type="text" icon={r.archived ? <UndoOutlined /> : <InboxOutlined />} onClick={() => update(r.id, { archived: !r.archived })} />
          </Tooltip>
          {r.usage_count === 0 && (
            <Popconfirm title="Delete this unused category?" onConfirm={() => mutate({ type: 'expenses/deleteCategory', payload: { id: r.id } })}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  const selectedRecords = categories.filter(c => selected.includes(c.id));

  return (
    <div className="flex flex-col gap-4">
      {duplicateGroups.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${duplicateGroups.length} possible duplicate ${duplicateGroups.length === 1 ? 'group' : 'groups'}`}
          description={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {duplicateGroups.map((g, i) => (
                <Button key={i} size="small" onClick={() => { setSelected(g.map(c => c.id)); setMergeTarget(g[0].id); setMergeOpen(true); }}>
                  Merge {g.map(c => `"${c.name}"`).join(' + ')}
                </Button>
              ))}
            </div>
          }
        />
      )}

      <Card className="bg-dark-card border-dark-border text-white shadow-xl">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <Input placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ flex: '1 1 180px', minWidth: 0 }} />
          <span className="text-xs text-gray-400" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Switch size="small" checked={showArchived} onChange={setShowArchived} /> show archived
          </span>
          <Button icon={<MergeCellsOutlined />} disabled={selected.length < 2} onClick={openMerge}>
            {isMobile ? `Merge (${selected.length})` : `Merge selected (${selected.length})`}
          </Button>
          <div style={{ display: 'flex', gap: 6, flex: '1 1 260px', justifyContent: 'flex-end' }}>
            <Input placeholder="New category" value={newName} onChange={e => setNewName(e.target.value)} onPressEnter={createNew} style={{ maxWidth: 200 }} />
            <Select value={newType} onChange={setNewType} style={{ width: 100 }} classNames={{ popup: { root: 'dark-dropdown' } }}>
              {TYPES.map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={createNew} disabled={!newName.trim()}>{!isMobile && 'Add'}</Button>
          </div>
        </div>

        <Table
          dataSource={visible}
          columns={columns}
          rowKey="id"
          loading={!loaded}
          size="small"
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
          scroll={{ x: 720 }}
          className="dark-table"
          locale={{ emptyText: <div className="text-gray-500">No categories yet. Add one above or record an expense.</div> }}
        />
      </Card>

      <Modal
        open={mergeOpen}
        onCancel={() => setMergeOpen(false)}
        onOk={doMerge}
        okText="Merge"
        okButtonProps={{ danger: true, disabled: !mergeTarget }}
        title="Merge categories"
        className="dark-modal"
      >
        <p className="text-sm text-gray-300">
          All expenses of the other selected categories will move into the target, and those categories will be deleted. This cannot be undone.
        </p>
        <div style={{ marginBottom: 8 }} className="text-xs text-gray-400">Keep:</div>
        <Select value={mergeTarget} onChange={setMergeTarget} style={{ width: '100%' }} classNames={{ popup: { root: 'dark-dropdown' } }}>
          {selectedRecords.map(c => (
            <Option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name} · {c.type} · {c.usage_count} rows</Option>
          ))}
        </Select>
        <div style={{ marginTop: 12 }} className="text-xs text-gray-400">
          Will be merged away: {selectedRecords.filter(c => c.id !== mergeTarget).map(c => c.name).join(', ') || '—'}
        </div>
      </Modal>
    </div>
  );
}
