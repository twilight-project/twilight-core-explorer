'use client';

import Link from 'next/link';
import { QueryBoundary } from '@/components/QueryBoundary';
import { EmptyState } from '@/components/states/States';
import { useLatestBlocks, useRecentTxs } from '@/lib/api/queries';
import { formatHeight } from '@/lib/format/height';
import { formatRelativeTime } from '@/lib/format/time';
import { shortenMiddle } from '@/lib/format/address';
import { summarizeMessageTypes } from '@/lib/format/summary';

// Redesign activity lists: whole-row links whose middle column DESCRIBES what happened in
// words (summary strings), instead of hash/proposer table columns. The full tables live on
// /blocks and /txs; these are doors.
function PanelShell({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        <Link href={href} className="text-sm text-primary hover:text-primary-light">
          {linkLabel} →
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-card-border">{children}</div>
    </section>
  );
}

export function LatestBlocksPanel() {
  const query = useLatestBlocks(8);
  return (
    <PanelShell title="Latest blocks" href="/blocks" linkLabel="All blocks">
      <QueryBoundary query={query} context="Latest blocks" loadingRows={5}>
        {(res) =>
          res.data.length === 0 ? (
            <EmptyState message="No blocks indexed yet." />
          ) : (
            <ul className="divide-y divide-card-border">
              {res.data.map((b) => (
                <li key={b.height}>
                  <Link
                    href={`/blocks/${encodeURIComponent(b.height)}`}
                    className="grid grid-cols-[110px_1fr_auto] items-center gap-3.5 bg-background-secondary px-4 py-3 hover:bg-card"
                  >
                    <span className="font-mono text-sm text-primary">{formatHeight(b.height)}</span>
                    <span className="truncate text-sm text-text-secondary">
                      {b.txCount} transaction{b.txCount === 1 ? '' : 's'}
                      {b.proposer.slotId ? ` · CoreSlot ${b.proposer.slotId}` : ''}
                    </span>
                    <span className="font-mono text-xs text-text-muted">
                      {formatRelativeTime(b.time)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>
    </PanelShell>
  );
}

export function RecentTxPanel() {
  const query = useRecentTxs(8);
  return (
    <PanelShell title="Recent transactions" href="/txs" linkLabel="All transactions">
      <QueryBoundary query={query} context="Recent transactions" loadingRows={5}>
        {(res) =>
          res.data.length === 0 ? (
            <EmptyState message="No transactions indexed yet." />
          ) : (
            <ul className="divide-y divide-card-border">
              {res.data.map((t) => {
                const failed = t.status !== 'success' && t.code !== 0;
                return (
                  <li key={t.hash}>
                    <Link
                      href={`/txs/${encodeURIComponent(t.hash)}`}
                      className="grid grid-cols-[8px_1fr_auto] items-center gap-3.5 bg-background-secondary px-4 py-3 hover:bg-card"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          'h-2 w-2 rounded-full ' + (failed ? 'bg-accent-red' : 'bg-accent-green')
                        }
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm text-text">
                          {summarizeMessageTypes(t.messageTypes)}
                          {failed ? ' · failed' : ''}
                        </span>
                        <span className="font-mono text-xs text-text-muted">
                          {shortenMiddle(t.hash)}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-text-muted">{t.height}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
    </PanelShell>
  );
}
