'use client';

import { Award, Coins, HandCoins, Server } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { useRewardsEpochs } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatAmount } from '@/lib/format/amount';
import { formatRelativeTime } from '@/lib/format/time';

// Real rewards summary from the latest epoch row (epochs are DESC). Every value is an observed
// aggregate projection — read-only, historical; no claim truth is implied here (that's the caveat on
// the ClaimingCard below). Pending -> "…", missing -> "—".
export function RewardsSummaryStrip() {
  const epochs = useRewardsEpochs();
  const latest = epochs.data?.pages[0]?.data[0];

  const reward =
    latest && latest.totalReward !== null && latest.denom !== null
      ? formatAmount(latest.totalReward, latest.denom)
      : null;
  const emitted =
    latest && latest.cumulativeEmitted !== null && latest.denom !== null
      ? formatAmount(latest.cumulativeEmitted, latest.denom)
      : null;
  const dash = (pending: boolean) => (pending ? '…' : '—');

  return (
    <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
      <KpiCard
        icon={Award}
        iconTone="rewards"
        label="Latest reward epoch"
        value={latest ? formatHeight(latest.epochNumber) : dash(epochs.isPending)}
        sub={latest?.blockTime ? formatRelativeTime(latest.blockTime) : 'aggregate projection'}
      />
      <KpiCard
        icon={HandCoins}
        iconTone="rewards"
        label="Latest reward"
        value={reward ? reward.display : dash(epochs.isPending)}
        unit={reward ? reward.symbol : undefined}
        sub={latest ? `epoch ${formatHeight(latest.epochNumber)}` : 'observed emission'}
      />
      <KpiCard
        icon={Server}
        iconTone="coreslot"
        label="Slots rewarded"
        value={
          latest?.activeSlotCount !== null && latest?.activeSlotCount !== undefined
            ? latest.activeSlotCount
            : dash(epochs.isPending)
        }
        sub="in the latest epoch"
      />
      <KpiCard
        icon={Coins}
        iconTone="rewards"
        label="Cumulative emitted"
        value={emitted ? emitted.display : dash(epochs.isPending)}
        unit={emitted ? emitted.symbol : undefined}
        sub={
          latest ? `through epoch ${formatHeight(latest.epochNumber)}` : 'observed rewards'
        }
      />
    </div>
  );
}
