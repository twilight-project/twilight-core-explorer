import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { BlocksAggregateStrip } from '@/components/blocks/BlocksAggregateStrip';
import { BlocksList } from '@/components/blocks/BlocksList';

export const metadata = { title: 'Blocks' };

// Airy redesign — list-page pattern (reused by Transactions/CoreSlots/Accounts): a serif PageHeader,
// a real windowed stat strip (GET /blocks/aggregate), then a titled panel wrapping the real
// keyset-paginated list. Brand- + density-agnostic (tokens only). The strip was the first `preview`
// placeholder to be wired to a real endpoint. (Gas is still omitted — not indexed on this chain.)
export default function BlocksPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow="Blocks"
        title="Block stream"
        sub="Every indexed block, newest first — height, age, transaction count, and the CoreSlot that proposed it."
      />

      <BlocksAggregateStrip />

      <Card>
        <CardHeader
          title="All blocks"
          action={<span className="font-mono text-xs text-text-muted">newest first · live</span>}
        />
        <CardBody>
          <BlocksList />
        </CardBody>
      </Card>
    </div>
  );
}
