import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Modal, Form, Input, DatePicker, InputNumber, Select, Tag, Button, Alert, Row, Col, Checkbox, AutoComplete } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { parseNLPInput, guessType } from '../../../utils/nlpParser';

const { Option } = Select;

const ICONS = {
  'Ghar Kharch': '🏠', 'Pocket Kharch': '👛', 'Room Rent': '🏢',
  'Bijali Bill': '⚡', 'Internet Bill': '🌐', 'Gas Booking': '🔥',
  'Home Loan': '🏡', 'Car Loan': '🚗', 'HDFC CC': '💳',
  'SBI CC': '💳', 'Kotak CC': '💳', 'LIC': '🛡️',
  'MF Saving': '📈', 'Land Saving': '🏗️', 'Bhima Saving': '💎'
};

const formatINR = (num) => {
  if (num === undefined || num === null) return '₹0';
  return '₹' + Math.round(num).toLocaleString('en-IN');
};

export default function ExpenseModal({ open, onClose, editRecord }) {
  const dispatch = useDispatch();
  const allCategories = useSelector(state => state.expenses.analytics.allCategories);
  const [form] = Form.useForm();
  const selectedMonth = Form.useWatch('month', form);
  const [isRangeMode, setIsRangeMode] = useState(false);

  const [nlpText, setNlpText] = useState('');
  const [nlpParsed, setNlpParsed] = useState(null);

  const isEdit = !!editRecord;

  // Extract unique categories from analytics (server-provided)
  const knownCategories = allCategories;

  // Sync edit mode pre-fill
  useEffect(() => {
    if (open) {
      setIsRangeMode(false);
      if (isEdit && editRecord) {
        form.setFieldsValue({
          month: dayjs(editRecord.month, 'YYYY-MM'),
          monthRange: null,
          amount: editRecord.amount,
          category: editRecord.category,
          type: editRecord.type,
          propagateYearly: false
        });
      } else {
        // Create Mode
        form.resetFields();
        form.setFieldsValue({
          month: dayjs(),
          monthRange: null,
          type: 'Expense',
          propagateYearly: false
        });
      }
      setNlpText('');
      setNlpParsed(null);
    }
  }, [open, editRecord, isEdit, form]);

  // NLP Parser trigger
  useEffect(() => {
    if (nlpText.trim().length >= 3) {
      const parsed = parseNLPInput(nlpText, knownCategories);
      setNlpParsed(parsed);
    } else {
      setNlpParsed(null);
    }
  }, [nlpText, knownCategories]);

  // Apply NLP Parsed data
  const handleApplyNLP = () => {
    if (nlpParsed) {
      form.setFieldsValue({
        month: dayjs(nlpParsed.month, 'YYYY-MM'),
        amount: nlpParsed.amount,
        category: nlpParsed.category,
        type: nlpParsed.type
      });
      setNlpText('');
      setNlpParsed(null);
    }
  };

  // NLP text box Enter key trigger
  const handleNlpKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nlpParsed && nlpParsed.amount && nlpParsed.category) {
        form.setFieldsValue({
          month: dayjs(nlpParsed.month, 'YYYY-MM'),
          amount: nlpParsed.amount,
          category: nlpParsed.category,
          type: nlpParsed.type
        });
        setNlpText('');
        setNlpParsed(null);
        // Wait brief millisecond for form state sync, then submit
        setTimeout(() => {
          form.submit();
        }, 150);
      }
    }
  };

  // Category Auto-type guesser
  const handleCategoryChange = (val) => {
    const type = guessType(val);
    form.setFieldsValue({ type });
  };

  // Build Top 6 Templates from known categories (static list)
  const getTemplates = () => {
    return knownCategories.slice(0, 6).map(cat => ({
      category: cat,
      amount: 5000,
      type: guessType(cat),
      icon: ICONS[cat] || '💰'
    }));
  };

  const templates = getTemplates();

  const handleApplyTemplate = (tpl) => {
    form.setFieldsValue({
      month: dayjs(),
      category: tpl.category,
      amount: tpl.amount,
      type: tpl.type
    });
  };

  // Form Submit Action
  const handleFinish = (values) => {
    const payload = {
      amount: parseFloat(values.amount),
      category: values.category.trim(),
      type: values.type
    };

    if (isRangeMode && values.monthRange) {
      // Range mode: dispatch bulkSync after building all months
      const [start, end] = values.monthRange;
      const monthsList = [];
      let current = start.startOf('month');
      const last = end.startOf('month');
      while (current.isBefore(last) || current.isSame(last, 'month')) {
        monthsList.push(current.format('YYYY-MM'));
        current = current.add(1, 'month');
      }
      // Create each month as individual expense
      monthsList.forEach(month => {
        dispatch({ type: 'expenses/createExpense', payload: { ...payload, month } });
      });
    } else if (values.propagateYearly && values.month) {
      const year = values.month.format('YYYY');
      // Create for all 12 months
      Array.from({ length: 12 }, (_, i) => {
        const month = `${year}-${String(i + 1).padStart(2, '0')}`;
        dispatch({ type: 'expenses/createExpense', payload: { ...payload, month } });
      });
    } else if (values.month) {
      const singlePayload = { ...payload, month: values.month.format('YYYY-MM') };
      if (isEdit) {
        dispatch({ type: 'expenses/updateExpense', payload: { uuid: editRecord.uuid, data: singlePayload, oldSnapshot: editRecord } });
      } else {
        dispatch({ type: 'expenses/createExpense', payload: singlePayload });
      }
    }

    onClose();
  };

  return (
    <Modal
      title={isEdit ? '✏️ Edit Expense' : '✨ Add New Expense'}
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(540px, 96vw)"
      getContainer={false}
      className="dark-modal"
      style={{
        background: '#161d30',
        borderRadius: '1rem',
        overflow: 'hidden'
      }}
    >
      <div className="flex flex-col gap-5 pt-3">
        {/* NLP Input Panel (Create Mode Only) */}
        {!isEdit && (
          <div className="flex flex-col gap-2 p-4 bg-white/5 border border-dark-border rounded-xl">
            <label className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
              <ThunderboltOutlined className="text-indigo-400" />
              Quick Smart Input
            </label>
            <Input
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              onKeyDown={handleNlpKeyDown}
              placeholder='Try: "spent 5000 on groceries in june 2026" (Press Enter to Quick Add)'
              className="nlp-input"
            />
            {nlpParsed ? (
              <div className="mt-3 flex flex-col gap-2.5 animate-fadeIn">
                <div className="text-[10px] font-bold text-green-400 flex items-center gap-1">
                  <CheckCircleOutlined /> Smart Parse Successful!
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Tag color="purple">₹{nlpParsed.amount?.toLocaleString('en-IN')}</Tag>
                  <Tag color="blue">{nlpParsed.category || '—'}</Tag>
                  <Tag color="cyan">{nlpParsed.month}</Tag>
                  <Tag color="green">{nlpParsed.type}</Tag>
                  <Button
                    type="primary"
                    size="small"
                    onClick={handleApplyNLP}
                    className="ml-auto text-xs py-0 h-6"
                  >
                    Apply & Fill ↓
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-gray-500 font-semibold flex items-center gap-1 mt-1">
                <InfoCircleOutlined /> Type naturally and we will fill the fields for you.
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        {!isEdit && (
          <div className="flex items-center text-xs text-gray-600 gap-3">
            <div className="flex-1 h-px bg-dark-border"></div>
            <span>or fill manually</span>
            <div className="flex-1 h-px bg-dark-border"></div>
          </div>
        )}

        {/* Manual Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          className="dark-form"
        >
          <Form.Item name="isRangeMode" valuePropName="checked" className="mb-3">
            <Checkbox checked={isRangeMode} onChange={(e) => setIsRangeMode(e.target.checked)}>
              <span className="text-gray-300 text-xs font-semibold">📅 Range Mode (Select multiple months)</span>
            </Checkbox>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              {isRangeMode ? (
                <Form.Item
                  name="monthRange"
                  label={<span className="text-gray-400 font-bold text-xs">Month Range</span>}
                  rules={[{ required: true, message: 'Please select month range' }]}
                >
                  <DatePicker.RangePicker picker="month" className="w-full" />
                </Form.Item>
              ) : (
                <Form.Item
                  name="month"
                  label={<span className="text-gray-400 font-bold text-xs">Month</span>}
                  rules={[{ required: true, message: 'Please select month' }]}
                >
                  <DatePicker picker="month" className="w-full" />
                </Form.Item>
              )}
            </Col>
            <Col span={12}>
              <Form.Item
                name="amount"
                label={<span className="text-gray-400 font-bold text-xs">Amount (₹)</span>}
                rules={[{ required: true, message: 'Please enter amount' }]}
              >
                <InputNumber min={0} className="w-full" placeholder="e.g. 5000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="category"
                label={<span className="text-gray-400 font-bold text-xs">Category</span>}
                rules={[{ required: true, message: 'Please enter category' }]}
              >
                <AutoComplete
                  options={knownCategories.map(cat => ({ value: cat }))}
                  placeholder="e.g. Ghar Kharch"
                  filterOption={(inputValue, option) =>
                    option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  onChange={(val) => handleCategoryChange(val)}
                  classNames={{ popup: { root: "dark-dropdown" } }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label={<span className="text-gray-400 font-bold text-xs">Type</span>}
                rules={[{ required: true }]}
              >
                <Select classNames={{ popup: { root: "dark-dropdown" } }}>
                  <Option value="Expense">💸 Expense</Option>
                  <Option value="EMI">🏦 EMI</Option>
                  <Option value="Saving">🐷 Saving</Option>
                  <Option value="Income">🟢 Income</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {!isRangeMode && (
            <Form.Item name="propagateYearly" valuePropName="checked" className="mb-4">
              <Checkbox>
                <span className="text-gray-300 text-xs font-semibold">
                  🔄 Apply / Update for all 12 months of the year ({selectedMonth ? selectedMonth.format('YYYY') : dayjs().format('YYYY')})
                </span>
              </Checkbox>
            </Form.Item>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button onClick={onClose} className="border-dark-border bg-transparent text-gray-300 hover:text-white">
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" className="bg-indigo-600 hover:bg-indigo-500 font-bold">
              {isEdit ? 'Save Changes' : 'Add Expense'}
            </Button>
          </div>
        </Form>

        {/* Templates Section (Create Mode Only) */}
        {!isEdit && templates.length > 0 && (
          <div className="border-t border-dark-border pt-4 mt-2">
            <label className="text-xs font-bold text-gray-400 mb-2.5 block">
              ⚡ One-tap Recurring
            </label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((tpl, idx) => (
                <div
                  key={idx}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-dark-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all duration-300 cursor-pointer select-none text-center"
                >
                  <span className="text-lg mb-1 leading-none">{tpl.icon}</span>
                  <span className="text-[10px] font-bold text-gray-300 truncate w-full">{tpl.category}</span>
                  <span className="text-[9px] text-gray-500 font-semibold mt-0.5">{formatINR(tpl.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
