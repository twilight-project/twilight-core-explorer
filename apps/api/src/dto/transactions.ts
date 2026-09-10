import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { HeightString, Nullable, PageInfoSchema } from './common.js';
import { bigToString, toIso } from '../lib/serialize.js';

const MessageDto = Type.Object(
  {
    msgIndex: Type.Integer(),
    typeUrl: Type.String(),
    module: Nullable(Type.String()),
    typeName: Nullable(Type.String()),
    decodedJson: Nullable(Type.Unknown()),
    decodeError: Nullable(Type.String()),
    raw: Type.Optional(Type.Unknown()),
  },
  { $id: 'Message' },
);

const EventDto = Type.Object(
  {
    phase: Type.String(),
    type: Type.String(),
    msgIndex: Nullable(Type.Integer()),
    eventIndex: Type.Integer(),
    attributes: Type.Unknown(),
  },
  { $id: 'Event' },
);

export const TxListItem = Type.Object(
  {
    hash: Type.String(),
    height: HeightString,
    index: Type.Integer(),
    status: Type.String(),
    code: Nullable(Type.Integer()),
    gasUsed: Nullable(HeightString),
    gasWanted: Nullable(HeightString),
    memo: Nullable(Type.String()),
    messageTypes: Type.Array(Type.String()),
    signerAddresses: Type.Array(Type.String()),
    // First fee coin, for list surfaces that show a per-tx fee (block ledger). Null on
    // fee-less txs or unexpected fee shapes — never invented.
    feeAmount: Nullable(Type.String()),
    feeDenom: Nullable(Type.String()),
  },
  { $id: 'TxListItem' },
);

export const TxDetail = Type.Object(
  {
    hash: Type.String(),
    height: HeightString,
    index: Type.Integer(),
    status: Type.String(),
    code: Nullable(Type.Integer()),
    gasUsed: Nullable(HeightString),
    gasWanted: Nullable(HeightString),
    memo: Nullable(Type.String()),
    messageTypes: Type.Array(Type.String()),
    signerAddresses: Type.Array(Type.String()),
    time: Nullable(Type.String()),
    fee: Nullable(Type.Unknown()),
    messages: Type.Array(MessageDto),
    events: Type.Array(EventDto),
    raw: Type.Optional(Type.Object({ tx: Type.Unknown(), result: Type.Unknown() })),
  },
  { $id: 'TxDetail' },
);

export const TxListResponse = Type.Object(
  { data: Type.Array(TxListItem), page: PageInfoSchema },
  { $id: 'TxListResponse' },
);
export const TxDetailResponse = Type.Object({ data: TxDetail }, { $id: 'TxDetailResponse' });

export const TxsQuery = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
    cursor: Type.Optional(Type.String()),
    height: Type.Optional(Type.String({ pattern: '^\\d+$' })),
    status: Type.Optional(Type.String()),
    // Message-type GROUP (module family), matched against Message.typeUrl prefixes server-side.
    // A closed enum — not a raw prefix — so the URL surface stays bounded and validated.
    typeGroup: Type.Optional(
      Type.Union([
        Type.Literal('coreslot'),
        Type.Literal('rewards'),
        Type.Literal('mining'),
        Type.Literal('bank'),
      ]),
    ),
  },
  { additionalProperties: false },
);
export const TxParams = Type.Object({ hash: Type.String() });
export const TxDetailQuery = Type.Object(
  { include: Type.Optional(Type.Literal('raw')) },
  { additionalProperties: false },
);

// ----- txs aggregate (windowed stats over the last N transactions) -----

export const TxsAggregateQuery = Type.Object(
  { window: Type.Optional(Type.Integer({ minimum: 1, maximum: 5000, default: 1000 })) },
  { additionalProperties: false },
);

export const TxsAggregate = Type.Object(
  {
    window: Type.Integer(),
    txsInWindow: Type.Integer(),
    fromHeight: Nullable(HeightString),
    toHeight: Nullable(HeightString),
    successCount: Type.Integer(),
    failedCount: Type.Integer(),
    otherCount: Type.Integer(),
    successRate: Nullable(
      Type.Number({ description: 'Percent of the window that succeeded; null if empty.' }),
    ),
    avgMessagesPerTx: Nullable(Type.Number()),
    totalMessages: Type.Integer(),
  },
  { $id: 'TxsAggregate' },
);

export const TxsAggregateResponse = Type.Object(
  { data: TxsAggregate },
  { $id: 'TxsAggregateResponse' },
);

// ----- row shapes + mappers -----

export interface TxRow {
  hash: string;
  height: bigint;
  index: number;
  status: string;
  code: number | null;
  gasUsed: bigint | null;
  gasWanted: bigint | null;
  memo: string | null;
  feeJson: unknown;
  signerAddressesJson: unknown;
  messageTypesJson: unknown;
  rawTx: unknown;
  rawResultJson: unknown;
}

