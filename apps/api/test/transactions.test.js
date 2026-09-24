import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import { MockPrisma, testConfig, tx, msg, evt, block } from './mock-prisma.js';

const build = (data) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });
const cursor = (...parts) => Buffer.from(parts.map(String).join(':'), 'utf8').toString('base64url');

describe('txs list', () => {
  it('lists newest-first (height desc, index desc) and paginates via a composite cursor', async () => {
    const app = await build({
      txs: [tx('A', 10, 0), tx('B', 10, 1), tx('C', 11, 0)],
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs?limit=2' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(body.data.map((t) => t.hash), ['C', 'B']); // 11/0, then 10/1
    assert.ok(body.page.nextCursor);

    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/txs?limit=2&cursor=${encodeURIComponent(body.page.nextCursor)}`,
    });
    assert.deepEqual(res2.json().data.map((t) => t.hash), ['A']); // 10/0
    assert.equal(res2.json().page.nextCursor, null);
    await app.close();
  });

  it('emits nextCursor:null on a full final page (N+1 lookahead)', async () => {
    const app = await build({ txs: [tx('A', 1, 0), tx('B', 2, 0)] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs?limit=2' });
    assert.equal(res.json().data.length, 2);
    assert.equal(res.json().page.nextCursor, null);
    await app.close();
  });

  it('filters by exact height', async () => {
    const app = await build({ txs: [tx('A', 1, 0), tx('B', 2, 0), tx('C', 2, 1)] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs?height=2' });
    assert.deepEqual(res.json().data.map((t) => t.hash), ['C', 'B']);
    await app.close();
  });

  it('filters by status', async () => {
    const app = await build({
      txs: [
        tx('A', 3, 0, { status: 'success' }),
        tx('B', 2, 0, { status: 'failed', code: 5 }),
        tx('C', 1, 0, { status: 'success' }),
      ],
    });
    const ok = await app.inject({ method: 'GET', url: '/api/v1/txs?status=success' });
    assert.deepEqual(ok.json().data.map((t) => t.hash), ['A', 'C']);
    const failed = await app.inject({ method: 'GET', url: '/api/v1/txs?status=failed' });
    assert.deepEqual(failed.json().data.map((t) => t.hash), ['B']);
    await app.close();
  });

  it('rejects bad limit / bad cursor with 400', async () => {
    const app = await build({ txs: [] });
    assert.equal((await app.inject({ url: '/api/v1/txs?limit=999' })).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/v1/txs?cursor=@@@' })).statusCode, 400);
    await app.close();
  });

  it('rejects a tx cursor with an unsafe index', async () => {
    const app = await build({ txs: [] });
    const unsafe = cursor(10, BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    const res = await app.inject({ url: `/api/v1/txs?cursor=${unsafe}` });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'invalid_cursor');
    await app.close();
  });

  it('serializes height + gas as strings, never raw on list', async () => {
    const app = await build({ txs: [tx('A', 7, 0)] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs' });
    const item = res.json().data[0];
    assert.equal(item.height, '7');
    assert.equal(item.gasUsed, '80000');
    assert.equal(item.raw, undefined);
    assert.equal(item.rawTx, undefined);
    await app.close();
  });
});

describe('txs typeGroup filter', () => {
  // The filter is a CLOSED enum split across three files (this DTO, the route's prefix map,
  // and the web filter options). devnet-2 shipped x/mining and the enum was not extended, so
  // /txs?typeGroup=mining answered 400 on the live deployment. Pin every module family.
  for (const group of ['coreslot', 'rewards', 'mining', 'bank']) {
    it(`accepts typeGroup=${group}`, async () => {
      const app = await buildServer({ config: testConfig, prisma: new MockPrisma({ txs: [] }) });
      const res = await app.inject({ url: `/api/v1/txs?typeGroup=${group}` });
      assert.equal(res.statusCode, 200, `typeGroup=${group} must be accepted`);
      await app.close();
    });
  }

  it('actually filters by module family (mining vs coreslot)', async () => {
    const prisma = new MockPrisma({
      txs: [tx('MINETX', 100n, 0), tx('SLOTTX', 101n, 0)],
      messages: [
        msg('MINETX', 0, { typeUrl: '/twilight.mining.v1.MsgSubmitSettlementChunk', module: 'mining' }),
        msg('SLOTTX', 0, { typeUrl: '/twilight.coreslot.v1.MsgUpdatePayoutAddress' }),
      ],
    });
    const app = await buildServer({ config: testConfig, prisma });
    const mining = await app.inject({ url: '/api/v1/txs?typeGroup=mining' });
    assert.deepEqual(mining.json().data.map((t) => t.hash), ['MINETX']);
    const coreslot = await app.inject({ url: '/api/v1/txs?typeGroup=coreslot' });
    assert.deepEqual(coreslot.json().data.map((t) => t.hash), ['SLOTTX']);
    await app.close();
  });

  it('still rejects an unknown group', async () => {
    const app = await buildServer({ config: testConfig, prisma: new MockPrisma({ txs: [] }) });
    const res = await app.inject({ url: '/api/v1/txs?typeGroup=staking' });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

describe('tx detail', () => {
  it('returns tx with materialized messages, events, block time; raw excluded by default', async () => {
    const app = await build({
      txs: [tx('A', 7, 0)],
      blocks: [block(7)],
      messages: [msg('A', 0), msg('A', 1)],
      events: [evt('A', 0), evt('A', 1)],
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/A' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.hash, 'A');
    assert.equal(d.time, '2026-06-26T00:00:00.000Z');
    assert.equal(d.messages.length, 2);
    assert.equal(d.messages[0].msgIndex, 0);
    assert.equal(d.messages[0].raw, undefined); // no message raw without include=raw
    assert.equal(d.events.length, 2);
    assert.equal(d.raw, undefined);
    assert.ok(d.fee);
    await app.close();
  });

  it('include=raw adds tx raw + message raw', async () => {
    const app = await build({ txs: [tx('A', 7, 0)], blocks: [block(7)], messages: [msg('A', 0)] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/A?include=raw' });
    const d = res.json().data;
    assert.deepEqual(d.raw.tx, { tx: 'A' });
    assert.deepEqual(d.messages[0].raw, { raw: 0 });
    await app.close();
  });

  it('returns 404 for an unknown hash', async () => {
    const app = await build({ txs: [] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/NOPE' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'not_found');
    await app.close();
  });
});

describe('txs aggregate', () => {
  it('computes windowed success/failed/rate and avg messages per tx', async () => {
    const app = await build({
      txs: [
        tx('A', 10, 0, { status: 'success', messageTypesJson: ['m1'] }),
        tx('B', 10, 1, { status: 'failed', messageTypesJson: ['m1', 'm2'] }),
        tx('C', 11, 0, { status: 'success', messageTypesJson: ['m1', 'm2', 'm3'] }),
        tx('D', 12, 0, { status: 'success', messageTypesJson: [] }),
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/aggregate' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.txsInWindow, 4);
    assert.equal(d.successCount, 3);
    assert.equal(d.failedCount, 1);
    assert.equal(d.otherCount, 0);
    assert.equal(d.successRate, 75); // 3/4
    assert.equal(d.totalMessages, 6); // 1+2+3+0
    assert.equal(d.avgMessagesPerTx, 1.5);
    assert.equal(d.fromHeight, '10');
    assert.equal(d.toHeight, '12');
    await app.close();
  });

  it('counts a non-success/failed status as "other"', async () => {
    const app = await build({
      txs: [tx('A', 1, 0, { status: 'success' }), tx('B', 2, 0, { status: 'pending' })],
    });
    const d = (await app.inject({ method: 'GET', url: '/api/v1/txs/aggregate' })).json().data;
    assert.equal(d.successCount, 1);
    assert.equal(d.failedCount, 0);
    assert.equal(d.otherCount, 1);
    await app.close();
  });

  it('returns 200 with nulls/0 on an empty chain (never 404, never a guessed 0)', async () => {
    const app = await build({ txs: [] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/aggregate' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.txsInWindow, 0);
    assert.equal(d.successRate, null);
    assert.equal(d.avgMessagesPerTx, null);
    assert.equal(d.fromHeight, null);
    assert.equal(d.totalMessages, 0);
    await app.close();
  });

  it('rejects an out-of-range window with 400 invalid_query', async () => {
    const app = await build({ txs: [] });
    const res = await app.inject({ method: 'GET', url: '/api/v1/txs/aggregate?window=99999' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'invalid_query');
    await app.close();
  });
});


describe('tx list fee (CR-D)', () => {
  it('surfaces the first fee coin and nulls odd shapes', async () => {
    const app = await buildServer({ config: testConfig, prisma: new MockPrisma({
      txs: [
        tx('FEE1', 10, 0),
        tx('FEE2', 11, 0, { feeJson: null }),
        tx('FEE3', 12, 0, { feeJson: { amount: 'not-a-list' } }),
      ],
    }) });
    const res = await app.inject({ url: '/api/v1/txs' });
    const byHash = Object.fromEntries(res.json().data.map((t) => [t.hash, t]));
    // The tx() factory carries feeJson {amount:[{denom:'utwlt',amount:'5'}]}.
    assert.equal(byHash.FEE1.feeAmount, '5');
    assert.equal(byHash.FEE1.feeDenom, 'utwlt');
    assert.equal(byHash.FEE2.feeAmount, null);
    assert.equal(byHash.FEE3.feeAmount, null);
    await app.close();
  });
});
