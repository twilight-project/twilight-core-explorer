import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import {
  MockPrisma,
  testConfig,
  epoch,
  entitlement,
  rewardsBalance,
  paramsChange,
  treasuryPayment,
  coreSlot,
} from './mock-prisma.js';

const build = (data) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });

describe('rewards epochs', () => {
  it('lists epochNumber DESC with rewardSemantics + keyset pagination', async () => {
    const app = await build({ epochs: [epoch(1), epoch(2), epoch(3)] });
    const res = await app.inject({ url: '/api/v1/rewards/epochs?limit=2' });
    assert.deepEqual(res.json().data.map((e) => e.epochNumber), ['3', '2']);
    assert.equal(res.json().data[0].rewardSemantics, 'aggregate_projection');
    // Phase 7.2: emission context promoted to first-class contract fields.
    assert.equal(res.json().data[0].cumulativeEmitted, '1000');
    assert.equal(res.json().data[0].distributionMethod, 'DISTRIBUTION_METHOD_UNIFORM_ACTIVE_BLOCKS');
    assert.ok(res.json().page.nextCursor);
    const res2 = await app.inject({
      url: `/api/v1/rewards/epochs?limit=2&cursor=${encodeURIComponent(res.json().page.nextCursor)}`,
    });
    assert.deepEqual(res2.json().data.map((e) => e.epochNumber), ['1']);
    assert.equal(res2.json().page.nextCursor, null);
    await app.close();
  });

  it('detail by epoch; include=raw; 404 missing; 400 invalid_epoch; int64 overflow 400', async () => {
    const app = await build({ epochs: [epoch(5)] });
    const ok = await app.inject({ url: '/api/v1/rewards/epochs/5' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.epochNumber, '5');
    assert.equal(ok.json().data.raw, undefined);
    const raw = await app.inject({ url: '/api/v1/rewards/epochs/5?include=raw' });
    assert.deepEqual(raw.json().data.raw, { epoch: 5 });
    assert.equal((await app.inject({ url: '/api/v1/rewards/epochs/999' })).statusCode, 404);
    const bad = await app.inject({ url: '/api/v1/rewards/epochs/abc' });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'invalid_epoch');
    assert.equal((await app.inject({ url: '/api/v1/rewards/epochs/9223372036854775808' })).statusCode, 400);
    await app.close();
  });
});

describe('coreslot rewards', () => {
  it('400 invalid_slot_id, 404 missing slot, 200 empty existing slot', async () => {
    const app = await build({ coreSlots: [coreSlot(2)] });
    assert.equal((await app.inject({ url: '/api/v1/coreslots/abc/rewards' })).json().error.code, 'invalid_slot_id');
    assert.equal((await app.inject({ url: '/api/v1/coreslots/999/rewards' })).statusCode, 404);
    const empty = await app.inject({ url: '/api/v1/coreslots/2/rewards' });
    assert.equal(empty.statusCode, 200);
    assert.deepEqual(empty.json().data, []);
    await app.close();
  });

  it('returns per-epoch entitlements newest-first with the observed-sample caveat', async () => {
    const app = await build({
      coreSlots: [coreSlot(2)],
      entitlements: [entitlement(1, 2, 1), entitlement(2, 2, 2, { releasedAmount: '250' })],
    });
    const res = await app.inject({ url: '/api/v1/coreslots/2/rewards' });
    assert.deepEqual(res.json().data.map((r) => r.epochNumber), ['2', '1']);
    const item = res.json().data[0];
    // Release is what x/mining settlement has paid out so far, not a claim flag.
    assert.equal(item.entitlementAmount, '250');
    assert.equal(item.releasedAmount, '250');
    assert.equal(item.slotStatusAtEpochClose, 'SLOT_STATUS_ACTIVE');
    assert.equal(item.claimSemantics, 'projection_observed_not_live_claimable');
    await app.close();
  });
});

