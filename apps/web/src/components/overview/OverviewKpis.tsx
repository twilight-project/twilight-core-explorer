'use client';

import { KpiCard } from '@/components/ui/KpiCard';
import {
  useCoreSlots,
  useLivenessRisk,
  useStatus,
  useSupply,
  useValidatorSet,
} from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { bpsToPercent } from '@/lib/format/bps';
import { statusTone } from '@/lib/format/status';

// Max active CoreSlots is a chain constant (PoA cap), not a live field — the set can hold up to 100.
const MAX_CORESLOTS = 100;

// The airy 6-up KPI grid. Every value is a real API field; a pending metric shows "…", a missing one
// "—" (never 0, never a fabricated staking/APR/throughput number the handoff mock used).
export function OverviewKpis() {
  const status = useStatus();
  const liveness = useLivenessRisk();
  const supply = useSupply();
  const slots = useCoreSlots();

  const indexer = status.data?.data.indexer;
  // Active set = validator set AT the latest indexed height (string height; never Number()).
  const latest = indexer?.lastIndexedHeight;
  const height = typeof latest === 'string' && /^\d+$/.test(latest) ? latest : undefined;
  const validatorSet = useValidatorSet(height);

  const risk = liveness.data?.data;
  const utwlt = supply.data?.data.supply.find((c) => c.denom === 'utwlt');
  const amount = utwlt ? formatAmount(utwlt.amount, utwlt.denom) : null;

  const activeCount = validatorSet.data ? validatorSet.data.data.length : undefined;
  const registered = slots.data ? slots.data.data.length : undefined;

  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-1 gap-grid sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Latest height"
        value={indexer ? formatHeight(indexer.lastIndexedHeight) : dash(status.isPending)}
        delta={indexer?.status}
        deltaTone={statusTone(indexer?.status)}
        sub={indexer ? `chain tip ${formatHeight(indexer.latestChainHeight)}` : 'awaiting status'}
      />

      <KpiCard
        label="Index lag"
        value={indexer ? formatHeight(indexer.lagBlocks) : dash(status.isPending)}
        unit="blocks"
        deltaTone={indexer?.lagBlocks === '0' ? 'success' : 'warning'}
        delta={indexer ? (indexer.lagBlocks === '0' ? 'synced' : 'behind') : undefined}
        sub={
          indexer?.freshnessSeconds !== null && indexer?.freshnessSeconds !== undefined
            ? `${indexer.freshnessSeconds}s since last block`
            : 'behind chain tip'
        }
      />

      <KpiCard
        label="Active CoreSlots"
        value={activeCount === undefined ? dash(validatorSet.isPending || status.isPending) : activeCount}
        unit={`/ ${MAX_CORESLOTS}`}
        sub={registered === undefined ? 'of registered set' : `of ${registered} registered`}
      />

      <KpiCard
        label="Available signing power"
        value={risk ? bpsToPercent(risk.availablePowerBps) : dash(liveness.isPending)}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        delta={risk ? `${risk.healthySlotCount} healthy` : undefined}
        sub={
          risk
            ? `${risk.degradedSlotCount} on watch · ${risk.downSlotCount} down`
            : 'awaiting liveness snapshot'
        }
      />

      <KpiCard
        label="Halt risk"
        value={risk ? risk.haltRiskLevel : dash(liveness.isPending)}
        mono={false}
        deltaTone={risk ? statusTone(risk.haltRiskLevel) : 'neutral'}
        sub={risk?.haltRiskReason ?? 'consensus continuity'}
      />

      <KpiCard
        label="Total supply"
        value={amount ? amount.display : dash(supply.isPending)}
        unit={amount ? amount.symbol : undefined}
        sub={
          supply.data
            ? `sampled at height ${formatHeight(supply.data.data.sampledAtHeight)}`
            : 'sampled snapshot'
        }
      />
    </div>
  );
}
