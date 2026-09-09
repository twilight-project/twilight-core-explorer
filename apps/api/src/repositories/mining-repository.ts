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
  entitlementAmount: string | null;
  epochCloseHeight: bigint | null;
  latencyBlocks: bigint | null;
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
           "finalizedHeight", "txHash", "height" AS fin_height
    FROM "MiningSettlementFinalization"
    ORDER BY "slotId", "epochNumber", "height" DESC
  )
  SELECT p."slotId", p."epochNumber", p.last_height AS "lastHeight",
         f."finalizationReason", f."releasedRemainder", f."finalizedHeight",
         f."txHash" AS "finalizeTxHash",
         coalesce(ca.chunk_count, 0)::bigint AS "chunkCount",
         coalesce(pa.payout_count, 0)::bigint AS "payoutCount",
         coalesce(pa.paid_total, 0)::text AS "totalPaid",
         e."entitlementAmount",
         re."height" AS "epochCloseHeight",
         -- Latency = finalization height minus the epoch's close height. finalizedHeight (the
         -- event attribute) is preferred; the finalize tx's own height is the honest fallback.
         (CASE WHEN f."slotId" IS NOT NULL AND re."height" IS NOT NULL
               THEN coalesce(f."finalizedHeight", f.fin_height) - re."height" END)::bigint
           AS "latencyBlocks"
  FROM pairs p
  LEFT JOIN fin f ON f."slotId" = p."slotId" AND f."epochNumber" = p."epochNumber"
  LEFT JOIN chunk_agg ca ON ca."slotId" = p."slotId" AND ca."epochNumber" = p."epochNumber"
  LEFT JOIN payout_agg pa ON pa."slotId" = p."slotId" AND pa."epochNumber" = p."epochNumber"
  LEFT JOIN "SlotEntitlementProjection" e ON e."slotId" = p."slotId" AND e."epochNumber" = p."epochNumber"
  LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = p."epochNumber"
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


// ---------- settlement status (expected vs settled) ----------
//
// The EXPECTATION view the activity view above cannot give: every (slot, epoch) an entitlement
// exists for, left-joined against the finalizations that actually happened. An entitlement with
// no finalization is an OPEN settlement — the chain created it silently, but the entitlement row
// proves it is owed. "Late" is not decided here: the API returns how long a settlement has been
// open (vs the latest indexed height) plus each slot's historical latency distribution, and the
// UI compares the two — the server never guesses a deadline the chain does not state.

export interface SettlementStatusRow {
  slotId: bigint;
  epochNumber: bigint;
  entitlementAmount: string;
  denom: string;
  epochCloseHeight: bigint | null;
  settled: boolean;
  finalizedHeight: bigint | null;
  finalizationReason: string | null;
  latencyBlocks: bigint | null;
  openForBlocks: bigint | null;
}

export interface ListSettlementStatusParams {
  slotId: bigint | undefined;
  epochNumber: bigint | undefined;
  beforeEpoch: bigint | undefined;
  beforeSlotId: bigint | undefined;
  limit: number;
}

const STATUS_SELECT = `
  WITH fin AS (
    SELECT DISTINCT ON ("slotId", "epochNumber")
           "slotId", "epochNumber", "finalizationReason", "finalizedHeight",
           "height" AS fin_height
    FROM "MiningSettlementFinalization"
    ORDER BY "slotId", "epochNumber", "height" DESC
  ),
  tip AS (SELECT max("height") AS h FROM "Block")
  SELECT ent."slotId", ent."epochNumber", ent."entitlementAmount", ent."denom",
         re."height" AS "epochCloseHeight",
         (f."slotId" IS NOT NULL) AS "settled",
         coalesce(f."finalizedHeight", f.fin_height) AS "finalizedHeight",
         f."finalizationReason",
         (CASE WHEN f."slotId" IS NOT NULL AND re."height" IS NOT NULL
               THEN coalesce(f."finalizedHeight", f.fin_height) - re."height" END)::bigint
           AS "latencyBlocks",
         (CASE WHEN f."slotId" IS NULL AND re."height" IS NOT NULL
               THEN (SELECT h FROM tip) - re."height" END)::bigint AS "openForBlocks"
  FROM "SlotEntitlementProjection" ent
  LEFT JOIN fin f ON f."slotId" = ent."slotId" AND f."epochNumber" = ent."epochNumber"
  LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = ent."epochNumber"
`;

