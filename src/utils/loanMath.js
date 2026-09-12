/**
 * Amortisation maths shared by the API and the Loans tab.
 * Months are 'YYYY-MM' strings; rates are annual percentages (e.g. 8.5).
 */

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function diffMonths(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Standard EMI for principal P, annual rate %, tenure n months. */
export function emiFor(principal, annualRate, tenureMonths) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.round(Number(tenureMonths) || 1));
  const r = (Number(annualRate) || 0) / 1200;
  if (r === 0) return P / n;
  const f = Math.pow(1 + r, n);
  return (P * r * f) / (f - 1);
}

/**
 * Builds the month-by-month schedule.
 * prepayments: [{ month, amount, mode: 'tenure' | 'emi' }]
 *   tenure → EMI unchanged, loan closes earlier
 *   emi    → EMI recomputed over the remaining original tenure
 */
export function buildSchedule({ principal, annualRate, tenureMonths, startMonth, emiAmount, prepayments = [] }) {
  const P = Number(principal) || 0;
  const n = Math.max(1, Math.round(Number(tenureMonths) || 1));
  const r = (Number(annualRate) || 0) / 1200;
  let emi = Number(emiAmount) > 0 ? Number(emiAmount) : emiFor(P, annualRate, n);
  const preByMonth = {};
  for (const p of prepayments) {
    if (!p || !p.month || !(Number(p.amount) > 0)) continue;
    (preByMonth[p.month] = preByMonth[p.month] || []).push({ amount: Number(p.amount), mode: p.mode === 'emi' ? 'emi' : 'tenure' });
  }

  const rows = [];
  let balance = P;
  let month = startMonth;
  let idx = 0;
  const hardCap = 720;

  while (balance > 0.5 && idx < hardCap) {
    const opening = balance;
    const interest = opening * r;
    let principalPaid = Math.min(opening, Math.max(0, emi - interest));
    if (emi <= interest && r > 0) principalPaid = Math.min(opening, 1); // guard against non-amortising EMI
    let closing = opening - principalPaid;

    let prepayment = 0;
    for (const p of preByMonth[month] || []) {
      const applied = Math.min(closing, p.amount);
      prepayment += applied;
      closing -= applied;
      if (p.mode === 'emi' && closing > 0.5) {
        const remaining = Math.max(1, n - (idx + 1));
        emi = emiFor(closing, annualRate, remaining);
      }
    }

    rows.push({
      month,
      opening: round2(opening),
      emi: round2(Math.min(emi, opening + interest)),
      interest: round2(interest),
      principal: round2(principalPaid),
      prepayment: round2(prepayment),
      closing: round2(Math.max(0, closing)),
    });

    balance = closing;
    month = addMonths(month, 1);
    idx++;
  }

  return rows;
}

function round2(v) { return Math.round(v * 100) / 100; }

/** Where the loan stands as of a given month (defaults to now). */
export function loanSnapshot(loan, asOfMonth = currentMonth()) {
  const schedule = buildSchedule(loan);
  if (schedule.length === 0) {
    return { schedule, emi: 0, totalInterest: 0, payoffMonth: loan.startMonth, monthsTotal: 0, paidMonths: 0, outstanding: 0, interestPaid: 0, principalPaid: 0, monthsLeft: 0, progressPct: 100 };
  }
  const paidMonths = Math.max(0, Math.min(schedule.length, diffMonths(loan.startMonth, asOfMonth) + 1));
  const paid = schedule.slice(0, paidMonths);
  const interestPaid = paid.reduce((s, x) => s + x.interest, 0);
  const principalPaid = paid.reduce((s, x) => s + x.principal + x.prepayment, 0);
  const totalInterest = schedule.reduce((s, x) => s + x.interest, 0);
  const outstanding = paidMonths > 0 ? paid[paid.length - 1].closing : Number(loan.principal);
  const monthsLeft = Math.max(0, schedule.length - paidMonths);
  return {
    schedule,
    emi: schedule[0].emi,
    totalInterest: round2(totalInterest),
    payoffMonth: schedule[schedule.length - 1].month,
    monthsTotal: schedule.length,
    paidMonths,
    outstanding: round2(outstanding),
    interestPaid: round2(interestPaid),
    principalPaid: round2(principalPaid),
    monthsLeft,
    progressPct: Number(loan.principal) > 0 ? Math.round((principalPaid / Number(loan.principal)) * 100) : 0,
  };
}

/** Effect of one extra prepayment on top of the loan's existing prepayments. */
export function simulatePrepayment(loan, extra, asOfMonth = currentMonth()) {
  const baseline = loanSnapshot(loan, asOfMonth);
  const withExtra = loanSnapshot({ ...loan, prepayments: [...(loan.prepayments || []), extra] }, asOfMonth);
  return {
    baseline,
    withExtra,
    interestSaved: round2(baseline.totalInterest - withExtra.totalInterest),
    monthsSaved: baseline.monthsTotal - withExtra.monthsTotal,
    newEmi: withExtra.schedule.length ? withExtra.schedule[Math.min(withExtra.schedule.length - 1, Math.max(0, diffMonths(loan.startMonth, extra.month) + 1))].emi : baseline.emi,
  };
}

/** Rank loans by interest saved per rupee of a hypothetical prepayment next month. */
export function prepayPriority(loans, amount = 100000, asOfMonth = currentMonth()) {
  const month = addMonths(asOfMonth, 1);
  return loans.map(loan => {
    const sim = simulatePrepayment(loan, { month, amount, mode: 'tenure' }, asOfMonth);
    return { loanId: loan.id, name: loan.name, interestSaved: sim.interestSaved, monthsSaved: sim.monthsSaved, perRupee: amount > 0 ? sim.interestSaved / amount : 0 };
  }).sort((a, b) => b.perRupee - a.perRupee);
}
