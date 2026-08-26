import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REWARDS_ENTITLEMENTS_PROJECTION } from '../../dist/projections/types.js';
import { projectRewardsEntitlements } from '../../dist/projections/rewards-entitlements.js';

const CHAIN_ID = 'twilight-devnet-2';

describe('Rewards entitlements projection (observed sample)', () => {
  it('1. samples the entitlements of every epoch finalized in the range', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    p.seedEpochFinalized(720n, 2n);
    const client = mockClient({
      1: [entitlement(1, '100'), entitlement(2, '200')],
      2: [entitlement(1, '150')],
    });

    const r = await projectRewardsEntitlements({
      prisma: p, client, chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 1000n, sampledAtHeight: 1000n, refreshEpochs: 0,
    });

    assert.equal(r.epochsSampled, 2);
    assert.equal(p.entitlements.size, 3);
    assert.equal(p.entitlements.get('1:1').entitlementAmount, '100');
    assert.equal(p.entitlements.get('1:2').entitlementAmount, '150');
  });

  it('2. stamps sampledAtHeight — these are observations, not derivations', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    await projectRewardsEntitlements({
      prisma: p, client: mockClient({ 1: [entitlement(1, '100')] }), chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 500n, sampledAtHeight: 500n, refreshEpochs: 0,
    });
    assert.equal(p.entitlements.get('1:1').sampledAtHeight, 500n);
  });

  it('3. RE-SAMPLES recent epochs so releasedAmount tracks settlement progress', async () => {
    // The whole reason this is not a sample-once projection: releasedAmount moves after the
    // epoch closes, as x/mining pays the entitlement down. Sampling once would freeze every
    // entitlement at released=0 — quietly wrong rather than merely stale.
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    await projectRewardsEntitlements({
      prisma: p, client: mockClient({ 1: [entitlement(1, '100', '0')] }), chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 400n, sampledAtHeight: 400n, refreshEpochs: 0,
    });
    assert.equal(p.entitlements.get('1:1').releasedAmount, '0');

    // A later run with NO new epoch_finalized in range must still refresh epoch 1.
    const r = await projectRewardsEntitlements({
      prisma: p, client: mockClient({ 1: [entitlement(1, '100', '100')] }), chainId: CHAIN_ID,
      startHeight: 401n, endHeight: 800n, sampledAtHeight: 800n, refreshEpochs: 6,
    });
    assert.equal(r.epochsSampled, 1, 'refreshed the known epoch with no new finalization');
    assert.equal(p.entitlements.get('1:1').releasedAmount, '100');
    assert.equal(p.entitlements.get('1:1').sampledAtHeight, 800n);
  });

  it('4. refreshEpochs=0 disables the refresh (no epochs -> no sample, cursor still advances)', async () => {
    const p = new MockPrisma();
    p.entitlements.set('1:1', { slotId: 1n, epochNumber: 1n });
    const r = await projectRewardsEntitlements({
      prisma: p, client: mockClient({}), chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 100n, sampledAtHeight: 100n, refreshEpochs: 0,
    });
    assert.equal(r.epochsSampled, 0);
    assert.equal(p.cursors.get(REWARDS_ENTITLEMENTS_PROJECTION), 100n);
  });

  it('5. a chain read failure writes NOTHING and halts (read-before-write)', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    p.seedEpochFinalized(720n, 2n);
    // Epoch 1 reads fine, epoch 2 throws: no half-sampled epoch set may survive.
    const client = {
      getEpochEntitlements: async (epoch) => {
        if (epoch === 2n) throw new Error('REST 503');
        return { raw: { entitlements: [entitlement(1, '100')] } };
      },
    };
    const r = await projectRewardsEntitlements({
      prisma: p, client, chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 1000n, sampledAtHeight: 1000n, refreshEpochs: 0,
    });

    assert.equal(r.failed, true);
    assert.equal(p.entitlements.size, 0, 'epoch 1 must not land on its own');
    assert.ok(failureKinds(p).includes('entitlements_chain_read_failed'));
    assert.equal(p.cursorStatus, 'halted_error');
  });

  it('6. rerun is idempotent (upsert by slot+epoch)', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    const args = {
      prisma: p, client: mockClient({ 1: [entitlement(1, '100'), entitlement(2, '200')] }),
      chainId: CHAIN_ID, startHeight: 1n, endHeight: 500n, sampledAtHeight: 500n, refreshEpochs: 0,
    };
    await projectRewardsEntitlements(args);
    await projectRewardsEntitlements(args);
    assert.equal(p.entitlements.size, 2);
  });

  it('7. follows pagination until next_key is exhausted', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    let call = 0;
    const client = {
      getEpochEntitlements: async () => {
        call += 1;
        return call === 1
          ? { raw: { entitlements: [entitlement(1, '100')], pagination: { next_key: 'MORE' } } }
          : { raw: { entitlements: [entitlement(2, '200')], pagination: { next_key: null } } };
      },
    };
    await projectRewardsEntitlements({
      prisma: p, client, chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 500n, sampledAtHeight: 500n, refreshEpochs: 0,
    });
    assert.equal(p.entitlements.size, 2, 'a truncated first page must not end the sample');
  });

  it('8. an entitlement missing slot_id or amount is skipped, never invented', async () => {
    const p = new MockPrisma();
    p.seedEpochFinalized(360n, 1n);
    const client = {
      getEpochEntitlements: async () => ({
        raw: { entitlements: [{ epoch: '1' }, entitlement(2, '200')] },
      }),
    };
    await projectRewardsEntitlements({
      prisma: p, client, chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 500n, sampledAtHeight: 500n, refreshEpochs: 0,
    });
    assert.equal(p.entitlements.size, 1);
    assert.ok(p.entitlements.has('2:1'));
  });

  it('9. an epoch_finalized with an unparseable epoch records a failure', async () => {
    const p = new MockPrisma();
    p.events.push({
      id: 99n, height: 360n, type: 'epoch_finalized',
      attributesJson: [{ key: 'epoch', value: 'not-a-number' }],
    });
    await projectRewardsEntitlements({
      prisma: p, client: mockClient({}), chainId: CHAIN_ID,
      startHeight: 1n, endHeight: 500n, sampledAtHeight: 500n, refreshEpochs: 0,
    });
    assert.ok(failureKinds(p).includes('invalid_epoch'));
  });
});

