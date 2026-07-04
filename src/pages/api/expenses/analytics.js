import * as dbProvider from '../../../lib/db/dbProvider';
import { detectAnomalies, generateAlerts, calculateHealthScore } from '../../../utils/financeEngine';

const dbConfig = {
  dataSource: process.env.DATA_SOURCE || 'json',
  connectionString: process.env.DATABASE_URL,
};

import { getSessionUser } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { filter = 'all', query = '' } = req.query;
  const rootDir = process.cwd();

  try {
    const analyticsData = await dbProvider.getAnalytics(
      dbConfig,
      { filter, query },
      rootDir,
      user.username
    );

    // Run anomaly detection and health score on the filtered raw data
    const { rawForAnomalies, monthlyTotals, months, categoryTotals, allCategories, allYears, allMonths } = analyticsData;
    const anomalies = detectAnomalies(rawForAnomalies);
    const alerts = generateAlerts(rawForAnomalies, anomalies);
    const health = calculateHealthScore(rawForAnomalies, anomalies);

    return res.status(200).json({
      monthlyTotals,
      months,
      categoryTotals,
      allCategories,
      allYears,
      allMonths,
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
    return res.status(500).json({ error: err.message });
  }
}
