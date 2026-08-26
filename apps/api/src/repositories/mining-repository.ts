// Mining reads. DB-only over materialized rows; no chain access, no recomputation.

import type { PrismaClient } from '@twilight-explorer/db';

export interface ListPayoutsParams {
  recipient: string | undefined;
  slotId: bigint | undefined;
  epochNumber: bigint | undefined;
  beforeHeight: bigint | undefined;
  beforeId: bigint | undefined;
  limit: number;
}

function payoutWhere(params: ListPayoutsParams) {
  return {
    ...(params.recipient !== undefined ? { recipient: params.recipient } : {}),
    ...(params.slotId !== undefined ? { slotId: params.slotId } : {}),
    ...(params.epochNumber !== undefined ? { epochNumber: params.epochNumber } : {}),
  };
}

export async function listSettlementPayouts(prisma: PrismaClient, params: ListPayoutsParams) {
  return prisma.miningSettlementPayout.findMany({
    where: {
      ...payoutWhere(params),
      // Keyset pagination: (height, id) DESC, matching the recipient+height index.
      ...(params.beforeHeight !== undefined && params.beforeId !== undefined
        ? {
            OR: [
              { height: { lt: params.beforeHeight } },
              { height: params.beforeHeight, id: { lt: params.beforeId } },
            ],
          }
        : {}),
    },
    orderBy: [{ height: 'desc' }, { id: 'desc' }],
    take: params.limit,
  });
}

/**
 * Totals for a recipient. Amounts are int64-scale decimal strings, so they are summed by the
 * DATABASE (numeric) rather than in JS — Number() would silently lose precision past 2^53.
 */
export async function getPayoutSummary(prisma: PrismaClient, recipient: string) {
  const [row] = await prisma.$queryRaw<{ count: bigint; total: string | null; denom: string | null }[]>`
    SELECT count(*)::bigint AS count,
           sum("amount"::numeric)::text AS total,
           min("denom") AS denom
    FROM "MiningSettlementPayout"
    WHERE "recipient" = ${recipient}
  `;
  return {
    payoutCount: row?.count ?? 0n,
    totalAmount: row?.total ?? '0',
    denom: row?.denom ?? null,
  };
}
