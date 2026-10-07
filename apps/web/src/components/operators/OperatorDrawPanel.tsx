'use client';

import Link from 'next/link';
import { SourceChip } from '@/components/provenance/SourceChip';
import { CopyButton } from '@/components/ui/CopyButton';
import { Panel } from './Panel';
import { useOperatorDraw } from '@/lib/api/queries';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { shortenMiddle } from '@/lib/format/address';

// Selection draw (phase 15 §8 — attested only, no re-derivation): the operator's published
// draw record for the newest settled epoch. The one chain-checkable element is the anchor —
// a real transaction committing the candidate-set and params hashes BEFORE the beacon, which
// links to the explorer's own tx page. Everything else is the operator's publication.

const OUTCOME_CAPTIONS: Record<string, string> = {
  NO_CANDIDATES: 'nobody entered the draw this epoch',
  SELECTED: 'winners were drawn from the candidate set',
  NO_VALID_BEACON: "the beacon was invalid, so nobody was selected",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-card-hover py-2 text-[13px]">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right font-mono text-xs text-text-secondary">{children}</span>
    </div>
  );
}

function HashValue({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span title={value}>{shortenMiddle(value)}</span>
      <CopyButton value={value} label="hash" />
    </span>
  );
}

export function OperatorDrawPanel({ slotId, epoch }: { slotId: string; epoch: string }) {
  const draw = useOperatorDraw(slotId, epoch);

  if (draw.isPending || draw.isError) return null;
  const d = draw.data.data;
  if (d.status === 'no_status') {
    return (
      <Panel title="Selection draw" meta={`epoch ${epoch} · operator-published`}>
        <p className="text-[13px] leading-relaxed text-text-muted">
          No draw record sampled for this epoch. <SourceChip kind="no-status" />
        </p>
      </Panel>
    );
  }

  const p = asRecord(d.payload);
  const anchor = asRecord(p['anchor']);
  const params = asRecord(p['parameters']);
  const outcome = feedString(p['outcome']);
  const candidateIds = Array.isArray(p['candidates'])
    ? (p['candidates'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const winnerIds = new Set(
    Array.isArray(p['winners'])
      ? (p['winners'] as unknown[]).filter((w): w is string => typeof w === 'string')
      : [],
  );
  const candidates = Array.isArray(p['candidates']) ? (p['candidates'] as unknown[]).length : null;
  const k = feedNumber(p['k']);
  const winners = Array.isArray(p['winners']) ? (p['winners'] as unknown[]).length : null;
  const rateBps = feedNumber(params['selection_rate_bps']);
  const anchorTx = feedString(anchor['tx_hash']);
  const setHash = feedString(p['candidate_set_hash']);

  return (
    <Panel
      title="Selection draw"
      meta={
        <>
          epoch {epoch} · operator-published <SourceChip kind="attested" />
        </>
      }
    >
      <p className="pb-2 text-[13px] leading-relaxed text-text-secondary">
        {outcome ? (
          <>
            <span className="font-mono text-xs text-text">{outcome}</span>
            {' — '}
            {OUTCOME_CAPTIONS[outcome] ?? 'outcome as published by the operator'}.
          </>
        ) : (
          'Draw record published without an outcome field.'
        )}
      </p>
      {candidates !== null ? <Row label="candidates">{candidates}</Row> : null}
      {winners !== null ? <Row label="winners">{winners}</Row> : k !== null ? <Row label="drawn (k)">{k}</Row> : null}
      {rateBps !== null ? (
        <Row label="selection rate">{(rateBps / 100).toFixed(2)}%</Row>
      ) : null}
      {anchorTx ? (
        <Row label="anchor tx">
          <span className="inline-flex items-center gap-1.5">
            <Link
              href={`/txs/${encodeURIComponent(anchorTx)}`}
              className="text-text hover:text-primary"
              title="The pre-beacon commitment transaction, on this chain"
            >
              {shortenMiddle(anchorTx)}
            </Link>
            <SourceChip kind="chain" title="a real transaction — follow it on this explorer" />
          </span>
        </Row>
      ) : null}
      {setHash ? (
        <Row label="candidate-set hash">
          <HashValue value={setHash} />
        </Row>
      ) : null}
      {candidateIds.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-b border-card-hover py-2.5">
          <span className="text-[13px] text-text-muted">who entered (draw ids)</span>
          {candidateIds.slice(0, 10).map((id) => (
            <span key={id} className="flex items-center justify-between gap-2 font-mono text-xs">
              <span className={winnerIds.has(id) ? 'text-primary' : 'text-text-secondary'} title={id}>
                {shortenMiddle(id)}
              </span>
              <span className="flex items-center gap-1.5">
                {winnerIds.has(id) ? (
                  <span className="rounded-full border border-primary/50 px-1.5 py-px font-mono text-[10.5px] text-primary">
                    winner
                  </span>
                ) : null}
                <CopyButton value={id} label="draw id" />
              </span>
            </span>
          ))}
          {candidateIds.length > 10 ? (
            <span className="font-mono text-[11px] text-text-muted">
              +{candidateIds.length - 10} more in the published record
            </span>
          ) : null}
          <span className="pt-1 font-mono text-[11px] leading-relaxed text-text-muted">
            Draw ids are pseudonymous hashes, never addresses — the feed carries no per-address
            data by design. The winners&apos; payout addresses are chain facts, on{' '}
            <Link
              href={`/mining/settlements/${encodeURIComponent(slotId)}/${encodeURIComponent(epoch)}`}
              className="text-text-secondary underline hover:text-text"
            >
              the epoch&apos;s settlement page
            </Link>
            .
          </span>
        </div>
      ) : null}
      <p className="pt-3 text-[12.5px] leading-relaxed text-text-muted">
        The operator commits the candidate set and parameters on chain before the beacon
        exists, so the draw cannot be steered afterwards. The explorer shows the record as
        published and links the commitment; it does not re-run the draw.
      </p>
    </Panel>
  );
}
