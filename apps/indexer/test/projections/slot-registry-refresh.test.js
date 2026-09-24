import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { refreshSlotRegistry } from '../../dist/projections/slot-registry-refresh.js';

const prismaWith = (rows) => {
  const updates = [];
  return {
    updates,
    coreSlotProjection: {
      findMany: async () => rows,
      update: async (args) => updates.push(args),
    },
  };
};

describe('slot-registry refresh (fill-NULL only)', () => {
  const chain = {
    getCoreSlots: async () => ({
      raw: { slots: [
        { slot_id: '1', reward_weight: '1.000000000000000000', consensus_power: '1' },
        { slot_id: '2', reward_weight: '1.000000000000000000', consensus_power: '1' },
      ] },
    }),
  };

  it('fills a NULL rewardWeight and NEVER overwrites an existing value', async () => {
    const prisma = prismaWith([
      { slotId: 1n, rewardWeight: '2.5', consensusPower: 1n }, // event-derived: untouched
      { slotId: 2n, rewardWeight: null, consensusPower: null },
    ]);
    const r = await refreshSlotRegistry({ prisma, client: chain });
    assert.equal(r.filled, 1);
    assert.equal(prisma.updates.length, 1);
    assert.equal(prisma.updates[0].where.slotId, 2n);
    assert.equal(prisma.updates[0].data.rewardWeight, '1.000000000000000000');
    assert.equal(prisma.updates[0].data.consensusPower, 1n);
  });

  it('never CREATES rows — registry rows come from the event projectors', async () => {
    const prisma = prismaWith([]); // chain knows slots, DB has none
    const r = await refreshSlotRegistry({ prisma, client: chain });
    assert.equal(r.filled, 0);
    assert.equal(prisma.updates.length, 0);
  });

  it('a chain read failure is a skipped sample, not an exception', async () => {
    const prisma = prismaWith([{ slotId: 2n, rewardWeight: null, consensusPower: null }]);
    const r = await refreshSlotRegistry({ prisma, client: { getCoreSlots: async () => { throw new Error('down'); } } });
    assert.equal(r.failed, true);
    assert.equal(prisma.updates.length, 0);
  });
});
