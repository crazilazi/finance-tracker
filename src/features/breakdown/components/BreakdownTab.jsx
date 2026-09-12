import React from 'react';
import { useSelector } from 'react-redux';
import { Card, Row, Col } from 'antd';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#10b981',
  palette: [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#14b8a6',
    '#84cc16', '#818cf8', '#a855f7', '#f43f5e', '#0ea5e9'
  ]
};

export default function BreakdownTab() {
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const analytics = useSelector(state => state.expenses.analytics);
  const { monthlyTotals = {}, months = [], categoryTotals = [] } = analytics;
  const matrix = analytics.categoryMatrix || { months: [], categories: [], values: {} };

  // Type totals from server analytics (sum across all months)
  const typeTotals = { Expense: 0, EMI: 0, Saving: 0 };
  Object.values(monthlyTotals).forEach(m => {
    typeTotals.Expense += m.Expense || 0;
    typeTotals.EMI += m.EMI || 0;
    typeTotals.Saving += m.Saving || 0;
  });

  // 1. Category Breakdown Bar Chart (Top 12) from server analytics
  const catTotals = categoryTotals.slice(0, 12);
  const barData = {
    labels: catTotals.map(c => c[0]),
    datasets: [
      {
        label: 'Total Amount (₹)',
        data: catTotals.map(c => c[1]),
        backgroundColor: COLORS.palette,
        borderRadius: 4
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.label}: ₹•••••` : `${ctx.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 9 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  // 2. Type Split Pie Chart — from server analytics typeTotals
  const pieData = {
    labels: ['Expenses', 'EMIs', 'Savings'],
    datasets: [
      {
        data: [typeTotals.Expense, typeTotals.EMI, typeTotals.Saving],
        backgroundColor: [COLORS.red, COLORS.blue, COLORS.green],
        borderWidth: 1,
        borderColor: '#161d30'
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.label}: ₹•••••` : `${ctx.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    }
  };

  // 3. Top five categories over time, from the month × category matrix
  const topCategories = catTotals.slice(0, 5).map(c => c[0]);
  const areaDatasets = topCategories.map((cat, idx) => ({
    label: cat,
    data: months.map(m => matrix.values[m]?.[cat] || 0),
    borderColor: COLORS.palette[idx % COLORS.palette.length],
    backgroundColor: `${COLORS.palette[idx % COLORS.palette.length]}1f`,
    fill: true,
    tension: 0.35,
    borderWidth: 2
  }));

  const areaData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo) - 1] + ' ' + y.slice(2);
    }),
    datasets: areaDatasets
  };

  const areaOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.dataset.label}: ₹•••••` : `${ctx.dataset.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      y: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Splits grid */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Category Breakdown (Top 12)" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="h-[280px]">
              <Bar data={barData} options={barOptions} />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Type Split (Expense / EMI / Saving)" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="h-[280px] flex justify-center items-center">
              <Pie data={pieData} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Top Categories Area Timeline */}
      <Card title="Top Spending Categories Over Time (Stacked Area)" className="bg-dark-card border-dark-border text-white shadow-xl">
        <div className="h-[300px]">
          <Line data={areaData} options={areaOptions} />
        </div>
      </Card>
    </div>
  );
}
