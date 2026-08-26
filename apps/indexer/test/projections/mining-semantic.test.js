import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MINING_SEMANTIC_PROJECTION,
  MINING_SUBMIT_CHUNK_TYPE_URL,
  MINING_FINALIZE_SETTLEMENT_TYPE_URL,
} from '../../dist/projections/types.js';
import {
  projectMiningSemanticHeight,
  projectMiningSemanticRange,
} from '../../dist/projections/mining-semantic.js';
import { resetMiningProjections } from '../../dist/projections/reset-mining.js';

const CHAIN_ID = 'twilight-devnet-2';
const SETTLEMENT_ADDR = 'twilight1kkxs9mjpq5waz7uxkugntzsp4dj67fgy4dwmk5';
const RECIPIENT = 'twilight1qvkpcjlfjqpzvh2en7rlrx0hz866z4st8phy04';

describe('Mining semantic projection', () => {
  it('1. chunk event + message writes a chunk row WITH the per-recipient payouts', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 22608n, slotId: 1n, epoch: 62n, chunkIndex: 0n });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 22608n });

    assert.equal(p.chunks.length, 1);
    const c = p.chunks[0];
    assert.equal(c.slotId, 1n);
    assert.equal(c.epochNumber, 62n);
    assert.equal(c.chunkIndex, 0n);
    assert.equal(c.nextChunkIndex, 1n);
    assert.equal(c.recipientCount, 1);
    assert.equal(c.chunkTotal, '10000000');
    // The payout LINES are only in the tx body — the event carries aggregates alone.
    assert.deepEqual(c.payoutsJson, [{ recipient: RECIPIENT, amount: '10000000' }]);
    assert.equal(failureKinds(p).length, 0);
  });

  it('2. finalization event writes the reason and remainder VERBATIM', async () => {
    const p = new MockMiningPrisma();
    p.seedFinalize({
      height: 22623n,
      slotId: 1n,
      epoch: 62n,
      reason: 'SETTLEMENT_FINALIZATION_REASON_AUTHORIZED_EARLY',
      remainder: '0',
      finalizedHeight: '22623',
    });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 22623n });

    assert.equal(p.finalizations.length, 1);
    const f = p.finalizations[0];
    assert.equal(f.finalizationReason, 'SETTLEMENT_FINALIZATION_REASON_AUTHORIZED_EARLY');
    assert.equal(f.releasedRemainder, '0');
    assert.equal(f.finalizedHeight, 22623n);
  });

  it('3. a chunk on a FAILED tx creates no semantic state', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 100n, slotId: 1n, epoch: 5n, chunkIndex: 0n, failed: true });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 100n });
    assert.equal(p.chunks.length, 0);
    assert.equal(p.payouts.length, 0);
    assert.equal(p.finalizations.length, 0);
  });

  it('4. a chunk event with no correlated message still records aggregates, payouts null', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 200n, slotId: 2n, epoch: 7n, chunkIndex: 0n, withMessage: false });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 200n });

    assert.equal(p.chunks.length, 1, 'the event is authoritative for the aggregates');
    assert.equal(p.chunks[0].chunkTotal, '10000000');
    assert.equal(p.chunks[0].payoutsJson, undefined, 'payouts are never invented');
    assert.ok(failureKinds(p).includes('missing_message'));
  });

  it('5. ambiguous correlation (two same-type msgs, no msgIndex) attaches no payouts', async () => {
    const p = new MockMiningPrisma();
    // Two chunk messages in one tx and an event with msgIndex null: not resolvable. Guessing
    // would attach the WRONG recipient set to a payout row.
    p.seedChunk({ height: 300n, slotId: 1n, epoch: 9n, chunkIndex: 0n, msgIndexOnEvent: null });
    p.messages.push(chunkMessage(99n, 'CHUNKTX300', 300n, 1));
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 300n });

    assert.equal(p.chunks[0].payoutsJson, undefined);
    assert.ok(failureKinds(p).includes('missing_message'));
  });

  it('6. invalid slot_id records a failure and writes no row', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 400n, slotId: 1n, epoch: 3n, chunkIndex: 0n, slotIdAttr: 'not-a-number' });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 400n });
    assert.equal(p.chunks.length, 0);
    assert.ok(failureKinds(p).includes('invalid_slot_id'));
  });

  it('7. rerun over the same range is idempotent (rows and failures)', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 500n, slotId: 1n, epoch: 11n, chunkIndex: 0n });
    p.seedFinalize({ height: 501n, slotId: 1n, epoch: 11n, reason: 'X', remainder: '5' });

    await projectMiningSemanticRange({ prisma: p, chainId: CHAIN_ID, startHeight: 500n, endHeight: 501n });
    const afterFirst = { c: p.chunks.length, f: p.finalizations.length, x: p.failures.length };
    await projectMiningSemanticRange({ prisma: p, chainId: CHAIN_ID, startHeight: 500n, endHeight: 501n });

    assert.deepEqual({ c: p.chunks.length, f: p.finalizations.length, x: p.failures.length }, afterFirst);
  });

  it('8. the cursor advances to the projected height', async () => {
    const p = new MockMiningPrisma();
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 42n });
    assert.equal(p.cursors.get(MINING_SEMANTIC_PROJECTION), 42n);
  });

  it('8b. unnests each payout line into its own recipient-keyed row', async () => {
    // This is the end-user reward record: participants never claim, they are paid inside the
    // chunk. JSON on the chunk row cannot be indexed by recipient, so the lines get their own
    // rows — that is what makes "what has this address received" a plain lookup.
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 700n, slotId: 1n, epoch: 15n, chunkIndex: 0n });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 700n });

    assert.equal(p.payouts.length, 1);
    const row = p.payouts[0];
    assert.equal(row.recipient, RECIPIENT);
    assert.equal(row.amount, '10000000');
    assert.equal(row.slotId, 1n);
    assert.equal(row.epochNumber, 15n);
    assert.equal(row.height, 700n);
    assert.equal(row.payoutIndex, 0);
  });

  it('8c. a chunk with NO correlated message produces no payout rows (never invented)', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 710n, slotId: 1n, epoch: 16n, chunkIndex: 0n, withMessage: false });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 710n });
    assert.equal(p.chunks.length, 1, 'the chunk aggregate still lands');
    assert.equal(p.payouts.length, 0, 'but no payout lines are fabricated');
  });

  it('8d. a replay that sees fewer payout lines does not leave stale rows behind', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 720n, slotId: 1n, epoch: 17n, chunkIndex: 0n });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 720n });
    assert.equal(p.payouts.length, 1);

    // Simulate the message becoming uncorrelatable on a rebuild: the delete-then-insert for
    // this chunk must clear the previous run's rows rather than orphaning them.
    p.messages.length = 0;
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 720n });
    assert.equal(p.payouts.length, 0, 'stale payout rows from the prior run are gone');
  });

  it('9. reset clears mining rows but preserves generic + other-domain rows', async () => {
    const p = new MockMiningPrisma();
    p.seedChunk({ height: 600n, slotId: 1n, epoch: 13n, chunkIndex: 0n });
    await projectMiningSemanticHeight({ prisma: p, chainId: CHAIN_ID, height: 600n });
    p.failures.push({ projectionName: 'rewards_semantic_v1', failureKind: 'other_domain' });
    assert.equal(p.chunks.length, 1);

    await resetMiningProjections(p);

    assert.equal(p.chunks.length, 0);
    assert.equal(p.payouts.length, 0);
    assert.equal(p.finalizations.length, 0);
    assert.equal(p.events.length > 0, true, 'generic Event rows survive a projection reset');
    assert.equal(p.messages.length > 0, true, 'generic Message rows survive a projection reset');
    assert.equal(
      p.failures.some((f) => f.projectionName === 'rewards_semantic_v1'),
      true,
      'another domain’s failures are untouched',
    );
  });
});

