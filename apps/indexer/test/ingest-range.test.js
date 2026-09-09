import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ingestRange, DEFAULT_INGEST_CONCURRENCY } from '../dist/ingest-range.js';

// `IndexerCursor.lastIndexedHeight` is a CONTIGUOUS watermark: readers (the status API, every
// projection CLI's default start height) take it to mean "everything at or below this is
// indexed". Concurrency must never let it run ahead of a hole — that is the silent-gap bug
// class the projections already guard against with readProjectionCursorHeight.

class MockPrisma {
  constructor() {
    this.cursorWrites = [];
    this.blocks = new Map();
    this.indexerCursor = {
      upsert: async (args) => {
        this.cursorWrites.push(args.create.lastIndexedHeight ?? args.update.lastIndexedHeight);
        return args;
      },
    };
    this.block = {
      findUnique: async (args) => this.blocks.get(args.where.height) ?? null,
      upsert: async () => ({}),
    };
    const noop = { upsert: async () => ({}), create: async () => ({}) };
    this.explorerTransaction = noop;
    this.message = noop;
    this.event = noop;
    this.account = noop;
    this.decodeFailure = noop;
    this.$transaction = async (fn) => fn(this);
  }
  get lastCursor() {
    return this.cursorWrites.at(-1) ?? null;
  }
}

// A client whose per-height latency is controllable, so completion order can be inverted.
function makeClient({ delays = {}, failAt = null } = {}) {
  const seen = [];
  const wait = (h) => new Promise((r) => setTimeout(r, delays[String(h)] ?? 0));
  return {
    seen,
    getBlock: async (height) => {
      seen.push(height);
      await wait(height);
      if (failAt !== null && height === failAt) throw new Error(`boom at ${height}`);
      return { height: height.toString(), hash: `H${height}`, time: undefined, raw: {} };
    },
    getBlockResults: async () => ({
      height: '0', beginBlockEvents: [], endBlockEvents: [], finalizeBlockEvents: [],
      txResults: [], raw: {},
    }),
    getTxsByHeight: async () => [],
  };
}

describe('ingestRange (bounded concurrency, contiguous watermark)', () => {
  it('ingests the whole range and lands the watermark on the last height', async () => {
    const prisma = new MockPrisma();
    const client = makeClient();
    const result = await ingestRange({
      chainId: 'twilight-devnet-2',
      startHeight: 1n,
      endHeight: 20n,
      latestChainHeight: 20n,
      client,
      prisma,
      concurrency: 4,
    });
    assert.equal(result.heightsIngested, 20);
    assert.equal(result.lastContiguousHeight, 20n);
    assert.equal(prisma.lastCursor, 20n);
    assert.deepEqual([...client.seen].sort((a, b) => Number(a - b)).map(Number),
      Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('actually runs heights concurrently', async () => {
    const prisma = new MockPrisma();
    // Every height sleeps 30ms; 12 heights at concurrency 6 must take ~2 rounds, not 12.
    const delays = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 30]));
    const started = Date.now();
    await ingestRange({
      chainId: 'c', startHeight: 1n, endHeight: 12n, latestChainHeight: 12n,
      client: makeClient({ delays }), prisma, concurrency: 6,
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 12 * 30, `expected concurrent execution, took ${elapsed}ms`);
  });

  it('NEVER advances the watermark past a hole when a later height finishes first', async () => {
    const prisma = new MockPrisma();
    // Height 1 is slow; 2..5 finish long before it. The watermark must stay null until 1 lands.
    const client = makeClient({ delays: { 1: 60 } });
    const result = await ingestRange({
      chainId: 'c', startHeight: 1n, endHeight: 5n, latestChainHeight: 5n,
      client, prisma, concurrency: 5,
    });
    assert.equal(result.lastContiguousHeight, 5n);
    // The KEY assertion: no cursor write ever claimed a height whose predecessor was pending.
    // Since 1 finished last, the only legal write is a single jump straight to 5.
    assert.deepEqual(prisma.cursorWrites, [5n]);
  });

  it('leaves the watermark below a failing height so the next tick resumes there', async () => {
    const prisma = new MockPrisma();
    // 1..3 succeed, 4 throws, 5..8 may or may not land — none may be claimed.
    const client = makeClient({ failAt: 4n, delays: { 4: 40 } });
    await assert.rejects(
      () => ingestRange({
        chainId: 'c', startHeight: 1n, endHeight: 8n, latestChainHeight: 8n,
        client, prisma, concurrency: 4,
      }),
      /boom at 4/,
    );
    for (const written of prisma.cursorWrites) {
      assert.ok(written < 4n, `watermark ${written} claimed the failed height 4 or beyond`);
    }
  });

  it('is sequential at concurrency 1 (backwards-compatible ordering)', async () => {
    const prisma = new MockPrisma();
    const client = makeClient({ delays: { 1: 30, 2: 20, 3: 10 } });
    await ingestRange({
      chainId: 'c', startHeight: 1n, endHeight: 3n, latestChainHeight: 3n,
      client, prisma, concurrency: 1,
    });
    assert.deepEqual(client.seen, [1n, 2n, 3n]);
    assert.deepEqual(prisma.cursorWrites, [1n, 2n, 3n]);
  });

  it('exposes a sane default concurrency', () => {
    assert.ok(DEFAULT_INGEST_CONCURRENCY >= 4 && DEFAULT_INGEST_CONCURRENCY <= 32);
  });
});
