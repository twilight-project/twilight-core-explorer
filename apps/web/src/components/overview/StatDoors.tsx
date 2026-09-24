'use client';

import Link from 'next/link';
import { useLivenessRisk, useRewardsEpochs, useSettlementStatus } from '@/lib/api/queries';

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

export function StatDoors() {
  const liveness = useLivenessRisk();
  const epochs = useRewardsEpochs();
  const settlements = useSettlementStatus();

  const risk = liveness.data?.data;
  const latestEpoch = epochs.data?.pages[0]?.data[0];
  // Open settlements = entitlements with no finalization yet, summed across slots.
  const slotSummaries = settlements.data?.pages[0]?.slots;
  const openSettlements =
    slotSummaries !== undefined
      ? String(slotSummaries.reduce((n, s) => n + s.openCount, 0))
      : '…';

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
        label="Open settlements"
        value={openSettlements}
        section="Economy"
        href="/economy?tab=settlements"
      />
    </div>
  );
}
