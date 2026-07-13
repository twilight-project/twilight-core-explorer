import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { AccountsAggregateStrip } from '@/components/accounts/AccountsAggregateStrip';
import { AccountsList } from '@/components/accounts/AccountsList';

export const metadata = { title: 'Accounts' };

// Airy redesign — deliberately "Observed accounts," NOT a wealth leaderboard (per the review): the
// list is ordered by observation, never by balance, and balances are per-address samples (on the
// detail page), not a global holdings ranking.
//
// The strip is real (GET /accounts/aggregate): global registry counts only. No "24h" cards
// (firstSeen/lastSeen are heights, not timestamps) and no median-balance/holdings card (that would
// imply a complete global balance index we don't have).
export default function AccountsPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Users}
        iconTone="infra"
        eyebrow="Accounts"
        title="Observed accounts"
        sub="Addresses seen by the indexer — first/last activity, transaction count, and kind. This is an observation log, not a holdings ranking; balances are per-address samples on each account's page."
      />

      <AccountsAggregateStrip />

      <Card>
        <CardHeader
          icon={Users}
          iconTone="infra"
          title="Observed accounts"
          action={<span className="font-mono text-xs text-text-muted">by observation</span>}
        />
        <CardBody>
          <AccountsList />
        </CardBody>
      </Card>
    </div>
  );
}
