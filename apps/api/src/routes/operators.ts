import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  OperatorClockResponse,
  OperatorEpochParams,
  OperatorFeedEpochResponse,
  OperatorProfileResponse,
  OperatorSlotParams,
  OperatorsListResponse,
  type OperatorVerdictT,
} from '../dto/operators.js';
import { ErrorResponse } from '../dto/common.js';
import { notFound } from '../lib/errors.js';
import { parseSlotId } from '../lib/slot-id.js';
import { bigToString } from '../lib/serialize.js';
import {
  getEpochPayoutFacts,
  getFeedEpochSample,
  getFeedHealth,
  getFeedSample,
  getOperatorVerdicts,
  getRecipientsTrend,
  getSettlementAccountViolations,
  type FeedSample,
  type OperatorVerdictRow,
} from '../repositories/operators-repository.js';

// Operator-profile routes (phase 15). Chain figures are computed with plan §6.1–§6.6
// definitions; feed reads serve the stored operator-status samples verbatim inside an
// envelope that names their provenance ('attested'), age and staleness. A slot with no
// configured feed answers `{status:'no_status'}` with 200 — silence is a state, not an error.

const CLOCK_STALE_SECONDS = 180;

function toVerdict(row: OperatorVerdictRow | undefined): OperatorVerdictT | null {
  if (!row) return null;
  return {
    owedAll: Number(row.owedAll),
    settledAll: Number(row.settledAll),
    owed30: Number(row.owed30),
    settled30: Number(row.settled30),
    medianLatencyBlocks: bigToString(row.medianLatencyBlocks),
    p90LatencyBlocks: bigToString(row.p90LatencyBlocks),
    paid30: row.paid30,
    paidAll: row.paidAll,
    kept30: row.kept30,
    keptAll: row.keptAll,
    entitlement30: row.entitlement30,
    entitlementAll: row.entitlementAll,
    recipients30: Number(row.recipients30),
    denom: 'utwlt',
    provenance: 'chain',
  };
}

