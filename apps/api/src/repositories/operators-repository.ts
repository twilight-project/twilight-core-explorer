// Operator-profile reads (phase 15). Chain-side aggregates are computed with the exact
// definitions of plan §6.1–§6.4 so no two readers get two numbers; feed-side reads return the
// stored operator-status samples verbatim (attested — the operator's explanation, never fact).

import type { PrismaClient } from '@twilight-explorer/db';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// §6.1–§6.3 in one statement per window set: owed epochs (entitlement > 0), settled (a
// finalization exists), latency percentiles over settled epochs, paid vs kept vs entitlement.
export interface OperatorVerdictRow {
  slotId: bigint;
  owedAll: bigint;
  settledAll: bigint;
  owed30: bigint;
  settled30: bigint;
  medianLatencyBlocks: bigint | null;
  p90LatencyBlocks: bigint | null;
  paid30: string;
  paidAll: string;
  kept30: string;
  keptAll: string;
  entitlement30: string;
  entitlementAll: string;
  recipients30: bigint;
}

export async function getOperatorVerdicts(
  prisma: PrismaClient,
  now = new Date(),
): Promise<OperatorVerdictRow[]> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
  return prisma.$queryRaw<OperatorVerdictRow[]>`
    WITH fin AS (
      SELECT DISTINCT ON ("slotId", "epochNumber")
             "slotId", "epochNumber", coalesce("finalizedHeight", "height") AS fin_height,
             coalesce("releasedRemainder", '0') AS remainder
      FROM "MiningSettlementFinalization"
      ORDER BY "slotId", "epochNumber", "height" DESC
    ),
    pay AS (
      SELECT "slotId", "epochNumber",
             coalesce(sum("amount"::numeric), 0) AS paid,
             count(DISTINCT "recipient") AS recipients
      FROM "MiningSettlementPayout" GROUP BY 1, 2
    ),
    joined AS (
      SELECT ent."slotId", ent."epochNumber", ent."entitlementAmount"::numeric AS entitlement,
             re."blockTime" AS close_time,
             (f."slotId" IS NOT NULL) AS settled,
             (CASE WHEN f."slotId" IS NOT NULL AND re."height" IS NOT NULL
                   THEN f.fin_height - re."height" END) AS lat,
             coalesce(f.remainder::numeric, 0) AS kept,
             coalesce(p.paid, 0) AS paid,
             coalesce(p.recipients, 0) AS recipients
      FROM "SlotEntitlementProjection" ent
      LEFT JOIN fin f ON f."slotId" = ent."slotId" AND f."epochNumber" = ent."epochNumber"
      LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = ent."epochNumber"
      LEFT JOIN pay p ON p."slotId" = ent."slotId" AND p."epochNumber" = ent."epochNumber"
      WHERE ent."entitlementAmount"::numeric > 0
    )
    SELECT "slotId",
           count(*)::bigint AS "owedAll",
           count(*) FILTER (WHERE settled)::bigint AS "settledAll",
           count(*) FILTER (WHERE close_time >= ${cutoff})::bigint AS "owed30",
           count(*) FILTER (WHERE settled AND close_time >= ${cutoff})::bigint AS "settled30",
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) FILTER (WHERE lat IS NOT NULL))::bigint
             AS "medianLatencyBlocks",
           round(percentile_cont(0.9) WITHIN GROUP (ORDER BY lat) FILTER (WHERE lat IS NOT NULL))::bigint
             AS "p90LatencyBlocks",
           coalesce(sum(paid) FILTER (WHERE close_time >= ${cutoff}), 0)::text AS "paid30",
           coalesce(sum(paid), 0)::text AS "paidAll",
           coalesce(sum(kept) FILTER (WHERE close_time >= ${cutoff}), 0)::text AS "kept30",
           coalesce(sum(kept), 0)::text AS "keptAll",
           coalesce(sum(entitlement) FILTER (WHERE close_time >= ${cutoff}), 0)::text AS "entitlement30",
           coalesce(sum(entitlement), 0)::text AS "entitlementAll",
           coalesce(sum(recipients) FILTER (WHERE close_time >= ${cutoff}), 0)::bigint AS "recipients30"
    FROM joined
    GROUP BY "slotId"
    ORDER BY "slotId" ASC
  `;
}

// §6.4 — distinct recipients per epoch, newest first (the trend; direction is the fact).
export interface RecipientsTrendRow {
  epochNumber: bigint;
  recipients: bigint;
}

