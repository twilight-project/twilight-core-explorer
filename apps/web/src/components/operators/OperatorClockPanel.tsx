'use client';

import { clsx } from 'clsx';
import { Panel, MetricTriple } from './Panel';
import { SourceChip } from '@/components/provenance/SourceChip';
import {
  useLatestBlocks,
  useOperatorClock,
  useRewardsEpochs,
  useSlotSettlements,
  useStatus,
} from '@/lib/api/queries';
import { averageBlockSeconds, deriveEpochEta, formatEta } from '@/lib/epoch-eta';
import { STATE_CAPTIONS, asRecord, feedNumber, feedString, reasonCaption } from '@/lib/operator-feed';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';

// Epoch clock (profile v2 §content-2): a four-phase timeline (OPEN · FROZEN · SEALED ·
// RECONCILED) plus WINDOW / ENROLLMENT / PREVIOUS EPOCH triples, from the operator's own
// clock (attested, with its age). Silence or staleness falls back to the chain-derived
// epoch-spacing estimate — never a blank.

const PHASES = [
  { id: 'OPEN', caption: 'Accepting observations from participants.' },
  { id: 'FROZEN', caption: 'Observation window closed; evidence deadline.' },
  { id: 'ALLOCATION_SEALED', caption: 'Allocation sealed; shares fixed.', label: 'SEALED' },
  { id: 'SETTLEMENT_RECONCILED', caption: 'Settlement tx on chain, checked by the explorer.', label: 'RECONCILED' },
] as const;

function phaseIndex(state: string | null): number {
  const i = PHASES.findIndex((p) => p.id === state);
  return i === -1 ? 0 : i;
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
    <Panel
      title={eta ? `Epoch ${eta.epochNumber} · where we are` : 'Epoch clock'}
      meta={
        <>
          <span className="text-text-muted">estimate</span> · derived from epoch spacing × block time
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
        <p className="text-text-muted">
          {silent ? 'This operator publishes no status.' : "The operator's clock sample is stale."}{' '}
          <SourceChip kind={silent ? 'no-status' : 'estimate'} />
        </p>
        {eta ? (
          <p>
            Epoch <span className="font-mono text-text">{eta.epochNumber}</span> closes{' '}
            {eta.etaSeconds !== null ? `in ~${formatEta(eta.etaSeconds)}` : `in ${eta.remainingBlocks} blocks`}{' '}
            at block <span className="font-mono text-text">{formatHeight(eta.closesAtHeight)}</span>{' '}
            <SourceChip kind="estimate" />
          </p>
        ) : (
          <p className="text-text-muted">Epoch clock unavailable.</p>
        )}
      </div>
    </Panel>
  );
}

export function OperatorClockPanel({ slotId }: { slotId: string }) {
  const clock = useOperatorClock(slotId);
  const status = useStatus();
  const blocks = useLatestBlocks(8);
  const activity = useSlotSettlements(slotId);
  const d = clock.data?.data;

  if (!d || d.status === 'no_status') return <EstimateFallback silent />;
  if (d.stale) return <EstimateFallback silent={false} />;

  const payload = asRecord(d.payload);
  const target = asRecord(payload['current_target']);
  const enrollment = asRecord(payload['enrollment']);
  const previous = asRecord(payload['previous_target']);
  const state = feedString(target['state']);
  const epoch = feedNumber(target['epoch']);
  const startH = feedNumber(target['start_height']);
  const closeH = feedNumber(target['close_height']);
  const reached = phaseIndex(state);

  // WINDOW figures: remaining blocks vs OUR indexed head × observed block time (chain-side).
  const head = status.data?.data.indexer?.latestChainHeight;
  const avgSecs = averageBlockSeconds(blocks.data?.data.map((b) => b.time) ?? []);
  let windowNote = '';
  if (startH !== null && closeH !== null) {
    const span = closeH - startH;
    const remaining = head !== null && head !== undefined ? closeH - Number(head) : null;
    windowNote = `${span.toLocaleString()} blocks.`;
    if (remaining !== null && remaining >= 0) {
      windowNote += ` ${remaining.toLocaleString()} remain${
        avgSecs !== null ? `, ~${formatEta(Math.round(remaining * avgSecs))} at ${avgSecs.toFixed(1)}s` : ''
      }.`;
    }
  }

  // PREVIOUS EPOCH: joined with the chain's settlement activity for that epoch.
  const prevEpoch = feedNumber(previous['epoch']);
  const prevState = feedString(previous['state']);
  const prevAct = (activity.data?.pages.flatMap((p) => p.data) ?? []).find(
    (s) => s.epochNumber === String(prevEpoch),
  );
  const prevNote = prevAct
    ? `Settled ${prevAct.latencyBlocks !== null ? `+${prevAct.latencyBlocks} blocks after close, ` : ''}${
        formatAmount(prevAct.totalPaid, prevAct.denom).display
      } ${formatAmount(prevAct.totalPaid, prevAct.denom).symbol} to ${prevAct.payoutCount} participant${
        prevAct.payoutCount === 1 ? '' : 's'
      }.`
    : 'No settlement activity indexed for it yet.';

  const joinCloses = enrollment['trusted_join_closes_at'];

  return (
    <Panel
      title={`Epoch ${epoch ?? '…'} · where we are`}
      meta={
        <>
          <span className="text-accent-orange">attested</span> · operator&apos;s clock
          {d.ageSeconds !== null ? `, ${d.ageSeconds}s old` : ''}
        </>
      }
    >
      <div className="flex flex-col gap-4.5">
        {/* Timeline */}
        <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
          {PHASES.map((p, i) => {
            const isCurrent = i === reached;
            const isPast = i < reached;
            return (
              <div key={p.id} className="flex flex-col gap-2 pr-3">
                <div className="flex items-center">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      'h-3 w-3 shrink-0 rounded-full border-2',
                      isCurrent || isPast
                        ? 'border-primary bg-primary'
                        : 'border-border-light bg-card',
                    )}
                  />
                  {i < PHASES.length - 1 ? (
                    <span aria-hidden="true" className="h-0.5 flex-1 bg-border-light" />
                  ) : null}
                </div>
                <span
                  className={clsx(
                    'font-mono text-[11px] tracking-[.08em]',
                    isCurrent ? 'text-primary' : 'text-text-muted',
                  )}
                >
                  {'label' in p ? p.label : p.id}
                </span>
                <span className="text-[12.5px] leading-snug text-text-secondary">
                  {reasonCaption(STATE_CAPTIONS, p.id) === p.id ? p.caption : p.caption}
                </span>
                {isCurrent ? (
                  <span className="font-mono text-[11.5px] text-text-muted">
                    now{startH !== null ? ` · since block ${formatHeight(String(startH))}` : ''}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 border-t border-card-hover pt-4 sm:grid-cols-3">
          <MetricTriple
            label="Window"
            size={16}
            value={
              startH !== null && closeH !== null
                ? `${formatHeight(String(startH))} → ${formatHeight(String(closeH))}`
                : '—'
            }
            note={windowNote || 'The operator did not publish window heights.'}
          />
          <MetricTriple
            label="Enrollment"
            size={16}
            tone="mint"
            value={feedString(enrollment['mode']) ?? '—'}
            note={
              joinCloses == null
                ? 'Trusted join close: not set.'
                : `Trusted join closes at ${String(joinCloses)}.`
            }
          />
          <MetricTriple
            label="Previous epoch"
            size={16}
            value={prevEpoch !== null ? `${prevEpoch} · ${prevState ?? '—'}` : '—'}
            note={prevNote}
          />
        </div>
      </div>
    </Panel>
  );
}
