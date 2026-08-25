import type { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  EntitlementListResponse,
  EntitlementsQuery,
  EpochDetailQuery,
  EpochParams,
  EpochsQuery,
  ParamsQuery,
  RewardEpochDetailResponse,
  RewardEpochListResponse,
  RewardsBalanceListResponse,
  RewardsBalancesQuery,
  RewardsParamsListResponse,
  SlotRewardListResponse,
  SlotRewardsQuery,
  TreasuryPaymentListResponse,
  TreasuryQuery,
  toEntitlementItem,
  toEpochDetail,
  toEpochListItem,
  toParamsChangeItem,
  toRewardsBalanceItem,
  toSlotRewardItem,
  toTreasuryPaymentItem,
} from '../dto/rewards.js';
import { SlotParams } from '../dto/coreslots.js';
import { ErrorResponse } from '../dto/common.js';
import {
  DEFAULT_LIMIT,
  decodeBigIntPart,
  decodeCursor,
  decodeKeyset,
  encodeCursor,
  encodeKeyset,
  parseUint64,
} from '../lib/pagination.js';
import { badRequest, invalidQuery, notFound } from '../lib/errors.js';
import { parseSlotId } from '../lib/slot-id.js';
import { getCoreSlot } from '../repositories/coreslots-repository.js';
import {
  getEpoch,
  listEpochEntitlements,
  listEpochs,
  listParamsChanges,
  listRewardsBalances,
  listSlotEntitlements,
  listTreasuryPayments,
} from '../repositories/rewards-repository.js';

/** Parse an optional numeric filter; out-of-int64 / malformed → 400 invalid_query (not a 500). */
function filterUint64(raw: string | undefined): bigint | undefined {
  if (raw === undefined) return undefined;
  const value = parseUint64(raw);
  if (value === null) {
    throw invalidQuery('numeric value out of range');
  }
  return value;
}

export async function rewardsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ---- epochs ----
  app.get(
    '/rewards/epochs',
    {
      schema: {
        tags: ['rewards'],
        summary: 'List reward epochs (aggregate projection, not claim truth)',
        querystring: EpochsQuery,
        response: { 200: RewardEpochListResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeEpoch = request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listEpochs(app.prisma, { beforeEpoch, limit: limit + 1 });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.epochNumber) : null;
      return { data: rows.map(toEpochListItem), page: { limit, nextCursor } };
    },
  );

  app.get(
    '/rewards/epochs/:epoch',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Get a reward epoch by number',
        params: EpochParams,
        querystring: EpochDetailQuery,
        response: { 200: RewardEpochDetailResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => {
      const epochNumber = parseUint64(request.params.epoch);
      if (epochNumber === null) {
        throw badRequest('invalid_epoch', 'invalid epoch');
      }
      const row = await getEpoch(app.prisma, epochNumber);
      if (!row) {
        throw notFound('epoch not found');
      }
      return { data: toEpochDetail(row, request.query.include === 'raw') };
    },
  );

  // ---- per-slot rewards ----
  app.get(
    '/coreslots/:slotId/rewards',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Per-epoch entitlement history for a CoreSlot (observed projection)',
        params: SlotParams,
        querystring: SlotRewardsQuery,
        response: { 200: SlotRewardListResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const slot = await getCoreSlot(app.prisma, slotId);
      if (!slot) {
        throw notFound('coreslot not found');
      }
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeEpoch = request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listSlotEntitlements(app.prisma, { slotId, beforeEpoch, limit: limit + 1 });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.epochNumber) : null;
      return { data: rows.map(toSlotRewardItem), page: { limit, nextCursor } };
    },
  );

  // ---- entitlements (replaces the retired claim history) ----
  // twilight-core aa568f61 deleted MsgClaimRewards and the reward_claimed event, so there is
  // no claim history to serve. A per-(slot, epoch) entitlement is the reward unit now.
  app.get(
    '/rewards/entitlements',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Per-slot, per-epoch reward entitlements (observed projection)',
        querystring: EntitlementsQuery,
        response: { 200: EntitlementListResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeSlotId =
        request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listEpochEntitlements(app.prisma, {
        epochNumber: filterUint64(request.query.epoch),
        slotId: filterUint64(request.query.slotId),
        payoutAddress: request.query.payoutAddress,
        beforeSlotId,
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.slotId) : null;
      return { data: rows.map(toEntitlementItem), page: { limit, nextCursor } };
    },
  );

  // ---- rewards balances (supply excluded by default) ----
  app.get(
    '/rewards/balances',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Rewards/module balance samples (supply excluded by default)',
        querystring: RewardsBalancesQuery,
        response: { 200: RewardsBalanceListResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeId = request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listRewardsBalances(app.prisma, {
        beforeId,
        sampleKind: request.query.sampleKind,
        denom: request.query.denom,
        height: filterUint64(request.query.height),
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.id) : null;
      return { data: rows.map(toRewardsBalanceItem), page: { limit, nextCursor } };
    },
  );

  // ---- params history ----
  app.get(
    '/rewards/params',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Rewards parameter-change history',
        querystring: ParamsQuery,
        response: { 200: RewardsParamsListResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeId = request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listParamsChanges(app.prisma, {
        beforeId,
        changeType: request.query.changeType,
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.id) : null;
      return { data: rows.map(toParamsChangeItem), page: { limit, nextCursor } };
    },
  );

  // ---- treasury payments ----
  app.get(
    '/rewards/treasury-payments',
    {
      schema: {
        tags: ['rewards'],
        summary: 'Rewards treasury-payment history',
        querystring: TreasuryQuery,
        response: { 200: TreasuryPaymentListResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;
      const beforeId = request.query.cursor !== undefined ? decodeCursor(request.query.cursor) : undefined;
      const fetched = await listTreasuryPayments(app.prisma, { beforeId, limit: limit + 1 });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeCursor(last.id) : null;
      return { data: rows.map(toTreasuryPaymentItem), page: { limit, nextCursor } };
    },
  );
}
