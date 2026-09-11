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
      if (url.includes('/epochs/')) {
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
      if (url.includes('/epochs/')) {
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
