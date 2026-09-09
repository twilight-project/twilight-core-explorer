'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError, ERROR_CODES, isApiUnavailable } from '@/lib/api/client';
import { useStatus } from '@/lib/api/queries';
import { deriveIndexerFreshness } from '@/lib/freshness';
import { formatHeight } from '@/lib/format/height';

// Layout-level status banner: the ONE place that tells every page "the DB is behind the chain
// tip" (backfill) or "the API is down". Per-panel states stay compact because this carries the
// prominent message. Renders nothing when the indexer is synced and the API reachable.

function Bar({
  tone,
  role,
  children,
}: {
  tone: 'warning' | 'danger';
  role: 'status' | 'alert';
  children: ReactNode;
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-accent-red/30 bg-accent-red/10 text-accent-red'
      : 'border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow';
  return (
    <div className="w-full lg:w-[1432px] lg:mx-auto px-4 sm:px-6 lg:px-[156px] pt-4">
      <div
        role={role}
        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${toneClasses}`}
      >
        {children}
      </div>
    </div>
  );
}

export function GlobalStatusBanner() {
  const status = useStatus();
  const queryClient = useQueryClient();
  // Session-only dismissal by design: a reload re-evaluates; lag is worth re-announcing.
  const [dismissed, setDismissed] = useState(false);

  const transportDown =
    status.isError &&
    (isApiUnavailable(status.error) ||
      (status.error instanceof ApiError && status.error.code === ERROR_CODES.timeout));

  if (transportDown) {
    return (
      <Bar tone="danger" role="alert">
        <span>API unreachable — the explorer cannot load data right now.</span>
        <button
          type="button"
          onClick={() => queryClient.refetchQueries()}
          className="shrink-0 rounded-lg border border-accent-red/40 px-3 py-1 text-xs hover:bg-accent-red/20"
        >
          Retry
        </button>
      </Bar>
    );
  }

  const indexer = status.data?.data.indexer ?? null;
  const freshness = deriveIndexerFreshness(indexer);
  if (freshness.kind !== 'lagging' || dismissed || indexer === null) return null;

  return (
    <Bar tone="warning" role="status">
      <span>
        Indexer catching up — {formatHeight(freshness.lagBlocks)} blocks behind chain tip (
        {formatHeight(indexer.lastIndexedHeight)} of {formatHeight(indexer.latestChainHeight)}{' '}
        indexed). Data below is complete up to the indexed height.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-lg border border-accent-yellow/40 px-3 py-1 text-xs hover:bg-accent-yellow/20"
      >
        Hide
      </button>
    </Bar>
  );
}
