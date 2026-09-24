import { Tabs, activeTab } from '@/components/ui/Tabs';
import { ValidatorsVerdict } from '@/components/slots/ValidatorsVerdict';
import { ValidatorsTable } from '@/components/slots/ValidatorsTable';
import { OperatorsDirectory } from '@/components/operators/OperatorsDirectory';
import { ProposerDistributionChart } from '@/components/network/ProposerDistributionChart';
import { ProposerLeaderboard } from '@/components/network/ProposerLeaderboard';
import { SigningHeatmap } from '@/components/liveness/SigningHeatmap';

export const metadata = { title: 'Slots' };

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'operators', label: 'Operators' },
  { id: 'history', label: 'Network history' },
] as const;

// /validators — the merged destination for the old /network, /liveness and /coreslots list
// pages (those routes now redirect here). Verdict first, then tabs; only the active tab's
// panel mounts, so inactive tabs' queries never fire.
export default function ValidatorsPage({
  searchParams,
}: {
  searchParams: { tab?: string | string[] };
}) {
  const tab = activeTab(TABS, searchParams.tab);

  return (
    <div className="flex flex-col gap-7">
      <ValidatorsVerdict />
      <Tabs
        tabs={TABS}
        active={tab}
        hrefFor={(id) => (id === TABS[0].id ? '/slots' : `/slots?tab=${id}`)}
        ariaLabel="Slot views"
      />
      {tab === 'overview' ? <ValidatorsTable /> : null}
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
