import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Card, Row, Col, Tag, Spin } from 'antd';
import {
  SafetyOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  PercentageOutlined,
  RiseOutlined,
  HistoryOutlined,
  StockOutlined,
  PieChartOutlined
} from '@ant-design/icons';
import { getMonthlyTotals, getCategoryTotals, mean, stdDev } from '../../../utils/financeEngine';

export default function InsightsTab() {
  const [rawData, setRawData] = useState(null);
  const hideAmounts = useSelector(state => state.expenses.hideAmounts);

  useEffect(() => {
    fetch('/api/expenses?pageSize=10000', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(result => setRawData(result.data || []))
      .catch(() => setRawData([]));
  }, []);

  if (rawData === null) {
    return <div className="text-center text-gray-400 py-20"><Spin size="large" /> <p className="mt-4">Crunching numbers for insights...</p></div>;
  }

  if (rawData.length === 0) {
    return <div className="text-center text-gray-400 py-10">No data available to calculate insights.</div>;
  }

  const months = [...new Set(rawData.map(d => d.month))].sort();
  const monthlyTotals = getMonthlyTotals(rawData);
  const totalSpend = rawData.reduce((sum, d) => sum + d.amount, 0);

  // 1. Top Category
  const catTotals = getCategoryTotals(rawData);
  const topCatName = catTotals[0]?.[0] || 'N/A';
  const topCatAmt = catTotals[0]?.[1] || 0;
  const topCatPct = totalSpend > 0 ? ((topCatAmt / totalSpend) * 100).toFixed(1) : 0;

  // 2. Spending Trajectory (Half 1 vs Half 2)
  const halfCount = Math.floor(months.length / 2);
  const firstHalfMonths = months.slice(0, halfCount);
  const secondHalfMonths = months.slice(halfCount);
  
  const firstHalfAvg = firstHalfMonths.length
    ? firstHalfMonths.reduce((sum, m) => sum + (monthlyTotals[m]?.total || 0), 0) / firstHalfMonths.length
    : 0;
  const secondHalfAvg = secondHalfMonths.length
    ? secondHalfMonths.reduce((sum, m) => sum + (monthlyTotals[m]?.total || 0), 0) / secondHalfMonths.length
    : 0;

  const trajectoryDiff = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;
  const trajectoryDir = trajectoryDiff > 0 ? 'increase' : 'decrease';

  // 3. Volatility (Max StdDev Category)
  const categories = [...new Set(rawData.map(d => d.category))];
  let mostVolatileCat = 'N/A';
  let maxStdDev = 0;
  
  categories.forEach(cat => {
    const catAmounts = rawData.filter(d => d.category === cat).map(d => d.amount);
    if (catAmounts.length >= 3) {
      const dev = stdDev(catAmounts);
      if (dev > maxStdDev) {
        maxStdDev = dev;
        mostVolatileCat = cat;
      }
    }
  });

  // 4. Savings Rate Benchmark
  const totalSaving = rawData.filter(d => d.type === 'Saving').reduce((s, d) => s + d.amount, 0);
  const overallSavingsRate = totalSpend > 0 ? (totalSaving / totalSpend) * 100 : 0;
  
  let savingsTagColor = 'red';
  let savingsStatus = 'Low';
  if (overallSavingsRate >= 15) {
    savingsTagColor = 'green';
    savingsStatus = 'Excellent';
  } else if (overallSavingsRate >= 10) {
    savingsTagColor = 'gold';
    savingsStatus = 'Healthy';
  }

  // 5. CC Burden
  const ccSpend = rawData
    .filter(d => d.category.toLowerCase().includes('cc') || d.category.toLowerCase().includes('credit'))
    .reduce((s, d) => s + d.amount, 0);
  const ccRatio = totalSpend > 0 ? (ccSpend / totalSpend) * 100 : 0;

  // 6. EMI Burden Load
  const emiSpend = rawData.filter(d => d.type === 'EMI').reduce((s, d) => s + d.amount, 0);
  const emiRatio = totalSpend > 0 ? (emiSpend / totalSpend) * 100 : 0;

  // 7. Month-over-Month Max Spike
  let maxSpikePct = 0;
  let maxSpikeMonth = 'N/A';
  const monthTotalsList = months.map(m => monthlyTotals[m].total);
  for (let i = 1; i < months.length; i++) {
    const prev = monthTotalsList[i - 1];
    const curr = monthTotalsList[i];
    if (prev > 0) {
      const pct = ((curr - prev) / prev) * 100;
      if (pct > maxSpikePct) {
        maxSpikePct = pct;
        maxSpikeMonth = months[i];
      }
    }
  }

  // 8. Financial Buffer
  const monthlyAvgOutflow = months.length ? totalSpend / months.length : 0;
  const bufferMonths = monthlyAvgOutflow > 0 ? totalSaving / monthlyAvgOutflow : 0;

  const formatINR = (num) => hideAmounts ? '₹•••••' : '₹' + Math.round(num).toLocaleString('en-IN');

  const insightsList = [
    {
      title: 'Top Category Spend',
      icon: <PieChartOutlined className="text-xl text-indigo-400" />,
      body: `Your single largest cumulative expense is **${topCatName}**, which totals **${formatINR(topCatAmt)}**.`,
      tag: `${topCatPct}% of total budget`,
      color: 'blue'
    },
    {
      title: 'Spending Trajectory',
      icon: <RiseOutlined className="text-xl text-purple-400" />,
      body: `Your monthly outflow has **${trajectoryDir}d** by **${Math.abs(trajectoryDiff).toFixed(1)}%** comparing the second half of the data against the first half.`,
      tag: trajectoryDiff > 0 ? 'Upward Trend' : 'Downward Trend',
      color: trajectoryDiff > 0 ? 'red' : 'green'
    },
    {
      title: 'Savings Benchmark',
      icon: <SafetyOutlined className="text-xl text-green-400" />,
      body: `Your cumulative savings rate is **${overallSavingsRate.toFixed(1)}%** of all tracked cash outflows.`,
      tag: `${savingsStatus} (${overallSavingsRate.toFixed(0)}%)`,
      color: savingsTagColor
    },
    {
      title: 'Volatility Indicator',
      icon: <WarningOutlined className="text-xl text-yellow-400" />,
      body: `The category with the most volatile monthly variance is **${mostVolatileCat}** with a standard deviation of **${formatINR(maxStdDev)}**.`,
      tag: 'High Variance',
      color: 'orange'
    },
    {
      title: 'Credit Card Ratio',
      icon: <PercentageOutlined className="text-xl text-cyan-400" />,
      body: `Your credit card bills make up **${ccRatio.toFixed(1)}%** of your total outflows, totaling **${formatINR(ccSpend)}**.`,
      tag: ccRatio > 25 ? 'High Usage' : 'Moderate Usage',
      color: ccRatio > 25 ? 'red' : 'green'
    },
    {
      title: 'Debt EMI Load',
      icon: <StockOutlined className="text-xl text-red-400" />,
      body: `Loans and EMIs constitute **${emiRatio.toFixed(1)}%** of your monthly cash flow, totaling **${formatINR(emiSpend)}**.`,
      tag: emiRatio > 35 ? 'Heavy Load' : 'Stable Load',
      color: emiRatio > 35 ? 'red' : 'green'
    },
    {
      title: 'Max Historical Spike',
      icon: <ThunderboltOutlined className="text-xl text-yellow-500" />,
      body: `The largest month-over-month spending surge occurred in **${maxSpikeMonth}**, jumping by **${maxSpikePct.toFixed(0)}%** vs the previous month.`,
      tag: 'Spike Detected',
      color: 'red'
    },
    {
      title: 'Financial Liquidity Buffer',
      icon: <HistoryOutlined className="text-xl text-teal-400" />,
      body: `Your total accumulated savings can support **${bufferMonths.toFixed(1)} months** of your average monthly spend in case of emergencies.`,
      tag: `${bufferMonths.toFixed(1)} Mo Cover`,
      color: bufferMonths >= 3 ? 'green' : 'gold'
    }
  ];

  return (
    <Row gutter={[16, 16]}>
      {insightsList.map((ins, idx) => (
        <Col xs={24} sm={12} xl={6} key={idx}>
          <Card
            className="bg-dark-card border-dark-border text-white shadow-xl h-full flex flex-col justify-between hover:border-indigo-500/50 transition-colors duration-300"
            styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: 20 } }}
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-white/5 p-2 rounded-xl flex items-center justify-center leading-none">
                  {ins.icon}
                </div>
                <h4 className="text-sm font-bold text-gray-100 m-0">{ins.title}</h4>
              </div>
              <p
                className="text-xs text-gray-300 leading-relaxed font-medium mb-4"
                dangerouslySetInnerHTML={{
                  __html: ins.body.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                }}
              />
            </div>
            <div>
              <Tag color={ins.color} className="font-bold border-none text-[10px] uppercase tracking-wider py-0.5 px-2 rounded">
                {ins.tag}
              </Tag>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
