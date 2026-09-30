/**
 * POST /api/csp-report
 * Receives Content-Security-Policy violation reports from browsers and writes
 * one short line per violation to the server log (App Service log stream).
 * Unauthenticated by necessity, so the body is capped at 16 KB, each field is
 * truncated, and logging is limited to 30 lines a minute per instance.
 * Always answers 204.
 */
export const config = { api: { bodyParser: false } };

const MAX_BODY = 16 * 1024;
const LIMIT_PER_MINUTE = 30;
let windowStart = 0;
let logged = 0;
let dropped = 0;

const clean = (v, max = 200) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '?').slice(0, max);

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/** Both formats: report-uri ({ "csp-report": {...} }) and Reporting API ([{ type, body }]). */
function violations(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.filter(r => r && r.type === 'csp-violation' && r.body).map(r => ({
      directive: r.body.effectiveDirective, blocked: r.body.blockedURL, page: r.body.documentURL,
      source: r.body.sourceFile ? `${r.body.sourceFile}:${r.body.lineNumber || ''}` : '', disposition: r.body.disposition,
    }));
  }
  const r = parsed && parsed['csp-report'];
  if (!r) return [];
  return [{
    directive: r['effective-directive'] || r['violated-directive'], blocked: r['blocked-uri'], page: r['document-uri'],
    source: r['source-file'] ? `${r['source-file']}:${r['line-number'] || ''}` : '', disposition: r.disposition,
  }];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', ['POST']); res.status(405).end(); return; }

  const raw = await readBody(req);
  let list = [];
  try { list = raw ? violations(JSON.parse(raw)) : []; } catch { list = []; }

  const now = Date.now();
  if (now - windowStart > 60000) {
    if (dropped > 0) console.warn(`[csp] ${dropped} further violation reports were not logged in the last minute`);
    windowStart = now; logged = 0; dropped = 0;
  }
  for (const v of list) {
    if (logged >= LIMIT_PER_MINUTE) { dropped++; continue; }
    logged++;
    console.warn(`[csp] ${clean(v.disposition, 10) || 'report'} ${clean(v.directive, 40)} blocked=${clean(v.blocked)} page=${clean(v.page)}${v.source ? ` at=${clean(v.source)}` : ''}`);
  }
  res.status(204).end();
}
