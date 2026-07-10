'use client';

import { Coins, Database, Layers, Wallet } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { useRewardsEpochs, useSupply } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';

// Real, conservative supply summary: the sampled utwlt total + sample height, cumulative emitted
// (latest epoch row), and the denom count in the sample. No circulating/bonded/vesting breakdown —
// the contract exposes none, and a donut would fabricate it. A 404 "no sample" degrades to "—".
export function SupplySummaryStrip() {
  const supply = useSupply();
  const epochs = useRewardsEpochs();

  const utwlt = supply.data?.data.supply.find((c) => c.denom === 'utwlt');
  const total = utwlt ? formatAmount(utwlt.amount, utwlt.denom) : null;
  const denomCount = supply.data ? supply.data.data.supply.length : undefined;

  const latest = epochs.data?.pages[0]?.data[0];
  const emitted =
    latest && latest.cumulativeEmitted !== null && latest.denom !== null
      ? formatAmount(latest.cumulativeEmitted, latest.denom)
      : null;

  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        icon={Wallet}
        iconTone="rewards"
        label="Total supply (sampled)"
        value={total ? total.display : dash(supply.isPending)}
        unit={total ? total.symbol : undefined}
        sub={
          supply.data
            ? `sampled at height ${formatHeight(supply.data.data.sampledAtHeight)}`
            : 'sampled snapshot'
        }
      />
      <KpiCard
        icon={Database}
        iconTone="infra"
        label="Sampled at height"
        value={supply.data ? formatHeight(supply.data.data.sampledAtHeight) : dash(supply.isPending)}
        sub="observed sample"
      />
      <KpiCard
        icon={Coins}
        iconTone="rewards"
        label="Cumulative emitted"
        value={emitted ? emitted.display : dash(epochs.isPending)}
        unit={emitted ? emitted.symbol : undefined}
        sub={latest ? `through epoch ${formatHeight(latest.epochNumber)}` : 'observed rewards'}
      />
      <KpiCard
        icon={Layers}
        iconTone="rewards"
        label="Denominations"
        value={denomCount === undefined ? dash(supply.isPending) : denomCount}
        sub="in the supply sample"
      />
    </div>
  );
}
