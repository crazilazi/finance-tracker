import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Row, Col, Select, Slider, Collapse } from 'antd';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { updateSimulatorState } from '../simulatorSlice';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const { Option } = Select;
const { Panel } = Collapse;

const COLORS = {
  primary: '#6366f1',
  green: '#10b981',
  blue: '#3b82f6',
  red: '#ef4444'
};

export default function SimulatorTab() {
  const dispatch = useDispatch();
  const analytics = useSelector(state => state.expenses.analytics || {});
  const { monthlyTotals = {}, months = [] } = analytics;
  const theme = useSelector(state => state.expenses.theme);
  
  // Get simulator settings
  const {
    simSource,
    simTrimPct,
    simCustomAmt,
    simFund,
    simCustomRate,
    simProjectYrs
  } = useSelector(state => state.simulator);

  const hideAmounts = useSelector(state => state.expenses.hideAmounts);
  const formatINR = (num) => hideAmounts ? '₹•••••' : '₹' + Math.round(num).toLocaleString('en-IN');
  
  const formatMonth = (m) => {
    const [y, mo] = m.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(mo) - 1] + ' ' + y.slice(2);
  };

  // ── Calculation Helper ──
  const runSimulation = () => {
    const allMonths = [...months].sort();
    if (allMonths.length === 0) return { details: [], totalPrincipal: 0, totalValue: 0, totalInterest: 0 };
    
    let R = 0.12;
    if (simFund === 'largecap') R = 0.12;
    else if (simFund === 'midcap') R = 0.15;
    else if (simFund === 'hybrid') R = 0.10;
    else if (simFund === 'debt') R = 0.06;
    else if (simFund === 'custom') R = simCustomRate / 100;
    
    const r = R / 12;
    let cumulativePrincipal = 0;
    let portfolioValue = 0;
    const details = [];
    
    // Historical period
    allMonths.forEach(m => {
      let pt = 0;
      const mData = monthlyTotals[m] || {};
      
      if (simSource === 'savings') {
        pt = mData.Saving || 0;
      } else if (simSource === 'trim') {
        const expensesTotal = mData.Expense || 0;
        pt = expensesTotal * (simTrimPct / 100);
      } else if (simSource === 'cc') {
        // Approximate CC as 20% of expenses if backend doesn't provide it
        pt = (mData.Expense || 0) * 0.2;
      } else if (simSource === 'fixed') {
        pt = simCustomAmt;
      }
      
      const prevValue = portfolioValue;
      cumulativePrincipal += pt;
      
      const valueBeforeInterest = prevValue + pt;
      const interestGained = valueBeforeInterest * r;
      portfolioValue = valueBeforeInterest + interestGained;
      
      details.push({
        month: m,
        sip: pt,
        interest: interestGained,
        cumulativePrincipal,
        cumulativeValue: portfolioValue,
        isProjection: false
      });
    });
    
    // Future projection
    const projectYrs = parseInt(simProjectYrs);
    if (projectYrs > 0) {
      const historicalSips = details.map(d => d.sip);
      const avgSip = historicalSips.length ? historicalSips.reduce((a, b) => a + b, 0) / historicalSips.length : 0;
      
      const lastMonthStr = allMonths[allMonths.length - 1];
      let [year, month] = lastMonthStr.split('-').map(Number);
      
      const totalProjMonths = projectYrs * 12;
      for (let i = 1; i <= totalProjMonths; i++) {
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
        const mStr = `${year}-${String(month).padStart(2, '0')}`;
        
        const pt = avgSip;
        const prevValue = portfolioValue;
        cumulativePrincipal += pt;
        
        const valueBeforeInterest = prevValue + pt;
        const interestGained = valueBeforeInterest * r;
        portfolioValue = valueBeforeInterest + interestGained;
        
        details.push({
          month: mStr,
          sip: pt,
          interest: interestGained,
          cumulativePrincipal,
          cumulativeValue: portfolioValue,
          isProjection: true
        });
      }
    }
    
    return {
      details,
      totalPrincipal: cumulativePrincipal,
      totalValue: portfolioValue,
      totalInterest: portfolioValue - cumulativePrincipal
    };
  };

  const results = runSimulation();

  // Milestone Text Calculations
  const allMonths = [...months].sort();
  const emiMonthsCount = allMonths.length;
  const totalEmi = Object.values(monthlyTotals).reduce((sum, m) => sum + (m.EMI || 0), 0);
  const avgEmi = emiMonthsCount > 0 ? totalEmi / emiMonthsCount : 35000;
  const coveredEmiMonths = avgEmi > 0 ? Math.round(results.totalValue / avgEmi) : 0;

  let milestoneText = '';
  if (results.totalValue < 100000) {
    milestoneText = `This portfolio matches a flagship smartphone 📱 or establishes a basic emergency pool.`;
  } else if (results.totalValue < 300000) {
    milestoneText = `This portfolio matches an international vacation ✈️ or funding 6 months of living expenses.`;
  } else if (results.totalValue < 800000) {
    milestoneText = `This portfolio covers **${coveredEmiMonths} months of your monthly EMI loans** 🏦 (avg. ${formatINR(avgEmi)}/mo) or buys a new hatchback car 🚗!`;
  } else if (results.totalValue < 1500000) {
    milestoneText = `This portfolio matches a new compact SUV 🚘 or covers **${coveredEmiMonths} months of your monthly EMI loans** 🏦 (avg. ${formatINR(avgEmi)}/mo)!`;
  } else {
    milestoneText = `This is a major wealth pool! It covers **${coveredEmiMonths} months of your monthly EMI loans** 🏠 or funds a down payment for a property!`;
  }

  // Chart configuration
  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const chartData = {
    labels: results.details.map(d => formatMonth(d.month) + (d.isProjection ? ' (P)' : '')),
    datasets: [
      {
        label: 'Portfolio Value',
        data: results.details.map(d => d.cumulativeValue),
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: results.details.map((d, idx) => {
          if (idx === results.details.length - 1) return 6;
          if (d && !d.isProjection && results.details[idx + 1]?.isProjection) return 6;
          return 0;
        }),
        pointHoverRadius: 6
      },
      {
        label: 'Principal Invested',
        data: results.details.map(d => d.cumulativePrincipal),
        borderColor: isDark ? '#475569' : '#94a3b8',
        borderDash: [5, 5],
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'Inter', size: 11 } } },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatINR(ctx.raw)}`
        }
      }
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Inter', size: 10 }, maxTicksLimit: 12 } },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { family: 'Inter', size: 10 },
          callback: (value) => {
            if (hideAmounts) return '•••••';
            if (value >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
            return '₹' + (value / 1000).toFixed(0) + 'k';
          }
        }
      }
    }
  };

  const handleChange = (key, val) => {
    dispatch(updateSimulatorState({ [key]: val }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Row gutter={[24, 24]}>
        {/* Controls Column */}
        <Col xs={24} lg={8}>
          <Card title="⚙️ Simulation Settings" className="bg-dark-card border-dark-border text-white shadow-xl h-full">
            <div className="flex flex-col gap-5">
              {/* Invest Source */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-400">SIP Source</label>
                <Select
                  value={simSource}
                  onChange={(val) => handleChange('simSource', val)}
                  className="w-full"
                  popupClassName="dark-dropdown"
                >
                  <Option value="savings">🐷 100% of Monthly Savings</Option>
                  <Option value="trim">✂️ Trim Monthly Expenses</Option>
                  <Option value="cc">💳 Invest Credit Card Bills</Option>
                  <Option value="fixed">💵 Fixed Monthly SIP</Option>
                </Select>
              </div>

              {/* Trim Slider (Conditional) */}
              {simSource === 'trim' && (
                <div className="flex flex-col gap-2 p-3 bg-white/5 border border-dashed border-dark-border rounded-xl animate-fadeIn">
                  <div className="flex justify-between items-center text-xs text-gray-300">
                    <span>Trim Expense Pct</span>
                    <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">{simTrimPct}%</span>
                  </div>
                  <Slider
                    min={5}
                    max={50}
                    step={5}
                    value={simTrimPct}
                    onChange={(val) => handleChange('simTrimPct', val)}
                    tooltip={{ formatter: (v) => `${v}%` }}
                  />
                  <span className="text-[10px] text-gray-400 leading-relaxed">Trims excess expenses monthly to invest.</span>
                </div>
              )}

              {/* Fixed SIP Slider (Conditional) */}
              {simSource === 'fixed' && (
                <div className="flex flex-col gap-2 p-3 bg-white/5 border border-dashed border-dark-border rounded-xl animate-fadeIn">
                  <div className="flex justify-between items-center text-xs text-gray-300">
                    <span>Monthly SIP Amount</span>
                    <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">{formatINR(simCustomAmt)}</span>
                  </div>
                  <Slider
                    min={1000}
                    max={50000}
                    step={1000}
                    value={simCustomAmt}
                    onChange={(val) => handleChange('simCustomAmt', val)}
                    tooltip={{ formatter: (v) => formatINR(v) }}
                  />
                </div>
              )}

              {/* Mutual Fund Category */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-400">Mutual Fund Category</label>
                <Select
                  value={simFund}
                  onChange={(val) => handleChange('simFund', val)}
                  className="w-full"
                  popupClassName="dark-dropdown"
                >
                  <Option value="largecap">📈 Equity Large Cap (12% p.a.)</Option>
                  <Option value="midcap">🚀 Equity Mid/Small Cap (15% p.a.)</Option>
                  <Option value="hybrid">🛡️ Hybrid/Balanced (10% p.a.)</Option>
                  <Option value="debt">💵 Debt/Liquid (6% p.a.)</Option>
                  <Option value="custom">⚙️ Custom Return Rate</Option>
                </Select>
              </div>

              {/* Custom Return Rate Slider (Conditional) */}
              {simFund === 'custom' && (
                <div className="flex flex-col gap-2 p-3 bg-white/5 border border-dashed border-dark-border rounded-xl animate-fadeIn">
                  <div className="flex justify-between items-center text-xs text-gray-300">
                    <span>Annual Return Rate</span>
                    <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">{simCustomRate}%</span>
                  </div>
                  <Slider
                    min={5}
                    max={30}
                    step={1}
                    value={simCustomRate}
                    onChange={(val) => handleChange('simCustomRate', val)}
                    tooltip={{ formatter: (v) => `${v}%` }}
                  />
                </div>
              )}

              {/* Future Projection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-400">Timeline Projection</label>
                <Select
                  value={simProjectYrs}
                  onChange={(val) => handleChange('simProjectYrs', val)}
                  className="w-full"
                  popupClassName="dark-dropdown"
                >
                  <Option value={0}>None (Historical only — 26 months)</Option>
                  <Option value={5}>Project 5 Years</Option>
                  <Option value={10}>Project 10 Years</Option>
                  <Option value={15}>Project 15 Years</Option>
                </Select>
              </div>
            </div>
          </Card>
        </Col>

        {/* Results Column */}
        <Col xs={24} lg={16}>
          <div className="flex flex-col gap-6">
            {/* KPI Cards */}
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={8}>
                <Card className="bg-dark-card border-dark-border text-white border-l-4 border-l-gray-400 p-2 shadow-lg">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Total Principal</div>
                  <div className="text-xl font-black mt-1">{formatINR(results.totalPrincipal)}</div>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card className="bg-dark-card border-dark-border text-white border-l-4 border-l-green-500 p-2 shadow-lg">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Wealth Gained</div>
                  <div className="text-xl font-black text-green-400 mt-1">{formatINR(results.totalInterest)}</div>
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card className="bg-dark-card border-dark-border text-white border-l-4 border-l-indigo-500 p-2 shadow-lg">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Portfolio Value</div>
                  <div className="text-xl font-black text-indigo-400 mt-1">{formatINR(results.totalValue)}</div>
                </Card>
              </Col>
            </Row>

            {/* Milestone Banner */}
            <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 shadow-md">
              <div className="text-3xl bg-indigo-500/10 w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner">
                🌟
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">Simulated Portfolio Potential</h4>
                <p
                  className="text-xs text-gray-300 m-0 leading-relaxed font-medium"
                  dangerouslySetInnerHTML={{
                    __html: milestoneText.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
                  }}
                />
              </div>
            </div>

            {/* Growth chart */}
            <Card title="SIP Investment Growth Projection" className="bg-dark-card border-dark-border text-white shadow-xl">
              <div className="h-[260px]">
                <Line data={chartData} options={chartOptions} />
              </div>
            </Card>
          </div>
        </Col>
      </Row>

      {/* Collapse detailed table */}
      <Collapse className="bg-dark-card border-dark-border shadow-xl rounded-xl overflow-hidden mt-2">
        <Panel
          header={<span className="text-xs font-bold text-gray-200">📋 Click to View Month-by-Month Growth Details</span>}
          key="1"
          className="border-none bg-dark-card"
        >
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto pr-2">
            <table className="min-w-full text-left text-xs font-medium border-collapse text-gray-300">
              <thead>
                <tr className="border-b border-dark-border text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Month</th>
                  <th className="py-2 px-3">SIP Amount</th>
                  <th className="py-2 px-3">Interest Gained</th>
                  <th className="py-2 px-3">Cumulative Principal</th>
                  <th className="py-2 px-3">Cumulative Value</th>
                </tr>
              </thead>
              <tbody>
                {results.details.map((d, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-dark-border/40 hover:bg-white/5 transition-colors ${
                      d.isProjection ? 'text-gray-500 italic' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      {formatMonth(d.month)} {d.isProjection && '(Proj)'}
                    </td>
                    <td className="py-2.5 px-3">{formatINR(d.sip)}</td>
                    <td className="py-2.5 px-3 text-green-400/80">{formatINR(d.interest)}</td>
                    <td className="py-2.5 px-3">{formatINR(d.cumulativePrincipal)}</td>
                    <td className="py-2.5 px-3 font-semibold text-gray-100">{formatINR(d.cumulativeValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Collapse>
    </div>
  );
}
