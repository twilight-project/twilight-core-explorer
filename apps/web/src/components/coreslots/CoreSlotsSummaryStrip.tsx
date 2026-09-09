'use client';

import { Gauge, Server, ServerCog, ShieldAlert } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { useCoreSlots, useLivenessRisk, useStatus, useValidatorSet } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { bpsToPercent } from '@/lib/format/bps';
import { statusTone } from '@/lib/format/status';

// Real registry summary for the CoreSlots page: active set (validator set at latest height) vs the
// full registry count, plus the liveness-risk vital signs. Active ≠ Registered on PoA — rotated-out
// slots stay in the registry. All real; pending -> "…", missing -> "—".
export function CoreSlotsSummaryStrip() {
  const status = useStatus();
  const slots = useCoreSlots();
  const liveness = useLivenessRisk();

  const latest = status.data?.data.indexer?.lastIndexedHeight;
  const height = typeof latest === 'string' && /^\d+$/.test(latest) ? latest : undefined;
  const validatorSet = useValidatorSet(height);

  const risk = liveness.data?.data;
  const activeCount = validatorSet.data ? validatorSet.data.data.length : undefined;
  const registered = slots.data ? slots.data.data.length : undefined;
  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        icon={Server}
        iconTone="coreslot"
        label="Active CoreSlots"
        value={
          activeCount === undefined ? dash(validatorSet.isPending || status.isPending) : activeCount
        }
        sub={height ? `signing at height ${formatHeight(height)}` : 'active validator set'}
      />
      <KpiCard
        icon={ServerCog}
        iconTone="coreslot"
        label="Registered CoreSlots"
        value={registered === undefined ? dash(slots.isPending) : registered}
        sub="in registry (incl. rotated-out)"
      />
      <KpiCard
        icon={Gauge}
        iconTone="liveness"
        label="Available signing power"
        value={risk ? bpsToPercent(risk.availablePowerBps) : dash(liveness.isPending)}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        delta={risk ? `${risk.healthySlotCount} healthy` : undefined}
        sub={
          risk
            ? `${risk.degradedSlotCount} on watch · ${risk.downSlotCount} down`
            : 'awaiting snapshot'
        }
      />
      <KpiCard
        icon={ShieldAlert}
        iconTone="risk"
        label="Halt risk"
        value={risk ? risk.haltRiskLevel : dash(liveness.isPending)}
        mono={false}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        sub={risk?.haltRiskReason ?? 'consensus continuity'}
      />
    </div>
  );
}
