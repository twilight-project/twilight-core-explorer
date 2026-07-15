import { Boxes } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { BlocksAggregateStrip } from '@/components/blocks/BlocksAggregateStrip';
import { BlocksList } from '@/components/blocks/BlocksList';
import { BlockCadencePanel } from '@/components/blocks/BlockCadencePanel';
import { LiveLabel } from '@/components/freshness/LiveLabel';

export const metadata = { title: 'Blocks' };

// Airy redesign — list-page pattern (reused by Transactions/CoreSlots/Accounts): a serif PageHeader,
// a real windowed stat strip (GET /blocks/aggregate), then a titled panel wrapping the real
// keyset-paginated list. Brand- + density-agnostic (tokens only). The strip was the first `preview`
// placeholder to be wired to a real endpoint. (Gas is still omitted — not indexed on this chain.)
export default function BlocksPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        icon={Boxes}
        iconTone="infra"
        eyebrow="Blocks"
        title="Block stream"
        sub="Every indexed block, newest first — height, age, transaction count, and the CoreSlot that proposed it."
      />

      <BlocksAggregateStrip />

      <BlockCadencePanel />

      <Card>
        <CardHeader
          icon={Boxes}
          iconTone="infra"
          title="All blocks"
          action={<LiveLabel />}
        />
        <CardBody>
          <BlocksList />
        </CardBody>
      </Card>
    </div>
  );
}
