import { Type, type Static } from '@sinclair/typebox';
import { HeightString, Nullable, PageInfoSchema } from './common.js';
import { bigToString } from '../lib/serialize.js';

// ---------- settlement payouts (the end-user reward record) ----------
//
// Participants on this chain never claim: x/mining settlement pays them directly inside a
// MsgSubmitSettlementChunk. One row per recipient line, so a user's reward history is an
// indexed lookup by `recipient` rather than a scan of every chunk's JSON.

export const SettlementPayoutItem = Type.Object(
  {
    id: HeightString,
    slotId: HeightString,
    epochNumber: HeightString,
    chunkIndex: HeightString,
    payoutIndex: Type.Integer(),
    recipient: Type.String(),
    amount: Type.String(),
    denom: Type.String(),
    height: HeightString,
    txHash: Type.String(),
    msgIndex: Nullable(Type.Integer()),
    // "Why this amount" context: the (slot, epoch) entitlement pool this line is a share of, and
    // how many recipients it was split across. Null when the entitlement was never observed.
    entitlementAmount: Nullable(Type.String()),
    recipientCount: Nullable(Type.Integer()),
  },
  { $id: 'SettlementPayoutItem' },
);

export const SettlementPayoutListResponse = Type.Object(
  { data: Type.Array(SettlementPayoutItem), page: PageInfoSchema },
  { $id: 'SettlementPayoutListResponse' },
);

export const SettlementPayoutSummary = Type.Object(
  {
    recipient: Type.String(),
    payoutCount: HeightString,
    // Summed in the database as numeric: these are int64-scale decimal strings and JS Number
    // would lose precision past 2^53.
    totalAmount: Type.String(),
    denom: Nullable(Type.String()),
  },
  { $id: 'SettlementPayoutSummary' },
);

export const SettlementPayoutSummaryResponse = Type.Object(
  { data: SettlementPayoutSummary },
  { $id: 'SettlementPayoutSummaryResponse' },
);

const LIMIT = Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 }));
const CURSOR = Type.Optional(Type.String());
const DIGITS = Type.Optional(Type.String({ pattern: '^\\d+$' }));

export const SettlementPayoutsQuery = Type.Object(
  {
    limit: LIMIT,
    cursor: CURSOR,
    recipient: Type.Optional(Type.String()),
    slotId: DIGITS,
    epoch: DIGITS,
  },
  { additionalProperties: false },
);

export interface SettlementPayoutRow {
  id: bigint;
  slotId: bigint;
  epochNumber: bigint;
  chunkIndex: bigint;
  payoutIndex: number;
  recipient: string;
  amount: string;
  denom: string;
  height: bigint;
  txHash: string;
  msgIndex: number | null;
}

export function toSettlementPayoutItem(
  r: SettlementPayoutRow,
  ctx?: { entitlementAmount: string | null; recipientCount: number | null },
): Static<typeof SettlementPayoutItem> {
  return {
    id: r.id.toString(),
    slotId: r.slotId.toString(),
    epochNumber: r.epochNumber.toString(),
    chunkIndex: r.chunkIndex.toString(),
    payoutIndex: r.payoutIndex,
    recipient: r.recipient,
    amount: r.amount,
    denom: r.denom,
    height: r.height.toString(),
    txHash: r.txHash,
    msgIndex: r.msgIndex,
    entitlementAmount: ctx?.entitlementAmount ?? null,
    recipientCount: ctx?.recipientCount ?? null,
  };
}

export function toSettlementPayoutSummary(
  recipient: string,
  s: { payoutCount: bigint; totalAmount: string; denom: string | null },
): Static<typeof SettlementPayoutSummary> {
  return {
    recipient,
    payoutCount: bigToString(s.payoutCount) ?? '0',
    totalAmount: s.totalAmount,
    denom: s.denom,
  };
}

