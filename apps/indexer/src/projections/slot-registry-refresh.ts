// Slot-registry refresh (observed sample, fill-NULL only).
//
// Some CoreSlot fields exist ONLY in chain state, never in any message or event: the chain
// assigns reward_weight internally on registration, so an event-replayed slot honestly has
// NULL there (the never-guess rule — a default must not be invented). This step reads the
// live registry through ChainClient and fills ONLY null fields on existing CoreSlotProjection
// rows — it never overwrites an event-derived value, mirroring the genesis seed's
// "repair path (fill-NULL-fields on existing rows)" precedent in coreslot-metadata.ts.

export interface SlotRegistryRefreshClient {
  getCoreSlots(): Promise<{ raw: unknown }>;
}

export interface SlotRegistryRefreshPrisma {
  coreSlotProjection: {
    findMany(args: {
      select: { slotId: true; rewardWeight: true; consensusPower: true };
    }): Promise<{ slotId: bigint; rewardWeight: string | null; consensusPower: bigint | null }[]>;
    update(args: {
      where: { slotId: bigint };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export interface SlotRegistryRefreshResult {
  slotsSeen: number;
  filled: number;
  failed: boolean;
}

export async function refreshSlotRegistry(args: {
  prisma: SlotRegistryRefreshPrisma;
  client: SlotRegistryRefreshClient;
}): Promise<SlotRegistryRefreshResult> {
  let raw: unknown;
  try {
    raw = (await args.client.getCoreSlots()).raw;
  } catch {
    // A chain read failure is a skipped sample, not corrupted state.
    return { slotsSeen: 0, filled: 0, failed: true };
  }

  const body = asRecord(raw);
  const list = Array.isArray(body['slots']) ? (body['slots'] as unknown[]) : [];
  const existing = await args.prisma.coreSlotProjection.findMany({
    select: { slotId: true, rewardWeight: true, consensusPower: true },
  });
  const bySlot = new Map(existing.map((s) => [s.slotId.toString(), s]));

  let filled = 0;
  for (const entry of list) {
    const slot = asRecord(entry);
    const idRaw = slot['slot_id'] ?? slot['id'];
    const id = typeof idRaw === 'string' && /^\d+$/.test(idRaw) ? idRaw : null;
    if (id === null) continue;
    const row = bySlot.get(id);
    if (!row) continue; // registry rows are created by the event projectors, never here

    const data: Record<string, unknown> = {};
    const weight = slot['reward_weight'];
    if (row.rewardWeight === null && typeof weight === 'string' && weight.length > 0) {
      data['rewardWeight'] = weight;
    }
    const power = slot['consensus_power'];
    if (
      row.consensusPower === null &&
      ((typeof power === 'string' && /^\d+$/.test(power)) || typeof power === 'number')
    ) {
      data['consensusPower'] = BigInt(power);
    }
    if (Object.keys(data).length > 0) {
      await args.prisma.coreSlotProjection.update({ where: { slotId: BigInt(id) }, data });
      filled++;
    }
  }
  return { slotsSeen: list.length, filled, failed: false };
}