export interface MessageRow {
  msgIndex: number;
  typeUrl: string;
  module: string | null;
  typeName: string | null;
  decodedJson: unknown;
  rawJson: unknown;
  decodeError: string | null;
}

export interface EventRow {
  phase: string;
  type: string;
  msgIndex: number | null;
  eventIndex: number;
  attributesJson: unknown;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

export interface AggregateTxRow {
  height: bigint;
  status: string;
  messageTypesJson: unknown;
}

const roundTo = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Windowed transaction stats from canonical rows. Success/failed are counted by the stored status
 * string; messages-per-tx uses the tx's messageTypes array length. Rates/averages are null on an
 * empty window (never a guessed 0).
 */
export function toTxsAggregate(window: number, txs: AggregateTxRow[]): Static<typeof TxsAggregate> {
  const txsInWindow = txs.length;
  let minHeight: bigint | null = null;
  let maxHeight: bigint | null = null;
  let successCount = 0;
  let failedCount = 0;
  let totalMessages = 0;
  for (const t of txs) {
    if (minHeight === null || t.height < minHeight) minHeight = t.height;
    if (maxHeight === null || t.height > maxHeight) maxHeight = t.height;
    const s = t.status.toLowerCase();
    if (s === 'success') successCount += 1;
    else if (s === 'failed') failedCount += 1;
    totalMessages += toStringArray(t.messageTypesJson).length;
  }
  return {
    window,
    txsInWindow,
    fromHeight: minHeight !== null ? minHeight.toString() : null,
    toHeight: maxHeight !== null ? maxHeight.toString() : null,
    successCount,
    failedCount,
    otherCount: txsInWindow - successCount - failedCount,
    successRate: txsInWindow > 0 ? roundTo((successCount / txsInWindow) * 100, 1) : null,
    avgMessagesPerTx: txsInWindow > 0 ? roundTo(totalMessages / txsInWindow, 2) : null,
    totalMessages,
  };
}

/** First fee coin out of the stored fee JSON; nulls when absent or oddly shaped. */
function firstFeeCoin(feeJson: unknown): { amount: string | null; denom: string | null } {
  if (typeof feeJson === 'object' && feeJson !== null && !Array.isArray(feeJson)) {
    const coins = (feeJson as { amount?: unknown }).amount;
    const first = Array.isArray(coins) ? coins[0] : undefined;
    if (
      typeof first === 'object' &&
      first !== null &&
      typeof (first as { amount?: unknown }).amount === 'string' &&
      typeof (first as { denom?: unknown }).denom === 'string'
    ) {
      return {
        amount: (first as { amount: string }).amount,
        denom: (first as { denom: string }).denom,
      };
    }
  }
  return { amount: null, denom: null };
}

export function toTxListItem(row: TxRow): Static<typeof TxListItem> {
  const fee = firstFeeCoin(row.feeJson);
  return {
    hash: row.hash,
    height: row.height.toString(),
    index: row.index,
    status: row.status,
    code: row.code,
    gasUsed: bigToString(row.gasUsed),
    gasWanted: bigToString(row.gasWanted),
    memo: row.memo,
    messageTypes: toStringArray(row.messageTypesJson),
    signerAddresses: toStringArray(row.signerAddressesJson),
    feeAmount: fee.amount,
    feeDenom: fee.denom,
  };
}

export function toTxDetail(
  row: TxRow,
  messages: MessageRow[],
  events: EventRow[],
  time: Date | null,
  includeRaw: boolean,
): Static<typeof TxDetail> {
  const detail: Static<typeof TxDetail> = {
    hash: row.hash,
    height: row.height.toString(),
    index: row.index,
    status: row.status,
    code: row.code,
    gasUsed: bigToString(row.gasUsed),
    gasWanted: bigToString(row.gasWanted),
    memo: row.memo,
    messageTypes: toStringArray(row.messageTypesJson),
    signerAddresses: toStringArray(row.signerAddressesJson),
    time: toIso(time),
    fee: row.feeJson ?? null,
    messages: messages.map((m) => toMessageDto(m, includeRaw)),
    events: events.map(toEventDto),
  };
  if (includeRaw) {
    detail.raw = { tx: row.rawTx ?? null, result: row.rawResultJson ?? null };
  }
  return detail;
}

function toMessageDto(row: MessageRow, includeRaw: boolean): Static<typeof MessageDto> {
  const dto: Static<typeof MessageDto> = {
    msgIndex: row.msgIndex,
    typeUrl: row.typeUrl,
    module: row.module,
    typeName: row.typeName,
    decodedJson: row.decodedJson ?? null,
    decodeError: row.decodeError,
  };
  if (includeRaw) {
    dto.raw = row.rawJson ?? null;
  }
  return dto;
}

function toEventDto(row: EventRow): Static<typeof EventDto> {
  return {
    phase: row.phase,
    type: row.type,
    msgIndex: row.msgIndex,
    eventIndex: row.eventIndex,
    attributes: row.attributesJson ?? null,
  };
}
