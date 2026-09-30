import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Content-Security-Policy. The app loads scripts only from itself (the one
 * inline block, __NEXT_DATA__, is JSON and never executed) and fonts from
 * Google. Ant Design injects inline styles, hence 'unsafe-inline' for styles
 * only. connect-src lists Google Fonts because the service worker fetches
 * them for its font cache.
 *
 * CSP_ENFORCE: ships as report-only so a missed source shows up as a logged
 * violation (see /api/csp-report) instead of breaking the app. Switch it to
 * true once a week of normal use has logged no violations.
 */
const CSP_ENFORCE = false;

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
  "report-to csp",
].join("; ");

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only honoured by browsers over HTTPS, so harmless in local development
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // next dev needs eval for hot reloading, so the policy is only sent by production builds
  ...(isDev ? [] : [
    { key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
    { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
  ]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['antd', '@ant-design', 'rc-util', 'rc-pagination', 'rc-picker', 'rc-tree', 'rc-table'],
  reactStrictMode: true,
  output: "standalone",
  // Nothing uses next/image, so switch the optimisation endpoint off entirely.
  // It has had critical advisories and would otherwise be reachable by anyone.
  images: { unoptimized: true },
  turbopack: {},
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

/**
 * Service worker caching policy.
 *
 * The plugin's default rules cache every same-origin GET, including /api/*,
 * in Cache Storage for 24 h. For a finance app that would persist unlocked
 * amounts on the device beyond the tab, the unlock window and logout, so the
 * defaults are replaced (not extended) with a static-only allowlist and an
 * explicit network-only rule for the API. The HTML shell carries no user data
 * (the app renders client-side), so precaching it is safe.
 *
 * The plugin hooks webpack, hence `next build --webpack` in package.json;
 * a Turbopack build silently emits no service worker.
 */
const runtimeCaching = [
  {
    urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: "NetworkOnly",
  },
  {
    urlPattern: /\/_next\/static\/.+/i,
    handler: "CacheFirst",
    options: { cacheName: "next-static", expiration: { maxEntries: 64, maxAgeSeconds: 30 * 86400 } },
  },
  {
    urlPattern: /\/icons\/.+\.png$/i,
    handler: "CacheFirst",
    options: { cacheName: "icons", expiration: { maxEntries: 8, maxAgeSeconds: 30 * 86400 } },
  },
  {
    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i,
    handler: "StaleWhileRevalidate",
    options: { cacheName: "fonts", expiration: { maxEntries: 16, maxAgeSeconds: 365 * 86400 } },
  },
];

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: false,
  extendDefaultRuntimeCaching: false,
  workboxOptions: { runtimeCaching },
});

export default withPWA(nextConfig);