// ---------- settlements ----------
//
// The (slotId, epoch) unit x/mining works in. NOTE this is an ACTIVITY view: the chain creates
// settlements silently (its EndBlocker emits no events), so a settlement that was created and
// never touched has no observable trace and is absent rather than listed as "open".

export const SettlementItem = Type.Object(
  {
    slotId: HeightString,
    epochNumber: HeightString,
    settled: Type.Boolean(),
    finalizationReason: Nullable(Type.String()),
    releasedRemainder: Nullable(Type.String()),
    finalizedHeight: Nullable(HeightString),
    finalizeTxHash: Nullable(Type.String()),
    chunkCount: Type.Integer(),
    payoutCount: Type.Integer(),
    totalPaid: Type.String(),
    denom: Type.String(),
    lastHeight: HeightString,
    entitlementAmount: Nullable(Type.String()),
    epochCloseHeight: Nullable(HeightString),
    latencyBlocks: Nullable(HeightString),
  },
  { $id: 'SettlementItem' },
);

export const SettlementListResponse = Type.Object(
  { data: Type.Array(SettlementItem), page: PageInfoSchema },
  { $id: 'SettlementListResponse' },
);

export const SettlementChunkItem = Type.Object(
  {
    chunkIndex: HeightString,
    recipientCount: Nullable(Type.Integer()),
    chunkTotal: Nullable(Type.String()),
    height: HeightString,
    txHash: Type.String(),
  },
);

// Inlined rather than Type.Intersect(SettlementItem, ...): fast-json-stringify resolves the
// response schema by $id, and reusing an $id-bearing schema inside an intersect makes the same
// id appear in two response schemas, which fails at serialization time (a 500, not a boot error).
export const SettlementDetailResponse = Type.Object(
  {
    data: Type.Object({
      slotId: HeightString,
      epochNumber: HeightString,
      settled: Type.Boolean(),
      finalizationReason: Nullable(Type.String()),
      releasedRemainder: Nullable(Type.String()),
      finalizedHeight: Nullable(HeightString),
      finalizeTxHash: Nullable(Type.String()),
      chunkCount: Type.Integer(),
      payoutCount: Type.Integer(),
      totalPaid: Type.String(),
      denom: Type.String(),
      lastHeight: HeightString,
      entitlementAmount: Nullable(Type.String()),
      epochCloseHeight: Nullable(HeightString),
      latencyBlocks: Nullable(HeightString),
      chunks: Type.Array(Type.Object({
        chunkIndex: HeightString,
        recipientCount: Nullable(Type.Integer()),
        chunkTotal: Nullable(Type.String()),
        height: HeightString,
        txHash: Type.String(),
      })),
      payouts: Type.Array(Type.Object({
        id: HeightString,
        slotId: HeightString,
        epochNumber: HeightString,
        chunkIndex: HeightString,
        payoutIndex: Type.Integer(),
        recipient: Type.String(),
        amount: Type.String(),
        denom: Type.String(),
        height: HeightString,
        txHash: Type.String(),
        msgIndex: Nullable(Type.Integer()),
      })),
    }),
  },
  { $id: 'SettlementDetailResponse' },
);

export const SettlementsQuery = Type.Object(
  { limit: LIMIT, cursor: CURSOR, slotId: DIGITS, epoch: DIGITS },
  { additionalProperties: false },
);

export const SettlementParams = Type.Object({
  slotId: Type.String(),
  epoch: Type.String(),
});

