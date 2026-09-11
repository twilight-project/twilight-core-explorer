'use client';

import { SourceChip } from '@/components/provenance/SourceChip';
import {
  useLatestBlocks,
  useOperatorClock,
  useRewardsEpochs,
  useStatus,
} from '@/lib/api/queries';
import { averageBlockSeconds, deriveEpochEta, formatEta } from '@/lib/epoch-eta';
import {
  STATE_CAPTIONS,
  asRecord,
  feedDeadline,
  feedNumber,
  feedString,
  reasonCaption,
} from '@/lib/operator-feed';
import { formatHeight } from '@/lib/format/height';

// §5.9 — the operator's clock, attested with its age; when the feed is silent or stale the
// panel falls back to the chain-derived epoch-spacing ESTIMATE (labelled), and says plainly
// that this operator publishes no status. Never a blank.

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-hover py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function DeadlineText({ value }: { value: unknown }) {
  const d = feedDeadline(value);
  if (d.time === null && d.height === null) return <span className="text-text-muted">not set</span>;
  return (
    <span className="font-mono text-[13px]">
      {d.height !== null ? `block ${formatHeight(String(d.height))}` : null}
      {d.height !== null && d.time !== null ? ' · ' : null}
      {d.time !== null ? new Date(d.time).toUTCString().replace(' GMT', ' UTC') : null}
      {d.estimated ? <span className="text-text-muted"> (est.)</span> : null}
    </span>
  );
}

function EstimateFallback({ silent }: { silent: boolean }) {
  const status = useStatus();
  const epochs = useRewardsEpochs();
  const blocks = useLatestBlocks(8);
  const eta = deriveEpochEta({
    epochs: epochs.data?.pages[0]?.data ?? [],
    headHeight: status.data?.data.indexer?.latestChainHeight,
    avgBlockSeconds: averageBlockSeconds(blocks.data?.data.map((b) => b.time) ?? []),
  });
  return (
    <div className="max-w-3xl text-sm leading-relaxed text-text-secondary">
      {silent ? (
        <p className="pb-2 text-text-muted">
          This operator publishes no status. <SourceChip kind="no-status" />
        </p>
      ) : (
        <p className="pb-2 text-text-muted">
          The operator&apos;s clock sample is stale — showing the chain-derived estimate instead.
        </p>
      )}
      {eta ? (
        <p>
          Epoch <span className="font-mono text-text">{eta.epochNumber}</span> closes{' '}
          {eta.etaSeconds !== null ? `in ~${formatEta(eta.etaSeconds)}` : `in ${eta.remainingBlocks} blocks`}{' '}
          at block <span className="font-mono text-text">{formatHeight(eta.closesAtHeight)}</span>{' '}
          <SourceChip kind="estimate" title="Derived from epoch spacing × observed block time" />
        </p>
      ) : (
        <p className="text-text-muted">Epoch clock unavailable.</p>
      )}
    </div>
  );
}

export function OperatorClockPanel({ slotId }: { slotId: string }) {
  const clock = useOperatorClock(slotId);
  const d = clock.data?.data;

  if (!d || d.status === 'no_status') return <EstimateFallback silent />;
  if (d.stale) return <EstimateFallback silent={false} />;

  const payload = asRecord(d.payload);
  const target = asRecord(payload['current_target']);
  const enrollment = asRecord(payload['enrollment']);
  const state = feedString(target['state']);
  const epoch = feedNumber(target['epoch']);
  const previous = asRecord(payload['previous_target']);

  return (
    <div className="max-w-3xl text-sm leading-relaxed text-text-secondary">
      <Row label="Current epoch:">
        <span className="font-mono text-text">{epoch ?? '—'}</span>
        {state ? (
          <>
            {' · '}
            <span className="font-mono">{state}</span>
            <span className="text-xs text-text-muted"> — {reasonCaption(STATE_CAPTIONS, state)}</span>
          </>
        ) : null}
        <SourceChip
          kind="attested"
          title={d.ageSeconds !== null ? `operator's clock, sampled ${d.ageSeconds}s ago` : "operator's clock"}
        />
        {d.ageSeconds !== null ? (
          <span className="font-mono text-[11px] text-text-muted">{d.ageSeconds}s old</span>
        ) : null}
      </Row>
      <Row label="Window:">
        <span className="font-mono text-[13px]">
          {feedNumber(target['start_height']) !== null
            ? `${formatHeight(String(feedNumber(target['start_height'])))} → `
            : ''}
          {feedNumber(target['close_height']) !== null
            ? formatHeight(String(feedNumber(target['close_height'])))
            : '—'}
        </span>
      </Row>
      <Row label="Observation deadline:">
        <DeadlineText value={target['observation_submission_deadline']} />
      </Row>
      <Row label="Reconciliation deadline:">
        <DeadlineText value={target['allocation_reconciliation_deadline']} />
      </Row>
      <Row label="Settlement expected by:">
        <DeadlineText value={target['settlement_expected_by']} />
        <span className="text-xs text-text-muted">
          — the operator&apos;s own policy figure, not a promise
        </span>
      </Row>
      <Row label="Enrollment:">
        <span className="font-mono text-[13px]">{feedString(enrollment['mode']) ?? '—'}</span>
        {' · trusted join closes: '}
        {enrollment['trusted_join_closes_at'] == null ? (
          <span className="text-text-muted">not set</span>
        ) : (
          <span className="font-mono text-[13px]">{String(enrollment['trusted_join_closes_at'])}</span>
        )}
      </Row>
      <Row label="Previous epoch:">
        <span className="font-mono text-[13px]">
          {feedNumber(previous['epoch']) ?? '—'}
          {feedString(previous['state']) ? ` · ${feedString(previous['state'])}` : ''}
        </span>
      </Row>
    </div>
  );
}