export async function listSettlementStatus(
  prisma: PrismaClient,
  params: ListSettlementStatusParams,
) {
  return prisma.$queryRaw<SettlementStatusRow[]>`
    ${Prisma.raw(STATUS_SELECT)}
    WHERE (${params.slotId ?? null}::bigint IS NULL OR ent."slotId" = ${params.slotId ?? null}::bigint)
      AND (${params.epochNumber ?? null}::bigint IS NULL OR ent."epochNumber" = ${params.epochNumber ?? null}::bigint)
      AND (
        ${params.beforeEpoch ?? null}::bigint IS NULL
        OR ent."epochNumber" < ${params.beforeEpoch ?? null}::bigint
        OR (ent."epochNumber" = ${params.beforeEpoch ?? null}::bigint
            AND ent."slotId" > ${params.beforeSlotId ?? null}::bigint)
      )
    ORDER BY ent."epochNumber" DESC, ent."slotId" ASC
    LIMIT ${params.limit}
  `;
}

export interface SettlementSlotSummaryRow {
  slotId: bigint;
  settledCount: bigint;
  openCount: bigint;
  medianLatencyBlocks: bigint | null;
  p90LatencyBlocks: bigint | null;
}

/** Per-slot settlement history: how many settled/open, and the latency distribution. */
export async function getSettlementSlotSummaries(prisma: PrismaClient) {
  return prisma.$queryRaw<SettlementSlotSummaryRow[]>`
    WITH fin AS (
      SELECT DISTINCT ON ("slotId", "epochNumber")
             "slotId", "epochNumber", "finalizedHeight", "height" AS fin_height
      FROM "MiningSettlementFinalization"
      ORDER BY "slotId", "epochNumber", "height" DESC
    ),
    joined AS (
      SELECT ent."slotId",
             (f."slotId" IS NOT NULL) AS settled,
             (CASE WHEN f."slotId" IS NOT NULL AND re."height" IS NOT NULL
                   THEN coalesce(f."finalizedHeight", f.fin_height) - re."height" END) AS lat
      FROM "SlotEntitlementProjection" ent
      LEFT JOIN fin f ON f."slotId" = ent."slotId" AND f."epochNumber" = ent."epochNumber"
      LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = ent."epochNumber"
    )
    SELECT "slotId",
           count(*) FILTER (WHERE settled)::bigint AS "settledCount",
           count(*) FILTER (WHERE NOT settled)::bigint AS "openCount",
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) FILTER (WHERE lat IS NOT NULL))::bigint
             AS "medianLatencyBlocks",
           round(percentile_cont(0.9) WITHIN GROUP (ORDER BY lat) FILTER (WHERE lat IS NOT NULL))::bigint
             AS "p90LatencyBlocks"
    FROM joined
    GROUP BY "slotId"
    ORDER BY "slotId" ASC
  `;
}

// ---------- payout split context ----------
//
// "Why this amount": each payout row's share of a known pool. For the page of payout rows just
// fetched, batch-load the (slot, epoch) entitlement (the pool) and the recipient count (the K
// the pool was split across) — two indexed queries, never N+1.

export interface PayoutContext {
  entitlementAmount: string | null;
  recipientCount: number | null;
}

export async function getPayoutContext(
  prisma: PrismaClient,
  pairs: { slotId: bigint; epochNumber: bigint }[],
): Promise<Map<string, PayoutContext>> {
  const out = new Map<string, PayoutContext>();
  if (pairs.length === 0) return out;
  const key = (slotId: bigint, epochNumber: bigint) => `${slotId}:${epochNumber}`;
  const seen = new Set<string>();
  const unique = pairs.filter((p) => {
    const k = key(p.slotId, p.epochNumber);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const where = { OR: unique.map((u) => ({ slotId: u.slotId, epochNumber: u.epochNumber })) };
  const [entitlements, counts] = await Promise.all([
    prisma.slotEntitlementProjection.findMany({
      where,
      select: { slotId: true, epochNumber: true, entitlementAmount: true },
    }),
    prisma.miningSettlementPayout.groupBy({
      by: ['slotId', 'epochNumber'],
      where,
      _count: { _all: true },
    }),
  ]);
  for (const u of unique) out.set(key(u.slotId, u.epochNumber), { entitlementAmount: null, recipientCount: null });
  for (const e of entitlements) {
    const k = key(e.slotId, e.epochNumber);
    out.set(k, { ...(out.get(k) ?? { recipientCount: null }), entitlementAmount: e.entitlementAmount, recipientCount: out.get(k)?.recipientCount ?? null });
  }
  for (const c of counts) {
    const k = key(c.slotId, c.epochNumber);
    const prev = out.get(k) ?? { entitlementAmount: null, recipientCount: null };
    out.set(k, { ...prev, recipientCount: c._count._all });
  }
  return out;
}
