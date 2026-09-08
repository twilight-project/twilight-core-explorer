import { ExplorerTabs } from '@/components/explorer/ExplorerTabs';
import { BlocksAggregateStrip } from '@/components/blocks/BlocksAggregateStrip';
import { BlocksList } from '@/components/blocks/BlocksList';
import { BlockCadencePanel } from '@/components/blocks/BlockCadencePanel';
import { LiveLabel } from '@/components/freshness/LiveLabel';

export const metadata = { title: 'Blocks' };

// Explorer stream: shared tab row (Blocks · Transactions · Accounts), a plain h1, the windowed
// stat strip, cadence panel and the keyset-paginated list. (Gas is still omitted — not indexed.)
export default function BlocksPage() {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="font-serif text-3xl tracking-tight text-text">Blocks</h1>
        <p className="max-w-2xl text-[15px] text-text-secondary">
          Every indexed block, newest first — height, age, transaction count, and the CoreSlot
          that proposed it.
        </p>
      </div>
      <ExplorerTabs />
      <BlocksAggregateStrip />
      <BlockCadencePanel />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text">All blocks</h2>
          <LiveLabel />
        </div>
        <BlocksList />
      </div>
    </div>
  );
}
