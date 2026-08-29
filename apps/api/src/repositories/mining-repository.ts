// Mining reads. DB-only over materialized rows; no chain access, no recomputation.

import { Prisma, type PrismaClient } from '@twilight-explorer/db';

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

// ---------- settlements ----------
//
// A settlement is the (slotId, epoch) unit x/mining works in. The chain creates one per
// entitlement SILENTLY (its EndBlocker emits nothing), so the explorer only knows about
// settlements that produced observable activity — a submitted chunk or a finalization. A
// settlement that was created and never touched is therefore absent here rather than shown
// as "open", which is why the API labels this an activity view.

export interface SettlementRow {
  slotId: bigint;
  epochNumber: bigint;
  lastHeight: bigint;
  finalizationReason: string | null;
  releasedRemainder: string | null;
  finalizedHeight: bigint | null;
  finalizeTxHash: string | null;
  chunkCount: bigint;
  payoutCount: bigint;
  totalPaid: string;
}

export interface ListSettlementsParams {
  slotId: bigint | undefined;
  epochNumber: bigint | undefined;
  beforeEpoch: bigint | undefined;
  beforeSlotId: bigint | undefined;
  limit: number;
}

// One statement rather than N+1 per settlement: the aggregates come from grouped CTEs and the
// finalization from a DISTINCT ON (a settlement can only finalize once, but a replay could
// leave more than one row, so take the latest by height deterministically).
const SETTLEMENT_SELECT = `
  WITH pairs AS (
    SELECT "slotId", "epochNumber", max("height") AS last_height FROM (
      SELECT "slotId", "epochNumber", "height" FROM "MiningSettlementChunk"
      UNION ALL
      SELECT "slotId", "epochNumber", "height" FROM "MiningSettlementFinalization"
    ) u GROUP BY 1, 2
  ),
  chunk_agg AS (
    SELECT "slotId", "epochNumber", count(*) AS chunk_count
    FROM "MiningSettlementChunk" GROUP BY 1, 2
  ),
  payout_agg AS (
    SELECT "slotId", "epochNumber", count(*) AS payout_count,
           coalesce(sum("amount"::numeric), 0) AS paid_total
    FROM "MiningSettlementPayout" GROUP BY 1, 2
  ),
  fin AS (
    SELECT DISTINCT ON ("slotId", "epochNumber")
           "slotId", "epochNumber", "finalizationReason", "releasedRemainder",
           "finalizedHeight", "txHash"
    FROM "MiningSettlementFinalization"
    ORDER BY "slotId", "epochNumber", "height" DESC
  )
  SELECT p."slotId", p."epochNumber", p.last_height AS "lastHeight",
         f."finalizationReason", f."releasedRemainder", f."finalizedHeight",
         f."txHash" AS "finalizeTxHash",
         coalesce(ca.chunk_count, 0)::bigint AS "chunkCount",
         coalesce(pa.payout_count, 0)::bigint AS "payoutCount",
         coalesce(pa.paid_total, 0)::text AS "totalPaid"
  FROM pairs p
  LEFT JOIN fin f ON f."slotId" = p."slotId" AND f."epochNumber" = p."epochNumber"
  LEFT JOIN chunk_agg ca ON ca."slotId" = p."slotId" AND ca."epochNumber" = p."epochNumber"
  LEFT JOIN payout_agg pa ON pa."slotId" = p."slotId" AND pa."epochNumber" = p."epochNumber"
`;

export async function listSettlements(prisma: PrismaClient, params: ListSettlementsParams) {
  // Keyset on (epoch DESC, slot ASC): the same ordering the response uses.
  return prisma.$queryRaw<SettlementRow[]>`
    ${Prisma.raw(SETTLEMENT_SELECT)}
    WHERE (${params.slotId ?? null}::bigint IS NULL OR p."slotId" = ${params.slotId ?? null}::bigint)
      AND (${params.epochNumber ?? null}::bigint IS NULL OR p."epochNumber" = ${params.epochNumber ?? null}::bigint)
      AND (
        ${params.beforeEpoch ?? null}::bigint IS NULL
        OR p."epochNumber" < ${params.beforeEpoch ?? null}::bigint
        OR (p."epochNumber" = ${params.beforeEpoch ?? null}::bigint
            AND p."slotId" > ${params.beforeSlotId ?? null}::bigint)
      )
    ORDER BY p."epochNumber" DESC, p."slotId" ASC
    LIMIT ${params.limit}
  `;
}

export async function getSettlement(prisma: PrismaClient, slotId: bigint, epochNumber: bigint) {
  const [row] = await prisma.$queryRaw<SettlementRow[]>`
    ${Prisma.raw(SETTLEMENT_SELECT)}
    WHERE p."slotId" = ${slotId} AND p."epochNumber" = ${epochNumber}
  `;
  return row ?? null;
}

export async function listSettlementChunks(
  prisma: PrismaClient,
  slotId: bigint,
  epochNumber: bigint,
) {
  return prisma.miningSettlementChunk.findMany({
    where: { slotId, epochNumber },
    orderBy: { chunkIndex: 'asc' },
  });
}

/**
 * Every payout line in a settlement. Bounded by the chain's own settlement params
 * (max_recipients_per_chunk x max_chunks_per_settlement), so it is safe to return inline —
 * but still capped defensively so a param change cannot turn this into an unbounded response.
 */
export async function listSettlementPayoutLines(
  prisma: PrismaClient,
  slotId: bigint,
  epochNumber: bigint,
  limit = 500,
) {
  return prisma.miningSettlementPayout.findMany({
    where: { slotId, epochNumber },
    orderBy: [{ chunkIndex: 'asc' }, { payoutIndex: 'asc' }],
    take: limit,
  });
}
