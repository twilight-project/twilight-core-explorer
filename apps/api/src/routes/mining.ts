import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  SettlementDetailResponse,
  SettlementListResponse,
  SettlementParams,
  SettlementsQuery,
  toSettlementChunkItem,
  toSettlementItem,
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
  getSettlement,
  listSettlementChunks,
  listSettlementPayoutLines,
  listSettlementPayouts,
  listSettlements,
} from '../repositories/mining-repository.js';
import {
  DEFAULT_LIMIT,
  decodeBigIntPart,
  decodeKeyset,
  encodeKeyset,
  parseUint64,
} from '../lib/pagination.js';
import { invalidQuery, notFound } from '../lib/errors.js';
import { parseSlotId } from '../lib/slot-id.js';

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

  // ---- settlements ----
  app.get(
    '/mining/settlements',
    {
      schema: {
        tags: ['mining'],
        summary: 'Settlements with observed activity (chunks submitted and/or finalized)',
        querystring: SettlementsQuery,
        response: { 200: SettlementListResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      let beforeEpoch: bigint | undefined;
      let beforeSlotId: bigint | undefined;
      if (request.query.cursor !== undefined) {
        const [e, s] = decodeKeyset(request.query.cursor, 2);
        beforeEpoch = decodeBigIntPart(e as string);
        beforeSlotId = decodeBigIntPart(s as string);
      }
      const fetched = await listSettlements(app.prisma, {
        slotId: filterUint64(request.query.slotId),
        epochNumber: filterUint64(request.query.epoch),
        beforeEpoch,
        beforeSlotId,
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeKeyset([last.epochNumber, last.slotId]) : null;
      return { data: rows.map(toSettlementItem), page: { limit, nextCursor } };
    },
  );

  app.get(
    '/mining/settlements/:slotId/:epoch',
    {
      schema: {
        tags: ['mining'],
        summary: 'One settlement with its chunks and every recipient payout',
        params: SettlementParams,
        response: {
          200: SettlementDetailResponse,
          400: ErrorResponse,
          404: ErrorResponse,
        },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const epoch = parseSlotId(request.params.epoch);
      const settlement = await getSettlement(app.prisma, slotId, epoch);
      if (!settlement) {
        // Either no such settlement, or one the chain created and nobody ever touched — the
        // latter leaves no observable trace, so the two are indistinguishable here.
        throw notFound('no settlement activity recorded for that slot and epoch');
      }
      const [chunks, payouts] = await Promise.all([
        listSettlementChunks(app.prisma, slotId, epoch),
        listSettlementPayoutLines(app.prisma, slotId, epoch),
      ]);
      return {
        data: {
          ...toSettlementItem(settlement),
          chunks: chunks.map(toSettlementChunkItem),
          payouts: payouts.map(toSettlementPayoutItem),
        },
      };
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
