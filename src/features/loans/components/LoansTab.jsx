import React, { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Button, Progress, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, Popconfirm, Empty, Slider, Tooltip, Collapse } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined } from '@ant-design/icons';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip as ChartTooltip, Legend, Filler } from 'chart.js';
import dayjs from 'dayjs';
import { selectCan, setUnlockPromptOpen } from '../../expenses/expensesSlice';
import { emiFor, simulatePrepayment, prepayPriority, addMonths, currentMonth } from '../../../utils/loanMath';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Legend, Filler);

const { Option } = Select;
const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel = (m) => m ? `${SHORT[parseInt(m.split('-')[1], 10) - 1]} ${m.split('-')[0].slice(2)}` : '—';

function LoanCard({ loan, fmt, can, mutate, onEdit, hideAmounts }) {
  const [simAmount, setSimAmount] = useState(0);
  const [simMonth, setSimMonth] = useState(addMonths(currentMonth(), 1));
  const [preForm] = Form.useForm();
  const closed = loan.monthsLeft === 0;

  const sim = useMemo(() => {
    if (!can.real || !simAmount || closed) return null;
    return simulatePrepayment({ ...loan }, { month: simMonth, amount: simAmount, mode: 'tenure' });
  }, [loan, simAmount, simMonth, can.real, closed]);

  const schedule = loan.schedule || [];
  const step = Math.max(1, Math.floor(schedule.length / 60));
  const chartRows = schedule.filter((_, i) => i % step === 0 || i === schedule.length - 1);
  const chartData = {
    labels: chartRows.map(r => monthLabel(r.month)),
    datasets: [{
      label: 'Outstanding', data: chartRows.map(r => r.closing), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.10)',
      fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
    }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Outstanding: ${fmt(ctx.raw)}` } } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 }, maxTicksLimit: 8 } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { size: 10 }, callback: (v) => hideAmounts ? '•••' : (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`) } },
    },
  };

  const addPrepayment = (values) => {
    mutate({ type: 'expenses/addPrepayment', payload: { loanId: loan.id, prepayment: { month: values.month.format('YYYY-MM'), amount: values.amount, mode: values.mode || 'tenure' } } });
    preForm.resetFields();
  };

  return (
    <Card
      className="bg-dark-card border-dark-border text-white shadow-xl"
      title={<span><BankOutlined /> {loan.name} {closed ? <Tag color="green">closed</Tag> : <Tag>{loan.annualRate}% · {loan.tenureMonths} mo</Tag>}{loan.category && <Tag color="blue">{loan.category}</Tag>}</span>}
      extra={
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(loan)} />
          <Popconfirm title="Remove this loan?" onConfirm={() => mutate({ type: 'expenses/deleteLoan', payload: { id: loan.id } })}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[
          ['Outstanding', fmt(loan.outstanding), 'text-orange-400'],
          ['EMI', fmt(loan.emi), ''],
          ['Months left', closed ? '0' : `${loan.monthsLeft}`, ''],
          ['Payoff', monthLabel(loan.payoffMonth), ''],
          ['Interest paid', fmt(loan.interestPaid), 'text-red-300'],
          ['Total interest', fmt(loan.totalInterest), ''],
        ].map(([k, v, cls]) => (
          <div key={k} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{k}</div>
            <div className={`text-sm font-bold ${cls}`}>{v}</div>
          </div>
        ))}
      </div>
      <Progress percent={loan.progressPct} size="small" strokeColor="#f97316" railColor="rgba(255,255,255,0.06)" format={p => `${p}% repaid`} />

      {schedule.length > 0 && (
        <div style={{ height: 160, marginTop: 8 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}

      {!closed && can.real && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)' }}>
          <div className="text-xs font-bold text-gray-300 mb-1">What if I prepay {fmt(simAmount)} in {monthLabel(simMonth)}?</div>
          <Slider min={0} max={Math.max(10000, Math.round((loan.outstanding || 0) / 1000) * 1000)} step={10000} value={simAmount} onChange={setSimAmount} tooltip={{ formatter: fmt }} />
          {sim && simAmount > 0 && (
            <div className="text-sm">
              Saves <b className="text-green-400">{fmt(sim.interestSaved)}</b> in interest and <b className="text-green-400">{sim.monthsSaved} months</b>; loan closes {monthLabel(sim.withExtra.payoffMonth)} instead of {monthLabel(sim.baseline.payoffMonth)}.
            </div>
          )}
        </div>
      )}

      <Collapse ghost size="small" style={{ marginTop: 8 }} items={[{
        key: 'pre',
        label: <span className="text-xs text-gray-400">Prepayments · {loan.prepayments.length}</span>,
        children: (
          <div className="flex flex-col gap-2">
            {loan.prepayments.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="text-sm">
                <span>{monthLabel(p.month)} · <b>{fmt(p.amount)}</b> <span className="text-gray-500 text-xs">({p.mode === 'emi' ? 'reduce EMI' : 'reduce tenure'})</span></span>
                <Popconfirm title="Remove prepayment?" onConfirm={() => mutate({ type: 'expenses/deletePrepayment', payload: { loanId: loan.id, id: p.id } })}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ))}
            <Form form={preForm} layout="inline" onFinish={addPrepayment} initialValues={{ month: dayjs(), mode: 'tenure' }} style={{ gap: 8 }}>
              <Form.Item name="month" rules={[{ required: true }]}><DatePicker picker="month" size="small" /></Form.Item>
              <Form.Item name="amount" rules={[{ required: true, message: 'Amount' }]}><InputNumber size="small" min={1} placeholder="Amount" controls={false} style={{ width: 120 }} /></Form.Item>
              <Form.Item name="mode"><Select size="small" style={{ width: 130 }} classNames={{ popup: { root: 'dark-dropdown' } }}><Option value="tenure">Reduce tenure</Option><Option value="emi">Reduce EMI</Option></Select></Form.Item>
              <Form.Item><Button size="small" type="primary" htmlType="submit" icon={<PlusOutlined />}>Record</Button></Form.Item>
            </Form>
          </div>
        ),
      }]} />
    </Card>
  );
}

