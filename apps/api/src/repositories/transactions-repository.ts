// Transaction reads. Composite keyset (height DESC, index DESC). Detail joins materialized Message
// and Event rows plus the block time. Read-only; no projection recompute.

import type { PrismaClient } from '@twilight-explorer/db';

export interface ListTxsParams {
  beforeHeight: bigint | undefined;
  beforeIndex: number | undefined;
  height: bigint | undefined;
  status: string | undefined;
  limit: number;
}

export async function listTxs(prisma: PrismaClient, params: ListTxsParams) {
  return prisma.explorerTransaction.findMany({
    where: {
      ...(params.height !== undefined ? { height: params.height } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.beforeHeight !== undefined && params.beforeIndex !== undefined
        ? {
            OR: [
              { height: { lt: params.beforeHeight } },
              { height: params.beforeHeight, index: { lt: params.beforeIndex } },
            ],
          }
        : {}),
    },
    orderBy: [{ height: 'desc' }, { index: 'desc' }],
    take: params.limit,
  });
}

export async function getTx(prisma: PrismaClient, hash: string) {
  return prisma.explorerTransaction.findUnique({ where: { hash } });
}

// The last `limit` transactions (newest-first), thinned to just what the aggregate needs. Windowed
// stats are computed in the mapper — a live read, not a projection.
export async function listTxsForAggregate(prisma: PrismaClient, limit: number) {
  return prisma.explorerTransaction.findMany({
    orderBy: [{ height: 'desc' }, { index: 'desc' }],
    take: limit,
    select: { height: true, status: true, messageTypesJson: true },
  });
}

export async function getMessages(prisma: PrismaClient, txHash: string) {
  return prisma.message.findMany({ where: { txHash }, orderBy: { msgIndex: 'asc' } });
}

export async function getEvents(prisma: PrismaClient, txHash: string) {
  return prisma.event.findMany({
    where: { txHash },
    orderBy: [{ msgIndex: 'asc' }, { eventIndex: 'asc' }],
  });
}

export async function getBlockTime(prisma: PrismaClient, height: bigint): Promise<Date | null> {
  const block = await prisma.block.findUnique({ where: { height }, select: { time: true } });
  return block?.time ?? null;
}
