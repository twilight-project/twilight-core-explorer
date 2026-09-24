'use client';

import { useCoreSlots, useLivenessRisk } from '@/lib/api/queries';
import { statusTone } from '@/lib/format/status';

/** "10000" bps → "100%", "9166" → "91.66%". */
function bpsToPercent(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '…';
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, '0')}%`;
}

// Verdict header for /validators — replaces NetworkHealthStrip + CoreSlotsSummaryStrip +
// LivenessOverview's stat grid with one sentence derived from the same queries.
export function ValidatorsVerdict() {
  const liveness = useLivenessRisk();
  const slots = useCoreSlots();

  const risk = liveness.data?.data;
  const registry = slots.data?.data ?? [];
  const rotatedOut = registry.filter((s) => s.status !== 'ACTIVE').length;

  const title = risk
    ? risk.healthySlotCount === risk.activeSlotCount
      ? `All ${risk.activeSlotCount} signing`
      : `${risk.activeSlotCount - risk.healthySlotCount} of ${risk.activeSlotCount} unhealthy`
    : 'CoreSlots';
  const riskColor =
    statusTone(risk?.haltRiskLevel) === 'success' ? 'text-accent-green' : 'text-accent-yellow';

  const healthy = risk ? risk.healthySlotCount === risk.activeSlotCount : true;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl text-text">Slots</h1>
        {risk ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-sm text-text-secondary">
            <span
              aria-hidden="true"
              className={
                healthy
                  ? 'h-2 w-2 rounded-full bg-accent-green'
                  : 'h-2 w-2 rounded-full bg-accent-yellow'
              }
            />
            {title}
          </span>
        ) : null}
      </div>
      {risk ? (
        <p className="max-w-2xl text-sm text-text-muted">
          {bpsToPercent(risk.availablePowerBps)} of signing power available · halt risk{' '}
          <span className={riskColor}>{risk.haltRiskLevel}</span>
          {rotatedOut > 0
            ? ` · ${rotatedOut} rotated-out slot${rotatedOut === 1 ? '' : 's'} in the registry`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
