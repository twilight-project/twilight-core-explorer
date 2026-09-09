'use client';

import { useStatus } from '@/lib/api/queries';
import { deriveIndexerFreshness } from '@/lib/freshness';
import { formatHeight } from '@/lib/format/height';

// "live" is only honest when the indexer is at the chain tip — derive the list-header label
// from real freshness instead of hardcoding it. Same placeholder conventions as KpiCard.
export function LiveLabel({ prefix = 'newest first' }: { prefix?: string }) {
  const status = useStatus();
  const freshness = deriveIndexerFreshness(status.data?.data.indexer ?? null);
  const label =
    freshness.kind === 'lagging'
      ? `syncing · ${formatHeight(freshness.lagBlocks)} behind`
      : freshness.kind === 'fresh'
        ? 'live'
        : '…';
  return (
    <span className="font-mono text-xs text-text-muted">
      {prefix} · {label}
    </span>
  );
}
