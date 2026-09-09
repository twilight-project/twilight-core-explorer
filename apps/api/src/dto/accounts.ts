import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { HeightString, Nullable, PageInfoSchema } from './common.js';
import { bigToString } from '../lib/serialize.js';

export const AccountListItem = Type.Object(
  {
    address: Type.String(),
    accountKind: Nullable(Type.String()),
    firstSeenHeight: Nullable(HeightString),
    lastSeenHeight: Nullable(HeightString),
    txCount: Type.Integer(),
  },
  { $id: 'AccountListItem' },
);

export const AccountDetail = Type.Object(
  {
    address: Type.String(),
    accountKind: Nullable(Type.String()),
    firstSeenHeight: Nullable(HeightString),
    lastSeenHeight: Nullable(HeightString),
    txCount: Type.Integer(),
    raw: Type.Optional(Type.Unknown()),
  },
  { $id: 'AccountDetail' },
);

export const AccountListResponse = Type.Object(
  { data: Type.Array(AccountListItem), page: PageInfoSchema },
  { $id: 'AccountListResponse' },
);
export const AccountDetailResponse = Type.Object(
  { data: AccountDetail },
  { $id: 'AccountDetailResponse' },
);

export const AccountsQuery = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
    cursor: Type.Optional(Type.String()),
    accountKind: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const AccountParams = Type.Object({ address: Type.String() });
export const AccountDetailQuery = Type.Object(
  { include: Type.Optional(Type.Literal('raw')) },
  { additionalProperties: false },
);

// ----- accounts aggregate (global registry counts) -----

export const AccountsAggregate = Type.Object(
  {
    totalAccounts: Type.Integer({ description: 'All observed accounts (addresses seen).' }),
    moduleAccounts: Type.Integer(),
    labelledAccounts: Type.Integer({ description: 'Accounts carrying a non-null kind.' }),
    avgTxCount: Nullable(Type.Number({ description: 'Mean observed tx count; null when no accounts.' })),
  },
  { $id: 'AccountsAggregate' },
);

export const AccountsAggregateResponse = Type.Object(
  { data: AccountsAggregate },
  { $id: 'AccountsAggregateResponse' },
);

export interface AccountsAggregateInput {
  total: number;
  moduleCount: number;
  labelledCount: number;
  avgTxCount: number | null;
}

export function toAccountsAggregate(a: AccountsAggregateInput): Static<typeof AccountsAggregate> {
  return {
    totalAccounts: a.total,
    moduleAccounts: a.moduleCount,
    labelledAccounts: a.labelledCount,
    avgTxCount: a.avgTxCount !== null ? Math.round(a.avgTxCount * 100) / 100 : null,
  };
}

export interface AccountRow {
  address: string;
  accountKind: string | null;
  firstSeenHeight: bigint | null;
  lastSeenHeight: bigint | null;
  txCount: number;
  rawAccountJson: unknown;
}

export function toAccountListItem(row: AccountRow): Static<typeof AccountListItem> {
  return {
    address: row.address,
    accountKind: row.accountKind,
    firstSeenHeight: bigToString(row.firstSeenHeight),
    lastSeenHeight: bigToString(row.lastSeenHeight),
    txCount: row.txCount,
  };
}

export function toAccountDetail(row: AccountRow, includeRaw: boolean): Static<typeof AccountDetail> {
  const detail: Static<typeof AccountDetail> = {
    address: row.address,
    accountKind: row.accountKind,
    firstSeenHeight: bigToString(row.firstSeenHeight),
    lastSeenHeight: bigToString(row.lastSeenHeight),
    txCount: row.txCount,
  };
  if (includeRaw) {
    detail.raw = row.rawAccountJson ?? null;
  }
  return detail;
}
