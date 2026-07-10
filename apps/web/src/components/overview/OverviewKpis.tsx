'use client';

import { Award, Coins, Database, Gauge, RefreshCw, Server, ServerCog, ShieldAlert } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import {
  useCoreSlots,
  useLivenessRisk,
  useRewardsEpochs,
  useStatus,
  useValidatorSet,
} from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { bpsToPercent } from '@/lib/format/bps';
import { statusTone } from '@/lib/format/status';

// The airy 8-up KPI grid. Every value is a real API field; a pending metric shows "…", a missing one
// "—" (never 0, never a fabricated staking/APR/throughput number). Total supply is intentionally NOT
// a card here — it has its own sampled panel below, so a card would double-count the sample.
//
// Active vs Registered are separate reads on purpose (PoA: the registry keeps rotated-out slots, so
// registered ≥ active). We show real counts, not "N/100" — the 100 cap is real but reads as a
// borrowed Cosmos default, per the redesign review.
export function OverviewKpis() {
  const status = useStatus();
  const liveness = useLivenessRisk();
  const slots = useCoreSlots();
  const epochs = useRewardsEpochs();

  const indexer = status.data?.data.indexer;
  // Active set = validator set AT the latest indexed height (string height; never Number()).
  const latest = indexer?.lastIndexedHeight;
  const height = typeof latest === 'string' && /^\d+$/.test(latest) ? latest : undefined;
  const validatorSet = useValidatorSet(height);

  const risk = liveness.data?.data;
  const activeCount = validatorSet.data ? validatorSet.data.data.length : undefined;
  const registered = slots.data ? slots.data.data.length : undefined;

  // Epochs are DESC (epochNumber desc), so the first row is the latest. cumulativeEmitted is a running
  // total carried on the epoch row — real, no client-side summing.
  const latestEpoch = epochs.data?.pages[0]?.data[0];
  const emitted =
    latestEpoch && latestEpoch.cumulativeEmitted !== null && latestEpoch.denom !== null
      ? formatAmount(latestEpoch.cumulativeEmitted, latestEpoch.denom)
      : null;

  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        icon={Database}
        iconTone="infra"
        label="Latest height"
        value={indexer ? formatHeight(indexer.lastIndexedHeight) : dash(status.isPending)}
        delta={indexer?.status}
        deltaTone={statusTone(indexer?.status)}
        sub={indexer ? `chain tip ${formatHeight(indexer.latestChainHeight)}` : 'awaiting status'}
      />

      <KpiCard
        icon={RefreshCw}
        iconTone="infra"
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
            : 'awaiting liveness snapshot'
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

      <KpiCard
        icon={Award}
        iconTone="rewards"
        label="Latest reward epoch"
        value={latestEpoch ? formatHeight(latestEpoch.epochNumber) : dash(epochs.isPending)}
        sub={
          latestEpoch?.activeSlotCount !== null && latestEpoch?.activeSlotCount !== undefined
            ? `${latestEpoch.activeSlotCount} slots rewarded`
            : 'aggregate projection'
        }
      />

      <KpiCard
        icon={Coins}
        iconTone="rewards"
        label="Cumulative emitted"
        value={emitted ? emitted.display : dash(epochs.isPending)}
        unit={emitted ? emitted.symbol : undefined}
        sub={
          latestEpoch ? `through epoch ${formatHeight(latestEpoch.epochNumber)}` : 'observed rewards'
        }
      />
    </div>
  );
}
