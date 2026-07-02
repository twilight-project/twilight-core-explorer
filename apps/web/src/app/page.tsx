import { OverviewHeader } from '@/components/overview/OverviewHeader';
import { OverviewKpis } from '@/components/overview/OverviewKpis';
import { FreshnessStrip } from '@/components/overview/FreshnessStrip';
import { LatestBlocksPanel, RecentTxPanel } from '@/components/overview/ActivityPanels';
import { LivenessSegmentedPanel } from '@/components/overview/LivenessSegmentedPanel';
import { SupplyPanel } from '@/components/overview/SupplyPanel';

// Overview — the operational summary answering "is Twilight healthy, current, and producing blocks?"
// Airy/premium redesign: a serif page header with a live-derived status pill, a 6-up real-data KPI
// grid, the freshness strip, live activity tables, and the segmented liveness + sampled supply row.
// The page is a static server shell; each panel is an independent client query (theme-agnostic tokens).
export default function OverviewPage() {
  return (
    <div className="space-y-section">
      <OverviewHeader />
      <OverviewKpis />
      <FreshnessStrip />

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
        <LatestBlocksPanel />
        <RecentTxPanel />
      </div>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
        <LivenessSegmentedPanel />
        <SupplyPanel />
      </div>
    </div>
  );
}
