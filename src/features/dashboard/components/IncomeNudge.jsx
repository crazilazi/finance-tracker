import React from 'react';
import { useSelector } from 'react-redux';
import { Alert, Button } from 'antd';

/**
 * Shown when no Income has been recorded in the last three months of data.
 * Without income the savings rate and Available Funds tiles are estimates.
 */
export default function IncomeNudge() {
  const analytics = useSelector(s => s.expenses.analytics);
  const can = useSelector(s => s.expenses.privacy.mode !== 'demo');
  const months = analytics.months || [];
  if (months.length === 0) return null;
  const recent = months.slice(-3);
  const hasIncome = recent.some(m => (analytics.monthlyTotals[m]?.Income || 0) > 0);
  if (hasIncome) return null;

  return (
    <Alert
      type="info"
      showIcon
      message="Add your monthly income to unlock real savings-rate and available-funds numbers"
      description="Right now the dashboard treats each month's total outflow as the income baseline. Record your salary once as an Income entry and mark it recurring; the monthly checklist will propose it from then on."
      action={
        <Button type="primary" size="small" disabled={!can}
          onClick={() => window.dispatchEvent(new CustomEvent('app:new-expense', { detail: { type: 'Income', category: 'Salary' } }))}>
          Add income
        </Button>
      }
    />
  );
}
