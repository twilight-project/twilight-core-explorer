'use client';

import { useEffect, useState } from 'react';
import {
  useCoreSlotHealth,
  useLatestBlocks,
  useLivenessRisk,
  useRewardsEpochs,
  useStatus,
} from '@/lib/api/queries';
import { averageBlockSeconds, deriveEpochEta, formatEta } from '@/lib/epoch-eta';
import { getLinkedSlot } from '@/lib/linked-slot';
import { formatHeight } from '@/lib/format/height';

// The one thing always on screen (control-room handoff): a 32px Fira Code strip with the
// chain's vitals. Every value is real and already-polled (the underlying hooks refetch on
// their own intervals); the epoch ETA is the labelled ESTIMATE from epoch spacing × observed
// block time (authoritative clock is a later phase). Left group truncates on narrow screens;
// the right group (own slot · indexed-ago · cursor) never shrinks.

function Sep() {
  return (
    <span aria-hidden="true" className="px-3 text-border-light">
      —
    </span>
  );
}

export function StatusStrip() {
  const status = useStatus();
  const liveness = useLivenessRisk();
  const epochs = useRewardsEpochs();
  const blocks = useLatestBlocks(8);

  // localStorage is read after mount (SSR has no storage); no re-render churn otherwise.
  const [linkedSlotId, setLinkedSlotId] = useState<string | null>(null);
  useEffect(() => {
    setLinkedSlotId(getLinkedSlot()?.slotId ?? null);
    const onLink = () => setLinkedSlotId(getLinkedSlot()?.slotId ?? null);
    window.addEventListener('tw-linked-slot-changed', onLink);
    return () => window.removeEventListener('tw-linked-slot-changed', onLink);
  }, []);
  const ownHealth = useCoreSlotHealth(linkedSlotId ?? '');

  const indexer = status.data?.data.indexer;
  const chainId = status.data?.data.chainId;
  const risk = liveness.data?.data;
  const avgSecs = averageBlockSeconds(blocks.data?.data.map((b) => b.time) ?? []);
  const eta = deriveEpochEta({
    epochs: epochs.data?.pages[0]?.data ?? [],
    headHeight: indexer?.latestChainHeight,
    avgBlockSeconds: avgSecs,
  });

  const ownSigning =
    linkedSlotId !== null && ownHealth.data?.data.isActiveAtLatest === true
      ? ownHealth.data.data.healthStatus === 'HEALTHY'
      : null;

  return (
    <div className="flex h-8 items-center overflow-hidden whitespace-nowrap border-b border-card-border bg-background-secondary px-5 font-mono text-xs text-text-muted">
      <span className="flex min-w-0 items-center overflow-hidden text-ellipsis">
        <span className="text-primary">{chainId ?? '…'}</span>
        <Sep />
        <span>
          head <span className="text-text">{indexer ? formatHeight(indexer.latestChainHeight) : '…'}</span>
        </span>
        <Sep />
        <span>
          lag <span className="text-text">{indexer ? formatHeight(indexer.lagBlocks) : '…'}</span>
          {avgSecs !== null ? ` · ${avgSecs.toFixed(1)}s` : ''}
        </span>
        <Sep />
        <span>
          signing{' '}
          <span className="text-text">
            {risk ? `${risk.healthySlotCount}/${risk.activeSlotCount}` : '…'}
          </span>
        </span>
        {eta ? (
          <>
            <Sep />
            <span>
              epoch <span className="text-text">{eta.epochNumber}</span> closes in{' '}
              <span className="text-text">
                {eta.etaSeconds !== null ? `~${formatEta(eta.etaSeconds)}` : `${eta.remainingBlocks} blk`}
              </span>{' '}
              (est.)
            </span>
          </>
        ) : null}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 bg-background-secondary pl-4">
        {linkedSlotId !== null && ownSigning !== null ? (
          <>
            <span className={ownSigning ? 'text-primary' : 'text-accent-red'}>
              ● slot {linkedSlotId} {ownSigning ? 'signing' : 'not signing'}
            </span>
            <span aria-hidden="true" className="text-border-light">
              —
            </span>
          </>
        ) : null}
        <span>
          indexed{' '}
          {indexer?.freshnessSeconds !== null && indexer?.freshnessSeconds !== undefined
            ? `${indexer.freshnessSeconds}s ago`
            : '…'}
        </span>
        <span aria-hidden="true" className="h-3 w-[7px] animate-cursor-blink bg-primary" />
      </span>
    </div>
  );
}
