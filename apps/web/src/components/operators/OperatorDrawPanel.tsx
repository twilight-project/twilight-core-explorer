'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SourceChip } from '@/components/provenance/SourceChip';
import { CopyButton } from '@/components/ui/CopyButton';
import { Panel, MetricTriple } from './Panel';
import { useOperatorDraw, useSettlement } from '@/lib/api/queries';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { shortenMiddle } from '@/lib/format/address';
import { formatAmount } from '@/lib/format/amount';

// Selection draw, readable top-down: a plain-language headline, three stats, who entered and
// who won (winners carry the chain-paid addresses), then the proof — the explorer's own
// re-derivation of the draw from indexed chain rows — folded behind one disclosure together
// with the technical anchors (commitment tx, set hash).

export function OperatorDrawPanel({ slotId, epoch }: { slotId: string; epoch: string }) {
  const draw = useOperatorDraw(slotId, epoch);
  const settlement = useSettlement(slotId, epoch);
  const [showProof, setShowProof] = useState(false);

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
  const k = feedNumber(p['k']);
  const rateBps = feedNumber(params['selection_rate_bps']);
  const anchorTx = feedString(anchor['tx_hash']);
  const setHash = feedString(p['candidate_set_hash']);
  const payouts = settlement.data?.data.payouts ?? [];
  const totalPaid = settlement.data?.data.totalPaid;
  const denom = settlement.data?.data.denom ?? 'utwlt';

  const headline =
    outcome === 'NO_CANDIDATES'
      ? 'Nobody entered this epoch — the full reward returned to the operator.'
      : outcome === 'NO_VALID_BEACON'
        ? 'The randomness beacon was invalid, so nobody was selected this epoch.'
        : outcome === 'SUCCESS'
          ? `${candidateIds.length} entered; the beacon picked ${winnerIds.size} winner${winnerIds.size === 1 ? '' : 's'}${
              totalPaid && totalPaid !== '0'
                ? `, who split ${formatAmount(totalPaid, denom).display} ${formatAmount(totalPaid, denom).symbol}`
                : ''
            }.`
          : `Outcome ${outcome ?? 'unknown'}, as published by the operator.`;

  const verifyKind =
    d.verification.result === 'verified'
      ? ('verified' as const)
      : d.verification.result === 'mismatch'
        ? ('mismatch' as const)
        : ('attested' as const);

  return (
    <Panel
      title="Selection draw"
      meta={
        <>
          epoch {epoch} ·{' '}
          {verifyKind === 'verified' && d.verification.caveats.length > 0 ? (
            <span className="text-text-muted">re-derived from chain data, with limits · </span>
          ) : null}
          <SourceChip
            kind={verifyKind}
            title={
              verifyKind === 'verified'
                ? `The explorer re-ran the whole draw from chain data and every digest matches.${d.verification.caveats.length ? ' Not covered: ' + d.verification.caveats.join('; ') : ''}`
                : verifyKind === 'mismatch'
                  ? 'A published figure contradicts the chain'
                  : "Published by the operator; some inputs weren't available to re-derive"
            }
          />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[15px] leading-relaxed text-text">{headline}</p>

        <div className="grid grid-cols-3 gap-4">
          <MetricTriple
            label="Entered"
            value={String(candidateIds.length)}
            size={20}
            note="candidates in the committed set"
          />
          <MetricTriple
            label="Winners"
            value={k !== null ? `${winnerIds.size} of ${k}` : String(winnerIds.size)}
            size={20}
            tone={winnerIds.size > 0 ? 'mint' : 'text'}
            note="drawn by the beacon (k = quota)"
          />
          <MetricTriple
            label="Selection rate"
            value={rateBps !== null ? `${(rateBps / 100).toFixed(0)}%` : '—'}
            size={20}
            note="of candidates win, capped"
          />
        </div>

        {candidateIds.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
              Who entered
            </span>
            {[...candidateIds]
              .sort((a, b) => Number(winnerIds.has(b)) - Number(winnerIds.has(a)))
              .slice(0, 10)
              .map((id) => (
                <span
                  key={id}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 font-mono text-xs ${
                    winnerIds.has(id) ? 'bg-primary/10' : ''
                  }`}
                >
                  <span
                    className={winnerIds.has(id) ? 'text-primary' : 'text-text-secondary'}
                    title={id}
                  >
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
          </div>
        ) : null}

        {winnerIds.size > 0 && payouts.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
              Paid on chain
            </span>
            {payouts.map((pay) => (
              <span
                key={pay.recipient}
                className="flex items-center justify-between gap-2 px-2 font-mono text-xs"
              >
                <Link
                  href={`/accounts/${encodeURIComponent(pay.recipient)}`}
                  className="truncate text-text hover:text-primary"
                  title={pay.recipient}
                >
                  {shortenMiddle(pay.recipient)}
                </Link>
                <span className="flex items-center gap-1.5 text-text-secondary">
                  {formatAmount(pay.amount, pay.denom).display}{' '}
                  {formatAmount(pay.amount, pay.denom).symbol}
                  <SourceChip kind="chain" />
                </span>
              </span>
            ))}
            <span className="font-mono text-[11px] leading-relaxed text-text-muted">
              Entrants are pseudonymous draw ids, never addresses (by contract). The winners
              are the people paid above
              {winnerIds.size > 1
                ? ' — which id is which address stays private.'
                : ' — with a single winner, the id and the address correspond one-to-one.'}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col border-t border-card-hover pt-3">
          <button
            type="button"
            onClick={() => setShowProof((x) => !x)}
            className="self-start font-mono text-[12.5px] text-text-muted hover:text-text"
          >
            {showProof ? '− hide the proof' : '+ the proof — how this draw is verified'}
          </button>
          {showProof ? (
            <div className="flex flex-col gap-1.5 pt-2.5">
              {anchorTx ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[12px]">
                  <span className="text-text-muted">commitment tx (pre-beacon)</span>
                  <span className="flex items-center gap-1.5 font-mono">
                    <Link
                      href={`/txs/${encodeURIComponent(anchorTx)}`}
                      className="text-text hover:text-primary"
                    >
                      {shortenMiddle(anchorTx)}
                    </Link>
                    <SourceChip kind="chain" />
                  </span>
                </div>
              ) : null}
              {setHash ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-card-hover pb-2 text-[12px]">
                  <span className="text-text-muted">candidate-set hash</span>
                  <span className="flex items-center gap-1.5 font-mono" title={setHash}>
                    {shortenMiddle(setHash)}
                    <CopyButton value={setHash} label="hash" />
                  </span>
                </div>
              ) : null}
              {d.verification.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex flex-col gap-0.5 border-b border-card-hover py-1.5 text-[12px] last:border-b-0"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={
                        c.ok === true
                          ? 'text-primary'
                          : c.ok === false
                            ? 'text-accent-red'
                            : 'text-text-muted'
                      }
                    >
                      {c.ok === true ? '✓' : c.ok === false ? '✕' : '—'}
                    </span>
                    <span className="min-w-0 break-all font-mono text-text-secondary">
                      {c.name}
                    </span>
                  </span>
                  <span className="min-w-0 break-words pl-[22px] font-mono text-text-muted">
                    {c.detail}
                  </span>
                </div>
              ))}
              {d.verification.caveats.map((c) => (
                <p key={c} className="pt-1 font-mono text-[11px] leading-relaxed text-accent-orange">
                  not covered: {c}
                </p>
              ))}
              <p className="pt-2 text-[12px] leading-relaxed text-text-muted">
                The explorer re-runs the draw from its own indexed chain rows: the commitment
                tx&apos;s memo (anchored before the beacon window existed), the block-id hashes
                of the window, and each block&apos;s attributed proposer. Anyone can repeat
                this with the published record, a trusted node and the operator&apos;s{' '}
                <span className="text-text-secondary">drawverify</span> tool — no need to trust
                this explorer either.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
