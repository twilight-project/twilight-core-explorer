// Operator-status feed sampler (phase 15 / twilight-operator-status-v1 draft 0.3).
//
// Fetches an OPERATOR's own public status feed — discovery, clock, per-epoch aggregates —
// and stores the raw payloads as observed samples. This is deliberately NOT ChainClient
// territory: the feed is the operator's explanation beside the chain, never chain fact.
//
// Contract rules encoded here, not re-decided:
//  - 404 / 429 / 5xx / unreachable are all the SAME outcome: "no status right now". A failed
//    fetch records lastAttempt/lastError only and never clobbers the last good payload.
//  - A settled epoch (state SETTLEMENT_RECONCILED) is immutable — fetched once, never again.
//  - Cadence: clock every run (the tick loop runs ~60s ≥ the 30s cache), discovery hourly,
//    epochs on first sight and again after the chain shows a finalization; a per-run fetch
//    budget keeps us far inside the advertised 60/min rate limit.
//  - ADR-MINIS-0020: no per-address data. Payloads are scanned before storage; a violating
//    payload is REFUSED (recorded as an error, payload not stored).

export const OPERATOR_STATUS_PROJECTION = 'operator_status_snapshot_v1';

const DISCOVERY_MAX_AGE_MS = 60 * 60 * 1000;
const EPOCH_FETCH_BUDGET = 8;
const SETTLED_STATE = 'SETTLEMENT_RECONCILED';

