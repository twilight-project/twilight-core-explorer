// Block reads. Keyset pagination by height (newest-first). Proposer enrichment is a LEFT join onto
// the materialized BlockProposerAttribution — the API never runs the proposer projection.

import type { PrismaClient } from '@twilight-explorer/db';

export async function listBlocks(prisma: PrismaClient, beforeHeight: bigint | null, limit: number) {
  return prisma.block.findMany({
    ...(beforeHeight !== null ? { where: { height: { lt: beforeHeight } } } : {}),
    orderBy: { height: 'desc' },
    take: limit,
  });
}

export async function getBlock(prisma: PrismaClient, height: bigint) {
  return prisma.block.findUnique({ where: { height } });
}

// The last `limit` blocks (newest-first), thinned to just what the aggregate needs. The window stats
// are computed in the mapper from these canonical rows — a live read, not a projection.
export async function listBlocksForAggregate(prisma: PrismaClient, limit: number) {
  return prisma.block.findMany({
    orderBy: { height: 'desc' },
    take: limit,
    select: { height: true, time: true, txCount: true },
  });
}

export async function getProposerByHeight(prisma: PrismaClient, height: bigint) {
  return prisma.blockProposerAttribution.findFirst({ where: { height } });
}

export async function getProposersByHeights(prisma: PrismaClient, heights: bigint[]) {
  if (heights.length === 0) return [];
  return prisma.blockProposerAttribution.findMany({ where: { height: { in: heights } } });
}
