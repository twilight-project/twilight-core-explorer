'use client';

import Link from 'next/link';
import { useLatestBlocks, useLivenessRisk, useRewardsEpochs } from '@/lib/api/queries';

// Redesign: three quiet numbers, each a DOOR to a section — replacing the 8-KPI grid. A value
// appears once per page, so these three deliberately do not repeat the verdict sentence's
// numbers (indexed height, slot counts, epoch close time).
function Door({
  label,
  value,
  section,
  href,
}: {
  label: string;
  value: string;
  section: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2.5 rounded-2xl border border-card-border bg-card px-5 py-5 hover:border-border-light hover:bg-card-hover"
    >
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="font-mono text-2xl tracking-tight text-text">{value}</span>
      <span className="text-sm text-primary">{section} →</span>
    </Link>
  );
}

/** Percentage from basis points, without float drama: "10000" → "100%", "9166" → "91.66%". */
function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '…';
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, '0')}%`;
}

/** Mean seconds between the last N blocks, from their timestamps. */
function averageBlockSeconds(times: (string | null)[]): string {
  const parsed = times
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t))
    .filter((n) => Number.isFinite(n));
  if (parsed.length < 2) return '…';
  const spanMs = Math.abs((parsed[0] as number) - (parsed[parsed.length - 1] as number));
  const avg = spanMs / (parsed.length - 1) / 1000;
  return `${avg.toFixed(1)}s`;
}

export function StatDoors() {
  const liveness = useLivenessRisk();
  const epochs = useRewardsEpochs();
  const blocks = useLatestBlocks(8);

  const risk = liveness.data?.data;
  const latestEpoch = epochs.data?.pages[0]?.data[0];
  const blockTimes = blocks.data?.data.map((b) => b.time) ?? [];

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      <Door
        label="Signing power available"
        value={bpsToPercent(risk?.availablePowerBps)}
        section="Validators"
        href="/validators"
      />
      <Door
        label="Latest reward epoch"
        value={latestEpoch ? latestEpoch.epochNumber : '…'}
        section="Economy"
        href="/economy"
      />
      <Door
        label="Average block time"
        value={averageBlockSeconds(blockTimes)}
        section="Blocks"
        href="/blocks"
      />
    </div>
  );
}
