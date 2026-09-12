import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { detectAnomalies, generateAlerts, calculateHealthScore } from '../../../utils/financeEngine';
import { requireContext, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateAnalyticsParams } from '../../../lib/validation';
import { finalizeAnalytics } from '../../../lib/privacyResponse';

export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const ctx = await requireContext(req, res);
  if (!ctx) return;

  const { value: params, error } = validateAnalyticsParams(req.query);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const analyticsData = await dbProvider.getAnalytics(dbConfig, params, ctx.user.user_id, ctx.privacy);

    // Anomalies, alerts and health are computed on the same (real or demo) rows the
    // charts are built from; hidden mode is applied afterwards by finalizeAnalytics.
    const {
      rawForAnomalies, monthlyTotals, months, categoryTotals, categoryMatrix,
      allCategories, allYears, allMonths, openingBalance, usualCategories, budgetStatus,
    } = analyticsData;
    const anomalies = detectAnomalies(rawForAnomalies, usualCategories);
    const alerts = generateAlerts(rawForAnomalies, anomalies, { budgetStatus });
    const health = calculateHealthScore(rawForAnomalies, anomalies);

    const payload = {
      monthlyTotals,
      months,
      categoryTotals,
      categoryMatrix,
      allCategories,
      allYears,
      allMonths,
      openingBalance,
      usualCategories,
      budgetStatus,
      anomalies,
      alerts,
      healthScore: health.score,
      healthMetrics: {
        savingsRate: health.savingsRate,
        emiBurden: health.emiBurden,
        stability: health.stability,
        anomalyScore: health.anomalyScore,
      },
    };

    res.status(200).json(await finalizeAnalytics(ctx, payload));
  } catch (err) {
    sendServerError(res, err, 'GET /api/expenses/analytics');
  }
}
