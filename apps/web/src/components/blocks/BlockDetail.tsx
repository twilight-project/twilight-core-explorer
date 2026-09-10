'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Tabs, activeTab, type TabDef } from '@/components/ui/Tabs';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { OperatorLink } from '@/components/operator/OperatorLink';
import { EmptyState, ErrorState, InvalidInput, LoadingState } from '@/components/states/States';
import { RawSection } from '@/components/detail/RawSection';
import { BlockTxsSection } from './BlockTxsSection';
import { isNotFound } from '@/lib/api/client';
import { useBlock, useBlockRaw, useStatus } from '@/lib/api/queries';
import { deriveHeightIndexingState } from '@/lib/freshness';
import { formatHeight } from '@/lib/format/height';
import { formatAbsoluteTime, formatRelativeTime } from '@/lib/format/time';
import { statusTone } from '@/lib/format/status';

const TABS = (txCount: number): TabDef[] => [
  { id: 'summary', label: 'Summary' },
  { id: 'transactions', label: `Transactions (${txCount})` },
  { id: 'raw', label: 'Raw' },
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-card-border py-3 text-sm">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function BackRow({ height }: { height?: string }) {
  const h = height && /^[1-9]\d*$/.test(height) ? BigInt(height) : null;
  return (
    <div className="flex items-center justify-between">
      <Link href="/blocks" className="text-sm text-text-muted hover:text-text">
        ← Blocks
      </Link>
      {h !== null ? (
        <div className="flex items-center gap-1.5 font-mono text-sm">
          {h > 1n ? (
            <Link
              href={`/blocks/${(h - 1n).toString()}`}
              className="rounded-lg border border-card-border px-2.5 py-1 text-text-secondary hover:text-text"
            >
              ← {formatHeight((h - 1n).toString())}
            </Link>
          ) : null}
          <Link
            href={`/blocks/${(h + 1n).toString()}`}
            className="rounded-lg border border-card-border px-2.5 py-1 text-text-secondary hover:text-text"
          >
            {formatHeight((h + 1n).toString())} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// Redesign block page: verdict first ("Block N — 3 transactions, proposed by CoreSlot 1"),
// prev/next height stepping in the header row, then tabs Summary / Transactions / Raw.
// The raw payload query only mounts on the Raw tab.
export function BlockDetail({ height, tab: rawTab }: { height: string; tab?: string | string[] | undefined }) {
  // Client-side, string-safe malformed-height check (no Number()): a canonical positive integer
  // (rejects "0", leading zeros, and empty). The API still validates (invalid_height / not_found)
  // and ErrorState branches on error.code.
  const valid = /^[1-9]\d*$/.test(height);
  const query = useBlock(valid ? height : '');
  const status = useStatus();

  if (!valid) {
    return (
      <div className="flex flex-col gap-7">
        <BackRow />
        <h1 className="font-serif text-3xl text-text">Block {height}</h1>
        <InvalidInput message="Block height must be a positive integer." />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-7">
        <BackRow height={height} />
        <LoadingState rows={6} />
      </div>
    );
  }
  if (query.isError) {
    // During backfill a not_found for an on-chain height means "not indexed YET" — an expected
    // state worth naming, not a hard failure.
    const heightState = isNotFound(query.error)
      ? deriveHeightIndexingState(height, status.data?.data.indexer ?? null)
      : { kind: 'unknown' as const };
    return (
      <div className="flex flex-col gap-7">
        <BackRow height={height} />
        <h1 className="font-serif text-3xl text-text">
          Block {formatHeight(height)}
        </h1>
        {heightState.kind === 'pending' ? (
          <EmptyState
            message={`Block ${formatHeight(height)} isn’t indexed yet — the indexer is at ${formatHeight(
              heightState.lastIndexedHeight,
            )} of ${formatHeight(heightState.latestChainHeight)}. It will appear as the backfill catches up.`}
          />
        ) : heightState.kind === 'beyond-tip' ? (
          <EmptyState
            message={`Block ${formatHeight(height)} doesn’t exist yet — the chain tip is ${formatHeight(
              heightState.latestChainHeight,
            )}.`}
          />
        ) : (
          <ErrorState error={query.error} context="Block" />
        )}
      </div>
    );
  }

  const b = query.data.data;
  const tabs = TABS(b.txCount);
  const tab = activeTab(tabs, rawTab);
  const proposer = b.proposer.operatorAddress ?? b.proposer.address ?? b.proposer.rawAddress;

  return (
    <div className="flex flex-col gap-7">
      <BackRow height={b.height} />

      <div className="flex flex-col gap-2.5">
        <h1 className="font-serif text-3xl text-text">
          Block {formatHeight(b.height)}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 text-[15px] text-text-secondary">
          <span>
            {b.txCount === 0
              ? 'No transactions'
              : `${b.txCount} transaction${b.txCount === 1 ? '' : 's'}`}
            {' · '}
            {formatRelativeTime(b.time)}
          </span>
          <span className="text-text-muted">·</span>
          <span className="inline-flex items-center gap-1.5">
            proposed by{' '}
            {b.proposer.operatorAddress ? (
              <OperatorLink operatorAddress={b.proposer.operatorAddress} />
            ) : (
              <span className="font-mono">{proposer ?? 'unknown'}</span>
            )}
          </span>
        </p>
      </div>

      <Tabs
        tabs={tabs}
        active={tab}
        hrefFor={(id) =>
          id === 'summary'
            ? `/blocks/${encodeURIComponent(height)}`
            : `/blocks/${encodeURIComponent(height)}?tab=${id}`
        }
        ariaLabel="Block views"
      />

      {tab === 'summary' ? (
        <div className="grid max-w-4xl grid-cols-1 gap-x-12 md:grid-cols-2">
          <FieldRow label="Hash">
            <MonoCopy value={b.hash} head={16} tail={10} label="block hash" />
          </FieldRow>
          <FieldRow label="Time">{formatAbsoluteTime(b.time)}</FieldRow>
          <FieldRow label="Chain">{b.chainId ?? '—'}</FieldRow>
          <FieldRow label="Attribution">
            {b.proposer.attributionStatus ? (
              <Badge tone={statusTone(b.proposer.attributionStatus)}>
                {b.proposer.attributionStatus}
              </Badge>
            ) : (
              '—'
            )}
          </FieldRow>
          <FieldRow label="App hash">
            <MonoCopy value={b.appHash} label="app hash" />
          </FieldRow>
          <FieldRow label="Last block hash">
            <MonoCopy value={b.lastBlockHash} label="last block hash" />
          </FieldRow>
        </div>
      ) : null}

      {tab === 'transactions' ? <BlockTxsSection height={b.height} /> : null}

      {tab === 'raw' ? <RawTab height={height} /> : null}
    </div>
  );
}

// Mounted only while the Raw tab is active, so the raw payload is fetched on demand.
function RawTab({ height }: { height: string }) {
  const raw = useBlockRaw(height, true);
  return <RawSection expanded onToggle={() => {}} query={raw} />;
}
