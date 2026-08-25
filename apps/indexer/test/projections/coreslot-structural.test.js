import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CORESLOT_SELECTION_POLICY_TYPE_URL,
  CORESLOT_SETTLEMENT_ADDRESS_TYPE_URL,
  CORESLOT_STRUCTURAL_PROJECTION,
} from '../../dist/projections/types.js';
import {
  projectCoreSlotStructuralHeight,
  projectCoreSlotStructuralRange,
} from '../../dist/projections/coreslot-structural.js';
import { resetCoreSlotStructuralProjection } from '../../dist/projections/reset-coreslot-structural.js';

const CHAIN_ID = 'twilight-devnet-2';
const OPERATOR = 'twilight1k40ka5ujyv6kvw02vuj8vtxwvrnhc8ywey5nua';
const SETTLEMENT = 'twilight1jdp7mxxlfmqncgcuvk6hed7km7cpt2320twvjm';

describe('CoreSlot structural projection (V2 settlement address + selection policy)', () => {
  it('1. takes the settlement address from the MESSAGE (the event omits it)', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 100n, slotId: 3n });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 100n });

    assert.equal(p.settlementChanges.length, 1);
    assert.equal(p.settlementChanges[0].settlementAddress, SETTLEMENT);
    assert.equal(p.settlementChanges[0].operatorAddress, OPERATOR);
    // Folded onto the shared slot row, like coreslot-payout does for payoutAddress.
    assert.equal(p.slots.get('3').settlementAddress, SETTLEMENT);
  });

  it('2. records the change with a null address when the message is missing', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 110n, slotId: 3n, withMessage: false });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 110n });

    // The change definitely happened — the event proves it. Only the value is unavailable.
    assert.equal(p.settlementChanges.length, 1);
    assert.equal(p.settlementChanges[0].settlementAddress, null);
    assert.ok(failureKinds(p).includes('missing_message'));
    assert.equal(p.slots.has('3'), false, 'never writes a null address onto the slot row');
  });

  it('3. selection policy takes version/effective height from the event, rate/cap from the message', async () => {
    const p = new MockPrisma();
    p.seedPolicy({ height: 200n, slotId: 1n, policyVersion: 2n, effectiveHeight: 260n });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 200n });

    const c = p.policyChanges[0];
    assert.equal(c.policyVersion, 2n);
    assert.equal(c.effectiveHeight, 260n);
    assert.equal(c.selectionRateBps, 2500);
    assert.equal(c.maxSelectedParticipants, 10n);
    assert.equal(p.slots.get('1').currentSelectionPolicyVersion, 2n);
  });

  it('4. a failed tx creates no structural state', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 300n, slotId: 3n, failed: true });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 300n });
    assert.equal(p.settlementChanges.length, 0);
    assert.equal(p.slots.size, 0);
  });

  it('5. invalid slot_id records a failure and writes no row', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 400n, slotId: 3n, slotIdAttr: 'nope' });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 400n });
    assert.equal(p.settlementChanges.length, 0);
    assert.ok(failureKinds(p).includes('invalid_slot_id'));
  });

  it('6. rerun is idempotent', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 500n, slotId: 3n });
    p.seedPolicy({ height: 501n, slotId: 1n, policyVersion: 1n, effectiveHeight: 560n });
    await projectCoreSlotStructuralRange({ prisma: p, chainId: CHAIN_ID, startHeight: 500n, endHeight: 501n });
    const before = { s: p.settlementChanges.length, pc: p.policyChanges.length, f: p.failures.length };
    await projectCoreSlotStructuralRange({ prisma: p, chainId: CHAIN_ID, startHeight: 500n, endHeight: 501n });
    assert.deepEqual({ s: p.settlementChanges.length, pc: p.policyChanges.length, f: p.failures.length }, before);
  });

  it('7. reset clears the history but NOT the shared CoreSlotProjection row', async () => {
    const p = new MockPrisma();
    p.seedSettlement({ height: 600n, slotId: 3n });
    await projectCoreSlotStructuralHeight({ prisma: p, chainId: CHAIN_ID, height: 600n });
    assert.equal(p.settlementChanges.length, 1);

    await resetCoreSlotStructuralProjection(p);

    assert.equal(p.settlementChanges.length, 0);
    assert.equal(p.policyChanges.length, 0);
    // The slot row is shared with the other CoreSlot projectors and the genesis seed —
    // clearing columns here would clobber their state.
    assert.equal(p.slots.get('3').settlementAddress, SETTLEMENT);
    assert.ok(p.events.length > 0, 'generic rows survive');
  });
});