function failureKinds(p) {
  return p.failures.filter((f) => f.projectionName === MINING_SEMANTIC_PROJECTION).map((f) => f.failureKind);
}

function chunkMessage(id, txHash, height, msgIndex) {
  return {
    id,
    txHash,
    height,
    msgIndex,
    typeUrl: MINING_SUBMIT_CHUNK_TYPE_URL,
    decodedJson: {
      settlement_address: SETTLEMENT_ADDR,
      slot_id: '1',
      epoch: '62',
      chunk_index: String(msgIndex),
      payouts: [{ recipient: RECIPIENT, amount: '10000000' }],
    },
    rawJson: { raw: true },
  };
}

class MockMiningPrisma {
  constructor() {
    this.transactions = [];
    this.messages = [];
    this.events = [];
    this.chunks = [];
    this.payouts = [];
    this.finalizations = [];
    this.settlements = [];
    this.failures = [];
    this.cursors = new Map();
    this._eventId = 1000n;

    this.explorerTransaction = {
      findMany: async (args) =>
        this.transactions.filter(
          (t) => t.height === args.where.height && (t.status === 'success' || t.code === 0),
        ),
    };
    this.message = {
      findMany: async (args) => {
        const w = args.where;
        return this.messages.filter(
          (m) =>
            m.height === w.height
            && w.txHash.in.includes(m.txHash)
            && w.typeUrl.in.includes(m.typeUrl),
        );
      },
    };
    this.event = {
      findMany: async (args) =>
        this.events
          .filter((e) => e.height === args.where.height && args.where.type.in.includes(e.type))
          .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
    this.miningSettlementChunk = {
      upsert: async (args) => upsertBy(this.chunks, 'sourceEventId', args),
      deleteMany: async () => { this.chunks.length = 0; },
    };
    this.miningSettlementPayout = {
      upsert: async (args) => upsertBy(this.payouts, 'payoutKey', args),
      deleteMany: async (args = {}) => {
        const id = args.where?.sourceEventId;
        for (let i = this.payouts.length - 1; i >= 0; i -= 1) {
          if (id === undefined || this.payouts[i].sourceEventId === id) this.payouts.splice(i, 1);
        }
      },
    };
    this.miningSettlementFinalization = {
      upsert: async (args) => upsertBy(this.finalizations, 'sourceEventId', args),
      deleteMany: async () => { this.finalizations.length = 0; },
    };
    this.miningSettlementProjection = {
      deleteMany: async () => { this.settlements.length = 0; },
    };
    this.projectionFailure = {
      upsert: async (args) => {
        const i = this.failures.findIndex((f) => f.failureKey === args.where.failureKey);
        if (i >= 0) this.failures[i] = { ...this.failures[i], ...args.update };
        else this.failures.push({ ...args.create, resolved: false });
      },
      deleteMany: async (args = {}) => {
        const w = args.where ?? {};
        for (let i = this.failures.length - 1; i >= 0; i -= 1) {
          const f = this.failures[i];
          if (w.projectionName?.in && !w.projectionName.in.includes(f.projectionName)) continue;
          if (typeof w.projectionName === 'string' && f.projectionName !== w.projectionName) continue;
          if (w.sourceHeight !== undefined && f.sourceHeight !== w.sourceHeight) continue;
          if (w.resolved !== undefined && Boolean(f.resolved) !== w.resolved) continue;
          this.failures.splice(i, 1);
        }
      },
    };
    this.projectionCursor = {
      upsert: async (args) => {
        const name = args.where.projectionName_chainId.projectionName;
        this.cursors.set(name, args.create.lastProjectedHeight ?? args.update.lastProjectedHeight);
      },
      deleteMany: async (args = {}) => {
        const names = args.where?.projectionName?.in ?? [];
        for (const n of names) this.cursors.delete(n);
      },
    };
    this.$transaction = async (fn) => fn(this);
  }

  seedChunk({
    height, slotId, epoch, chunkIndex,
    failed = false, withMessage = true, msgIndexOnEvent = 0, slotIdAttr,
  }) {
    const txHash = `CHUNKTX${height}`;
    this.transactions.push({ hash: txHash, height, code: failed ? 5 : 0, status: failed ? 'failed' : 'success' });
    if (withMessage) this.messages.push(chunkMessage(this._eventId + 500n, txHash, height, 0));
    this.events.push({
      id: this._eventId++,
      height,
      txHash,
      msgIndex: msgIndexOnEvent,
      type: 'mining_settlement_chunk_submitted',
      attributesJson: [
        { key: 'slot_id', value: slotIdAttr ?? String(slotId) },
        { key: 'epoch', value: String(epoch) },
        { key: 'chunk_index', value: String(chunkIndex) },
        { key: 'next_chunk_index', value: String(chunkIndex + 1n) },
        { key: 'recipient_count', value: '1' },
        { key: 'chunk_total', value: '10000000' },
      ],
    });
  }

  seedFinalize({ height, slotId, epoch, reason, remainder, finalizedHeight }) {
    const txHash = `FINTX${height}`;
    this.transactions.push({ hash: txHash, height, code: 0, status: 'success' });
    this.messages.push({
      id: this._eventId + 700n,
      txHash,
      height,
      msgIndex: 0,
      typeUrl: MINING_FINALIZE_SETTLEMENT_TYPE_URL,
      decodedJson: { signer: SETTLEMENT_ADDR, slot_id: String(slotId), epoch: String(epoch) },
      rawJson: { raw: true },
    });
    this.events.push({
      id: this._eventId++,
      height,
      txHash,
      msgIndex: 0,
      type: 'mining_settlement_finalized',
      attributesJson: [
        { key: 'slot_id', value: String(slotId) },
        { key: 'epoch', value: String(epoch) },
        { key: 'finalization_reason', value: reason },
        { key: 'released_remainder', value: remainder },
        { key: 'finalized_height', value: finalizedHeight ?? String(height) },
      ],
    });
  }
}

function upsertBy(rows, key, args) {
  const id = args.where[key];
  const i = rows.findIndex((r) => r[key] === id);
  if (i >= 0) rows[i] = { ...rows[i], ...args.update };
  else rows.push({ ...args.create });
}