export default function LoansTab() {
  const dispatch = useDispatch();
  const loans = useSelector(s => s.expenses.loans) || [];
  const categories = useSelector(s => s.expenses.categories) || [];
  const hideAmounts = useSelector(s => s.expenses.hideAmounts);
  const can = useSelector(selectCan);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null);
  const fmt = (n) => (hideAmounts || n === null || n === undefined) ? '₹•••••' : '₹' + Math.round(n).toLocaleString('en-IN');
  const mutate = (action) => (can.config ? dispatch(action) : dispatch(setUnlockPromptOpen(true)));

  const openNew = () => {
    if (!can.config) { dispatch(setUnlockPromptOpen(true)); return; }
    form.resetFields();
    form.setFieldsValue({ start_month: dayjs(), annual_rate: 8.5, tenure_months: 240 });
    setEditing('new');
  };
  const openEdit = (l) => {
    if (!can.config) { dispatch(setUnlockPromptOpen(true)); return; }
    form.setFieldsValue({
      name: l.name, category_id: l.category_id, principal: l.principal, annual_rate: l.annualRate,
      tenure_months: l.tenureMonths, start_month: dayjs(l.startMonth, 'YYYY-MM'), emi_amount: l.emiAmount,
    });
    setEditing(l);
  };
  const submit = (values) => {
    const payload = {
      name: values.name.trim(), category_id: values.category_id || null, principal: values.principal,
      annual_rate: values.annual_rate, tenure_months: values.tenure_months,
      start_month: values.start_month.format('YYYY-MM'), emi_amount: values.emi_amount || null,
    };
    if (editing === 'new') mutate({ type: 'expenses/createLoan', payload });
    else mutate({ type: 'expenses/updateLoan', payload: { id: editing.id, patch: payload } });
    setEditing(null);
  };

  const active = loans.filter(l => l.monthsLeft > 0);
  const totalOutstanding = active.reduce((s, l) => s + (l.outstanding || 0), 0);
  const totalEmi = active.reduce((s, l) => s + (l.emi || 0), 0);
  const priority = can.real && active.length > 1 ? prepayPriority(active, 100000) : [];
  const emiCats = [...categories].filter(c => !c.archived).sort((a, b) => (a.type === 'EMI' ? -1 : 1) - (b.type === 'EMI' ? -1 : 1) || a.name.localeCompare(b.name));

  const watchedPrincipal = Form.useWatch('principal', form);
  const watchedRate = Form.useWatch('annual_rate', form);
  const watchedTenure = Form.useWatch('tenure_months', form);
  const computedEmi = watchedPrincipal && watchedTenure ? emiFor(watchedPrincipal, watchedRate || 0, watchedTenure) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-dark-card border-dark-border text-white shadow-xl">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="text-lg font-bold"><BankOutlined /> Loans</div>
            <div className="text-xs text-gray-400">
              {active.length > 0 ? <>Outstanding <b className="text-orange-400">{fmt(totalOutstanding)}</b> across {active.length} active loan{active.length === 1 ? '' : 's'} · EMIs {fmt(totalEmi)}/month</> : 'Track balances, payoff dates and what a prepayment would save.'}
            </div>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>Add loan</Button>
        </div>
        {priority.length > 0 && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <div className="text-xs font-bold text-gray-300 mb-1">Where a ₹1,00,000 prepayment next month saves the most</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {priority.map((p, i) => (
                <Tag key={p.loanId} color={i === 0 ? 'green' : 'default'} style={{ margin: 0 }}>
                  {i + 1}. {p.name}: saves {fmt(p.interestSaved)} · {p.monthsSaved} mo
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Card>

      {loans.length === 0 ? (
        <Card className="bg-dark-card border-dark-border text-white shadow-xl">
          <Empty description={<span className="text-gray-400">No loans yet. Add your home, car or land loan with its principal, rate and tenure.</span>} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
          {loans.map(l => <LoanCard key={l.id} loan={l} fmt={fmt} can={can} mutate={mutate} onEdit={openEdit} hideAmounts={hideAmounts} />)}
        </div>
      )}

      <Modal
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        okText={editing === 'new' ? 'Add loan' : 'Save'}
        title={editing === 'new' ? 'Add loan' : 'Edit loan'}
        className="dark-modal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit} className="dark-form">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name the loan' }]}>
            <Input placeholder="e.g. Home Loan" maxLength={100} />
          </Form.Item>
          <Form.Item name="category_id" label="EMI category in the ledger (optional)">
            <Select allowClear showSearch optionFilterProp="children" classNames={{ popup: { root: 'dark-dropdown' } }}>
              {emiCats.map(c => <Option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name} · {c.type}</Option>)}
            </Select>
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="principal" label="Principal" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber min={1} style={{ width: '100%' }} controls={false} />
            </Form.Item>
            <Form.Item name="annual_rate" label="Annual interest %" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber min={0} max={60} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="tenure_months" label="Tenure (months)" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber min={1} max={600} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="start_month" label="First EMI month" rules={[{ required: true, message: 'Required' }]}>
              <DatePicker picker="month" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="emi_amount" label={<span>EMI override <Tooltip title="Leave blank to use the standard formula"><span className="text-gray-500">(computed: {computedEmi ? fmt(computedEmi) : '—'})</span></Tooltip></span>}>
            <InputNumber min={0} style={{ width: '100%' }} controls={false} placeholder={computedEmi ? Math.round(computedEmi).toString() : ''} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