describe('rewards entitlements', () => {
  it('orders epoch DESC then slot ASC, paginates by slot cursor, and filters', async () => {
    const app = await build({
      entitlements: [entitlement(1, 2, 10), entitlement(2, 2, 9), entitlement(3, 3, 11)],
    });
    const res = await app.inject({ url: '/api/v1/rewards/entitlements?limit=2' });
    assert.deepEqual(res.json().data.map((c) => c.id), ['3', '1']); // epoch 11, then epoch 10
    assert.equal(res.json().data[0].claimSemantics, 'projection_observed_not_live_claimable');

    const byEpoch = await app.inject({ url: '/api/v1/rewards/entitlements?epoch=9' });
    assert.deepEqual(byEpoch.json().data.map((c) => c.id), ['2']);

    const bySlot = await app.inject({ url: '/api/v1/rewards/entitlements?slotId=3' });
    assert.deepEqual(bySlot.json().data.map((c) => c.id), ['3']);

    const byPayout = await app.inject({
      url: '/api/v1/rewards/entitlements?payoutAddress=twilight1payout',
    });
    assert.equal(byPayout.json().data.length, 3);
    await app.close();
  });

  it('rejects an out-of-int64 slotId filter with 400', async () => {
    const app = await build({ entitlements: [] });
    const res = await app.inject({ url: '/api/v1/rewards/entitlements?slotId=9223372036854775808' });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe('rewards balances', () => {
  it('excludes supply by default; includes via ?sampleKind=supply', async () => {
    const app = await build({
      rewardsBalances: [
        rewardsBalance(1, 'module_balance'),
        rewardsBalance(2, 'supply'),
        rewardsBalance(3, 'cumulative_emitted'),
      ],
    });
    const def = await app.inject({ url: '/api/v1/rewards/balances' });
    assert.deepEqual(def.json().data.map((b) => b.sampleKind).sort(), ['cumulative_emitted', 'module_balance']);
    assert.equal(def.json().data[0].source, 'sampled');
    const sup = await app.inject({ url: '/api/v1/rewards/balances?sampleKind=supply' });
    assert.deepEqual(sup.json().data.map((b) => b.sampleKind), ['supply']);
    await app.close();
  });
});

describe('rewards params + treasury', () => {
  it('params id DESC + changeType filter', async () => {
    const app = await build({
      paramsChanges: [paramsChange(1, { changeType: 'queued' }), paramsChange(2, { changeType: 'activated' })],
    });
    assert.deepEqual((await app.inject({ url: '/api/v1/rewards/params' })).json().data.map((p) => p.id), ['2', '1']);
    const f = await app.inject({ url: '/api/v1/rewards/params?changeType=queued' });
    assert.deepEqual(f.json().data.map((p) => p.id), ['1']);
    await app.close();
  });

  it('treasury id DESC', async () => {
    const app = await build({ treasuryPayments: [treasuryPayment(1), treasuryPayment(2)] });
    const res = await app.inject({ url: '/api/v1/rewards/treasury-payments' });
    assert.deepEqual(res.json().data.map((t) => t.id), ['2', '1']);
    assert.equal(res.json().data[0].amount, '42');
    await app.close();
  });
});

// Per-endpoint cursor + final-page coverage (mirrors the acceptance checklist literally, even though
// all routes share the hardened cursor helpers).
describe('rewards list endpoints — pagination edge cases', () => {
  const cases = [
    { name: 'epochs', url: '/api/v1/rewards/epochs', data: { epochs: [epoch(1), epoch(2)] } },
    {
      name: 'coreslot rewards',
      url: '/api/v1/coreslots/2/rewards',
      data: { coreSlots: [coreSlot(2)], entitlements: [entitlement(1, 2, 1), entitlement(2, 2, 2)] },
    },
    { name: 'entitlements', url: '/api/v1/rewards/entitlements', data: { entitlements: [entitlement(1, 2, 10), entitlement(2, 2, 11)] } },
    {
      name: 'balances',
      url: '/api/v1/rewards/balances',
      data: { rewardsBalances: [rewardsBalance(1, 'module_balance'), rewardsBalance(2, 'cumulative_emitted')] },
    },
    { name: 'params', url: '/api/v1/rewards/params', data: { paramsChanges: [paramsChange(1), paramsChange(2)] } },
    {
      name: 'treasury-payments',
      url: '/api/v1/rewards/treasury-payments',
      data: { treasuryPayments: [treasuryPayment(1), treasuryPayment(2)] },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: malformed cursor -> 400 invalid_cursor`, async () => {
      const app = await build(c.data);
      const res = await app.inject({ url: `${c.url}?cursor=@@@` });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'invalid_cursor');
      await app.close();
    });

    it(`${c.name}: full final page emits nextCursor:null`, async () => {
      const app = await build(c.data);
      const res = await app.inject({ url: `${c.url}?limit=2` });
      assert.equal(res.json().data.length, 2);
      assert.equal(res.json().page.nextCursor, null);
      await app.close();
    });
  }
});
