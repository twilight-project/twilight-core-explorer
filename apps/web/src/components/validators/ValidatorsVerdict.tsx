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
      ? `${risk.activeSlotCount} CoreSlots, all signing`
      : `${risk.activeSlotCount} CoreSlots, ${risk.activeSlotCount - risk.healthySlotCount} unhealthy`
    : 'CoreSlots';
  const riskColor =
    statusTone(risk?.haltRiskLevel) === 'success' ? 'text-accent-green' : 'text-accent-yellow';

  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-serif text-3xl tracking-tight text-text">{title}</h1>
      {risk ? (
        <p className="max-w-2xl text-[15px] leading-relaxed text-text-secondary">
          {bpsToPercent(risk.availablePowerBps)} of signing power is available. Halt risk is{' '}
          <span className={riskColor}>{risk.haltRiskLevel}</span>.
          {rotatedOut > 0
            ? ` ${rotatedOut} rotated-out slot${rotatedOut === 1 ? '' : 's'} remain in the registry.`
            : ''}
        </p>
      ) : null}
    </div>
  );
}
