import { MINING_PROJECTIONS } from './types.js';

export interface ResetMiningProjectionPrisma {
  miningSettlementChunk: { deleteMany(args?: unknown): Promise<unknown> };
  miningSettlementFinalization: { deleteMany(args?: unknown): Promise<unknown> };
  miningSettlementProjection: { deleteMany(args?: unknown): Promise<unknown> };
  projectionFailure: { deleteMany(args?: unknown): Promise<unknown> };
  projectionCursor: { deleteMany(args?: unknown): Promise<unknown> };
  $transaction<T>(fn: (tx: ResetMiningProjectionPrisma) => Promise<T>): Promise<T>;
}

/**
 * Scoped reset for the mining domain. Deletes only mining projection rows plus this
 * domain's ProjectionFailure/ProjectionCursor entries — never generic canonical rows, and
 * never another domain's projections.
 */
export async function resetMiningProjections(
  prisma: ResetMiningProjectionPrisma,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.miningSettlementChunk.deleteMany();
    await tx.miningSettlementFinalization.deleteMany();
    await tx.miningSettlementProjection.deleteMany();
    await tx.projectionFailure.deleteMany({
      where: { projectionName: { in: [...MINING_PROJECTIONS] } },
    });
    await tx.projectionCursor.deleteMany({
      where: { projectionName: { in: [...MINING_PROJECTIONS] } },
    });
  });
}
