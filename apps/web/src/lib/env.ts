// The only network origin the web app is permitted to talk to: the Phase 9 public API.
// Must be NEXT_PUBLIC_ because all fetching is client-side. No chain/RPC/REST/DB access exists.
//
// An EMPTY value means same-origin: the web server proxies /api/v1/* (and /openapi.json,
// /health/*) to the API via next.config.js rewrites (API_PROXY_TARGET). That is the deployed
// posture behind a domain — one origin, no CORS, no mixed content.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'
).replace(/\/+$/, '');
