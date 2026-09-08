'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { DataList } from '@/components/detail/DataList';
import { DetailShell } from '@/components/detail/DetailShell';
import { RawSection } from '@/components/detail/RawSection';
import { ErrorState, LoadingState } from '@/components/states/States';
import { BalancesSection } from './BalancesSection';
import { RewardsReceivedSection } from './RewardsReceivedSection';
import { useAccount, useAccountRaw } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';

// Account identity + sampled balances. No related-transaction history: the Phase 9 API exposes no
// address/signer tx filter, so we do not invent one (omitted by contract).
export function AccountDetail({ address }: { address: string }) {
  const query = useAccount(address);
  const [rawOpen, setRawOpen] = useState(false);
  const raw = useAccountRaw(address, rawOpen);

  if (query.isPending) {
    return (
      <DetailShell title="Account" backHref="/accounts" backLabel="Accounts">
        <LoadingState rows={4} />
      </DetailShell>
    );
  }
  if (query.isError) {
    return (
      <DetailShell title="Account" backHref="/accounts" backLabel="Accounts">
        <ErrorState error={query.error} context="Account" />
      </DetailShell>
    );
  }

  const a = query.data.data;
  return (
    <DetailShell title="Account" backHref="/accounts" backLabel="Accounts">
      <Card>
        <CardBody>
          <DataList
            items={[
              { label: 'Address', value: <MonoCopy value={a.address} head={20} tail={12} label="address" /> },
              { label: 'Kind', value: a.accountKind ? <Badge tone="neutral">{a.accountKind}</Badge> : '—' },
              { label: 'First seen', value: <span className="font-mono">{formatHeight(a.firstSeenHeight)}</span> },
              { label: 'Last seen', value: <span className="font-mono">{formatHeight(a.lastSeenHeight)}</span> },
              { label: 'Tx count', value: <span className="font-mono">{a.txCount}</span> },
              {
                label: 'Reward entitlements',
                // Phrased as a SEARCH, not a relation: an account is not provably a payout
                // recipient, so this links to the server-side payoutAddress filter — an empty
                // result is a valid answer. (Claims are retired on this chain; entitlements are
                // the V2 surface.)
                value: (
                  <Link
                    href={`/economy?tab=entitlements&payoutAddress=${encodeURIComponent(a.address)}`}
                    className="text-sm text-primary hover:text-primary-light"
                  >
                    Search entitlements paying this address →
                  </Link>
                ),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        {/* /supply is a contract-safe cross-link: both are sampled observations. */}
        <CardHeader
          icon={Users}
          iconTone="infra"
          title="Sampled balances"
          action={
            <Link href="/economy?tab=supply" className="text-sm text-primary hover:text-primary-light">
              Network supply →
            </Link>
          }
        />
        <CardBody>
          <BalancesSection address={a.address} />
        </CardBody>
      </Card>

      <RewardsReceivedSection address={a.address} />

      <RawSection expanded={rawOpen} onToggle={() => setRawOpen((o) => !o)} query={raw} />
    </DetailShell>
  );
}
