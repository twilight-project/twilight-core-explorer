import { utwltToTwlt } from '@/components/charts/shape';
import type { OperatorHistoryResponse } from '@/lib/api/queries';

// The operator dashboard's data layer: the daily history rows from /operators/{slot}/history
// turned into chartable metrics, headline totals and a CSV. Pure functions only, so the
// numbers on the page are testable without rendering a chart.

export type HistoryDay = OperatorHistoryResponse['data']['days'][number];

export type MetricId =
  | 'distinctMiners'
  | 'paid'
  | 'entitlement'
  | 'kept'
  | 'activeMiners'
  | 'newMiners'
  | 'enrolled'
  | 'latency';

export interface MetricDef {
  id: MetricId;
  label: string;
  unit: 'TWLT' | 'miners' | 'blocks';
  /** Area for flows of value, bars for counts. */
  form: 'area' | 'bar';
  provenance: 'chain' | 'attested';
  /** What one day's value means, for the chart caption and tooltip. */
  caption: string;
  value: (d: HistoryDay) => number | null;
  /** Plot the running total of `value` instead of each day's value (drawn as a step line). */
  cumulative?: boolean;
}

const twlt = (raw: string) => utwltToTwlt(raw) ?? 0;

export const METRICS: MetricDef[] = [
  {
    id: 'distinctMiners',
    label: 'Distinct miners',
    unit: 'miners',
    form: 'area',
    provenance: 'chain',
    caption: 'Distinct addresses ever paid by this slot, as of each day',
    value: (d) => d.newMiners,
    cumulative: true,
  },
  {
    id: 'paid',
    label: 'Paid to miners',
    unit: 'TWLT',
    form: 'area',
    provenance: 'chain',
    caption: 'TWLT paid to miners by settlements of the epochs that closed that day',
    value: (d) => twlt(d.paid),
  },
  {
    id: 'entitlement',
    label: 'Owed',
    unit: 'TWLT',
    form: 'area',
    provenance: 'chain',
    caption: 'TWLT the chain allotted to this slot for the epochs that closed that day',
    value: (d) => twlt(d.entitlement),
  },
  {
    id: 'kept',
    label: 'Kept',
    unit: 'TWLT',
    form: 'area',
    provenance: 'chain',
    caption: 'TWLT kept as settlement remainder: residue and budget not paid to miners',
    value: (d) => twlt(d.kept),
  },
  {
    id: 'activeMiners',
    label: 'Miners paid',
    unit: 'miners',
    form: 'bar',
    provenance: 'chain',
    caption: 'Distinct addresses paid by this slot that day',
    value: (d) => d.activeMiners,
  },
  {
    id: 'newMiners',
    label: 'New miners',
    unit: 'miners',
    form: 'bar',
    provenance: 'chain',
    caption: 'Addresses paid by this slot for the first time that day',
    value: (d) => d.newMiners,
  },
  {
    id: 'enrolled',
    label: 'Enrolled',
    unit: 'miners',
    form: 'area',
    provenance: 'attested',
    caption: "Average miners enrolled per epoch, as published by the operator's auth server",
    value: (d) => (d.feed.avgEnrolled === null ? null : round(d.feed.avgEnrolled, 2)),
  },
  {
    id: 'latency',
    label: 'Latency',
    unit: 'blocks',
    form: 'bar',
    provenance: 'chain',
    caption: 'Median blocks from epoch close to its settlement',
    value: (d) => (d.medianLatencyBlocks === null ? null : Number(d.medianLatencyBlocks)),
  },
];

