import { Type, type Static } from '@sinclair/typebox';
import { HeightString, Nullable } from './common.js';

// Operator-profile DTOs (phase 15). Chain-side figures carry provenance 'chain'; anything
// from the operator-status feed carries 'attested' plus its sample envelope (sampledAt,
// asHeight, fetchedAt, ageSeconds, stale) — per the contract, a feed value is never fact.

export const OperatorVerdict = Type.Object(
  {
    // §6.1 — owed = epochs with entitlement > 0; settled = owed with a chain finalization.
    owedAll: Type.Integer(),
    settledAll: Type.Integer(),
    owed30: Type.Integer(),
    settled30: Type.Integer(),
    // §6.2 — finalization height minus epoch close height, over settled epochs (all-time).
    medianLatencyBlocks: Nullable(HeightString),
    p90LatencyBlocks: Nullable(HeightString),
    // §6.3 — numeric-string sums (DB-side numeric; never Number()).
    paid30: Type.String(),
    paidAll: Type.String(),
    kept30: Type.String(),
    keptAll: Type.String(),
    entitlement30: Type.String(),
    entitlementAll: Type.String(),
    recipients30: Type.Integer(),
    denom: Type.String(),
    provenance: Type.Literal('chain'),
  },
  { $id: 'OperatorVerdict' },
);

export const OperatorFeedHealth = Type.Object(
  {
    publishesStatus: Type.Boolean(),
    // 'configured' — the base URL comes from explorer config until discovery lands on chain.
    baseUrl: Nullable(Type.String()),
    lastSuccessAt: Nullable(Type.String()),
    ageSeconds: Nullable(Type.Integer()),
    lastError: Nullable(Type.String()),
  },
  { $id: 'OperatorFeedHealth' },
);

export const OperatorListItem = Type.Object(
  {
    slotId: HeightString,
    status: Nullable(Type.String()),
    operatorAddress: Nullable(Type.String()),
    moniker: Nullable(Type.String()),
    verdict: Nullable(OperatorVerdict),
    feed: OperatorFeedHealth,
  },
  { $id: 'OperatorListItem' },
);

export const OperatorsListResponse = Type.Object(
  { data: Type.Array(OperatorListItem) },
  { $id: 'OperatorsListResponse' },
);

export const OperatorProfileResponse = Type.Object(
  {
    data: Type.Object({
      identity: Type.Object({
        slotId: HeightString,
        status: Nullable(Type.String()),
        operatorAddress: Nullable(Type.String()),
        payoutAddress: Nullable(Type.String()),
        settlementAddress: Nullable(Type.String()),
        consensusAddress: Nullable(Type.String()),
        consensusPower: Nullable(Type.String()),
        rewardWeight: Nullable(Type.String()),
        createdHeight: Nullable(HeightString),
        // The operator's own words — always rendered inside the marked 'declared' box.
        metadata: Type.Any(),
        provenance: Type.Literal('chain'),
      }),
      verdict: Nullable(OperatorVerdict),
      // §6.4 — distinct recipients per epoch, newest first.
      recipientsTrend: Type.Array(
        Type.Object({ epochNumber: HeightString, recipients: Type.Integer() }),
      ),
      // §6.6 — non-settlement activity from the settlement address (expected: 0, ADR-MINIS-0010).
      settlementAccountCheck: Nullable(
        Type.Object({
          settlementAddress: Type.String(),
          foreignTxCount: Type.Integer(),
          foreignTxHashes: Type.Array(Type.String()),
          provenance: Type.Literal('chain'),
        }),
      ),
      // §5.5 rules constants, straight from chain rows (raw params — the UI cites, not invents).
      rules: Type.Object({
        distributionMethod: Nullable(Type.String()),
        latestParams: Type.Any(),
        provenance: Type.Literal('chain'),
      }),
    }),
  },
  { $id: 'OperatorProfileResponse' },
);

// ---- feed sample envelopes --------------------------------------------------------------

const SampleEnvelope = {
  source: Type.Literal('operator'),
  provenance: Type.Literal('attested'),
  baseUrl: Type.String(),
  baseUrlProvenance: Type.Literal('configured'),
  sampledAt: Nullable(Type.String()),
  asHeight: Nullable(HeightString),
  fetchedAt: Nullable(Type.String()),
  ageSeconds: Nullable(Type.Integer()),
  /** True when the sample is old for its kind, or as_height runs ahead of our indexed tip. */
  stale: Type.Boolean(),
  staleForward: Type.Boolean(),
  lastError: Nullable(Type.String()),
  payload: Type.Any(),
};

export const OperatorClockResponse = Type.Object(
  {
    data: Type.Union([
      Type.Object({ status: Type.Literal('no_status'), reason: Type.String() }),
      Type.Object({ status: Type.Literal('ok'), ...SampleEnvelope }),
    ]),
  },
  { $id: 'OperatorClockResponse' },
);

// §6.5 — the four checks for a settled epoch; the chain wins every disagreement.
export const FeedEpochVerification = Type.Object(
  {
    result: Type.Union([
      Type.Literal('verified'),
      Type.Literal('mismatch'),
      Type.Literal('unverifiable'),
    ]),
    failedChecks: Type.Array(Type.String()),
    chain: Type.Object({
      payoutAmounts: Type.Array(Type.String()),
      recipients: Type.Integer(),
    }),
  },
  { $id: 'FeedEpochVerification' },
);

export const OperatorFeedEpochResponse = Type.Object(
  {
    data: Type.Union([
      Type.Object({ status: Type.Literal('no_status'), reason: Type.String() }),
      Type.Object({
        status: Type.Literal('ok'),
        ...SampleEnvelope,
        verification: FeedEpochVerification,
      }),
    ]),
  },
  { $id: 'OperatorFeedEpochResponse' },
);

export const OperatorSlotParams = Type.Object({ slotId: Type.String() });
export const OperatorEpochParams = Type.Object({ slotId: Type.String(), epoch: Type.String() });

export type OperatorVerdictT = Static<typeof OperatorVerdict>;
