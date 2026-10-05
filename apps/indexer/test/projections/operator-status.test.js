import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findPrivacyViolation,
  parseOperatorStatusUrls,
  projectOperatorStatus,
  sampleKey,
} from '../../dist/projections/operator-status-snapshot.js';

// In-memory prisma covering exactly what the sampler touches.
function mockPrisma({ entitled = [], finalized = [] } = {}) {
  const samples = new Map();
  return {
    _samples: samples,
    operatorStatusSample: {
      findUnique: async ({ where }) => samples.get(where.sampleKey) ?? null,
      findMany: async ({ where }) =>
        [...samples.values()].filter((s) => s.slotId === where.slotId && s.kind === where.kind),
      upsert: async ({ where, create, update }) => {
        const prev = samples.get(where.sampleKey);
        samples.set(where.sampleKey, prev ? { ...prev, ...update } : { ...create });
        return samples.get(where.sampleKey);
      },
    },
    slotEntitlementProjection: {
      findMany: async () => entitled.map((e) => ({ epochNumber: BigInt(e) })),
    },
    miningSettlementFinalization: {
      findMany: async () => finalized.map((e) => ({ epochNumber: BigInt(e) })),
    },
  };
}

const CLOCK = {
  source: 'operator',
  sampled_at: '2026-09-11T13:11:07Z',
  as_height: 178470,
  current_target: { epoch: 497, state: 'OPEN' },
};
const okJson = (body) => async () => ({ ok: true, status: 200, body });

describe('operator-status sampler', () => {
  it('stores a good clock sample with envelope fields', async () => {
    const prisma = mockPrisma();
    const r = await projectOperatorStatus({
      prisma,
      fetchJson: okJson(CLOCK),
      slotId: 3n,
      baseUrl: 'https://as.example',
    });
    assert.equal(r.clock, 'stored');
    const row = prisma._samples.get(sampleKey(3n, 'clock', null));
    assert.equal(row.asHeight, 178470n);
    assert.equal(row.lastError, null);
    assert.ok(row.payloadJson.current_target.epoch === 497);
  });

  it('a failed fetch NEVER clobbers the last good payload (contract: keep last sample + age)', async () => {
    const prisma = mockPrisma();
    await projectOperatorStatus({ prisma, fetchJson: okJson(CLOCK), slotId: 3n, baseUrl: 'https://as' });
    const fail = async () => ({ ok: false, status: 503, error: 'http 503' });
    const r = await projectOperatorStatus({ prisma, fetchJson: fail, slotId: 3n, baseUrl: 'https://as' });
    assert.equal(r.clock, 'failed');
    const row = prisma._samples.get(sampleKey(3n, 'clock', null));
    assert.equal(row.lastError, 'http 503');
    // The good payload survives the outage.
    assert.equal(row.payloadJson.as_height, 178470);
    assert.ok(row.fetchedAt instanceof Date);
  });

  it('a settled epoch sample is immutable — never refetched', async () => {
    const prisma = mockPrisma({ entitled: [50], finalized: [50] });
    let epochCalls = 0;
    const fetchJson = async (url) => {
      if (url.includes('/candidates')) return { ok: true, status: 200, body: { outcome: 'NO_CANDIDATES' } };
      if (url.includes('/operator-status/epochs/')) {
        epochCalls++;
        return { ok: true, status: 200, body: { state: 'SETTLEMENT_RECONCILED', epoch: 50, sampled_at: '2026-09-11T00:00:00Z', as_height: 1 } };
      }
      return { ok: true, status: 200, body: CLOCK };
    };
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    assert.equal(epochCalls, 1);
  });

  it('an open epoch with a stored sample refetches only after the CHAIN shows a finalization', async () => {
    let finalized = [];
    const prisma = mockPrisma({ entitled: [60] });
    prisma.miningSettlementFinalization.findMany = async () =>
      finalized.map((e) => ({ epochNumber: BigInt(e) }));
    let epochCalls = 0;
    const fetchJson = async (url) => {
      if (url.includes('/candidates')) return { ok: true, status: 200, body: { outcome: 'NO_CANDIDATES' } };
      if (url.includes('/operator-status/epochs/')) {
        epochCalls++;
        return { ok: true, status: 200, body: { state: 'OPEN', epoch: 60 } };
      }
      return { ok: true, status: 200, body: CLOCK };
    };
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    assert.equal(epochCalls, 1); // no chain finalization yet -> no refetch
    finalized = [60];
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    assert.equal(epochCalls, 2); // refresh-after-settle
  });

  it('REFUSES a payload carrying an address (ADR-MINIS-0020) and stores no payload', async () => {
    const dirty = { ...CLOCK, note: 'pay twilight1mw4n9ksh7ank3ewqu4vpg7f82ccp83xw03xmgl' };
    const prisma = mockPrisma();
    const r = await projectOperatorStatus({ prisma, fetchJson: okJson(dirty), slotId: 3n, baseUrl: 'https://as' });
    assert.equal(r.clock, 'refused');
    const row = prisma._samples.get(sampleKey(3n, 'clock', null));
    assert.equal(row.payloadJson, undefined);
    assert.match(row.lastError, /privacy_refused/);
  });
});

