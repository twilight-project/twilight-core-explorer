import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildServer } from '../dist/server.js';
import { MockPrisma, testConfig, consensusWindow, networkRisk } from './mock-prisma.js';

const build = (data) => buildServer({ config: testConfig, prisma: new MockPrisma(data) });

describe('network proposers', () => {
  it('aggregates attributed blocks per slot, sorted desc; ignores unattributed', async () => {
    const app = await build({
      attributions: [
        { height: 1n, slotId: 1n, operatorAddress: 'op1', attributionStatus: 'attributed' },
        { height: 2n, slotId: 1n, operatorAddress: 'op1', attributionStatus: 'attributed' },
        { height: 3n, slotId: 2n, operatorAddress: 'op2', attributionStatus: 'attributed' },
        { height: 4n, slotId: null, operatorAddress: null, attributionStatus: 'unmapped_validator' },
      ],
    });
    const res = await app.inject({ url: '/api/v1/network/proposers' });
    assert.deepEqual(res.json().data, [
      { slotId: '1', operatorAddress: 'op1', blocksProposed: 2 },
      { slotId: '2', operatorAddress: 'op2', blocksProposed: 1 },
    ]);
    await app.close();
  });

  it('breaks ties deterministically by slotId ASC', async () => {
    // slot 3 inserted before slot 1, both with one attributed block -> tie-break must order 1 before 3
    const app = await build({
      attributions: [
        { height: 1n, slotId: 3n, operatorAddress: 'op3', attributionStatus: 'attributed' },
        { height: 2n, slotId: 1n, operatorAddress: 'op1', attributionStatus: 'attributed' },
      ],
    });
    const res = await app.inject({ url: '/api/v1/network/proposers' });
    assert.deepEqual(res.json().data.map((r) => r.slotId), ['1', '3']);
    await app.close();
  });
});

describe('network validator-set', () => {
  it('returns windows active at the height (effectiveFrom <= h < effectiveTo|null)', async () => {
    const app = await build({
      windows: [
        consensusWindow(1, 1, 5, 100), // active [5,100)
        consensusWindow(2, 2, 100, null), // active [100, inf)
        consensusWindow(3, 3, 200, null), // not yet active at 150
      ],
    });
    const res = await app.inject({ url: '/api/v1/network/validator-set?height=150' });
    assert.deepEqual(res.json().data.map((m) => m.slotId), ['2']);
    await app.close();
  });

  it('includes a window whose effectiveTo equals nothing and excludes effectiveTo==height', async () => {
    const app = await build({
      windows: [
        consensusWindow(1, 1, 5, 100), // [5,100): at height 100 -> excluded (to == height)
        consensusWindow(2, 2, 5, null), // [5, inf): included
      ],
    });
    const res = await app.inject({ url: '/api/v1/network/validator-set?height=100' });
    assert.deepEqual(res.json().data.map((m) => m.slotId), ['2']);
    await app.close();
  });

  it('400 when height is missing, non-numeric, or out of int64 range', async () => {
    const app = await build({});
    assert.equal((await app.inject({ url: '/api/v1/network/validator-set' })).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/v1/network/validator-set?height=abc' })).statusCode, 400);
    assert.equal(
      (await app.inject({ url: '/api/v1/network/validator-set?height=9223372036854775808' })).statusCode,
      400,
    );
    await app.close();
  });
});

describe('network liveness-risk', () => {
  it('returns the current snapshot with status strings verbatim', async () => {
    const app = await build({ networkRisk: networkRisk({ haltRiskLevel: 'warning', haltRiskReason: 'one down' }) });
    const res = await app.inject({ url: '/api/v1/network/liveness-risk' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.haltRiskLevel, 'warning');
    assert.equal(res.json().data.haltRiskReason, 'one down');
    assert.equal(res.json().data.availablePowerBps, 10000);
    await app.close();
  });

  it('404 when no snapshot exists', async () => {
    const app = await build({});
    const res = await app.inject({ url: '/api/v1/network/liveness-risk' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'not_found');
    await app.close();
  });
});

describe('network signing heatmap', () => {
  const le = (h, slotId, status) => ({
    committedBlockHeight: BigInt(h),
    slotId: BigInt(slotId),
    operatorAddress: `op${slotId}`,
    consensusAddress: `c${slotId}`,
    status,
  });

  it('builds a per-slot grid aligned to the window heights (signed/missed/null)', async () => {
    const app = await build({
      livenessEvidence: [
        le(100, 1, 'signed'),
        le(100, 2, 'missed'),
        le(101, 1, 'signed'),
        le(101, 2, 'signed'),
        le(102, 1, 'missed'), // slot 2 has NO row at 102 -> its cell must be null
      ],
    });
    const res = await app.inject({ url: '/api/v1/network/signing-heatmap' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.blocksInWindow, 3);
    assert.deepEqual(d.heights, ['100', '101', '102']); // ascending columns
    assert.equal(d.fromHeight, '100');
    assert.equal(d.toHeight, '102');
    assert.equal(d.slots.length, 2);
    const [s1, s2] = d.slots; // sorted by slotId asc
    assert.equal(s1.slotId, '1');
    assert.deepEqual(s1.cells, ['signed', 'signed', 'missed']);
    assert.equal(s1.signed, 2);
    assert.equal(s1.missed, 1);
    assert.equal(s1.operatorAddress, 'op1');
    assert.equal(s2.slotId, '2');
    assert.deepEqual(s2.cells, ['missed', 'signed', null]); // null where slot 2 had no evidence
    assert.equal(s2.signed, 1);
    assert.equal(s2.missed, 1);
    await app.close();
  });

  it('windows to the last N distinct committed heights', async () => {
    const app = await build({
      livenessEvidence: [le(100, 1, 'signed'), le(101, 1, 'signed'), le(102, 1, 'missed')],
    });
    const d = (await app.inject({ url: '/api/v1/network/signing-heatmap?window=2' })).json().data;
    assert.equal(d.blocksInWindow, 2);
    assert.deepEqual(d.heights, ['101', '102']); // the newest 2, ascending
    await app.close();
  });

  it('returns 200 with empty arrays when there is no evidence', async () => {
    const app = await build({ livenessEvidence: [] });
    const res = await app.inject({ url: '/api/v1/network/signing-heatmap' });
    assert.equal(res.statusCode, 200);
    const d = res.json().data;
    assert.equal(d.blocksInWindow, 0);
    assert.deepEqual(d.heights, []);
    assert.deepEqual(d.slots, []);
    assert.equal(d.fromHeight, null);
    await app.close();
  });

  it('rejects an out-of-range window with 400 invalid_query', async () => {
    const app = await build({ livenessEvidence: [] });
    const res = await app.inject({ url: '/api/v1/network/signing-heatmap?window=999' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'invalid_query');
    await app.close();
  });
});
