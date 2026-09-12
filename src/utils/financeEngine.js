// ── Financial Analytics Engine ──

export function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}

export function pctChange(curr, prev) {
  if (!prev || prev === 0) return { pct: 0, dir: 'neutral' };
  const pct = ((curr - prev) / prev) * 100;
  return { pct: Math.abs(pct).toFixed(1), dir: pct > 2 ? 'up' : pct < -2 ? 'down' : 'neutral' };
}

export function getMonthlyTotals(data) {
  const totals = {};
  data.forEach(d => {
    if (!totals[d.month]) totals[d.month] = { Expense: 0, EMI: 0, Saving: 0, Income: 0, total: 0 };
    if (totals[d.month][d.type] === undefined) {
      totals[d.month][d.type] = 0;
    }
    totals[d.month][d.type] += d.amount;
    if (d.type !== 'Income') {
      totals[d.month].total += d.amount;
    }
  });
  return totals;
}

export function getCategoryTotals(data) {
  const totals = {};
  data.forEach(d => {
    if (!totals[d.category]) totals[d.category] = 0;
    totals[d.category] += d.amount;
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

/**
 * Categories that appear in most months of the dataset (at least 3 months and
 * 80% of all months). Used when the caller cannot supply a server-derived list.
 */
export function learnUsualCategories(data, months) {
  if (!data || !months || months.length < 3) return [];
  const monthsByCat = {};
  data.forEach(d => {
    if (!monthsByCat[d.category]) monthsByCat[d.category] = new Set();
    monthsByCat[d.category].add(d.month);
  });
  const threshold = Math.max(3, Math.ceil(months.length * 0.8));
  return Object.entries(monthsByCat)
    .filter(([, set]) => set.size >= threshold)
    .map(([cat]) => cat);
}

// ── Anomaly Detection Engine ──
export function detectAnomalies(data, usualCategories = null) {
  const anomalies = [];
  if (!data || data.length < 5) return anomalies;

  // 1. Category-level anomalies (Z-score based)
  const categories = [...new Set(data.map(d => d.category))];
  const months = [...new Set(data.map(d => d.month))].sort();

  categories.forEach(cat => {
    const catData = data.filter(d => d.category === cat);
    const amounts = catData.map(d => d.amount).filter(a => a > 0);
    if (amounts.length < 3) return;

    const m = mean(amounts);
    const s = stdDev(amounts);
    if (s === 0) return;

    catData.forEach(d => {
      const z = (d.amount - m) / s;
      if (z > 1.8) {
        anomalies.push({
          type: 'spike',
          severity: z > 2.5 ? 'high' : z > 2 ? 'medium' : 'low',
          month: d.month,
          category: d.category,
          amount: d.amount,
          expected: m,
          zScore: z.toFixed(2),
          detail: `${d.category} in ${d.month} was ₹${Math.round(d.amount).toLocaleString('en-IN')} — ${((d.amount / m - 1) * 100).toFixed(0)}% above average (₹${Math.round(m).toLocaleString('en-IN')})`
        });
      }
    });
  });

  // 2. Month-over-month total spikes
  const monthlyTotals = getMonthlyTotals(data);
  const sortedMonths = Object.keys(monthlyTotals).sort();
  const monthTotals = sortedMonths.map(m => monthlyTotals[m].total);

  for (let i = 1; i < sortedMonths.length; i++) {
    const prev = monthTotals[i - 1];
    const curr = monthTotals[i];
    const change = ((curr - prev) / prev) * 100;

    if (change > 25) {
      anomalies.push({
        type: 'monthly_spike',
        severity: change > 40 ? 'high' : 'medium',
        month: sortedMonths[i],
        category: 'Total Monthly',
        amount: curr,
        expected: prev,
        zScore: (change / 10).toFixed(2),
        detail: `Total spending in ${sortedMonths[i]} jumped ${change.toFixed(0)}% vs previous month (₹${Math.round(curr).toLocaleString('en-IN')} vs ₹${Math.round(prev).toLocaleString('en-IN')})`
      });
    }
  }

  // 3. Missing/zero category detection.
  // Uses the caller-supplied "usual" categories (server-derived from the
  // user's own history); falls back to learning them from the data itself.
  const expectedCategories = Array.isArray(usualCategories)
    ? usualCategories
    : learnUsualCategories(data, sortedMonths);
  sortedMonths.forEach(month => {
    const monthData = data.filter(d => d.month === month);
    const monthCats = monthData.map(d => d.category);

    expectedCategories.forEach(cat => {
      const entry = monthData.find(d => d.category === cat);
      if (!entry) {
        anomalies.push({
          type: 'missing',
          severity: 'low',
          month: month,
          category: cat,
          amount: 0,
          expected: 0,
          zScore: '0',
          detail: `${cat} not recorded in ${month} — possibly missing data`
        });
      }
    });
  });

  // 4. Sudden EMI changes
  const emiData = data.filter(d => d.type === 'EMI');
  const emiByMonth = {};
  emiData.forEach(d => {
    if (!emiByMonth[d.month]) emiByMonth[d.month] = 0;
    emiByMonth[d.month] += d.amount;
  });
  const emiMonths = Object.keys(emiByMonth).sort();
  for (let i = 1; i < emiMonths.length; i++) {
    const diff = Math.abs(emiByMonth[emiMonths[i]] - emiByMonth[emiMonths[i-1]]);
    if (diff > 5000) {
      anomalies.push({
        type: 'emi_change',
        severity: diff > 10000 ? 'high' : 'medium',
        month: emiMonths[i],
        category: 'EMI Total',
        amount: emiByMonth[emiMonths[i]],
        expected: emiByMonth[emiMonths[i-1]],
        zScore: (diff / 5000).toFixed(2),
        detail: `EMI burden changed by ₹${Math.round(diff).toLocaleString('en-IN')} in ${emiMonths[i]} (from ₹${Math.round(emiByMonth[emiMonths[i-1]]).toLocaleString('en-IN')} to ₹${Math.round(emiByMonth[emiMonths[i]]).toLocaleString('en-IN')})`
      });
    }
  }

  // Sort by severity and Z-score
  const severityOrder = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || parseFloat(b.zScore) - parseFloat(a.zScore));

  return anomalies;
}

// ── Alert Generator ──
export function generateAlerts(data, anomalies) {
  const alerts = [];
  if (!data || data.length === 0) return alerts;

  const months = [...new Set(data.map(d => d.month))].sort();
  const latestMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];

  const monthlyTotals = getMonthlyTotals(data);
  const latest = monthlyTotals[latestMonth];
  const prev = monthlyTotals[prevMonth];

  // Alert 1: Monthly budget exceeded
  if (latest && latest.total > 150000) {
    alerts.push({
      type: 'danger',
      title: '🚨 Budget Exceeded',
      detail: `${latestMonth} total spending is ₹${Math.round(latest.total).toLocaleString('en-IN')} — exceeding ₹1.5L threshold`,
      meta: latestMonth
    });
  }

  // Alert 2: Expense increase
  if (latest && prev && latest.Expense > prev.Expense * 1.15) {
    const pct = ((latest.Expense / prev.Expense - 1) * 100).toFixed(0);
    alerts.push({
      type: 'warning',
      title: '⚠️ Expense Increase',
      detail: `Expenses rose ${pct}% from ${prevMonth} to ${latestMonth}`,
      meta: latestMonth
    });
  }

  // Alert 3: High CC bills
  const ccBills = data.filter(d => d.month === latestMonth && (d.category.toLowerCase().includes('cc') || d.category.toLowerCase().includes('credit')));
  const ccTotal = ccBills.reduce((s, d) => s + d.amount, 0);
  if (ccTotal > 20000) {
    alerts.push({
      type: 'warning',
      title: '💳 High Credit Card Bill',
      detail: `Credit card spending in ${latestMonth} is ₹${Math.round(ccTotal).toLocaleString('en-IN')}`,
      meta: latestMonth
    });
  }

  // Alert 4: Savings trend
  const savingMonths = months.slice(-6);
  const savingAmounts = savingMonths.map(m => {
    const mt = monthlyTotals[m];
    return mt ? mt.Saving : 0;
  });
  const avgSaving = mean(savingAmounts);
  if (avgSaving > 0) {
    alerts.push({
      type: 'success',
      title: '🎉 Savings Growing',
      detail: `Average savings over last 6 months: ₹${Math.round(avgSaving).toLocaleString('en-IN')}/month`,
      meta: 'Last 6 months'
    });
  }

  // Alert 5: Anomaly count
  const highAnomalies = anomalies.filter(a => a.severity === 'high');
  if (highAnomalies.length > 0) {
    alerts.push({
      type: 'danger',
      title: `🔴 ${highAnomalies.length} Critical Anomalies`,
      detail: `Found ${highAnomalies.length} high-severity spending anomalies that need attention`,
      meta: 'All time'
    });
  }

  // Alert 6: EMI burden
  if (latest && latest.EMI > latest.total * 0.3) {
    const pct = (latest.EMI / latest.total * 100).toFixed(0);
    alerts.push({
      type: 'info',
      title: '🏦 EMI Burden Notice',
      detail: `EMIs constitute ${pct}% of your total monthly outflow in ${latestMonth}`,
      meta: latestMonth
    });
  }

  return alerts;
}

// ── Financial Health Score Calculator ──
export function calculateHealthScore(data, anomalies) {
  if (!data || data.length === 0) return { score: 0, savingsRate: 0, emiBurden: 0, stability: 0, anomalyScore: 0 };

  const months = [...new Set(data.map(d => d.month))].sort();
  const latestMonth = months[months.length - 1];
  const monthlyTotals = getMonthlyTotals(data);
  const latest = monthlyTotals[latestMonth];

  // 1. Savings Rate (30 pts)
  const savingsRate = latest && latest.total > 0 ? (latest.Saving / latest.total) * 100 : 0;
  const savingsPoints = Math.min(30, (savingsRate / 15) * 30); // 15% is standard benchmark

  // 2. EMI Burden (30 pts)
  const emiBurden = latest && latest.total > 0 ? (latest.EMI / latest.total) * 100 : 0;
  const emiPoints = Math.max(0, 30 - Math.max(0, emiBurden - 30) * 1.5); // Dedect if > 30%

  // 3. Spending Stability (20 pts)
  const monthlyOutflows = months.map(m => monthlyTotals[m].total);
  const stabilityPct = monthlyOutflows.length > 1 ? stdDev(monthlyOutflows) / mean(monthlyOutflows) : 0;
  const stabilityPoints = Math.max(0, 20 - stabilityPct * 40);

  // 4. Anomaly Deduction (20 pts)
  const highAnomalyCount = anomalies.filter(a => a.severity === 'high' && a.month === latestMonth).length;
  const medAnomalyCount = anomalies.filter(a => a.severity === 'medium' && a.month === latestMonth).length;
  const anomalyDeduction = highAnomalyCount * 10 + medAnomalyCount * 5;
  const anomalyPoints = Math.max(0, 20 - anomalyDeduction);

  const totalScore = Math.round(savingsPoints + emiPoints + stabilityPoints + anomalyPoints);

  return {
    score: Math.min(100, Math.max(0, totalScore)),
    savingsRate: Math.round(savingsRate),
    emiBurden: Math.round(emiBurden),
    stability: Math.round(Math.max(0, 100 - stabilityPct * 100)),
    anomalyScore: Math.round(anomalyPoints * 5)
  };
}

// Smart query parsing lives in src/utils/smartQuery.js and is applied server-side.

