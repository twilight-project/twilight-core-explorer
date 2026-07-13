import { Award } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { RewardsSummaryStrip } from '@/components/rewards/RewardsSummaryStrip';
import { RewardsView } from '@/components/rewards/RewardsView';

export const metadata = { title: 'Rewards' };

// Airy redesign — keeps our accurate read-only rewards semantics (observed projections + historical
// events, no claim action), improves only the layout: a real summary strip over the existing epochs /
// claims / balances / treasury / params panels + the non-actionable claiming caveat.
export default function RewardsPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Award}
        iconTone="rewards"
        eyebrow="Rewards"
        title="CoreSlot rewards & emissions"
        sub="Epochs, claim history, module balances, treasury payments, and params changes — read-only observed projections and historical events. Claiming is not available here."
      />
      <RewardsSummaryStrip />
      <RewardsView />
    </div>
  );
}