function failureKinds(p) {
  return p.failures.map((f) => f.failureKind);
}

function entitlement(slotId, amount, released = '0') {
  return {
    slot_id: String(slotId),
    total_blocks_active: '360',
    entitlement_amount: amount,
    released_amount: released,
    payout_address: 'twilight1payout',
    reward_config_version: '1',
    slot_status_at_epoch_close: 'SLOT_STATUS_ACTIVE',
    activation_sequence_at_epoch_close: '1',
    created_height: '360',
  };
}

function mockClient(byEpoch) {
  return {
    getEpochEntitlements: async (epoch) => ({
      raw: { entitlements: byEpoch[String(epoch)] ?? [] },
    }),
  };
}

class MockPrisma {
  constructor() {
    this.events = [];
    this.entitlements = new Map();
    this.failures = [];
    this.cursors = new Map();
    this.cursorStatus = null;

    this.event = {
      findMany: async (args) => {
        const w = args.where;
        return this.events.filter(
          (e) => e.type === w.type && e.height >= w.height.gte && e.height <= w.height.lte,
        );
      },
    };
    this.slotEntitlementProjection = {
      findMany: async (args = {}) => {
        const epochs = [...new Set([...this.entitlements.values()].map((e) => e.epochNumber))];
        epochs.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // desc
        const take = args.take ?? epochs.length;
        return epochs.slice(0, take).map((epochNumber) => ({ epochNumber }));
      },
      upsert: async (args) => {
        const k = `${args.where.slotId_epochNumber.slotId}:${args.where.slotId_epochNumber.epochNumber}`;
        const existing = this.entitlements.get(k);
        this.entitlements.set(k, existing ? { ...existing, ...args.update } : { ...args.create });
      },
      deleteMany: async () => this.entitlements.clear(),
    };
    this.projectionFailure = {
      upsert: async (args) => {
        const i = this.failures.findIndex((f) => f.failureKey === args.where.failureKey);
        if (i >= 0) this.failures[i] = { ...this.failures[i], ...args.update };
        else this.failures.push({ ...args.create });
      },
      deleteMany: async () => { this.failures.length = 0; },
    };
    this.projectionCursor = {
      upsert: async (args) => {
        const name = args.where.projectionName_chainId.projectionName;
        const data = args.create.lastProjectedHeight !== undefined ? args.create : args.update;
        this.cursors.set(name, data.lastProjectedHeight);
        if (data.status) this.cursorStatus = data.status;
      },
      deleteMany: async () => this.cursors.clear(),
    };
    this.$transaction = async (fn) => fn(this);
  }

  seedEpochFinalized(height, epoch) {
    this.events.push({
      id: height,
      height,
      type: 'epoch_finalized',
      attributesJson: [{ key: 'epoch', value: String(epoch) }],
    });
  }
}
