import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { BlocksList } from '@/components/blocks/BlocksList';

export const metadata = { title: 'Blocks' };

// Airy redesign — list-page pattern (reused by Transactions/CoreSlots/Accounts): a serif PageHeader,
// a feasibility-gated stat strip, then a titled panel wrapping the real keyset-paginated list.
// Brand- + density-agnostic (tokens only).
//
// Stat strip: every card here IS derivable from indexed `Block` rows (avg interval + txCount +
// distinct proposer), so it's shown as a `preview` placeholder now and wired to a real aggregate
// endpoint next iteration. Non-derivable handoff stats (gas — not indexed on this chain) are omitted.
export default function BlocksPage() {
  return (
    <div className="space-y-section">
      <PageHeader
        eyebrow="Blocks"
        title="Block stream"
        sub="Every indexed block, newest first — height, age, transaction count, and the CoreSlot that proposed it."
      />

      <div className="grid grid-cols-2 gap-grid lg:grid-cols-4">
        <KpiCard preview label="Avg block time" value="2.1" unit="s" />
        <KpiCard preview label="Txs / block" value="12" unit="avg" />
        <KpiCard preview label="Blocks / day" value="41,000" />
        <KpiCard preview label="Unique proposers" value="4" />
      </div>

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
