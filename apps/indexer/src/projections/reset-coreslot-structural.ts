import { CORESLOT_STRUCTURAL_PROJECTION } from './types.js';

export interface ResetCoreSlotStructuralPrisma {
  coreSlotSettlementAddressChange: { deleteMany(args?: unknown): Promise<unknown> };
  coreSlotSelectionPolicyChange: { deleteMany(args?: unknown): Promise<unknown> };
  projectionFailure: { deleteMany(args?: unknown): Promise<unknown> };
  projectionCursor: { deleteMany(args?: unknown): Promise<unknown> };
  $transaction<T>(fn: (tx: ResetCoreSlotStructuralPrisma) => Promise<T>): Promise<T>;
}

/**
 * Scoped reset for the CoreSlot V2 structural history.
 *
 * NOTE: this deliberately does NOT clear CoreSlotProjection.settlementAddress /
 * currentSelectionPolicyVersion. That row is shared with the other CoreSlot projectors and the
 * genesis identity seed; wiping columns here would clobber their state. A replay re-upserts
 * those fields, and the combined CoreSlot rebuild owns clearing the shared row.
 */
export async function resetCoreSlotStructuralProjection(
  prisma: ResetCoreSlotStructuralPrisma,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.coreSlotSettlementAddressChange.deleteMany();
    await tx.coreSlotSelectionPolicyChange.deleteMany();
    await tx.projectionFailure.deleteMany({
      where: { projectionName: CORESLOT_STRUCTURAL_PROJECTION },
    });
    await tx.projectionCursor.deleteMany({
      where: { projectionName: CORESLOT_STRUCTURAL_PROJECTION },
    });
  });
}
