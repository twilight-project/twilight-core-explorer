import { utwltToTwlt } from '@/components/charts/shape';

// Joins the two per-epoch sources into one oldest-first series for the operator trend
// charts: STATUS rows (every epoch owed: entitlement, settled, latency) and the settlement
// ACTIVITY rows (what actually happened: totalPaid, remainder, payoutCount). Chain facts
// only — nothing here reads the operator's feed.

export interface EpochStatusLike {
  epochNumber: string;
  entitlementAmount: string;
  settled: boolean;
  latencyBlocks: string | null;
}

export interface EpochActivityLike {
  epochNumber: string;
  totalPaid: string;
  releasedRemainder?: string | null;
  payoutCount: number;
}

export interface EpochSeriesRow {
  epoch: string;
  settled: boolean;
  /** Distinct recipients paid (0 for remainder-only or unsettled epochs). */
  recipients: number;
  /** paid ÷ entitlement, 0–100; null while the epoch is unsettled. */
  paidPct: number | null;
  paidTwlt: number;
  keptTwlt: number | null;
  /** Blocks from epoch close to the settlement tx; null while unsettled. */
  latency: number | null;
}

export function buildEpochSeries(
  statusRows: EpochStatusLike[],
  activityRows: EpochActivityLike[],
  max = 60,
): EpochSeriesRow[] {
  const activityByEpoch = new Map(activityRows.map((a) => [a.epochNumber, a]));
  return statusRows
    .slice(0, max)
    .map((r): EpochSeriesRow => {
      const a = activityByEpoch.get(r.epochNumber);
      const paidTwlt = a ? (utwltToTwlt(a.totalPaid) ?? 0) : 0;
      const keptTwlt =
        a?.releasedRemainder != null ? utwltToTwlt(a.releasedRemainder) : r.settled ? null : null;
      let paidPct: number | null = null;
      if (r.settled) {
        try {
          const ent = BigInt(r.entitlementAmount);
          paidPct =
            ent === 0n ? 0 : Number((BigInt(a?.totalPaid ?? '0') * 1000n) / ent) / 10;
        } catch {
          paidPct = null;
        }
      }
      return {
        epoch: r.epochNumber,
        settled: r.settled,
        recipients: a?.payoutCount ?? 0,
        paidPct,
        paidTwlt,
        keptTwlt,
        latency: r.latencyBlocks !== null ? Number(r.latencyBlocks) : null,
      };
    })
    .reverse(); // API serves newest first; charts read left→right oldest first
}
