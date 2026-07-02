'use client';

import { KpiCard } from '@/components/ui/KpiCard';
import { useLivenessRisk, useStatus, useValidatorSet } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { bpsToPercent } from '@/lib/format/bps';
import { statusTone } from '@/lib/format/status';

// Real network-health summary for the Network page: active set size (validator set at the latest
// indexed height) + the liveness-risk snapshot (available power, healthy/watch/down, halt risk).
// All real fields; pending -> "…", missing/error -> "—" (a 404 "no snapshot yet" reads as "—").
export function NetworkHealthStrip() {
  const status = useStatus();
  const liveness = useLivenessRisk();

  const latest = status.data?.data.indexer?.lastIndexedHeight;
  const height = typeof latest === 'string' && /^\d+$/.test(latest) ? latest : undefined;
  const validatorSet = useValidatorSet(height);

  const risk = liveness.data?.data;
  const activeCount = validatorSet.data ? validatorSet.data.data.length : undefined;
  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        label="Active CoreSlots"
        value={
          activeCount === undefined ? dash(validatorSet.isPending || status.isPending) : activeCount
        }
        sub={height ? `at height ${formatHeight(height)}` : 'active validator set'}
      />
      <KpiCard
        label="Available signing power"
        value={risk ? bpsToPercent(risk.availablePowerBps) : dash(liveness.isPending)}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        delta={risk ? risk.haltRiskLevel : undefined}
        sub="of total consensus power"
      />
      <KpiCard
        label="Healthy CoreSlots"
        value={risk ? risk.healthySlotCount : dash(liveness.isPending)}
        sub={
          risk
            ? `${risk.degradedSlotCount} on watch · ${risk.downSlotCount} down`
            : 'awaiting snapshot'
        }
      />
      <KpiCard
        label="Halt risk"
        value={risk ? risk.haltRiskLevel : dash(liveness.isPending)}
        mono={false}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        sub={risk?.haltRiskReason ?? 'consensus continuity'}
      />
    </div>
  );
}
