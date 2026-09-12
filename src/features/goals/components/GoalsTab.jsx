import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Button, Progress, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, Popconfirm, Empty, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, FlagOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { selectCan, setUnlockPromptOpen } from '../../expenses/expensesSlice';

const { Option } = Select;
const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => m ? `${SHORT[parseInt(m.split('-')[1], 10) - 1]} ${m.split('-')[0]}` : '—';

export default function GoalsTab() {
  const dispatch = useDispatch();
  const goals = useSelector(s => s.expenses.goals) || [];
  const categories = useSelector(s => s.expenses.categories) || [];
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const can = useSelector(selectCan);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null); // null | 'new' | goal
  const fmt = (n) => (hideAmounts || n === null || n === undefined) ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');

  const mutate = (action) => (can.config ? dispatch(action) : dispatch(setUnlockPromptOpen(true)));

  const openNew = () => {
    if (!can.config) { dispatch(setUnlockPromptOpen(true)); return; }
    form.resetFields();
    form.setFieldsValue({ expected_annual_rate: 8, starting_amount: 0 });
    setEditing('new');
  };
  const openEdit = (g) => {
    if (!can.config) { dispatch(setUnlockPromptOpen(true)); return; }
    form.setFieldsValue({
      name: g.name, category_id: g.category_id, target_amount: g.target_amount,
      target_month: g.target_month ? dayjs(g.target_month, 'YYYY-MM') : null,
      expected_annual_rate: g.expected_annual_rate ?? 0, starting_amount: g.starting_amount ?? 0,
    });
    setEditing(g);
  };
  const submit = (values) => {
    const payload = {
      name: values.name.trim(),
      category_id: values.category_id || null,
      target_amount: values.target_amount,
      target_month: values.target_month ? values.target_month.format('YYYY-MM') : null,
      expected_annual_rate: values.expected_annual_rate ?? null,
      starting_amount: values.starting_amount ?? 0,
    };
    if (editing === 'new') mutate({ type: 'expenses/createGoal', payload });
    else mutate({ type: 'expenses/updateGoal', payload: { id: editing.id, patch: payload } });
    setEditing(null);
  };

  const savingCats = [...categories].filter(c => !c.archived).sort((a, b) => (a.type === 'Saving' ? -1 : 1) - (b.type === 'Saving' ? -1 : 1) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-dark-card border-dark-border text-white shadow-xl">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="text-lg font-bold"><FlagOutlined /> Savings goals</div>
            <div className="text-xs text-gray-400">Progress comes from the linked category's recorded amounts; projections use your last six months' average contribution.</div>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New goal</Button>
        </div>
      </Card>

      {goals.length === 0 ? (
        <Card className="bg-dark-card border-dark-border text-white shadow-xl">
          <Empty description={<span className="text-gray-400">No goals yet. Link one to a saving category such as Land Saving or MF Saving.</span>} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          {goals.map(g => (
            <Card key={g.id} className="bg-dark-card border-dark-border text-white shadow-xl"
              title={<span>{g.name} {g.onTrack === true && <Tag color="green">on track</Tag>}{g.onTrack === false && <Tag color="orange">behind</Tag>}</span>}
              extra={
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(g)} />
                  <Popconfirm title="Delete this goal?" onConfirm={() => mutate({ type: 'expenses/deleteGoal', payload: { id: g.id } })}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              }
            >
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <Progress type="circle" percent={g.progressPct} size={84} strokeColor={g.progressPct >= 100 ? '#10b981' : '#6366f1'} />
                <div style={{ flex: 1, minWidth: 0 }} className="text-sm">
                  <div><span className="text-gray-400">Saved</span> <b>{fmt(g.saved)}</b> <span className="text-gray-500">of {fmt(g.target_amount)}</span></div>
                  {g.category && <div className="text-xs text-gray-500">from {g.category}</div>}
                  <div className="text-xs text-gray-400 mt-1">Avg {fmt(g.monthlyAvg)}/month (last 6 mo)</div>
                  <div className="text-xs text-gray-400">
                    {g.progressPct >= 100 ? 'Reached 🎉' : g.projectedMonth ? `Projected ${monthLabel(g.projectedMonth)} (${g.monthsToGo} mo)` : 'No contributions yet'}
                  </div>
                  {g.target_month && (
                    <Tooltip title="Monthly amount needed from now to hit the target by the target month">
                      <div className="text-xs text-gray-400">Target {monthLabel(g.target_month)} · need <b className="text-gray-200">{fmt(g.monthlyNeeded)}</b>/mo</div>
                    </Tooltip>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing === 'new' ? 'Create goal' : 'Save'}
        title={editing === 'new' ? 'New savings goal' : 'Edit goal'}
        className="dark-modal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit} className="dark-form">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Give the goal a name' }]}>
            <Input placeholder="e.g. Land purchase, Emergency fund" maxLength={100} />
          </Form.Item>
          <Form.Item name="category_id" label="Linked category (progress source)">
            <Select allowClear showSearch optionFilterProp="children" placeholder="Pick a saving category" classNames={{ popup: { root: 'dark-dropdown' } }}>
              {savingCats.map(c => <Option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name} · {c.type}</Option>)}
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="target_amount" label="Target amount" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber min={1} style={{ width: '100%' }} controls={false} />
            </Form.Item>
            <Form.Item name="starting_amount" label="Already saved (outside the ledger)">
              <InputNumber min={0} style={{ width: '100%' }} controls={false} />
            </Form.Item>
            <Form.Item name="target_month" label="Target month (optional)">
              <DatePicker picker="month" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expected_annual_rate" label="Expected annual return %">
              <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
