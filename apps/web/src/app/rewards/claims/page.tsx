import { HandCoins } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ClaimsSection } from '@/components/rewards/sections/ClaimsSection';
import { oneParam } from '@/lib/search-params';

export const metadata = { title: 'Claim history' };

export default function RewardsClaimsPage({
  searchParams,
}: {
  searchParams: {
    slotId?: string | string[];
    claimant?: string | string[];
    txHash?: string | string[];
    fromHeight?: string | string[];
    toHeight?: string | string[];
  };
}) {
  // Coerce each raw URL param at the trust boundary; the API re-validates (digits patterns).
  const filter = {
    slotId: oneParam(searchParams.slotId),
    claimant: oneParam(searchParams.claimant),
    txHash: oneParam(searchParams.txHash),
    fromHeight: oneParam(searchParams.fromHeight),
    toHeight: oneParam(searchParams.toHeight),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HandCoins}
        iconTone="rewards"
        eyebrow="Rewards"
        title="Claim history"
        sub={`Historical reward claim events${filter.slotId ? ` for CoreSlot ${filter.slotId}` : ''}. Read-only — the explorer performs no claim action.`}
      />
      <ClaimsSection filter={filter} showFilters />
    </div>
  );
}