export function metric(id: MetricId): MetricDef {
  const m = METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown metric ${id}`);
  return m;
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** [day, value] pairs, oldest first; null values stay null so the chart shows a gap. */
export function seriesFor(days: HistoryDay[], id: MetricId): Array<[string, number | null]> {
  const m = metric(id);
  if (!m.cumulative) return days.map((d) => [d.day, m.value(d)]);
  let total = 0;
  return days.map((d) => {
    total += m.value(d) ?? 0;
    return [d.day, round(total, 6)];
  });
}

/** Share of the day's owed amount that reached miners, over settled epochs only (0–100). */
export function payoutSharePct(d: HistoryDay): number | null {
  if (d.settledEpochs === 0) return null;
  try {
    const ent = BigInt(d.paid) + BigInt(d.kept);
    if (ent === 0n) return null;
    return Number((BigInt(d.paid) * 1000n) / ent) / 10;
  } catch {
    return null;
  }
}

export interface HistoryTotals {
  paid: number;
  entitlement: number;
  kept: number;
  epochs: number;
  settledEpochs: number;
  payouts: number;
  miners: number;
}

/** Sums over the given days. Amounts are summed exactly in base units, then converted. */
export function totals(days: HistoryDay[]): HistoryTotals {
  let paid = 0n;
  let ent = 0n;
  let kept = 0n;
  let epochs = 0;
  let settled = 0;
  let payouts = 0;
  let miners = 0;
  for (const d of days) {
    paid += BigInt(d.paid);
    ent += BigInt(d.entitlement);
    kept += BigInt(d.kept);
    epochs += d.epochs;
    settled += d.settledEpochs;
    payouts += d.payouts;
    miners += d.newMiners;
  }
  return {
    paid: utwltToTwlt(paid.toString()) ?? 0,
    entitlement: utwltToTwlt(ent.toString()) ?? 0,
    kept: utwltToTwlt(kept.toString()) ?? 0,
    epochs,
    settledEpochs: settled,
    payouts,
    miners,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** True when `day` (YYYY-MM-DD, UTC) is the current UTC date. */
export function isToday(day: string, now: number = Date.now()): boolean {
  return new Date(now).toISOString().slice(0, 10) === day;
}

/**
 * The rows falling in the `n` calendar days ending at the newest row's day (history is
 * oldest first). A day with no owed epoch has NO row, so slicing the last `n` rows would
 * reach back over however many idle days it took to find them — on this chain, a slot that
 * settles twice a week would call 15 weeks of rows "the last 30 days".
 */
export function lastDays(days: HistoryDay[], n: number): HistoryDay[] {
  const newest = days[days.length - 1];
  if (!newest) return [];
  const start = dayToMs(newest.day) - (n - 1) * DAY_MS;
  return days.filter((d) => dayToMs(d.day) >= start);
}

const CSV_COLUMNS: Array<[string, (d: HistoryDay) => string | number | null]> = [
  ['day', (d) => d.day],
  ['first_epoch', (d) => d.firstEpoch],
  ['last_epoch', (d) => d.lastEpoch],
  ['epochs', (d) => d.epochs],
  ['settled_epochs', (d) => d.settledEpochs],
  ['owed_twlt', (d) => utwltToTwlt(d.entitlement)],
  ['paid_twlt', (d) => utwltToTwlt(d.paid)],
  ['kept_twlt', (d) => utwltToTwlt(d.kept)],
  ['payout_lines', (d) => d.payouts],
  ['miners_paid', (d) => d.activeMiners],
  ['new_miners', (d) => d.newMiners],
  ['median_latency_blocks', (d) => d.medianLatencyBlocks],
  ['enrolled_avg_attested', (d) => d.feed.avgEnrolled],
  ['enrolled_max_attested', (d) => d.feed.maxEnrolled],
  ['admitted_attested', (d) => d.feed.admitted],
];

export function historyCsv(days: HistoryDay[]): string {
  const header = CSV_COLUMNS.map(([h]) => h).join(',');
  const rows = days.map((d) => CSV_COLUMNS.map(([, f]) => f(d) ?? '').join(','));
  return [header, ...rows].join('\n') + '\n';
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export function formatNumber(v: number): string {
  return NUMBER.format(v);
}

/** Axis-label style: 1.2K, 35M. */
export function formatCompact(v: number): string {
  return COMPACT.format(v);
}

/** "12 Oct" for axes, "12 Oct 2026" for tooltips. */
export function formatDay(day: string, withYear = false): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}