function sampleEnvelope(sample: FeedSample, indexedTip: bigint | null, now: Date) {
  const age =
    sample.fetchedAt !== null ? Math.floor((now.getTime() - sample.fetchedAt.getTime()) / 1000) : null;
  const staleForward =
    sample.asHeight !== null && indexedTip !== null && sample.asHeight > indexedTip;
  return {
    source: 'operator' as const,
    provenance: 'attested' as const,
    baseUrl: sample.baseUrl,
    baseUrlProvenance: 'configured' as const,
    sampledAt: sample.sampledAt?.toISOString() ?? null,
    asHeight: bigToString(sample.asHeight),
    fetchedAt: sample.fetchedAt?.toISOString() ?? null,
    ageSeconds: age,
    stale: age === null || age > CLOCK_STALE_SECONDS || staleForward,
    staleForward,
    lastError: sample.lastError,
    payload: sample.payloadJson ?? null,
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function sumValues(v: unknown): number {
  if (typeof v !== 'object' || v === null) return 0;
  return Object.values(v as Record<string, unknown>).reduce<number>(
    (acc, x) => acc + (num(x) ?? 0),
    0,
  );
}

// §6.5 — the four checks. All hold: verified. Any fails: mismatch, chain's numbers shown.
// Not settled / no payload: unverifiable.
export function verifyFeedEpoch(
  payload: unknown,
  chain: { amounts: string[]; recipients: bigint },
): { result: 'verified' | 'mismatch' | 'unverifiable'; failedChecks: string[] } {
  if (typeof payload !== 'object' || payload === null) {
    return { result: 'unverifiable', failedChecks: [] };
  }
  const p = payload as Record<string, unknown>;
  if (p['state'] !== 'SETTLEMENT_RECONCILED') return { result: 'unverifiable', failedChecks: [] };

  const failed: string[] = [];
  const counts =
    typeof p['counts'] === 'object' && p['counts'] !== null
      ? (p['counts'] as Record<string, unknown>)
      : {};
  const share =
    typeof p['share'] === 'object' && p['share'] !== null
      ? (p['share'] as Record<string, unknown>)
      : null;

  // 1. share.amount equals EVERY chain payout amount for the epoch (vacuous when none paid).
  const shareAmount = share !== null && typeof share['amount'] === 'string' ? share['amount'] : null;
  if (chain.amounts.length > 0) {
    if (shareAmount === null || chain.amounts.some((a) => a !== shareAmount)) {
      failed.push('share_equals_chain_payouts');
    }
  } else if (shareAmount !== null && shareAmount !== '0') {
    failed.push('share_equals_chain_payouts');
  }

  // 2. counts.admitted equals the chain's distinct recipient count.
  const admitted = num(counts['admitted']);
  if (admitted === null || BigInt(admitted) !== chain.recipients) {
    failed.push('admitted_equals_recipients');
  }

  // 3–4. The contract's reconciliation identities.
  const enrolled = num(counts['enrolled']);
  const eligible = num(counts['eligible']);
  if (enrolled === null || eligible === null || enrolled !== eligible + sumValues(counts['not_eligible'])) {
    failed.push('enrolled_reconciles');
  }
  if (eligible === null || admitted === null || eligible !== admitted + sumValues(counts['excluded'])) {
    failed.push('eligible_reconciles');
  }

  return failed.length === 0 ? { result: 'verified', failedChecks: [] } : { result: 'mismatch', failedChecks: failed };
}

export async function operatorsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    '/operators',
    {
      schema: {
        tags: ['operators'],
        summary: 'Operator directory: per slot, the chain verdict figures + feed health',
        response: { 200: OperatorsListResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async () => {
      const now = new Date();
      const [slots, verdicts, health] = await Promise.all([
        app.prisma.coreSlotProjection.findMany({ orderBy: { slotId: 'asc' } }),
        getOperatorVerdicts(app.prisma, now),
        getFeedHealth(app.prisma),
      ]);
      const verdictBySlot = new Map(verdicts.map((v) => [v.slotId.toString(), v]));
      const healthBySlot = new Map(health.map((h) => [h.slotId.toString(), h]));
      return {
        data: slots.map((s) => {
          const h = healthBySlot.get(s.slotId.toString());
          const meta = s.metadataJson as Record<string, unknown> | null;
          const moniker =
            meta && typeof meta['moniker'] === 'string' ? (meta['moniker'] as string) : null;
          return {
            slotId: s.slotId.toString(),
            status: s.status,
            operatorAddress: s.operatorAddress,
            moniker,
            verdict: toVerdict(verdictBySlot.get(s.slotId.toString())),
            feed: {
              publishesStatus: h?.fetchedAt != null,
              baseUrl: h?.baseUrl ?? null,
              lastSuccessAt: h?.fetchedAt?.toISOString() ?? null,
              ageSeconds: h?.fetchedAt
                ? Math.floor((now.getTime() - h.fetchedAt.getTime()) / 1000)
                : null,
              lastError: h?.lastError ?? null,
            },
          };
        }),
      };
    },
  );

  app.get(
    '/operators/:slotId/profile',
    {
      schema: {
        tags: ['operators'],
        summary: 'Chain-computed operator profile: verdict, trend, checks, rules',
        params: OperatorSlotParams,
        response: { 200: OperatorProfileResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const slot = await app.prisma.coreSlotProjection.findUnique({ where: { slotId } });
      if (!slot) throw notFound('no CoreSlot with that id');

      const [verdicts, trend, latestEpoch, latestParams] = await Promise.all([
        getOperatorVerdicts(app.prisma),
        getRecipientsTrend(app.prisma, slotId),
        app.prisma.rewardEpochProjection.findFirst({
          orderBy: { epochNumber: 'desc' },
          select: { distributionMethod: true },
        }),
        app.prisma.rewardsParamsChange.findFirst({
          orderBy: { height: 'desc' },
          select: { paramsJson: true },
        }),
      ]);
      const settlementCheck = slot.settlementAddress
        ? await getSettlementAccountViolations(app.prisma, slot.settlementAddress)
        : null;

      return {
        data: {
          identity: {
            slotId: slot.slotId.toString(),
            status: slot.status,
            operatorAddress: slot.operatorAddress,
            payoutAddress: slot.payoutAddress,
            settlementAddress: slot.settlementAddress,
            consensusAddress: slot.consensusAddress,
            consensusPower: bigToString(slot.consensusPower),
            rewardWeight: slot.rewardWeight,
            createdHeight: bigToString(slot.createdHeight),
            metadata: slot.metadataJson ?? null,
            provenance: 'chain' as const,
          },
          verdict: toVerdict(verdicts.find((v) => v.slotId === slotId)),
          recipientsTrend: trend.map((t) => ({
            epochNumber: t.epochNumber.toString(),
            recipients: Number(t.recipients),
          })),
          settlementAccountCheck: settlementCheck
            ? {
                settlementAddress: slot.settlementAddress as string,
                foreignTxCount: Number(settlementCheck.count),
                foreignTxHashes: settlementCheck.txs.map((t) => t.hash),
                provenance: 'chain' as const,
              }
            : null,
          rules: {
            distributionMethod: latestEpoch?.distributionMethod ?? null,
            latestParams: latestParams?.paramsJson ?? null,
            provenance: 'chain' as const,
          },
        },
      };
    },
  );

  app.get(
    '/operators/:slotId/status/clock',
    {
      schema: {
        tags: ['operators'],
        summary: "The operator's own clock (attested), with age and staleness",
        params: OperatorSlotParams,
        response: { 200: OperatorClockResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const sample = await getFeedSample(app.prisma, slotId, 'clock');
      if (!sample || (sample.payloadJson == null && sample.fetchedAt == null)) {
        return { data: { status: 'no_status' as const, reason: 'this operator publishes no status' } };
      }
      const tip = await app.prisma.block.aggregate({ _max: { height: true } });
      return {
        data: { status: 'ok' as const, ...sampleEnvelope(sample, tip._max.height ?? null, new Date()) },
      };
    },
  );

  app.get(
    '/operators/:slotId/status/epochs/:epoch',
    {
      schema: {
        tags: ['operators'],
        summary: "The operator's per-epoch aggregates (attested) + §6.5 verification vs the chain",
        params: OperatorEpochParams,
        response: { 200: OperatorFeedEpochResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const epoch = parseSlotId(request.params.epoch);
      const sample = await getFeedEpochSample(app.prisma, slotId, epoch);
      if (!sample || sample.payloadJson == null) {
        return { data: { status: 'no_status' as const, reason: 'no operator status for this epoch' } };
      }
      const [tip, chainFacts] = await Promise.all([
        app.prisma.block.aggregate({ _max: { height: true } }),
        getEpochPayoutFacts(app.prisma, slotId, epoch),
      ]);
      const verification = verifyFeedEpoch(sample.payloadJson, chainFacts);
      return {
        data: {
          status: 'ok' as const,
          ...sampleEnvelope(sample, tip._max.height ?? null, new Date()),
          verification: {
            ...verification,
            chain: {
              payoutAmounts: chainFacts.amounts,
              recipients: Number(chainFacts.recipients),
            },
          },
        },
      };
    },
  );
}
