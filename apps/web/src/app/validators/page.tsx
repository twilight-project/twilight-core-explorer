import { Tabs, activeTab } from '@/components/ui/Tabs';
import { ValidatorsVerdict } from '@/components/validators/ValidatorsVerdict';
import { ValidatorsTable } from '@/components/validators/ValidatorsTable';
import { CoreSlotsList } from '@/components/coreslots/CoreSlotsList';
import { OperatorsDirectory } from '@/components/operators/OperatorsDirectory';
import { ProposerDistributionChart } from '@/components/network/ProposerDistributionChart';
import { ProposerLeaderboard } from '@/components/network/ProposerLeaderboard';
import { SigningHeatmap } from '@/components/liveness/SigningHeatmap';
import { PerSlotHealthTable } from '@/components/liveness/PerSlotHealthTable';
import { oneParam } from '@/lib/search-params';

export const metadata = { title: 'Validators' };

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'registry', label: 'Registry' },
  { id: 'operators', label: 'Operators' },
  { id: 'history', label: 'Network history' },
] as const;

// /validators — the merged destination for the old /network, /liveness and /coreslots list
// pages (those routes now redirect here). Verdict first, then tabs; only the active tab's
// panel mounts, so inactive tabs' queries never fire.
export default function ValidatorsPage({
  searchParams,
}: {
  searchParams: { tab?: string | string[]; status?: string | string[] };
}) {
  const tab = activeTab(TABS, searchParams.tab);
  const status = oneParam(searchParams.status);

  return (
    <div className="flex flex-col gap-7">
      <ValidatorsVerdict />
      <Tabs
        tabs={TABS}
        active={tab}
        hrefFor={(id) => (id === TABS[0].id ? '/validators' : `/validators?tab=${id}`)}
        ariaLabel="Validator views"
      />
      {tab === 'active' ? (
        <div className="flex flex-col gap-6">
          <ValidatorsTable />
          <PerSlotHealthTable />
        </div>
      ) : null}
      {tab === 'registry' ? <CoreSlotsList status={status} /> : null}
      {tab === 'operators' ? <OperatorsDirectory /> : null}
      {tab === 'history' ? (
        <div className="flex flex-col gap-6">
          <SigningHeatmap />
          <ProposerDistributionChart />
          <ProposerLeaderboard />
        </div>
      ) : null}
    </div>
  );
}
