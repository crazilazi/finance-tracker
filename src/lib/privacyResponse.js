import * as dbProvider from './db/dbProvider';
import { dbConfig } from './db/config';
import {
  indexAnalytics, maskAnomalies, maskAlerts, buildNameMasker, attachNamesToMasker,
  maskNamesDeep, maskAnalyticsNames,
} from './db/privacyTransforms';

/**
 * Final shaping of API payloads according to the request's privacy context.
 * Providers already handle amounts; this layer handles category-name masking
 * and the hidden-mode index conversion for analytics.
 */

const identity = (v) => v;

export async function nameMasker(ctx) {
  if (!ctx.privacy.maskCategoryNames) return identity;
  const cats = await dbProvider.getCategoryNameList(dbConfig, ctx.user.user_id);
  return attachNamesToMasker(buildNameMasker(cats), cats);
}

export async function finalizeRows(ctx, payload) {
  const mask = await nameMasker(ctx);
  const out = mask === identity ? payload : maskNamesDeep(payload, mask, new Set(['category']));
  return Array.isArray(out) ? out : { ...out, mode: ctx.privacy.mode };
}

export async function finalizeCategories(ctx, rows) {
  const mask = await nameMasker(ctx);
  return mask === identity ? rows : maskNamesDeep(rows, mask, new Set(['name', 'category']));
}

export async function finalizeSummary(ctx, summary) {
  const mask = await nameMasker(ctx);
  const out = mask === identity ? summary : maskNamesDeep(summary, mask, new Set(['category']));
  return { ...out, mode: ctx.privacy.mode };
}

export async function finalizeAnalytics(ctx, payload) {
  let out = payload;
  if (ctx.privacy.mode === 'hidden') {
    out = { ...indexAnalytics(out), anomalies: maskAnomalies(out.anomalies), alerts: maskAlerts(out.alerts) };
  }
  const mask = await nameMasker(ctx);
  if (mask !== identity) out = maskAnalyticsNames(out, mask);
  return { ...out, mode: ctx.privacy.mode };
}
