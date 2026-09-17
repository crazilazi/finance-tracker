import withPWAInit from "@ducanh2912/next-pwa";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Only honoured by browsers over HTTPS, so harmless in local development
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['antd', '@ant-design', 'rc-util', 'rc-pagination', 'rc-picker', 'rc-tree', 'rc-table'],
  reactStrictMode: true,
  output: "standalone",
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