import type { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  TxDetailQuery,
  TxDetailResponse,
  TxListResponse,
  TxParams,
  TxsAggregateQuery,
  TxsAggregateResponse,
  TxsQuery,
  toTxDetail,
  toTxListItem,
  toTxsAggregate,
} from '../dto/transactions.js';
import { ErrorResponse } from '../dto/common.js';
import {
  DEFAULT_LIMIT,
  decodeBigIntPart,
  decodeKeyset,
  encodeKeyset,
  parseUint64,
} from '../lib/pagination.js';
import { invalidCursor, invalidQuery, notFound } from '../lib/errors.js';
import {
  getBlockTime,
  getEvents,
  getMessages,
  getTx,
  listTxs,
  listTxsForAggregate,
} from '../repositories/transactions-repository.js';

// typeGroup enum → Message.typeUrl prefix. Server-owned constants (the LIKE pattern is never
// user input); "claims" stays part of the rewards module family on this chain.
const TYPE_GROUP_PREFIX: Record<'coreslot' | 'rewards' | 'bank', string> = {
  coreslot: '/twilight.coreslot.',
  rewards: '/twilight.rewards.',
  bank: '/cosmos.bank.',
};

export async function transactionsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    '/txs',
    {
      schema: {
        tags: ['transactions'],
        summary: 'List transactions (newest first)',
        querystring: TxsQuery,
        response: { 200: TxListResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' }, // cacheable with always-revalidate (ETag)
    },
    async (request) => {
      const limit = request.query.limit ?? DEFAULT_LIMIT;

      let beforeHeight: bigint | undefined;
      let beforeIndex: number | undefined;
      if (request.query.cursor !== undefined) {
        const [h, i] = decodeKeyset(request.query.cursor, 2);
        beforeHeight = decodeBigIntPart(h as string);
        const index = decodeBigIntPart(i as string);
        if (index > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw invalidCursor();
        }
        beforeIndex = Number(index);
      }

      let height: bigint | undefined;
      if (request.query.height !== undefined) {
        const parsed = parseUint64(request.query.height);
        if (parsed === null) {
          throw invalidQuery('height out of range');
        }
        height = parsed;
      }

      const fetched = await listTxs(app.prisma, {
        beforeHeight,
        beforeIndex,
        height,
        status: request.query.status,
        typeUrlPrefix:
          request.query.typeGroup !== undefined
            ? TYPE_GROUP_PREFIX[request.query.typeGroup]
            : undefined,
        limit: limit + 1,
      });
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;

      const data = rows.map(toTxListItem);
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const nextCursor = hasMore && last ? encodeKeyset([last.height, last.index]) : null;

      return { data, page: { limit, nextCursor } };
    },
  );

  // GET /txs/aggregate — windowed stats over the last N transactions. Static route: Fastify's router
  // matches it ahead of the parametric /txs/:hash (TxParams accepts any string, so precedence — not
  // hash validation — is what reserves the literal "aggregate"). A live read, not a projection.
  app.get(
    '/txs/aggregate',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Aggregate stats over the last N transactions',
        querystring: TxsAggregateQuery,
        response: { 200: TxsAggregateResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const window = request.query.window ?? 1000;
      const txs = await listTxsForAggregate(app.prisma, window);
      return { data: toTxsAggregate(window, txs) };
    },
  );

  app.get(
    '/txs/:hash',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Get a transaction by hash',
        params: TxParams,
        querystring: TxDetailQuery,
        response: { 200: TxDetailResponse, 404: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const tx = await getTx(app.prisma, request.params.hash);
      if (!tx) {
        throw notFound('transaction not found');
      }
      const [messages, events, time] = await Promise.all([
        getMessages(app.prisma, tx.hash),
        getEvents(app.prisma, tx.hash),
        getBlockTime(app.prisma, tx.height),
      ]);
      const includeRaw = request.query.include === 'raw';
      return { data: toTxDetail(tx, messages, events, time, includeRaw) };
    },
  );
}
