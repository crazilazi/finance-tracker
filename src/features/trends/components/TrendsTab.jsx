import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Card, Row, Col, Select } from 'antd';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const { Option } = Select;

const COLORS = {
  primary: '#6366f1',
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  purple: '#8b5cf6',
  orange: '#f97316',
  palette: ['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
};

export default function TrendsTab() {
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const analytics = useSelector(state => state.expenses.analytics);
  const { monthlyTotals = {}, months = [], categoryTotals = [], allCategories = [], allYears = [] } = analytics;

  const [selectedCategory, setSelectedCategory] = useState('all');

  // Category Trend Data — built from analytics.monthlyTotals
  const trendLineData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo) - 1] + ' ' + y.slice(2);
    }),
    datasets: selectedCategory === 'all'
      ? ['Expense', 'EMI', 'Saving'].map((type, idx) => ({
          label: type,
          data: months.map(m => monthlyTotals[m]?.[type] || 0),
          borderColor: idx === 0 ? COLORS.red : idx === 1 ? COLORS.blue : COLORS.green,
          backgroundColor: idx === 0 ? 'rgba(239, 68, 68, 0.05)' : idx === 1 ? 'rgba(59, 130, 246, 0.05)' : 'rgba(16, 185, 129, 0.05)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }))
      : [{
          label: selectedCategory,
          data: months.map(m => {
            const cat = categoryTotals.find(c => c[0] === selectedCategory);
            // For per-category-per-month, use a simple filter on monthlyTotals
            // (For full accuracy, we'd need a separate API endpoint; for now use proxy)
            return 0; // placeholder — full category+month breakdown needs dedicated endpoint
          }),
          borderColor: COLORS.primary,
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { family: 'Inter' } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.dataset.label}: ₹•••••` : `${ctx.dataset.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  // YoY Spending Data — built from analytics.monthlyTotals for all years
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const yoyData = {
    labels: monthNamesShort,
    datasets: allYears.map((yr, idx) => ({
      label: yr,
      data: Array.from({ length: 12 }, (_, i) => {
        const mStr = `${yr}-${String(i + 1).padStart(2, '0')}`;
        return monthlyTotals[mStr]?.total || 0;
      }),
      backgroundColor: COLORS.palette[idx % COLORS.palette.length],
      borderWidth: 0,
      borderRadius: 4
    }))
  };

  const yoyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { family: 'Inter' } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.dataset.label}: ₹•••••` : `${ctx.dataset.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  // Heatmap Data — from analytics.monthlyTotals
  const heatmapRows = [];
  const allOutflows = Object.values(monthlyTotals).map(t => t.total);
  const maxSpend = Math.max(...allOutflows, 1);

  allYears.forEach(yr => {
    const monthsData = Array.from({ length: 12 }, (_, i) => {
      const mStr = `${yr}-${String(i + 1).padStart(2, '0')}`;
      return monthlyTotals[mStr]?.total || 0;
    });
    heatmapRows.push({ year: yr, data: monthsData });
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Category Trend Section */}
      <Card
        title={
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-1">
            <span className="text-white text-base">Category-wise Trend Analysis</span>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              className="w-56"
              popupClassName="dark-dropdown"
            >
              <Option value="all">All Splits (Expense/EMI/Saving)</Option>
              {allCategories.map(c => (
                <Option key={c} value={c}>{c}</Option>
              ))}
            </Select>
          </div>
        }
        className="bg-dark-card border-dark-border text-white shadow-xl"
      >
        <div className="h-[300px]">
          <Line data={trendLineData} options={lineOptions} />
        </div>
      </Card>

      {/* YoY Comparison and Heatmap */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Year-over-Year Spending Comparison" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="h-[280px]">
              <Bar data={yoyData} options={yoyOptions} />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Spending Heatmap (Month × Year)" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="flex flex-col gap-2 overflow-x-auto select-none pt-4">
              {/* Heatmap header months */}
              <div className="flex items-center min-w-[450px]">
                <div className="w-12 text-xs font-bold text-gray-500 text-left">Year</div>
                <div className="flex-1 grid grid-cols-12 gap-1 text-center font-bold text-[10px] text-gray-400">
                  {monthNamesShort.map(m => (
                    <div key={m}>{m}</div>
                  ))}
                </div>
              </div>

              {/* Heatmap rows */}
              {heatmapRows.map(row => (
                <div key={row.year} className="flex items-center min-w-[450px]">
                  <div className="w-12 text-xs font-bold text-gray-300">{row.year}</div>
                  <div className="flex-1 grid grid-cols-12 gap-1">
                    {row.data.map((val, idx) => {
                      const pct = val / maxSpend;
                      // Opacity scales from 0.05 to 0.95
                      const opacity = val > 0 ? 0.1 + pct * 0.8 : 0;
                      const tooltip = val > 0
                        ? (hideAmounts ? '₹•••••' : `₹${Math.round(val).toLocaleString('en-IN')}`)
                        : 'No Data';

                      return (
                        <div
                          key={idx}
                          title={`${monthNamesShort[idx]} ${row.year}: ${tooltip}`}
                          className="h-8 rounded flex items-center justify-center text-[9px] font-bold transition-all duration-300 border border-dark-border/20 cursor-pointer"
                          style={{
                            backgroundColor: val > 0 ? `rgba(99, 102, 241, ${opacity})` : 'rgba(255,255,255,0.02)',
                            color: opacity > 0.5 ? '#fff' : '#9ca3af'
                          }}
                        >
                          {val > 0 ? (hideAmounts ? '•••' : `${Math.round(val / 1000)}k`) : '—'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              <div className="flex justify-end gap-3 text-[10px] text-gray-500 font-semibold mt-4">
                <span>Low Spend</span>
                <div className="flex gap-0.5">
                  <div className="w-3 h-3 rounded bg-indigo-500/10"></div>
                  <div className="w-3 h-3 rounded bg-indigo-500/40"></div>
                  <div className="w-3 h-3 rounded bg-indigo-500/70"></div>
                  <div className="w-3 h-3 rounded bg-indigo-500"></div>
                </div>
                <span>High Spend</span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
