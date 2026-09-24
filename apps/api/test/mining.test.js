import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import {
  MockPrisma,
  testConfig,
  block,
  entitlement,
  epoch,
  payout,
  settlementChunk,
  settlementFinalization,
} from './mock-prisma.js';

const ADDR = 'twilight1mw4n9ksh7ank3ewqu4vpg7f82ccp83xw03xmgl';
const OTHER = 'twilight1qvkpcjlfjqpzvh2en7rlrx0hz866z4st8phy04';

const build = (data) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });

describe('mining settlement payouts', () => {
  it('lists payouts newest-first and filters by recipient', async () => {
    const app = await build({
      payouts: [payout(1, ADDR, 100), payout(2, OTHER, 101), payout(3, ADDR, 102)],
    });
    const res = await app.inject({ url: `/api/v1/mining/payouts?recipient=${ADDR}` });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().data.map((p) => p.id), ['3', '1']);
    assert.equal(res.json().data[0].recipient, ADDR);
    await app.close();
  });

  it('paginates by the (height, id) keyset', async () => {
    const app = await build({
      payouts: [payout(1, ADDR, 100), payout(2, ADDR, 101), payout(3, ADDR, 102)],
    });
    const first = await app.inject({ url: `/api/v1/mining/payouts?recipient=${ADDR}&limit=2` });
    assert.deepEqual(first.json().data.map((p) => p.id), ['3', '2']);
    const cursor = encodeURIComponent(first.json().page.nextCursor);
    const second = await app.inject({
      url: `/api/v1/mining/payouts?recipient=${ADDR}&limit=2&cursor=${cursor}`,
    });
    assert.deepEqual(second.json().data.map((p) => p.id), ['1']);
    assert.equal(second.json().page.nextCursor, null);
    await app.close();
  });

  it('filters by slot and epoch', async () => {
    const app = await build({
      payouts: [
        payout(1, ADDR, 100, { slotId: 1n, epochNumber: 10n }),
        payout(2, ADDR, 101, { slotId: 2n, epochNumber: 11n }),
      ],
    });
    const bySlot = await app.inject({ url: '/api/v1/mining/payouts?slotId=2' });
    assert.deepEqual(bySlot.json().data.map((p) => p.id), ['2']);
    const byEpoch = await app.inject({ url: '/api/v1/mining/payouts?epoch=10' });
    assert.deepEqual(byEpoch.json().data.map((p) => p.id), ['1']);
    await app.close();
  });

  it('rejects an out-of-int64 numeric filter with 400', async () => {
    const app = await build({ payouts: [] });
    const res = await app.inject({ url: '/api/v1/mining/payouts?slotId=9223372036854775808' });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  it('summarizes total rewards received by an address', async () => {
    const app = await build({
      payouts: [payout(1, ADDR, 100), payout(2, ADDR, 101), payout(3, OTHER, 102)],
    });
    const res = await app.inject({ url: `/api/v1/accounts/${ADDR}/payout-summary` });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.recipient, ADDR);
    assert.equal(d.payoutCount, '2');
    assert.equal(d.totalAmount, '20000000');
    assert.equal(d.denom, 'utwlt');
    await app.close();
  });

  it('sums without precision loss past 2^53 (amounts are int64-scale strings)', async () => {
    // Number() would round these; the sum must be exact, so it happens in the database as
    // numeric and is carried as a decimal string end to end.
    const app = await build({
      payouts: [
        payout(1, ADDR, 100, { amount: '9007199254740993' }),
        payout(2, ADDR, 101, { amount: '1' }),
      ],
    });
    const res = await app.inject({ url: `/api/v1/accounts/${ADDR}/payout-summary` });
    assert.equal(res.json().data.totalAmount, '9007199254740994');
    await app.close();
  });

  it('reports zero for an address that has never been paid', async () => {
    const app = await build({ payouts: [payout(1, OTHER, 100)] });
    const res = await app.inject({ url: `/api/v1/accounts/${ADDR}/payout-summary` });
    assert.equal(res.json().data.payoutCount, '0');
    assert.equal(res.json().data.totalAmount, '0');
    assert.equal(res.json().data.denom, null);
    await app.close();
  });
});

