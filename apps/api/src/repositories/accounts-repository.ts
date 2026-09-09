// Account reads. Keyset by address ASC (the unique @id — stable, non-null). Identity/activity only;
// no balances (no materialized balance model exists), no operator/payout role hints (deferred to 9c).

import type { PrismaClient } from '@twilight-explorer/db';

export interface ListAccountsParams {
  afterAddress: string | undefined;
  accountKind: string | undefined;
  limit: number;
}

export async function listAccounts(prisma: PrismaClient, params: ListAccountsParams) {
  return prisma.account.findMany({
    where: {
      ...(params.accountKind !== undefined ? { accountKind: params.accountKind } : {}),
      ...(params.afterAddress !== undefined ? { address: { gt: params.afterAddress } } : {}),
    },
    orderBy: { address: 'asc' },
    take: params.limit,
  });
}

export async function getAccount(prisma: PrismaClient, address: string) {
  return prisma.account.findUnique({ where: { address } });
}

// Global account registry counts — efficient aggregate reads (count/aggregate, never a full scan).
// No time-window: firstSeen/lastSeen are HEIGHTS, not timestamps, so "24h"-style metrics aren't
// sourceable and are deliberately not offered here.
export async function getAccountsAggregate(prisma: PrismaClient) {
  const [total, moduleCount, labelledCount, txAgg] = await Promise.all([
    prisma.account.count(),
    prisma.account.count({ where: { accountKind: 'module' } }),
    prisma.account.count({ where: { accountKind: { not: null } } }),
    prisma.account.aggregate({ _avg: { txCount: true } }),
  ]);
  return { total, moduleCount, labelledCount, avgTxCount: txAgg._avg.txCount };
}
