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
