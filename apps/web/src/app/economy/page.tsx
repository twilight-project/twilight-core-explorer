import { Tabs, activeTab } from '@/components/ui/Tabs';
import { EconomyVerdict } from '@/components/economy/EconomyVerdict';
import { EpochsSection } from '@/components/rewards/sections/EpochsSection';
import { EntitlementsSection } from '@/components/rewards/sections/EntitlementsSection';
import { BalancesSection } from '@/components/rewards/sections/BalancesSection';
import { TreasurySection } from '@/components/rewards/sections/TreasurySection';
import { ParamsSection } from '@/components/rewards/sections/ParamsSection';
import { SettlementsStatusSection } from '@/components/economy/SettlementsStatusSection';
import { SupplyView } from '@/components/supply/SupplyView';
import { oneParam } from '@/lib/search-params';

export const metadata = { title: 'Economy' };

const TABS = [
  { id: 'epochs', label: 'Epochs' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'entitlements', label: 'Entitlements' },
  { id: 'supply', label: 'Supply' },
  { id: 'parameters', label: 'Parameters' },
] as const;

// /economy — the merged destination for the old /rewards, /rewards/entitlements and /supply
// pages (those routes now redirect here; the epoch + settlement detail routes are unchanged).
// Treasury and module balances fold into the Supply tab.
export default function EconomyPage({
  searchParams,
}: {
  searchParams: {
    tab?: string | string[];
    epoch?: string | string[];
    slotId?: string | string[];
    payoutAddress?: string | string[];
  };
}) {
  const tab = activeTab(TABS, searchParams.tab);
  const entitlementsFilter = {
    epoch: oneParam(searchParams.epoch),
    slotId: oneParam(searchParams.slotId),
    payoutAddress: oneParam(searchParams.payoutAddress),
  };

  return (
    <div className="flex flex-col gap-7">
      <EconomyVerdict />
      <Tabs
        tabs={TABS}
        active={tab}
        hrefFor={(id) => (id === TABS[0].id ? '/economy' : `/economy?tab=${id}`)}
        ariaLabel="Economy views"
      />
      {tab === 'epochs' ? <EpochsSection /> : null}
      {tab === 'settlements' ? <SettlementsStatusSection /> : null}
      {tab === 'entitlements' ? <EntitlementsSection filter={entitlementsFilter} showFilters /> : null}
      {tab === 'supply' ? (
        <div className="flex flex-col gap-6">
          <SupplyView />
          <BalancesSection />
          <TreasurySection />
        </div>
      ) : null}
      {tab === 'parameters' ? <ParamsSection /> : null}
    </div>
  );
}