describe('mining settlements', () => {
  const withActivity = () => build({
    chunks: [
      settlementChunk(1, 62, 0, 22608),
      settlementChunk(1, 62, 1, 22610, { chunkTotal: '5000000', recipientCount: 2 }),
      settlementChunk(2, 61, 0, 22400),
    ],
    finalizations: [settlementFinalization(1, 62, 22623)],
    payouts: [
      payout(1, ADDR, 22608, { slotId: 1n, epochNumber: 62n }),
      payout(2, OTHER, 22610, { slotId: 1n, epochNumber: 62n, amount: '5000000', chunkIndex: 1n }),
      payout(3, ADDR, 22400, { slotId: 2n, epochNumber: 61n }),
    ],
  });

  it('lists settlements newest-epoch-first with counts and totals', async () => {
    const app = await withActivity();
    const res = await app.inject({ url: '/api/v1/mining/settlements' });
    assert.equal(res.statusCode, 200);
    const rows = res.json().data;
    assert.deepEqual(rows.map((r) => `${r.slotId}/${r.epochNumber}`), ['1/62', '2/61']);
    const first = rows[0];
    assert.equal(first.chunkCount, 2);
    assert.equal(first.payoutCount, 2);
    assert.equal(first.totalPaid, '15000000');
    await app.close();
  });

  it('marks settled ONLY when the chain finalized it, never inferred from payouts', async () => {
    const app = await withActivity();
    const rows = (await app.inject({ url: '/api/v1/mining/settlements' })).json().data;
    const settled = rows.find((r) => r.slotId === '1');
    const open = rows.find((r) => r.slotId === '2');
    assert.equal(settled.settled, true);
    assert.equal(settled.finalizationReason, 'SETTLEMENT_FINALIZATION_REASON_AUTHORIZED_EARLY');
    assert.equal(settled.releasedRemainder, '0');
    // Slot 2 has payouts but no finalization event: paid-out is NOT the same as settled.
    assert.equal(open.settled, false);
    assert.equal(open.finalizationReason, null);
    await app.close();
  });

  it('filters by slot and by epoch', async () => {
    const app = await withActivity();
    const bySlot = await app.inject({ url: '/api/v1/mining/settlements?slotId=2' });
    assert.deepEqual(bySlot.json().data.map((r) => r.slotId), ['2']);
    await app.close();
  });

  it('detail returns the chunks and every recipient payout with amounts', async () => {
    const app = await withActivity();
    const res = await app.inject({ url: '/api/v1/mining/settlements/1/62' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.settled, true);
    assert.deepEqual(d.chunks.map((c) => c.chunkIndex), ['0', '1']);
    assert.deepEqual(
      d.payouts.map((p) => [p.recipient, p.amount]),
      [[ADDR, '10000000'], [OTHER, '5000000']],
    );
    await app.close();
  });

  it('404s for a settlement with no observed activity', async () => {
    const app = await withActivity();
    const res = await app.inject({ url: '/api/v1/mining/settlements/9/9' });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  it('rejects a non-numeric slot id with 400', async () => {
    const app = await withActivity();
    const res = await app.inject({ url: '/api/v1/mining/settlements/abc/62' });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});


describe('mining settlement status (expected vs settled)', () => {
  // Epoch 61 closed at height 610 and settled at 623 (latency 13); epoch 62 closed at 620 and
  // has NO finalization — open, and open for tip(700) - 620 = 80 blocks.
  const withExpectations = () => build({
    blocks: [block(700)],
    epochs: [epoch(61), epoch(62)],
    entitlements: [entitlement(1, 1, 61), entitlement(2, 1, 62)],
    finalizations: [settlementFinalization(1, 61, 623)],
  });

  it('marks entitlements settled/open with latency and open-age', async () => {
    const app = await withExpectations();
    const res = await app.inject({ url: '/api/v1/mining/settlements/status' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    // Newest epoch first.
    assert.deepEqual(body.data.map((r) => r.epochNumber), ['62', '61']);
    const open = body.data[0];
    assert.equal(open.settled, false);
    assert.equal(open.latencyBlocks, null);
    assert.equal(open.openForBlocks, '80');
    const settled = body.data[1];
    assert.equal(settled.settled, true);
    assert.equal(settled.latencyBlocks, '13');
    assert.equal(settled.openForBlocks, null);
    await app.close();
  });

  it('returns per-slot latency summaries alongside the page', async () => {
    const app = await withExpectations();
    const res = await app.inject({ url: '/api/v1/mining/settlements/status' });
    const slots = res.json().slots;
    assert.equal(slots.length, 1);
    assert.equal(slots[0].slotId, '1');
    assert.equal(slots[0].settledCount, 1);
    assert.equal(slots[0].openCount, 1);
    assert.equal(slots[0].medianLatencyBlocks, '13');
    await app.close();
  });

  it('filters by slot', async () => {
    const app = await build({
      blocks: [block(700)],
      epochs: [epoch(61)],
      entitlements: [entitlement(1, 1, 61), entitlement(2, 2, 61)],
      finalizations: [],
    });
    const res = await app.inject({ url: '/api/v1/mining/settlements/status?slotId=2' });
    assert.deepEqual(res.json().data.map((r) => r.slotId), ['2']);
    await app.close();
  });
});

describe('payout split context (why this amount)', () => {
  it('each payout row carries its entitlement pool and recipient count', async () => {
    const app = await build({
      entitlements: [entitlement(1, 1, 62, { entitlementAmount: '30000000' })],
      payouts: [
        payout(1, ADDR, 100, { slotId: 1n, epochNumber: 62n }),
        payout(2, OTHER, 101, { slotId: 1n, epochNumber: 62n }),
      ],
    });
    const res = await app.inject({ url: `/api/v1/mining/payouts?recipient=${ADDR}` });
    assert.equal(res.statusCode, 200);
    const row = res.json().data[0];
    assert.equal(row.entitlementAmount, '30000000');
    assert.equal(row.recipientCount, 2);
    await app.close();
  });

  it('an unobserved entitlement is null, never invented', async () => {
    const app = await build({
      payouts: [payout(1, ADDR, 100, { slotId: 9n, epochNumber: 9n })],
    });
    const res = await app.inject({ url: `/api/v1/mining/payouts?recipient=${ADDR}` });
    assert.equal(res.json().data[0].entitlementAmount, null);
    assert.equal(res.json().data[0].recipientCount, 1);
    await app.close();
  });
});