describe('privacy guard', () => {
  it('flags forbidden keys and bech32 values; allows the reason-count buckets', () => {
    assert.equal(findPrivacyViolation({ counts: { excluded: { NO_VALID_PAYOUT_DESTINATION: 0 } } }), null);
    assert.match(findPrivacyViolation({ recipient_address: 'x' }) ?? '', /forbidden key/);
    assert.match(findPrivacyViolation({ a: ['twilight1mw4n9ksh7ank3ewqu4vpg7f82ccp83xw03xmgl'] }) ?? '', /bech32/);
    assert.match(findPrivacyViolation({ user_id: 7 }) ?? '', /forbidden key/);
    assert.equal(findPrivacyViolation(CLOCK), null);
  });
});

describe('parseOperatorStatusUrls', () => {
  it('parses the slot=url list and ignores junk', () => {
    const m = parseOperatorStatusUrls('3=https://rewards.nyks.dev, 5=http://x , bad, 9=ftp://no');
    assert.equal(m.get(3n), 'https://rewards.nyks.dev');
    assert.equal(m.get(5n), 'http://x');
    assert.equal(m.size, 2);
  });
});

describe('auth-server sampling', () => {
  const AS_METADATA = {
    issuer: 'https://as',
    jwks_uri: 'https://as/oauth/jwks.json',
    token_endpoint: 'https://as/oauth/token',
    dpop_signing_alg_values_supported: ['ES256'],
  };
  const JWKS = { keys: [{ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig', kid: 'receipt-1', x: 'abc' }] };

  it('samples AS metadata + JWKS on first run, then holds for an hour', async () => {
    const prisma = mockPrisma();
    const calls = [];
    const fetchJson = async (url) => {
      calls.push(url);
      if (url.endsWith('/.well-known/oauth-authorization-server'))
        return { ok: true, status: 200, body: AS_METADATA };
      if (url.endsWith('/oauth/jwks.json')) return { ok: true, status: 200, body: JWKS };
      return { ok: true, status: 200, body: CLOCK };
    };
    const t0 = new Date('2026-10-06T10:00:00Z');
    const r = await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as', now: t0 });
    assert.equal(r.authServer, 'stored');
    const meta = prisma._samples.get(sampleKey(3n, 'as_metadata', null));
    const jwks = prisma._samples.get(sampleKey(3n, 'as_jwks', null));
    assert.equal(meta.payloadJson.issuer, 'https://as');
    assert.equal(jwks.payloadJson.keys[0].kid, 'receipt-1');

    // 10 minutes later: fresh — neither AS endpoint is hit again.
    calls.length = 0;
    const r2 = await projectOperatorStatus({
      prisma, fetchJson, slotId: 3n, baseUrl: 'https://as',
      now: new Date(t0.getTime() + 10 * 60 * 1000),
    });
    assert.equal(r2.authServer, 'fresh');
    assert.equal(calls.filter((u) => u.includes('oauth')).length, 0);

    // 61 minutes later: sampled again.
    const r3 = await projectOperatorStatus({
      prisma, fetchJson, slotId: 3n, baseUrl: 'https://as',
      now: new Date(t0.getTime() + 61 * 60 * 1000),
    });
    assert.equal(r3.authServer, 'stored');
  });

  it('a failed AS fetch keeps the last good metadata (same taxonomy as the feed)', async () => {
    const prisma = mockPrisma();
    const t0 = new Date('2026-10-06T10:00:00Z');
    const good = async (url) =>
      url.includes('oauth')
        ? { ok: true, status: 200, body: url.includes('jwks') ? JWKS : AS_METADATA }
        : { ok: true, status: 200, body: CLOCK };
    await projectOperatorStatus({ prisma, fetchJson: good, slotId: 3n, baseUrl: 'https://as', now: t0 });
    const down = async (url) =>
      url.includes('oauth')
        ? { ok: false, status: 503, error: 'http 503' }
        : { ok: true, status: 200, body: CLOCK };
    const r = await projectOperatorStatus({
      prisma, fetchJson: down, slotId: 3n, baseUrl: 'https://as',
      now: new Date(t0.getTime() + 2 * 60 * 60 * 1000),
    });
    assert.equal(r.authServer, 'failed');
    const meta = prisma._samples.get(sampleKey(3n, 'as_metadata', null));
    assert.equal(meta.lastError, 'http 503');
    assert.equal(meta.payloadJson.issuer, 'https://as'); // last good survives
  });

  it('jwksUrlFrom never follows a jwks_uri off the operator origin', async () => {
    const { jwksUrlFrom } = await import('../../dist/projections/operator-status-snapshot.js');
    assert.equal(jwksUrlFrom({ jwks_uri: 'https://as/custom/jwks' }, 'https://as'), 'https://as/custom/jwks');
    assert.equal(jwksUrlFrom({ jwks_uri: 'https://evil.example/jwks' }, 'https://as'), 'https://as/oauth/jwks.json');
    assert.equal(jwksUrlFrom(null, 'https://as'), 'https://as/oauth/jwks.json');
  });
});

describe('draw-record sampling', () => {
  const DISCOVERY = {
    version: 'twilight-operator-status-v1',
    draw_record: 'https://as/v1/selection/slots/3/epochs/{epoch}/candidates',
  };
  const DRAW = { version: 1, target_epoch: 61, outcome: 'NO_CANDIDATES', candidates: [], anchor: { tx_hash: 'AB' } };

  it('fetches the draw record beside each epoch fetch, via the discovery template', async () => {
    const prisma = mockPrisma({ entitled: [61], finalized: [61] });
    const urls = [];
    const fetchJson = async (url) => {
      urls.push(url);
      if (url.includes('/candidates')) return { ok: true, status: 200, body: DRAW };
      if (url.includes('/epochs/'))
        return { ok: true, status: 200, body: { state: 'SETTLEMENT_RECONCILED', epoch: 61 } };
      if (url.includes('well-known/twilight'))
        return { ok: true, status: 200, body: DISCOVERY };
      return { ok: true, status: 200, body: CLOCK };
    };
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    assert.ok(urls.includes('https://as/v1/selection/slots/3/epochs/61/candidates'));
    const row = prisma._samples.get(sampleKey(3n, 'draw', 61n));
    assert.equal(row.payloadJson.outcome, 'NO_CANDIDATES');
    // Settled epoch: next run skips BOTH the epoch and its draw.
    urls.length = 0;
    await projectOperatorStatus({ prisma, fetchJson, slotId: 3n, baseUrl: 'https://as' });
    assert.equal(urls.filter((u) => u.includes('/candidates') || u.includes('/epochs/')).length, 0);
  });

  it('drawUrlFrom ignores an off-origin template', async () => {
    const { drawUrlFrom } = await import('../../dist/projections/operator-status-snapshot.js');
    assert.equal(
      drawUrlFrom({ draw_record: 'https://evil/e/{epoch}' }, 'https://as', 3n, 61n),
      'https://as/v1/selection/slots/3/epochs/61/candidates',
    );
    assert.equal(
      drawUrlFrom(DISCOVERY, 'https://as', 3n, 7n),
      'https://as/v1/selection/slots/3/epochs/7/candidates',
    );
  });
});

describe('auth-server health probe', () => {
  it('probes /healthz every run via the health fetcher; outage keeps last good', async () => {
    const prisma = mockPrisma();
    const healthUrls = [];
    const fetchHealth = async (url) => {
      healthUrls.push(url);
      return { ok: true, status: 200, body: { up: true, httpStatus: 200 } };
    };
    await projectOperatorStatus({ prisma, fetchJson: okJson(CLOCK), fetchHealth, slotId: 3n, baseUrl: 'https://as' });
    await projectOperatorStatus({ prisma, fetchJson: okJson(CLOCK), fetchHealth, slotId: 3n, baseUrl: 'https://as' });
    assert.deepEqual(healthUrls, ['https://as/healthz', 'https://as/healthz']); // every run
    const row = prisma._samples.get(sampleKey(3n, 'as_health', null));
    assert.equal(row.payloadJson.up, true);

    const down = async () => ({ ok: false, status: null, error: 'fetch failed' });
    await projectOperatorStatus({ prisma, fetchJson: okJson(CLOCK), fetchHealth: down, slotId: 3n, baseUrl: 'https://as' });
    const after = prisma._samples.get(sampleKey(3n, 'as_health', null));
    assert.equal(after.lastError, 'fetch failed');
    assert.equal(after.payloadJson.up, true); // last good survives
  });
});