export interface SettlementRowShape {
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

export function toSettlementItem(r: SettlementRowShape): Static<typeof SettlementItem> {
  return {
    slotId: r.slotId.toString(),
    epochNumber: r.epochNumber.toString(),
    // A settlement is settled iff the chain emitted a finalization for it. Absence means the
    // window is still open (or nothing was observed) — never inferred from payout totals.
    settled: r.finalizationReason !== null,
    finalizationReason: r.finalizationReason,
    releasedRemainder: r.releasedRemainder,
    finalizedHeight: bigToString(r.finalizedHeight),
    finalizeTxHash: r.finalizeTxHash,
    chunkCount: Number(r.chunkCount),
    payoutCount: Number(r.payoutCount),
    totalPaid: r.totalPaid,
    denom: 'utwlt',
    lastHeight: r.lastHeight.toString(),
    entitlementAmount: r.entitlementAmount,
    epochCloseHeight: bigToString(r.epochCloseHeight),
    latencyBlocks: bigToString(r.latencyBlocks),
  };
}

export interface SettlementChunkRow {
  chunkIndex: bigint;
  recipientCount: number | null;
  chunkTotal: string | null;
  height: bigint;
  txHash: string;
}

export function toSettlementChunkItem(r: SettlementChunkRow): Static<typeof SettlementChunkItem> {
  return {
    chunkIndex: r.chunkIndex.toString(),
    recipientCount: r.recipientCount,
    chunkTotal: r.chunkTotal,
    height: r.height.toString(),
    txHash: r.txHash,
  };
}


// ---------- settlement status (expected vs settled) ----------
//
// Expectation view: one row per (slot, epoch) an entitlement exists for, whether or not the
// settlement produced observable activity. `settled` is true only on an emitted finalization.
// The API does not decide "late": it reports how long an open settlement has been open
// (openForBlocks, vs the latest indexed height) and each slot's historical latency distribution
// (`slots`); the client compares the two.

export const SettlementStatusItem = Type.Object(
  {
    slotId: HeightString,
    epochNumber: HeightString,
    entitlementAmount: Type.String(),
    denom: Type.String(),
    epochCloseHeight: Nullable(HeightString),
    settled: Type.Boolean(),
    finalizedHeight: Nullable(HeightString),
    finalizationReason: Nullable(Type.String()),
    latencyBlocks: Nullable(HeightString),
    openForBlocks: Nullable(HeightString),
  },
  { $id: 'SettlementStatusItem' },
);

export const SettlementSlotSummary = Type.Object(
  {
    slotId: HeightString,
    settledCount: Type.Integer(),
    openCount: Type.Integer(),
    medianLatencyBlocks: Nullable(HeightString),
    p90LatencyBlocks: Nullable(HeightString),
  },
  { $id: 'SettlementSlotSummary' },
);

export const SettlementStatusResponse = Type.Object(
  {
    data: Type.Array(SettlementStatusItem),
    slots: Type.Array(SettlementSlotSummary),
    page: PageInfoSchema,
  },
  { $id: 'SettlementStatusResponse' },
);

export const SettlementStatusQuery = Type.Object(
  { limit: LIMIT, cursor: CURSOR, slotId: DIGITS, epoch: DIGITS },
  { additionalProperties: false },
);

export interface SettlementStatusRowShape {
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

export function toSettlementStatusItem(
  r: SettlementStatusRowShape,
): Static<typeof SettlementStatusItem> {
  return {
    slotId: r.slotId.toString(),
    epochNumber: r.epochNumber.toString(),
    entitlementAmount: r.entitlementAmount,
    denom: r.denom,
    epochCloseHeight: bigToString(r.epochCloseHeight),
    settled: r.settled,
    finalizedHeight: bigToString(r.finalizedHeight),
    finalizationReason: r.finalizationReason,
    latencyBlocks: bigToString(r.latencyBlocks),
    openForBlocks: bigToString(r.openForBlocks),
  };
}

export function toSettlementSlotSummary(r: {
  slotId: bigint;
  settledCount: bigint;
  openCount: bigint;
  medianLatencyBlocks: bigint | null;
  p90LatencyBlocks: bigint | null;
}): Static<typeof SettlementSlotSummary> {
  return {
    slotId: r.slotId.toString(),
    settledCount: Number(r.settledCount),
    openCount: Number(r.openCount),
    medianLatencyBlocks: bigToString(r.medianLatencyBlocks),
    p90LatencyBlocks: bigToString(r.p90LatencyBlocks),
  };
}
