// Phase 13c transport hardening: security headers, Cache-Control policy, ETag revalidation, build/
// version surface, and rate limiting. All assert TRANSPORT behavior — response envelopes are unchanged
// (verified by the other suites still passing).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import { MockPrisma, testConfig, block } from './mock-prisma.js';

const build = (data = {}) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });

describe('security headers (helmet)', () => {
  it('sets nosniff + cross-origin resource policy on responses', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/status' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(res.headers['x-frame-options'], 'DENY'); // frameguard deny — an API is never framed
    await app.close();
  });
});

describe('Cache-Control policy (fail-safe: no-store unless a route opts into revalidate)', () => {
  it('uses no-store on a non-opted-in endpoint (/status is sampled/live)', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/status' });
    assert.equal(res.headers['cache-control'], 'no-store');
    await app.close();
  });

  it('uses no-cache (revalidate) on an opted-in cacheable endpoint (/blocks)', async () => {
    const app = await build({ blocks: [block(1)] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/blocks' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'no-cache');
    await app.close();
  });
});

describe('ETag revalidation (validators useful, freshness authoritative)', () => {
  it('returns an ETag and 304s a matching If-None-Match — never a max-age stale window', async () => {
    const app = await build({ blocks: [block(1)] });
    const first = await app.inject({ method: 'GET', url: '/api/v1/blocks' });
    assert.equal(first.statusCode, 200);
    const etag = first.headers.etag;
    assert.ok(etag, 'expected an ETag header');

    const revalidated = await app.inject({
      method: 'GET',
      url: '/api/v1/blocks',
      headers: { 'if-none-match': etag },
    });
    assert.equal(revalidated.statusCode, 304); // unchanged → revalidation short-circuits, no stale serve
    await app.close();
  });
});

describe('version / build info on /status (build+env only, no chain access)', () => {
  it('exposes data.build with version/gitSha/builtAt/environment', async () => {
    const app = await build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/status' });
    const info = res.json().data.build;
    assert.equal(typeof info.version, 'string');
    assert.equal(info.gitSha, null); // unset in tests
    assert.equal(info.builtAt, null);
    assert.equal(info.environment, 'development'); // testConfig.env
    await app.close();
  });
});

describe('rate limiting (disable-able; 429 uses the { error } envelope)', () => {
  it('does NOT throttle when disabled (the default test posture)', async () => {
    const app = await build();
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/v1/status' });
      assert.equal(res.statusCode, 200);
    }
    await app.close();
  });

  it('returns a 429 in the { error } envelope once the per-IP limit is exceeded', async () => {
    const config = { ...testConfig, rateLimit: { enabled: true, max: 2, timeWindowMs: 60_000 } };
    const app = await buildServer({ config, prisma: new MockPrisma({}) });
    await app.inject({ method: 'GET', url: '/api/v1/status' }); // 1
    await app.inject({ method: 'GET', url: '/api/v1/status' }); // 2
    const limited = await app.inject({ method: 'GET', url: '/api/v1/status' }); // 3 → over
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, 'rate_limited');
    await app.close();
  });
});

// N2: behind Cloudflare → Caddy the TCP peer is always Caddy, so without trustProxy every visitor
// shares one bucket. Caddy (a private address on the Docker network) sends a single X-Forwarded-For.
describe('rate limiting keys on the real client behind the proxy (N2)', () => {
  const TRUSTED = ['loopback', 'uniquelocal'];
  const limited = (trustProxy) => ({
    ...testConfig,
    trustProxy,
    rateLimit: { enabled: true, max: 2, timeWindowMs: 60_000 },
  });
  const CADDY = '172.18.0.5';
  const hit = (app, client, peer = CADDY) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/status',
      remoteAddress: peer,
      headers: client ? { 'x-forwarded-for': client } : {},
    });

  it('behind the trusted proxy, each client gets its own bucket', async () => {
    const app = await buildServer({ config: limited(TRUSTED), prisma: new MockPrisma({}) });
    assert.equal((await hit(app, '203.0.113.1')).statusCode, 200);
    assert.equal((await hit(app, '203.0.113.1')).statusCode, 200);
    assert.equal((await hit(app, '203.0.113.1')).statusCode, 429, 'client A is over its limit');
    assert.equal((await hit(app, '203.0.113.2')).statusCode, 200, 'client B is unaffected by A');
    await app.close();
  });

  it('a client cannot escape its bucket by prepending its own X-Forwarded-For', async () => {
    // Caddy replaces the header, but even if a chain arrived, only the address next to the trusted
    // proxy counts — the client-controlled left part is ignored.
    const app = await buildServer({ config: limited(TRUSTED), prisma: new MockPrisma({}) });
    await hit(app, '1.1.1.1, 203.0.113.9');
    await hit(app, '2.2.2.2, 203.0.113.9');
    assert.equal((await hit(app, '3.3.3.3, 203.0.113.9')).statusCode, 429);
    await app.close();
  });

  it('a public peer is not trusted: its X-Forwarded-For is ignored', async () => {
    const app = await buildServer({ config: limited(TRUSTED), prisma: new MockPrisma({}) });
    const direct = '198.51.100.7';
    await hit(app, '203.0.113.1', direct);
    await hit(app, '203.0.113.2', direct);
    assert.equal((await hit(app, '203.0.113.3', direct)).statusCode, 429);
    await app.close();
  });

  it('without trustProxy, X-Forwarded-For is ignored (the peer is the client)', async () => {
    const app = await buildServer({ config: limited(false), prisma: new MockPrisma({}) });
    await hit(app, '203.0.113.1');
    await hit(app, '203.0.113.2');
    assert.equal((await hit(app, '203.0.113.3')).statusCode, 429);
    await app.close();
  });
});

describe('API_TRUST_PROXY parsing (N2)', () => {
  it('parses off and address lists; refuses true in production, hop counts and junk', async () => {
    const { readTrustProxy } = await import('../dist/config.js');
    assert.equal(readTrustProxy(undefined, true), false);
    assert.equal(readTrustProxy('false', true), false);
    assert.deepEqual(readTrustProxy('loopback,uniquelocal', true), ['loopback', 'uniquelocal']);
    assert.deepEqual(readTrustProxy('10.0.0.0/8, 172.16.0.0/12', true), ['10.0.0.0/8', '172.16.0.0/12']);
    assert.equal(readTrustProxy('true', false), true);
    assert.throws(() => readTrustProxy('true', true), /refused in production/);
    assert.throws(() => readTrustProxy('1', true), /hop counts are not supported/);
    assert.throws(() => readTrustProxy('yes please', true), /comma-separated list/);
  });
});
