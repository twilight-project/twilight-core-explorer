import { Network } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { NetworkHealthStrip } from '@/components/network/NetworkHealthStrip';
import { ValidatorSetSection } from '@/components/network/ValidatorSetSection';
import { ProposerLeaderboard } from '@/components/network/ProposerLeaderboard';
import { ProposerDistributionChart } from '@/components/network/ProposerDistributionChart';

export const metadata = { title: 'Network' };

// Airy redesign — the "who is validating and is the set healthy?" page: a real health-summary strip
// over the active CoreSlot set (with consensus power + effective window) and the proposer leaderboard.
// Deep signing behavior (heatmap, missed streaks) lives on the Liveness page.
export default function NetworkPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Network}
        iconTone="coreslot"
        eyebrow="Network"
        title="Validator set & network health"
        sub="The active CoreSlot set at the latest indexed height, the block-proposer leaderboard, and overall signing health — who is validating Twilight, and is the set safe from a halt."
      />
      <NetworkHealthStrip />
      <ValidatorSetSection />
      <ProposerDistributionChart />
      <ProposerLeaderboard />
    </div>
  );
}
