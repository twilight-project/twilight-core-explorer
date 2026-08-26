import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  SettlementPayoutListResponse,
  SettlementPayoutSummaryResponse,
  SettlementPayoutsQuery,
  toSettlementPayoutItem,
  toSettlementPayoutSummary,
} from '../dto/mining.js';
import { AccountParams } from '../dto/accounts.js';
import { ErrorResponse } from '../dto/common.js';
import {
  getPayoutSummary,
  listSettlementPayouts,
} from '../repositories/mining-repository.js';
import {
  DEFAULT_LIMIT,
  decodeBigIntPart,
  decodeKeyset,
  encodeKeyset,
  parseUint64,
} from '../lib/pagination.js';
import { invalidQuery } from '../lib/errors.js';

/** Parse an optional numeric filter; out-of-int64 / malformed → 400 invalid_query (not a 500). */
function filterUint64(raw: string | undefined): bigint | undefined {
  if (raw === undefined) return undefined;
  const value = parseUint64(raw);
  if (value === null) {
    throw invalidQuery('numeric value out of range');
  }
  return value;
}

export async function miningRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ---- settlement payouts ----
  app.get(
    '/mining/payouts',
    {
      schema: {
        tags: ['mining'],
        summary: 'Settlement payouts to participants (one row per recipient line)',
        querystring: SettlementPayoutsQuery,
        response: { 200: SettlementPayoutListResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      let beforeHeight: bigint | undefined;
      let beforeId: bigint | undefined;
      if (request.query.cursor !== undefined) {
        const [h, i] = decodeKeyset(request.query.cursor, 2);
        beforeHeight = decodeBigIntPart(h as string);
        beforeId = decodeBigIntPart(i as string);
      }
      const fetched = await listSettlementPayouts(app.prisma, {
        recipient: request.query.recipient,
        slotId: filterUint64(request.query.slotId),
        epochNumber: filterUint64(request.query.epoch),
        beforeHeight,
        beforeId,
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeKeyset([last.height, last.id]) : null;
      return { data: rows.map(toSettlementPayoutItem), page: { limit, nextCursor } };
    },
  );

  // ---- per-account reward totals ----
  // The account-facing answer to "what have I received". Deliberately a summary endpoint
  // rather than a field on the account: an account may have no payouts at all, and totals are
  // an aggregate over a different table.
  app.get(
    '/accounts/:address/payout-summary',
    {
      schema: {
        tags: ['mining'],
        summary: 'Total settlement rewards received by an address',
        params: AccountParams,
        response: { 200: SettlementPayoutSummaryResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const { address } = request.params;
      return { data: toSettlementPayoutSummary(address, await getPayoutSummary(app.prisma, address)) };
    },
  );
}
