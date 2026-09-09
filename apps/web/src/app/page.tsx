import { VerdictBlock } from '@/components/overview/VerdictBlock';
import { StatDoors } from '@/components/overview/StatDoors';
import { LatestBlocksPanel, RecentTxPanel } from '@/components/overview/ActivityPanels';

// Overview — redesign: one plain-language verdict first (with the freshness grid behind a
// disclosure), three stat doors into the sections, then the two activity lists. Each metric
// appears exactly once. The page is a static server shell; each panel is a client query.
export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-10">
      <VerdictBlock />
      <StatDoors />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LatestBlocksPanel />
        <RecentTxPanel />
      </div>
    </div>
  );
}
