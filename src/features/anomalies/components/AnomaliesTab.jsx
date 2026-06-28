import React from 'react';
import { useSelector } from 'react-redux';
import { Card, Row, Col } from 'antd';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function AnomaliesTab() {
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const analytics = useSelector(state => state.expenses.analytics);
  const anomalies = analytics.anomalies || [];
  const monthlyTotals = analytics.monthlyTotals || {};
  const months = analytics.months || [];

  // Anomalies already filtered by server — show them directly
  const currentAnomalies = anomalies;

  const highCount = currentAnomalies.filter(a => a.severity === 'high').length;
  const mediumCount = currentAnomalies.filter(a => a.severity === 'medium').length;
  const lowCount = currentAnomalies.filter(a => a.severity === 'low').length;

  // Timeline datasets
  const timelineData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo) - 1] + ' ' + y.slice(2);
    }),
    datasets: [
      {
        label: 'Monthly Total Spending',
        data: months.map(m => monthlyTotals[m]?.total || 0),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.07)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointRadius: months.map(m => {
          const monthAnom = currentAnomalies.filter(a => a.month === m);
          if (monthAnom.some(a => a.severity === 'high')) return 8;
          if (monthAnom.some(a => a.severity === 'medium')) return 5;
          return 2;
        }),
        pointBackgroundColor: months.map(m => {
          const monthAnom = currentAnomalies.filter(a => a.month === m);
          if (monthAnom.some(a => a.severity === 'high')) return '#ef4444';
          if (monthAnom.some(a => a.severity === 'medium')) return '#f59e0b';
          return '#6366f1';
        }),
        pointBorderWidth: 0,
        pointHoverRadius: 8
      }
    ]
  };

  const timelineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const m = months[ctx.dataIndex];
            const monthAnoms = currentAnomalies.filter(a => a.month === m);
            let label = hideAmounts ? 'Total: ₹•••••' : `Total: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`;
            if (monthAnoms.length > 0) {
              label += ` (${monthAnoms.length} Anomalies)`;
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* KPI grid */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="text-gray-400 font-semibold text-xs mb-1">🔴 Critical Spikes</div>
            <div className="text-3xl font-black text-red-500 mt-2">{highCount}</div>
            <p className="text-xs text-gray-500 mt-1">High-severity deviations from average</p>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="text-gray-400 font-semibold text-xs mb-1">🟡 Moderate Warnings</div>
            <div className="text-3xl font-black text-yellow-500 mt-2">{mediumCount}</div>
            <p className="text-xs text-gray-500 mt-1">Medium-severity spending spikes</p>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="text-gray-400 font-semibold text-xs mb-1">🔵 Missing Entries</div>
            <div className="text-3xl font-black text-blue-400 mt-2">{lowCount}</div>
            <p className="text-xs text-gray-500 mt-1">Expected entries not recorded</p>
          </Card>
        </Col>
      </Row>

      {/* Anomalies List */}
      <Card title="Anomaly Detection Log" className="bg-dark-card border-dark-border text-white shadow-xl">
        <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2">
          {currentAnomalies.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No anomalies detected in the selected period.</div>
          ) : (
            currentAnomalies.map((a, idx) => {
              const borderStyles = {
                high: 'border-l-4 border-red-500 bg-red-950/10 text-red-300',
                medium: 'border-l-4 border-yellow-500 bg-yellow-950/10 text-yellow-300',
                low: 'border-l-4 border-blue-500 bg-blue-950/10 text-blue-300'
              };
              return (
                <div key={idx} className={`p-4 rounded-lg border border-dark-border flex flex-col md:flex-row justify-between items-start md:items-center gap-2 ${borderStyles[a.severity] || borderStyles.low}`}>
                  <div className="flex-1">
                    <span className="bg-black/35 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded mr-3">
                      {a.severity}
                    </span>
                    <span className="font-semibold text-sm text-gray-100">{hideAmounts ? a.detail.replace(/₹[\d,]+/g, '₹•••••') : a.detail}</span>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-2 text-xs font-semibold text-gray-400">
                    <span>Month: {a.month}</span>
                    <span>•</span>
                    <span>Z-Score: {a.zScore}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Timeline Chart */}
      <Card title="Anomaly Timeline Overview" className="bg-dark-card border-dark-border text-white shadow-xl">
        <div className="h-[280px]">
          <Line data={timelineData} options={timelineOptions} />
        </div>
      </Card>
    </div>
  );
}
