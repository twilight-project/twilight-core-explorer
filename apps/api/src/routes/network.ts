import type { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  NetworkRiskResponse,
  ProposerLeaderboardResponse,
  SigningHeatmapQuery,
  SigningHeatmapResponse,
  ValidatorSetQuery,
  ValidatorSetResponse,
  toNetworkRisk,
  toProposerLeaderboardItem,
  toSigningHeatmap,
  toValidatorSetMember,
} from '../dto/network.js';
import { ErrorResponse } from '../dto/common.js';
import { invalidQuery, notFound } from '../lib/errors.js';
import { parseUint64 } from '../lib/pagination.js';
import {
  getLivenessEvidenceForHeights,
  getNetworkRisk,
  getProposerLeaderboard,
  getRecentLivenessHeights,
  getValidatorSetAtHeight,
} from '../repositories/network-repository.js';

export async function networkRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    '/network/proposers',
    {
      schema: {
        tags: ['network'],
        summary: 'Proposer leaderboard (attributed blocks per CoreSlot)',
        response: { 200: ProposerLeaderboardResponse },
      },
    },
    async () => {
      const rows = await getProposerLeaderboard(app.prisma);
      return { data: rows.map(toProposerLeaderboardItem) };
    },
  );

  app.get(
    '/network/validator-set',
    {
      schema: {
        tags: ['network'],
        summary: 'Active CoreSlot set at a height',
        querystring: ValidatorSetQuery,
        response: { 200: ValidatorSetResponse, 400: ErrorResponse },
      },
    },
    async (request) => {
      const height = parseUint64(request.query.height);
      if (height === null) {
        throw invalidQuery('height out of range');
      }
      const rows = await getValidatorSetAtHeight(app.prisma, height);
      return { data: rows.map(toValidatorSetMember) };
    },
  );

  app.get(
    '/network/liveness-risk',
    {
      schema: {
        tags: ['network'],
        summary: 'Current network halt-risk snapshot',
        response: { 200: NetworkRiskResponse, 404: ErrorResponse },
      },
    },
    async () => {
      const risk = await getNetworkRisk(app.prisma);
      if (!risk) {
        throw notFound('network liveness-risk snapshot not found');
      }
      return { data: toNetworkRisk(risk) };
    },
  );

  // GET /network/signing-heatmap — per-slot signed/missed grid over the last N committed blocks.
  // A live read of the CoreSlotLivenessEvidence projection; empty -> 200 with empty arrays.
  app.get(
    '/network/signing-heatmap',
    {
      schema: {
        tags: ['network'],
        summary: 'Per-CoreSlot signing heatmap over the last N committed blocks',
        querystring: SigningHeatmapQuery,
        response: { 200: SigningHeatmapResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const window = request.query.window ?? 48;
      const heights = await getRecentLivenessHeights(app.prisma, window);
      const rows = await getLivenessEvidenceForHeights(app.prisma, heights);
      return { data: toSigningHeatmap(window, heights, rows) };
    },
  );
}