export interface OperatorStatusSampleDelegate {
  findUnique(args: { where: { sampleKey: string } }): Promise<StoredSample | null>;
  findMany(args: {
    where: { slotId: bigint; kind: string };
    select?: unknown;
  }): Promise<StoredSample[]>;
  upsert(args: {
    where: { sampleKey: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface StoredSample {
  sampleKey: string;
  slotId: bigint;
  kind: string;
  epochNumber: bigint | null;
  payloadJson: unknown;
  sampledAt: Date | null;
  asHeight: bigint | null;
  fetchedAt: Date | null;
  lastError: string | null;
}

export interface OperatorStatusPrisma {
  operatorStatusSample: OperatorStatusSampleDelegate;
  slotEntitlementProjection: {
    findMany(args: {
      where: { slotId: bigint };
      orderBy: { epochNumber: 'desc' };
      select: { epochNumber: true };
      take: number;
    }): Promise<{ epochNumber: bigint }[]>;
  };
  miningSettlementFinalization: {
    findMany(args: {
      where: { slotId: bigint };
      select: { epochNumber: true };
    }): Promise<{ epochNumber: bigint }[]>;
  };
}

export type FetchOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number | null; error: string };

export type FetchJson = (url: string) => Promise<FetchOutcome>;

/** Default fetcher: GET JSON with a timeout; every failure mode collapses to one taxonomy. */
export function makeFetchJson(timeoutMs: number): FetchJson {
  return async (url: string): Promise<FetchOutcome> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        return { ok: false, status: res.status, error: `http ${res.status}` };
      }
      const body: unknown = await res.json();
      return { ok: true, status: res.status, body };
    } catch (err) {
      return {
        ok: false,
        status: null,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---- ADR-MINIS-0020 privacy guard -------------------------------------------------------
// The feed is built not to carry per-address or per-user data; our side refuses it too.
// Returns a violation description, or null when the payload is clean.

const FORBIDDEN_KEY_RE =
  /(address(es)?$|^recipient|^user|_user$|^participant_id|installation|request_id|^query$|query_text|provider_name)/i;
// Allowlisted keys that CONTAIN 'address'-like fragments but are aggregate reason counters.
const ALLOWED_KEYS = new Set([
  'NO_VALID_PAYOUT_DESTINATION', // a COUNT bucket, not a destination
]);
const BECH32_RE = /twilight1[0-9a-z]{20,}/;

export function findPrivacyViolation(value: unknown, path = '$'): string | null {
  if (typeof value === 'string') {
    if (BECH32_RE.test(value)) return `${path}: bech32 address in value`;
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = findPrivacyViolation(value[i], `${path}[${i}]`);
      if (v) return v;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!ALLOWED_KEYS.has(key) && FORBIDDEN_KEY_RE.test(key)) {
        return `${path}.${key}: forbidden key`;
      }
      const v = findPrivacyViolation(child, `${path}.${key}`);
      if (v) return v;
    }
  }
  return null;
}

// ---- sample persistence -----------------------------------------------------------------

export function sampleKey(slotId: bigint, kind: string, epochNumber: bigint | null): string {
  return `${slotId}:${kind}:${epochNumber ?? '-'}`;
}

function parseEnvelope(body: unknown): { sampledAt: Date | null; asHeight: bigint | null } {
  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const sampledAt =
    typeof obj['sampled_at'] === 'string' && !Number.isNaN(Date.parse(obj['sampled_at']))
      ? new Date(obj['sampled_at'])
      : null;
  let asHeight: bigint | null = null;
  const rawHeight = obj['as_height'];
  if (typeof rawHeight === 'number' && Number.isInteger(rawHeight) && rawHeight >= 0) {
    asHeight = BigInt(rawHeight);
  } else if (typeof rawHeight === 'string' && /^\d+$/.test(rawHeight)) {
    asHeight = BigInt(rawHeight);
  }
  return { sampledAt, asHeight };
}

async function recordFetch(
  prisma: OperatorStatusPrisma,
  args: {
    slotId: bigint;
    kind: string;
    epochNumber: bigint | null;
    baseUrl: string;
    outcome: FetchOutcome;
    now: Date;
  },
): Promise<'stored' | 'refused' | 'failed'> {
  const key = sampleKey(args.slotId, args.kind, args.epochNumber);
  const base = {
    slotId: args.slotId,
    kind: args.kind,
    epochNumber: args.epochNumber,
    sampleKey: key,
    baseUrl: args.baseUrl,
    lastAttemptAt: args.now,
  };

  if (!args.outcome.ok) {
    await prisma.operatorStatusSample.upsert({
      where: { sampleKey: key },
      create: { ...base, lastHttpStatus: args.outcome.status, lastError: args.outcome.error },
      update: {
        baseUrl: args.baseUrl,
        lastAttemptAt: args.now,
        lastHttpStatus: args.outcome.status,
        lastError: args.outcome.error,
      },
    });
    return 'failed';
  }

  const violation = findPrivacyViolation(args.outcome.body);
  if (violation !== null) {
    await prisma.operatorStatusSample.upsert({
      where: { sampleKey: key },
      create: { ...base, lastHttpStatus: args.outcome.status, lastError: `privacy_refused: ${violation}` },
      update: {
        baseUrl: args.baseUrl,
        lastAttemptAt: args.now,
        lastHttpStatus: args.outcome.status,
        lastError: `privacy_refused: ${violation}`,
      },
    });
    return 'refused';
  }

  const { sampledAt, asHeight } = parseEnvelope(args.outcome.body);
  const good = {
    payloadJson: args.outcome.body,
    sampledAt,
    asHeight,
    fetchedAt: args.now,
    lastHttpStatus: args.outcome.status,
    lastError: null,
  };
  await prisma.operatorStatusSample.upsert({
    where: { sampleKey: key },
    create: { ...base, ...good },
    update: { baseUrl: args.baseUrl, lastAttemptAt: args.now, ...good },
  });
  return 'stored';
}

function epochStateOf(sample: StoredSample | null): string | null {
  if (!sample || typeof sample.payloadJson !== 'object' || sample.payloadJson === null) return null;
  const state = (sample.payloadJson as Record<string, unknown>)['state'];
  return typeof state === 'string' ? state : null;
}

// ---- the run ----------------------------------------------------------------------------

export interface OperatorStatusRunResult {
  slotId: string;
  clock: 'stored' | 'refused' | 'failed';
  discovery: 'stored' | 'refused' | 'failed' | 'fresh';
  epochsFetched: number;
  epochsFailed: number;
}

export async function projectOperatorStatus(args: {
  prisma: OperatorStatusPrisma;
  fetchJson: FetchJson;
  slotId: bigint;
  baseUrl: string;
  now?: Date;
  epochBudget?: number;
}): Promise<OperatorStatusRunResult> {
  const { prisma, fetchJson, slotId } = args;
  const baseUrl = args.baseUrl.replace(/\/+$/, '');
  const now = args.now ?? new Date();
  const budget = args.epochBudget ?? EPOCH_FETCH_BUDGET;

  // Discovery: hourly (age-gated on last success).
  const discoveryKeyed = await prisma.operatorStatusSample.findUnique({
    where: { sampleKey: sampleKey(slotId, 'discovery', null) },
  });
  let discovery: OperatorStatusRunResult['discovery'] = 'fresh';
  const discoveryAge = discoveryKeyed?.fetchedAt
    ? now.getTime() - discoveryKeyed.fetchedAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (discoveryAge >= DISCOVERY_MAX_AGE_MS) {
    discovery = await recordFetch(prisma, {
      slotId,
      kind: 'discovery',
      epochNumber: null,
      baseUrl,
      now,
      outcome: await fetchJson(`${baseUrl}/.well-known/twilight-operator-status`),
    });
  }

  // Clock: every run (the tick cadence is at or above the contract's 30s cache).
  const clock = await recordFetch(prisma, {
    slotId,
    kind: 'clock',
    epochNumber: null,
    baseUrl,
    now,
    outcome: await fetchJson(`${baseUrl}/v1/operator-status/clock`),
  });

  // Epochs: chain-known entitlements for this slot, newest first. Fetch when there is no
  // sample, or when the stored sample is not settled but the CHAIN now shows a finalization
  // (refresh-after-settle). A stored SETTLEMENT_RECONCILED sample is immutable — skipped.
  const entitled = await prisma.slotEntitlementProjection.findMany({
    where: { slotId },
    orderBy: { epochNumber: 'desc' },
    select: { epochNumber: true },
    take: 200,
  });
  const finalized = new Set(
    (await prisma.miningSettlementFinalization.findMany({
      where: { slotId },
      select: { epochNumber: true },
    })).map((f) => f.epochNumber.toString()),
  );
  const existing = await prisma.operatorStatusSample.findMany({
    where: { slotId, kind: 'epoch' },
  });
  const byEpoch = new Map(existing.map((s) => [s.epochNumber?.toString() ?? '-', s]));

  let epochsFetched = 0;
  let epochsFailed = 0;
  for (const { epochNumber } of entitled) {
    if (epochsFetched + epochsFailed >= budget) break;
    const stored = byEpoch.get(epochNumber.toString()) ?? null;
    const state = epochStateOf(stored);
    if (state === SETTLED_STATE) continue;
    const hasPayload = stored?.payloadJson != null;
    const chainSettled = finalized.has(epochNumber.toString());
    if (hasPayload && !chainSettled) continue; // fresh enough; re-fetch only after settle
    const result = await recordFetch(prisma, {
      slotId,
      kind: 'epoch',
      epochNumber,
      baseUrl,
      now,
      outcome: await fetchJson(`${baseUrl}/v1/operator-status/epochs/${epochNumber}`),
    });
    if (result === 'stored') epochsFetched++;
    else epochsFailed++;
  }

  return { slotId: slotId.toString(), clock, discovery, epochsFetched, epochsFailed };
}

/** Parse OPERATOR_STATUS_URLS: `3=https://rewards.nyks.dev,5=https://…`. */
export function parseOperatorStatusUrls(raw: string | undefined): Map<bigint, string> {
  const out = new Map<bigint, string>();
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const slot = part.slice(0, eq).trim();
    const url = part.slice(eq + 1).trim();
    if (/^\d+$/.test(slot) && /^https?:\/\//.test(url)) out.set(BigInt(slot), url);
  }
  return out;
}
