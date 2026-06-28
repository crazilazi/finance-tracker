import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setTableFilters, setCurrentPage } from '../../../features/expenses/expensesSlice';
import { Card, Row, Col, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import HealthGauge from '../../../components/ui/HealthGauge';
import Sparkline from '../../../components/ui/Sparkline';
import { pctChange } from '../../../utils/financeEngine';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

const COLORS = {
  primary: '#6366f1',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  palette: [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#14b8a6'
  ]
};

export default function DashboardTab() {
  const dispatch = useDispatch();
  const theme = useSelector(state => state.expenses.theme);
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const analytics = useSelector(state => state.expenses.analytics);
  const analyticsLoading = useSelector(state => state.expenses.analyticsLoading);

  const {
    monthlyTotals = {},
    months = [],
    categoryTotals = [],
    healthScore = 0,
    healthMetrics = { savingsRate: 0, emiBurden: 0, stability: 0, anomalyScore: 0 },
  } = analytics;

  const handleCardClick = (type) => {
    dispatch(setTableFilters({
      type,
      search: '',
      category: 'all',
      year: 'all',
      month: 'all'
    }));
    dispatch(setCurrentPage('data'));
  };

  // Compute KPI totals from analytics.monthlyTotals
  const totalIncome = months.reduce((sum, m) => {
    const inc = monthlyTotals[m]?.Income || 0;
    const tot = monthlyTotals[m]?.total || 0;
    return sum + (inc > 0 ? inc : tot);
  }, 0);

  const totalSpent = months.reduce((sum, m) => {
    return sum + (monthlyTotals[m]?.Expense || 0) + (monthlyTotals[m]?.EMI || 0);
  }, 0);

  const totalSaving = months.reduce((sum, m) => sum + (monthlyTotals[m]?.Saving || 0), 0);
  const netBalance = totalIncome - (totalSpent + totalSaving);

  // Sparklines derived from monthlyTotals
  const sparklineIncome = months.map(m => {
    const inc = monthlyTotals[m]?.Income || 0;
    return inc > 0 ? inc : (monthlyTotals[m]?.total || 0);
  });
  const sparklineTotal = months.map(m => monthlyTotals[m]?.total || 0);
  const sparklineSaving = months.map(m => monthlyTotals[m]?.Saving || 0);
  const sparklineNet = months.map(m => {
    const inc = monthlyTotals[m]?.Income || 0;
    const tot = monthlyTotals[m]?.total || 0;
    return inc > 0 ? (inc - tot) : 0;
  });

  const getMomTrend = (currArr) => {
    if (currArr.length < 2) return null;
    const curr = currArr[currArr.length - 1];
    const prev = currArr[currArr.length - 2];
    const change = pctChange(curr, prev);
    if (change.pct === '0.0') return null;
    const isUp = change.dir === 'up';
    return (
      <span className={`text-xs font-bold flex items-center gap-0.5 ${isUp ? 'text-red-400' : 'text-green-400'}`}>
        {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        {change.pct}%
      </span>
    );
  };

  // Stacked Bar
  const barData = {
    labels: months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo) - 1] + ' ' + y.slice(2);
    }),
    datasets: [
      {
        label: 'Total Income',
        data: months.map(m => {
          const inc = monthlyTotals[m]?.Income || 0;
          return inc > 0 ? inc : (monthlyTotals[m]?.total || 0);
        }),
        type: 'line',
        borderColor: '#10b981',
        borderWidth: 3,
        fill: false,
        pointBackgroundColor: '#10b981',
        pointRadius: 4,
        order: 1
      },
      { label: 'Expenses', data: months.map(m => monthlyTotals[m]?.Expense || 0), backgroundColor: COLORS.red, order: 2 },
      { label: 'EMIs', data: months.map(m => monthlyTotals[m]?.EMI || 0), backgroundColor: COLORS.blue, order: 2 },
      { label: 'Savings', data: months.map(m => monthlyTotals[m]?.Saving || 0), backgroundColor: COLORS.green, order: 2 }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.dataset.label}: ₹•••••` : `${ctx.dataset.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    onClick: (event, elements, chart) => {
      if (elements && elements.length > 0) {
        const elementIndex = elements[0].index;
        const rawLabel = chart.data.labels[elementIndex];
        const monthsMap = {
          Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
          Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        };
        const [moName, yrShort] = rawLabel.split(' ');
        const year = '20' + yrShort;
        const monthNum = monthsMap[moName];
        if (year && monthNum) {
          dispatch(setTableFilters({ year, month: monthNum, type: 'all', category: 'all', search: '' }));
          dispatch(setCurrentPage('data'));
        }
      }
    },
    scales: {
      x: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 } } },
      y: { stacked: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ca3af', font: { family: 'Inter', size: 10 }, callback: (val) => hideAmounts ? '•••••' : val } }
    }
  };

  // Donut — top 8 categories from server analytics
  const catTotals = categoryTotals.slice(0, 8);
  const donutData = {
    labels: catTotals.map(c => c[0]),
    datasets: [{ data: catTotals.map(c => c[1]), backgroundColor: COLORS.palette, borderWidth: 1, borderColor: '#161d30' }]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#9ca3af', boxWidth: 10, font: { family: 'Inter', size: 9 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => hideAmounts ? `${ctx.label}: ₹•••••` : `${ctx.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}`
        }
      }
    },
    onClick: (event, elements, chart) => {
      if (elements && elements.length > 0) {
        const category = chart.data.labels[elements[0].index];
        dispatch(setTableFilters({ category, type: 'all', search: '', year: 'all', month: 'all' }));
        dispatch(setCurrentPage('data'));
      }
    }
  };

  const formatINR = (num) => hideAmounts ? '₹•••••' : '₹' + Math.round(num).toLocaleString('en-IN');

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-gray-400 font-semibold text-xs mb-1">Total Income</div>
                <div className="text-2xl font-black text-green-400">{formatINR(totalIncome)}</div>
              </div>
              <div className="bg-green-500/10 p-2 rounded-xl text-lg text-green-400 leading-none">💵</div>
            </div>
            <div className="flex justify-between items-center mt-4">
              {getMomTrend(sparklineIncome)}
              <Sparkline data={sparklineIncome} color={COLORS.green} />
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <span onClick={() => handleCardClick('Income')} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors">
                View Details ➜
              </span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-gray-400 font-semibold text-xs mb-1">Total Outflow</div>
                <div className="text-2xl font-black text-red-400">{formatINR(totalSpent)}</div>
              </div>
              <div className="bg-red-500/10 p-2 rounded-xl text-lg text-red-400 leading-none">💰</div>
            </div>
            <div className="flex justify-between items-center mt-4">
              {getMomTrend(sparklineTotal)}
              <Sparkline data={sparklineTotal} color={COLORS.red} />
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <span onClick={() => handleCardClick('all')} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors">
                View Details ➜
              </span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-gray-400 font-semibold text-xs mb-1">Total Savings</div>
                <div className="text-2xl font-black text-blue-400">{formatINR(totalSaving)}</div>
              </div>
              <div className="bg-blue-500/10 p-2 rounded-xl text-lg text-blue-400 leading-none">🐷</div>
            </div>
            <div className="flex justify-between items-center mt-4">
              {getMomTrend(sparklineSaving)}
              <Sparkline data={sparklineSaving} color={COLORS.primary} />
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <span onClick={() => handleCardClick('Saving')} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors">
                View Details ➜
              </span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card className="bg-dark-card border-dark-border text-white shadow-xl hover:-translate-y-0.5 transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-gray-400 font-semibold text-xs mb-1">Net Balance</div>
                <div className={`text-2xl font-black ${netBalance >= 0 ? 'text-cyan-400' : 'text-orange-500'}`}>{formatINR(netBalance)}</div>
              </div>
              <div className="bg-cyan-500/10 p-2 rounded-xl text-lg text-cyan-400 leading-none">⚖️</div>
            </div>
            <div className="flex justify-between items-center mt-4">
              {getMomTrend(sparklineNet)}
              <Sparkline data={sparklineNet} color={COLORS.cyan} />
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <span onClick={() => handleCardClick('all')} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer transition-colors">
                View Details ➜
              </span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Monthly Spending Overview" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="h-[280px]">
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Category Distribution (Top 8)" className="bg-dark-card border-dark-border text-white shadow-xl">
            <div className="h-[280px]">
              {catTotals.length > 0 ? <Doughnut data={donutData} options={donutOptions} /> : (
                <div className="flex items-center justify-center h-full text-gray-500">No data</div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Health Score Gauge */}
      <Card title="💓 Financial Health Index" className="bg-dark-card border-dark-border text-white shadow-xl">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={8} className="flex justify-center">
            <HealthGauge score={healthScore} />
          </Col>
          <Col xs={24} md={16}>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-400 mb-1">
                  <span>Savings Rate (Benchmark: 15%+)</span>
                  <span className="text-green-400 font-bold">{healthMetrics.savingsRate}%</span>
                </div>
                <Progress percent={Math.min(100, (healthMetrics.savingsRate / 15) * 100)} showInfo={false} strokeColor={COLORS.green} trailColor="rgba(255,255,255,0.05)" />
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-400 mb-1">
                  <span>EMI Burden Ratio (Target: Under 30%)</span>
                  <span className={`font-bold ${healthMetrics.emiBurden > 30 ? 'text-red-400' : 'text-blue-400'}`}>{healthMetrics.emiBurden}%</span>
                </div>
                <Progress percent={Math.min(100, healthMetrics.emiBurden)} showInfo={false} strokeColor={healthMetrics.emiBurden > 30 ? COLORS.red : COLORS.blue} trailColor="rgba(255,255,255,0.05)" />
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-400 mb-1">
                  <span>Spending Stability Index</span>
                  <span className="text-indigo-400 font-bold">{healthMetrics.stability}%</span>
                </div>
                <Progress percent={healthMetrics.stability} showInfo={false} strokeColor={COLORS.primary} trailColor="rgba(255,255,255,0.05)" />
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-400 mb-1">
                  <span>Anomaly Safety Score</span>
                  <span className="text-yellow-400 font-bold">{healthMetrics.anomalyScore}%</span>
                </div>
                <Progress percent={healthMetrics.anomalyScore} showInfo={false} strokeColor={COLORS.yellow} trailColor="rgba(255,255,255,0.05)" />
              </div>
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
