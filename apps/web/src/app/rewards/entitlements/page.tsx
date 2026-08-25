import { HandCoins } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EntitlementsSection } from '@/components/rewards/sections/EntitlementsSection';
import { oneParam } from '@/lib/search-params';

export const metadata = { title: 'Entitlements' };

export default function RewardsEntitlementsPage({
  searchParams,
}: {
  searchParams: {
    epoch?: string | string[];
    slotId?: string | string[];
    payoutAddress?: string | string[];
  };
}) {
  // Coerce each raw URL param at the trust boundary; the API re-validates (digits patterns).
  const filter = {
    epoch: oneParam(searchParams.epoch),
    slotId: oneParam(searchParams.slotId),
    payoutAddress: oneParam(searchParams.payoutAddress),
  };

  const scope = filter.slotId
    ? ` for CoreSlot ${filter.slotId}`
    : filter.epoch
      ? ` for epoch ${filter.epoch}`
      : '';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HandCoins}
        iconTone="rewards"
        eyebrow="Rewards"
        title="Entitlements"
        sub={`Per-slot, per-epoch reward entitlements${scope}, and how much x/mining settlement has released. Read-only — the explorer performs no settlement action.`}
      />
      <EntitlementsSection filter={filter} showFilters />
    </div>
  );
}
