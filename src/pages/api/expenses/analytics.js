import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';
import { detectAnomalies, generateAlerts, calculateHealthScore } from '../../../utils/financeEngine';
import { requireUser, sendServerError, methodNotAllowed } from '../../../lib/apiUtils';
import { validateAnalyticsParams } from '../../../lib/validation';

export default async function handler(req, res) {
  if (req.method !== 'GET') { methodNotAllowed(res, ['GET']); return; }

  const user = requireUser(req, res);
  if (!user) return;

  const { value: params, error } = validateAnalyticsParams(req.query);
  if (error) { res.status(400).json({ error }); return; }

  try {
    const analyticsData = await dbProvider.getAnalytics(dbConfig, params, user.user_id);

    // Run anomaly detection and health score on the filtered raw data.
    // "Missing entry" checks use the user's own usual categories, not a fixed list.
    const {
      rawForAnomalies, monthlyTotals, months, categoryTotals, categoryMatrix,
      allCategories, allYears, allMonths, openingBalance, usualCategories,
    } = analyticsData;
    const anomalies = detectAnomalies(rawForAnomalies, usualCategories);
    const alerts = generateAlerts(rawForAnomalies, anomalies);
    const health = calculateHealthScore(rawForAnomalies, anomalies);

    res.status(200).json({
      monthlyTotals,
      months,
      categoryTotals,
      categoryMatrix,
      allCategories,
      allYears,
      allMonths,
      openingBalance,
      usualCategories,
      anomalies,
      alerts,
      healthScore: health.score,
      healthMetrics: {
        savingsRate: health.savingsRate,
        emiBurden: health.emiBurden,
        stability: health.stability,
        anomalyScore: health.anomalyScore,
      },
    });
  } catch (err) {
    sendServerError(res, err, 'GET /api/expenses/analytics');
  }
}