export async function getRecipientsTrend(
  prisma: PrismaClient,
  slotId: bigint,
  limit = 60,
): Promise<RecipientsTrendRow[]> {
  return prisma.$queryRaw<RecipientsTrendRow[]>`
    SELECT "epochNumber", count(DISTINCT "recipient")::bigint AS recipients
    FROM "MiningSettlementPayout"
    WHERE "slotId" = ${slotId}
    GROUP BY "epochNumber"
    ORDER BY "epochNumber" DESC
    LIMIT ${limit}
  `;
}

// §6.6 — the declared-versus-observed settlement account: every tx signed by the settlement
// address whose messages are not settlement chunks, finalizations, or (later) draw anchors.
// Zero is the expected value under ADR-MINIS-0010.
const SETTLEMENT_TYPE_URLS = [
  '/twilight.mining.v1.MsgSubmitSettlementChunk',
  '/twilight.mining.v1.MsgFinalizeSettlement',
];

export interface ForeignSettlementTx {
  hash: string;
  height: bigint;
  typeUrls: unknown;
}

export async function getSettlementAccountViolations(
  prisma: PrismaClient,
  settlementAddress: string,
  limit = 20,
): Promise<{ count: bigint; txs: ForeignSettlementTx[] }> {
  const rows = await prisma.$queryRaw<ForeignSettlementTx[]>`
    SELECT t."hash", t."height", t."messageTypesJson" AS "typeUrls"
    FROM "ExplorerTransaction" t
    WHERE t."signerAddressesJson" @> ${JSON.stringify([settlementAddress])}::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t."messageTypesJson") AS m(url)
        WHERE m.url != ALL(${SETTLEMENT_TYPE_URLS}::text[])
      )
    ORDER BY t."height" DESC
    LIMIT ${limit}
  `;
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM "ExplorerTransaction" t
    WHERE t."signerAddressesJson" @> ${JSON.stringify([settlementAddress])}::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t."messageTypesJson") AS m(url)
        WHERE m.url != ALL(${SETTLEMENT_TYPE_URLS}::text[])
      )
  `;
  return { count: countRows[0]?.count ?? 0n, txs: rows };
}

// ---- feed samples -----------------------------------------------------------------------

export interface FeedSample {
  kind: string;
  epochNumber: bigint | null;
  payloadJson: unknown;
  sampledAt: Date | null;
  asHeight: bigint | null;
  fetchedAt: Date | null;
  lastAttemptAt: Date;
  lastHttpStatus: number | null;
  lastError: string | null;
  baseUrl: string;
}

export async function getFeedSample(
  prisma: PrismaClient,
  slotId: bigint,
  kind: 'discovery' | 'clock',
): Promise<FeedSample | null> {
  return prisma.operatorStatusSample.findUnique({
    where: { sampleKey: `${slotId}:${kind}:-` },
  });
}

export async function getFeedEpochSample(
  prisma: PrismaClient,
  slotId: bigint,
  epochNumber: bigint,
): Promise<FeedSample | null> {
  return prisma.operatorStatusSample.findUnique({
    where: { sampleKey: `${slotId}:epoch:${epochNumber}` },
  });
}

/** Per-slot feed health: does it publish at all, and how fresh is the last good clock. */
export async function getFeedHealth(prisma: PrismaClient) {
  return prisma.operatorStatusSample.findMany({
    where: { kind: 'clock' },
    select: {
      slotId: true,
      fetchedAt: true,
      lastAttemptAt: true,
      lastError: true,
      baseUrl: true,
    },
  });
}

// §6.5 chain rows needed to verify a feed epoch: every payout amount + distinct recipients.
export async function getEpochPayoutFacts(
  prisma: PrismaClient,
  slotId: bigint,
  epochNumber: bigint,
): Promise<{ amounts: string[]; recipients: bigint }> {
  const [row] = await prisma.$queryRaw<{ amounts: string[] | null; recipients: bigint }[]>`
    SELECT array_agg(DISTINCT "amount") AS amounts,
           count(DISTINCT "recipient")::bigint AS recipients
    FROM "MiningSettlementPayout"
    WHERE "slotId" = ${slotId} AND "epochNumber" = ${epochNumber}
  `;
  return { amounts: row?.amounts ?? [], recipients: row?.recipients ?? 0n };
}
