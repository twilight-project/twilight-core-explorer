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
             -- RewardEpochProjection."blockTime" is NULL for every row the projector has
             -- written to date, so epoch close time comes from the Block at the close height.
             coalesce(re."blockTime", b."time") AS close_time,
             (f."slotId" IS NOT NULL) AS settled,
             (CASE WHEN f."slotId" IS NOT NULL AND re."height" IS NOT NULL
                   THEN f.fin_height - re."height" END) AS lat,
             coalesce(f.remainder::numeric, 0) AS kept,
             coalesce(p.paid, 0) AS paid,
             coalesce(p.recipients, 0) AS recipients
      FROM "SlotEntitlementProjection" ent
      LEFT JOIN fin f ON f."slotId" = ent."slotId" AND f."epochNumber" = ent."epochNumber"
      LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = ent."epochNumber"
      LEFT JOIN "Block" b ON b."height" = re."height"
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
  kind: 'discovery' | 'clock' | 'as_metadata' | 'as_jwks' | 'as_health',
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

export async function getDrawSample(
  prisma: PrismaClient,
  slotId: bigint,
  epochNumber: bigint,
): Promise<FeedSample | null> {
  return prisma.operatorStatusSample.findUnique({
    where: { sampleKey: `${slotId}:draw:${epochNumber}` },
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

// Paid participants for one slot: one row per DISTINCT recipient address, from settlement
// payouts — chain facts (the feed's enrolled participants stay pseudonymous per
// ADR-MINIS-0020; only addresses the chain actually paid appear here).
export interface PaidParticipantRow {
  recipient: string;
  epochsPaid: bigint;
  totalReceived: string;
  firstEpoch: bigint;
  lastEpoch: bigint;
  lastHeight: bigint;
}

export async function getPaidParticipants(
  prisma: PrismaClient,
  slotId: bigint,
  limit = 100,
): Promise<PaidParticipantRow[]> {
  return prisma.$queryRaw<PaidParticipantRow[]>`
    SELECT "recipient",
           count(DISTINCT "epochNumber")::bigint AS "epochsPaid",
           sum("amount"::numeric)::text AS "totalReceived",
           min("epochNumber")::bigint AS "firstEpoch",
           max("epochNumber")::bigint AS "lastEpoch",
           max("height")::bigint AS "lastHeight"
    FROM "MiningSettlementPayout"
    WHERE "slotId" = ${slotId}
    GROUP BY "recipient"
    ORDER BY sum("amount"::numeric) DESC, "recipient" ASC
    LIMIT ${limit}
  `;
}

export async function countPaidParticipants(
  prisma: PrismaClient,
  slotId: bigint,
): Promise<{ all: bigint; recent: bigint }> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const [row] = await prisma.$queryRaw<{ all: bigint; recent: bigint }[]>`
    SELECT count(DISTINCT p."recipient")::bigint AS "all",
           count(DISTINCT p."recipient") FILTER (WHERE b."time" >= ${cutoff})::bigint AS "recent"
    FROM "MiningSettlementPayout" p
    LEFT JOIN "Block" b ON b."height" = p."height"
    WHERE p."slotId" = ${slotId}
  `;
  return { all: row?.all ?? 0n, recent: row?.recent ?? 0n };
}

/** Newest feed epoch sample for a slot (any state) — carries the live enrolled count. */
export async function getNewestEpochSample(
  prisma: PrismaClient,
  slotId: bigint,
): Promise<FeedSample | null> {
  const rows = await prisma.operatorStatusSample.findMany({
    where: { slotId, kind: 'epoch' },
    orderBy: { epochNumber: 'desc' },
    take: 1,
  });
  return rows[0] ?? null;
}

// Daily history for the operator dashboard: every owed epoch bucketed by the UTC day of its close
// block, with the §6.1–§6.4 definitions above (kept = released remainder, paid = payout lines,
// latency = finalization height − close height). Feed columns are the operator's attested
// per-epoch counts, averaged over the epochs that have a stored sample — never chain fact.
export interface OperatorHistoryDayRow {
  day: Date;
  firstEpoch: bigint;
  lastEpoch: bigint;
  epochs: bigint;
  settledEpochs: bigint;
  entitlement: string;
  paid: string;
  kept: string;
  payouts: bigint;
  medianLatencyBlocks: bigint | null;
  feedEpochs: bigint;
  avgEnrolled: number | null;
  maxEnrolled: number | null;
  admitted: bigint | null;
}

export async function getOperatorHistoryDays(
  prisma: PrismaClient,
  slotId: bigint,
): Promise<OperatorHistoryDayRow[]> {
  return prisma.$queryRaw<OperatorHistoryDayRow[]>`
    WITH fin AS (
      SELECT DISTINCT ON ("epochNumber")
             "epochNumber", coalesce("finalizedHeight", "height") AS fin_height,
             coalesce("releasedRemainder", '0') AS remainder
      FROM "MiningSettlementFinalization"
      WHERE "slotId" = ${slotId}
      ORDER BY "epochNumber", "height" DESC
    ),
    pay AS (
      SELECT "epochNumber", count(*) AS payouts, coalesce(sum("amount"::numeric), 0) AS paid
      FROM "MiningSettlementPayout"
      WHERE "slotId" = ${slotId}
      GROUP BY 1
    ),
    -- Attested counts come from the operator's own feed, stored as published: only a plain
    -- non-negative integer (up to 9 digits) is cast. Anything else (4.5, 3e9, a huge number) is
    -- "no value" instead of an ::int error that would fail the whole query — and with it the
    -- chain figures on the same row.
    feed AS (
      SELECT "epochNumber",
             CASE WHEN jsonb_typeof("payloadJson"->'counts'->'enrolled') = 'number'
                       AND ("payloadJson"->'counts'->>'enrolled') ~ '^[0-9]{1,9}$'
                  THEN ("payloadJson"->'counts'->>'enrolled')::int END AS enrolled,
             CASE WHEN jsonb_typeof("payloadJson"->'counts'->'admitted') = 'number'
                       AND ("payloadJson"->'counts'->>'admitted') ~ '^[0-9]{1,9}$'
                  THEN ("payloadJson"->'counts'->>'admitted')::int END AS admitted
      FROM "OperatorStatusSample"
      WHERE "slotId" = ${slotId} AND "kind" = 'epoch' AND "epochNumber" IS NOT NULL
    ),
    joined AS (
      SELECT ent."epochNumber",
             date_trunc('day', coalesce(re."blockTime", b."time")) AS day,
             ent."entitlementAmount"::numeric AS entitlement,
             (f."epochNumber" IS NOT NULL) AS settled,
             (CASE WHEN f."epochNumber" IS NOT NULL AND re."height" IS NOT NULL
                   THEN f.fin_height - re."height" END) AS lat,
             coalesce(f.remainder::numeric, 0) AS kept,
             coalesce(p.paid, 0) AS paid,
             coalesce(p.payouts, 0) AS payouts,
             fd.enrolled, fd.admitted
      FROM "SlotEntitlementProjection" ent
      LEFT JOIN "RewardEpochProjection" re ON re."epochNumber" = ent."epochNumber"
      LEFT JOIN "Block" b ON b."height" = re."height"
      LEFT JOIN fin f ON f."epochNumber" = ent."epochNumber"
      LEFT JOIN pay p ON p."epochNumber" = ent."epochNumber"
      LEFT JOIN feed fd ON fd."epochNumber" = ent."epochNumber"
      WHERE ent."slotId" = ${slotId} AND ent."entitlementAmount"::numeric > 0
    )
    SELECT day,
           min("epochNumber")::bigint AS "firstEpoch",
           max("epochNumber")::bigint AS "lastEpoch",
           count(*)::bigint AS epochs,
           count(*) FILTER (WHERE settled)::bigint AS "settledEpochs",
           sum(entitlement)::text AS entitlement,
           sum(paid)::text AS paid,
           sum(kept)::text AS kept,
           sum(payouts)::bigint AS payouts,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) FILTER (WHERE lat IS NOT NULL))::bigint
             AS "medianLatencyBlocks",
           count(enrolled)::bigint AS "feedEpochs",
           avg(enrolled)::float8 AS "avgEnrolled",
           max(enrolled) AS "maxEnrolled",
           sum(admitted)::bigint AS admitted
    FROM joined
    WHERE day IS NOT NULL
    GROUP BY day
    ORDER BY day ASC
  `;
}

// Miners per day from the payout lines: distinct recipients and how many of them were paid by
// this slot for the first time (the growth curve). A payout is bucketed by the CLOSE day of the
// epoch it settles — the same day key getOperatorHistoryDays uses for that epoch's `paid` — so
// every miner day is also a history day and no payout falls outside the series.
export interface OperatorMinersDayRow {
  day: Date;
  activeMiners: bigint;
  newMiners: bigint;
}

export async function getOperatorMinersDays(
  prisma: PrismaClient,
  slotId: bigint,
): Promise<OperatorMinersDayRow[]> {
  return prisma.$queryRaw<OperatorMinersDayRow[]>`
    WITH p AS (
      SELECT DISTINCT p."recipient", date_trunc('day', coalesce(re."blockTime", b."time")) AS day
      FROM "MiningSettlementPayout" p
      JOIN "RewardEpochProjection" re ON re."epochNumber" = p."epochNumber"
      LEFT JOIN "Block" b ON b."height" = re."height"
      WHERE p."slotId" = ${slotId} AND coalesce(re."blockTime", b."time") IS NOT NULL
    ),
    firsts AS (SELECT "recipient", min(day) AS day FROM p GROUP BY 1)
    SELECT p.day,
           count(*)::bigint AS "activeMiners",
           count(*) FILTER (WHERE f.day = p.day)::bigint AS "newMiners"
    FROM p JOIN firsts f ON f."recipient" = p."recipient"
    GROUP BY p.day
    ORDER BY p.day ASC
  `;
}