function failureKinds(p) {
  return p.failures
    .filter((f) => f.projectionName === CORESLOT_STRUCTURAL_PROJECTION)
    .map((f) => f.failureKind);
}

class MockPrisma {
  constructor() {
    this.transactions = [];
    this.messages = [];
    this.events = [];
    this.settlementChanges = [];
    this.policyChanges = [];
    this.slots = new Map();
    this.failures = [];
    this.cursors = new Map();
    this._id = 1n;

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
          (m) => m.height === w.height && w.txHash.in.includes(m.txHash) && w.typeUrl.in.includes(m.typeUrl),
        );
      },
    };
    this.event = {
      findMany: async (args) =>
        this.events
          .filter((e) => e.height === args.where.height && args.where.type.in.includes(e.type))
          .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
    this.coreSlotSettlementAddressChange = {
      upsert: async (args) => upsertBy(this.settlementChanges, 'sourceEventId', args),
      deleteMany: async () => { this.settlementChanges.length = 0; },
    };
    this.coreSlotSelectionPolicyChange = {
      upsert: async (args) => upsertBy(this.policyChanges, 'sourceEventId', args),
      deleteMany: async () => { this.policyChanges.length = 0; },
    };
    this.coreSlotProjection = {
      upsert: async (args) => {
        const key = String(args.where.slotId);
        const existing = this.slots.get(key);
        this.slots.set(key, existing ? { ...existing, ...args.update } : { ...args.create });
      },
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
          if (typeof w.projectionName === 'string' && f.projectionName !== w.projectionName) continue;
          if (w.sourceHeight !== undefined && f.sourceHeight !== w.sourceHeight) continue;
          if (w.resolved !== undefined && Boolean(f.resolved) !== w.resolved) continue;
          this.failures.splice(i, 1);
        }
      },
    };
    this.projectionCursor = {
      upsert: async (args) => {
        this.cursors.set(
          args.where.projectionName_chainId.projectionName,
          args.create.lastProjectedHeight ?? args.update.lastProjectedHeight,
        );
      },
      deleteMany: async () => { this.cursors.clear(); },
    };
    this.$transaction = async (fn) => fn(this);
  }

  seedSettlement({ height, slotId, failed = false, withMessage = true, slotIdAttr }) {
    const txHash = `SETTX${height}`;
    this.transactions.push({ hash: txHash, height, code: failed ? 5 : 0, status: failed ? 'failed' : 'success' });
    if (withMessage) {
      this.messages.push({
        id: this._id + 900n,
        txHash,
        height,
        msgIndex: 0,
        typeUrl: CORESLOT_SETTLEMENT_ADDRESS_TYPE_URL,
        decodedJson: { operator: OPERATOR, slot_id: String(slotId), settlement_address: SETTLEMENT },
        rawJson: { raw: true },
      });
    }
    this.events.push({
      id: this._id++,
      height,
      txHash,
      msgIndex: 0,
      type: 'coreslot_settlement_updated',
      // NOTE: no settlement address attribute — that is the whole point.
      attributesJson: [
        { key: 'slot_id', value: slotIdAttr ?? String(slotId) },
        { key: 'operator_address', value: OPERATOR },
      ],
    });
  }

  seedPolicy({ height, slotId, policyVersion, effectiveHeight }) {
    const txHash = `POLTX${height}`;
    this.transactions.push({ hash: txHash, height, code: 0, status: 'success' });
    this.messages.push({
      id: this._id + 900n,
      txHash,
      height,
      msgIndex: 0,
      typeUrl: CORESLOT_SELECTION_POLICY_TYPE_URL,
      decodedJson: {
        operator: OPERATOR,
        slot_id: String(slotId),
        selection_rate_bps: '2500',
        max_selected_participants: '10',
      },
      rawJson: { raw: true },
    });
    this.events.push({
      id: this._id++,
      height,
      txHash,
      msgIndex: 0,
      type: 'coreslot_selection_policy_updated',
      attributesJson: [
        { key: 'slot_id', value: String(slotId) },
        { key: 'operator_address', value: OPERATOR },
        { key: 'policy_version', value: String(policyVersion) },
        { key: 'effective_height', value: String(effectiveHeight) },
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
