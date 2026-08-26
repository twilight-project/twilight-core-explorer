import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import { MockPrisma, testConfig, payout } from './mock-prisma.js';

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
