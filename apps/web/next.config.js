/** @type {import('next').NextConfig} */
// Minimal, safe headers only. Full CSP / observability are deferred to Phase 13 (per the
// Phase 10 design doc). No experimental flags; client-leaning app-router posture.
const nextConfig = {
  reactStrictMode: true,
  // The in-app diagnostics page moved from /api -> /diagnostics (it was never a public API reference;
  // that lives at the Scalar /docs page). Exact-path source so it never shadows the backend /api/v1/*.
  async redirects() {
    return [{ source: '/api', destination: '/diagnostics', permanent: true }];
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
