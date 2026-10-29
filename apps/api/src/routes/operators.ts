import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  OperatorAuthResponse,
  OperatorClockResponse,
  OperatorDrawResponse,
  OperatorEpochParams,
  OperatorFeedEpochResponse,
  OperatorParticipantsResponse,
  OperatorProfileResponse,
  OperatorSlotParams,
  OperatorsListResponse,
  type OperatorVerdictT,
} from '../dto/operators.js';
import { ErrorResponse } from '../dto/common.js';
import { notFound } from '../lib/errors.js';
import { parseEpochId, parseSlotId } from '../lib/slot-id.js';
import { bigToString } from '../lib/serialize.js';
import {
  MAX_WINDOW_BLOCKS,
  toBoundedBig,
  verifyDraw,
  type DrawVerification,
  type WindowBlock,
} from '../lib/draw-verify.js';
import {
  countPaidParticipants,
  getDrawSample,
  getEpochPayoutFacts,
  getFeedEpochSample,
  getFeedHealth,
  getFeedSample,
  getNewestEpochSample,
  getPaidParticipants,
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

// Per-app-instance verdict cache (see the draw route): a module-level Map would be shared
// by every server built in a process, including across tests.
interface CachedVerdict {
  verification: DrawVerification;
  expiresAt: number;
}
const DRAW_VERDICT_TTL_SETTLED_MS = 5 * 60 * 1000;
const DRAW_VERDICT_TTL_PENDING_MS = 30 * 1000;
const DRAW_VERDICT_CACHES = new WeakMap<object, Map<string, CachedVerdict>>();
function drawVerdictCache(app: object): Map<string, CachedVerdict> {
  let cache = DRAW_VERDICT_CACHES.get(app);
  if (!cache) {
    cache = new Map<string, CachedVerdict>();
    DRAW_VERDICT_CACHES.set(app, cache);
  }
  return cache;
}
// AS metadata/JWKS are sampled hourly; two missed rounds = stale.
const AUTH_STALE_SECONDS = 2 * 60 * 60;

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

function sampleEnvelope(
  sample: FeedSample,
  indexedTip: bigint | null,
  now: Date,
  // "Stale" is per kind: the clock refreshes every tick (180 s), while a draw record is
  // FINAL once stored — null means age alone never makes it stale (stale-forward still can).
  staleAfterSeconds: number | null = CLOCK_STALE_SECONDS,
) {
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
    stale: staleForward || (staleAfterSeconds !== null && (age === null || age > staleAfterSeconds)),
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
      const discoverySample = await getFeedSample(app.prisma, slotId, 'discovery');
      const now = new Date();

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
          discovery:
            discoverySample?.payloadJson != null
              ? {
                  payload: discoverySample.payloadJson,
                  fetchedAt: discoverySample.fetchedAt?.toISOString() ?? null,
                  ageSeconds: discoverySample.fetchedAt
                    ? Math.floor((now.getTime() - discoverySample.fetchedAt.getTime()) / 1000)
                    : null,
                  provenance: 'attested' as const,
                }
              : null,
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
    '/operators/:slotId/auth',
    {
      schema: {
        tags: ['operators'],
        summary: "The operator's authentication server: RFC 8414 metadata + JWKS (attested)",
        params: OperatorSlotParams,
        response: { 200: OperatorAuthResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const [metadata, jwks, health] = await Promise.all([
        getFeedSample(app.prisma, slotId, 'as_metadata'),
        getFeedSample(app.prisma, slotId, 'as_jwks'),
        getFeedSample(app.prisma, slotId, 'as_health'),
      ]);
      if (!metadata || (metadata.payloadJson == null && metadata.fetchedAt == null)) {
        return {
          data: {
            status: 'no_status' as const,
            reason: 'this operator publishes no authentication service',
          },
        };
      }
      const now = new Date();
      const authSample = (s: FeedSample) => ({
        payload: s.payloadJson ?? null,
        fetchedAt: s.fetchedAt?.toISOString() ?? null,
        ageSeconds: s.fetchedAt
          ? Math.floor((now.getTime() - s.fetchedAt.getTime()) / 1000)
          : null,
        lastError: s.lastError,
      });
      const meta = authSample(metadata);
      return {
        data: {
          status: 'ok' as const,
          source: 'operator' as const,
          provenance: 'attested' as const,
          baseUrl: metadata.baseUrl,
          baseUrlProvenance: 'configured' as const,
          reachable: metadata.lastError === null,
          stale: meta.ageSeconds === null || meta.ageSeconds > AUTH_STALE_SECONDS,
          metadata: meta,
          jwks: jwks ? authSample(jwks) : null,
          health: health
            ? {
                // up = the newest probe attempt succeeded (lastError cleared on success).
                up: health.lastError === null,
                checkedAt: health.lastAttemptAt.toISOString(),
                ageSeconds: Math.floor((now.getTime() - health.lastAttemptAt.getTime()) / 1000),
                lastUpAgeSeconds: health.fetchedAt
                  ? Math.floor((now.getTime() - health.fetchedAt.getTime()) / 1000)
                  : null,
                lastError: health.lastError,
              }
            : null,
        },
      };
    },
  );

  app.get(
    '/operators/:slotId/participants',
    {
      schema: {
        tags: ['operators'],
        summary: 'Paid participants by address (chain) + the live enrolled count (attested)',
        params: OperatorSlotParams,
        response: { 200: OperatorParticipantsResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const now = new Date();
      const [counts, rows, newest] = await Promise.all([
        countPaidParticipants(app.prisma, slotId),
        getPaidParticipants(app.prisma, slotId),
        getNewestEpochSample(app.prisma, slotId),
      ]);
      const newestBody =
        newest && typeof newest.payloadJson === 'object' && newest.payloadJson !== null
          ? (newest.payloadJson as Record<string, unknown>)
          : null;
      const newestCounts =
        newestBody && typeof newestBody['counts'] === 'object' && newestBody['counts'] !== null
          ? (newestBody['counts'] as Record<string, unknown>)
          : null;
      const enrolledRaw = newestCounts?.['enrolled'];
      return {
        data: {
          paidAll: Number(counts.all),
          paid30: Number(counts.recent),
          denom: 'utwlt',
          provenance: 'chain' as const,
          enrolled:
            newest && newest.epochNumber !== null && typeof enrolledRaw === 'number'
              ? {
                  epochNumber: newest.epochNumber.toString(),
                  enrolled: enrolledRaw,
                  fetchedAt: newest.fetchedAt?.toISOString() ?? null,
                  ageSeconds: newest.fetchedAt
                    ? Math.floor((now.getTime() - newest.fetchedAt.getTime()) / 1000)
                    : null,
                  provenance: 'attested' as const,
                }
              : null,
          participants: rows.map((r) => ({
            recipient: r.recipient,
            epochsPaid: Number(r.epochsPaid),
            totalReceived: r.totalReceived,
            firstEpoch: r.firstEpoch.toString(),
            lastEpoch: r.lastEpoch.toString(),
          })),
        },
      };
    },
  );

  app.get(
    '/operators/:slotId/draw/:epoch',
    {
      schema: {
        tags: ['operators'],
        summary: "The operator's published selection-draw record for an epoch (attested)",
        params: OperatorEpochParams,
        response: { 200: OperatorDrawResponse, 400: ErrorResponse },
      },
      config: { cacheControl: 'revalidate' },
    },
    async (request) => {
      const slotId = parseSlotId(request.params.slotId);
      const epoch = parseEpochId(request.params.epoch);
      const sample = await getDrawSample(app.prisma, slotId, epoch);
      if (!sample || sample.payloadJson == null) {
        return {
          data: { status: 'no_status' as const, reason: 'no draw record for this epoch' },
        };
      }
      const tip = await app.prisma.block.aggregate({ _max: { height: true } });

      // Independent re-derivation (selectionv1). The record is hostile input: every bound
      // it names goes through toBoundedBig, the block query is capped by the COMMITTED
      // window length, and attribution rows are required to be final — a missing or
      // non-final row degrades the beacon check to null (never a guess). Verdicts are
      // cached per stored sample, so a request never re-hashes an unchanged record (m5).
      const record =
        typeof sample.payloadJson === 'object' && sample.payloadJson !== null
          ? (sample.payloadJson as Record<string, unknown>)
          : {};
      // Every verdict depends on index data that can still arrive or be replayed after the
      // draw sample is stored (attribution rows, the anchor tx, policy rows), and a stored
      // draw sample never changes — so no verdict is cached forever. Each entry expires:
      // 'unverifiable' quickly (it is usually waiting on data), settled verdicts after a few
      // minutes (bounds how long a verdict built on a lagging projection can stay stale),
      // and the short pending TTL also bounds the CPU a malformed or incomplete record can
      // cost per request. The cache lives on the app instance, not the module.
      const cacheKey = `${slotId}:${epoch}:${sample.fetchedAt?.getTime() ?? 0}`;
      const cached = drawVerdictCache(app).get(cacheKey);
      let verification = cached && cached.expiresAt > Date.now() ? cached.verification : undefined;
      if (!verification) {
        const anchorRec =
          typeof record['anchor'] === 'object' && record['anchor'] !== null
            ? (record['anchor'] as Record<string, unknown>)
            : {};
        const beaconRec =
          typeof record['beacon'] === 'object' && record['beacon'] !== null
            ? (record['beacon'] as Record<string, unknown>)
            : null;
        const anchorHash =
          typeof anchorRec['tx_hash'] === 'string' && /^[0-9a-fA-F]{64}$/.test(anchorRec['tx_hash'])
            ? anchorRec['tx_hash'].toUpperCase()
            : null;
        const cursor = await app.prisma.indexerCursor.findFirst({ orderBy: { updatedAt: 'desc' } });
        const anchorTx = anchorHash
          ? await app.prisma.explorerTransaction.findUnique({
              where: { hash: anchorHash },
              select: { memo: true, height: true },
            })
          : null;
        const start = toBoundedBig(beaconRec?.['start_height']);
        const end = toBoundedBig(beaconRec?.['end_height']);
        let windowBlocks: WindowBlock[] = [];
        if (start !== null && end !== null && end >= start && end - start < MAX_WINDOW_BLOCKS) {
          const [blocks, attributions] = await Promise.all([
            app.prisma.block.findMany({
              where: { height: { gte: start, lte: end } },
              select: { height: true, hash: true },
            }),
            app.prisma.blockProposerAttribution.findMany({
              where: { height: { gte: start, lte: end } },
              select: { height: true, slotId: true, attributionStatus: true },
            }),
          ]);
          // Only FINAL attributions count; anything else is missing data (M2).
          const slotByHeight = new Map(
            attributions
              .filter((x) => x.attributionStatus === 'attributed' && x.slotId !== null)
              .map((x) => [x.height, x.slotId as bigint]),
          );
          windowBlocks = blocks.map((b) => ({
            height: b.height,
            hash: b.hash,
            proposerSlotId: slotByHeight.get(b.height) ?? null,
          }));
        }
        // The policy row to compare against is the one in force AT THE ANCHOR, chosen by
        // the chain-indexed anchor height ONLY. Never by the version the record names: as
        // the reference verifier puts it, "asking for the versions by number would trust the
        // record to say which rows to fetch, and a forged parameter set names whichever
        // version makes it look right" (twilight-minis drawrecord.go). A policy tx at height H
        // takes effect from H+1 (x/coreslot ValidFromHeight), so the row in force at anchor
        // height A is the newest with height < A. No anchor in the index → no comparison.
        const policyRow = anchorTx
          ? await app.prisma.coreSlotSelectionPolicyChange.findFirst({
              where: { slotId, height: { lt: anchorTx.height } },
              orderBy: { height: 'desc' },
              select: { policyVersion: true, selectionRateBps: true, maxSelectedParticipants: true },
            })
          : null;
        // Policy rows come from the structural projection, which runs separately from tx
        // ingestion: until it has processed the anchor height, a missing or older row says
        // nothing, so the comparison waits (unverifiable) instead of accusing an honest
        // record that names a policy the projection has not reached yet.
        const structural =
          anchorTx && cursor?.chainId
            ? await app.prisma.projectionCursor.findUnique({
                where: {
                  projectionName_chainId: { projectionName: 'coreslot_structural_v1', chainId: cursor.chainId },
                },
                select: { lastProjectedHeight: true },
              })
            : null;
        const policyProjectionBehind =
          anchorTx !== null && (structural === null || structural.lastProjectedHeight < anchorTx.height);
        verification = verifyDraw({
          chainId: cursor?.chainId ?? '',
          slotId,
          epoch,
          record,
          anchor: anchorTx ? { memo: anchorTx.memo, height: anchorTx.height } : null,
          blocks: windowBlocks,
          chainPolicy: policyRow
            ? {
                policyVersion: policyRow.policyVersion,
                selectionRateBps:
                  policyRow.selectionRateBps === null ? null : BigInt(policyRow.selectionRateBps),
                maxSelectedParticipants: policyRow.maxSelectedParticipants,
              }
            : null,
          policyProjectionBehind,
        });
        const cache = drawVerdictCache(app);
        cache.delete(cacheKey); // re-insert at the end so eviction stays oldest-first
        cache.set(cacheKey, {
          verification,
          expiresAt:
            Date.now() +
            (verification.result === 'unverifiable' ? DRAW_VERDICT_TTL_PENDING_MS : DRAW_VERDICT_TTL_SETTLED_MS),
        });
        if (cache.size > 500) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      }

      return {
        data: {
          status: 'ok' as const,
          // A stored draw record is final: age never stales it (stale-forward still can).
          ...sampleEnvelope(sample, tip._max.height ?? null, new Date(), null),
          verification,
        },
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
      const epoch = parseEpochId(request.params.epoch);
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
          // A SETTLEMENT_RECONCILED epoch is immutable by contract: age never stales it.
          ...sampleEnvelope(
            sample,
            tip._max.height ?? null,
            new Date(),
            (sample.payloadJson as Record<string, unknown> | null)?.['state'] ===
              'SETTLEMENT_RECONCILED'
              ? null
              : CLOCK_STALE_SECONDS,
          ),
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
