/** @type {import('next').NextConfig} */
// Minimal, safe headers only. Full CSP / observability are deferred to Phase 13 (per the
// Phase 10 design doc). No experimental flags; client-leaning app-router posture.
// Same-origin API proxy: when API_PROXY_TARGET is set (runtime env — `next start` re-evaluates
// this config), the web server forwards the API's three real prefixes to it. Pair it with an
// EMPTY NEXT_PUBLIC_API_BASE_URL so the browser calls relative /api/v1/* URLs. One origin means
// no CORS and no https→http mixed-content blocking behind a domain.
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? '').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (apiProxyTarget === '') return [];
    return [
      { source: '/api/v1/:path*', destination: `${apiProxyTarget}/api/v1/:path*` },
      { source: '/openapi.json', destination: `${apiProxyTarget}/openapi.json` },
      { source: '/health/:path*', destination: `${apiProxyTarget}/health/:path*` },
    ];
  },
  // The in-app diagnostics page moved from /api -> /diagnostics (it was never a public API reference;
  // that lives at the Scalar /docs page). Exact-path source so it never shadows the backend /api/v1/*.
  async redirects() {
    return [
      { source: '/api', destination: '/diagnostics', permanent: true },
      // Redesign IA: the six standalone section pages merged into /validators and /economy.
      // Exact-path sources, so the surviving detail routes (/coreslots/:slotId,
      // /rewards/epochs/:epoch, /mining/settlements/...) keep working untouched.
      { source: '/network', destination: '/validators?tab=history', permanent: false },
      { source: '/liveness', destination: '/validators', permanent: false },
      { source: '/coreslots', destination: '/validators?tab=registry', permanent: false },
      { source: '/rewards', destination: '/economy', permanent: false },
      { source: '/rewards/entitlements', destination: '/economy?tab=entitlements', permanent: false },
      { source: '/supply', destination: '/economy?tab=supply', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
