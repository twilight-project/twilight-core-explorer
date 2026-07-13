import { Coins } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SupplySummaryStrip } from '@/components/supply/SupplySummaryStrip';
import { SupplyView } from '@/components/supply/SupplyView';

export const metadata = { title: 'Supply' };

// Airy redesign — conservative by design (per the review): a real summary strip (sampled total,
// sample height, cumulative emitted, denom count) over the observed denom sample. No
// circulating/bonded/vesting donut — the contract exposes no breakdown, so we don't fabricate one.
export default function SupplyPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Coins}
        iconTone="rewards"
        eyebrow="Supply"
        title="Token supply"
        sub="Observed total supply by denom at a sampled height, plus cumulative emitted rewards — read-only, not a computed economic breakdown (no circulating / bonded / vesting split)."
      />
      <SupplySummaryStrip />
      <SupplyView />
    </div>
  );
}
