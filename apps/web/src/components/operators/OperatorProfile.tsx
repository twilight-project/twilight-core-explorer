'use client';

import Link from 'next/link';
import { SourceChip } from '@/components/provenance/SourceChip';
import { ErrorState, LoadingState } from '@/components/states/States';
import { CoreSlotHealthSection } from '@/components/coreslots/sections/CoreSlotHealthSection';
import { OperatorTrackRecord } from './OperatorTrackRecord';
import { OperatorDrawPanel } from './OperatorDrawPanel';
import { OperatorNav, operatorDisplayName } from './OperatorShell';
import { Panel, MetricTriple } from './Panel';
import {
  useFeedEpochFanout,
  useOperatorProfile,
  useSettlementStatus,
  type OperatorProfileResponse,
} from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';
import { formatSlotStatus } from '@/lib/format/slot';

// Operator Overview: the verdict and the freshest evidence only — the four metrics, signing
// health, and the recent track record. Everything explanatory (who runs it, how to join,
// rules, identity) lives on the Details tab; the full per-epoch ledger on the Data tab.

type Profile = OperatorProfileResponse['data'];

function keptRatioPercent(kept: string, entitlement: string): number | null {
  try {
    const e = BigInt(entitlement);
    if (e === 0n) return 0;
    return Number((BigInt(kept) * 1000n) / e) / 10;
  } catch {
    return null;
  }
}

function verdictSentence(v: NonNullable<Profile['verdict']>, mismatches: number): string {
  if (mismatches > 0) {
    return `${mismatches} epoch${mismatches === 1 ? '' : 's'} where published figures disagreed with the chain.`;
  }
  if (v.settledAll === v.owedAll && v.owedAll > 0) {
    return 'Pays every epoch it owes, on time, and its published figures match the chain.';
  }
  const open = v.owedAll - v.settledAll;
  return `Has settled ${v.settledAll} of ${v.owedAll} epochs; ${open} epoch${open === 1 ? '' : 's'} open past the expected window.`;
}

export function OperatorProfile({ slotId }: { slotId: string }) {
  const profile = useOperatorProfile(slotId);
  const settlements = useSettlementStatus({ slotId });

  const statusRows = settlements.data?.pages.flatMap((p) => p.data) ?? [];
  const settledEpochs = statusRows.filter((r) => r.settled).map((r) => r.epochNumber);
  const feed = useFeedEpochFanout(slotId, settledEpochs);

  if (profile.isPending) return <LoadingState rows={10} />;
  if (profile.isError) return <ErrorState error={profile.error} context="Operator profile" />;

  const p = profile.data.data;
  const v = p.verdict;
  const displayName = operatorDisplayName(p.identity.slotId, p.identity.metadata);
  const slotStatus = formatSlotStatus(p.identity.status);

  const feedResults = (feed.data ?? []).flatMap((f) => (f.data && 'verification' in f.data ? [f.data] : []));
  const mismatches = feedResults.filter((f) => f.verification.result === 'mismatch').length;

  const worstLatency = statusRows.reduce<bigint | null>((acc, r) => {
    if (r.latencyBlocks === null) return acc;
    const l = BigInt(r.latencyBlocks);
    return acc === null || l > acc ? l : acc;
  }, null);
  const keptPct = v ? keptRatioPercent(v.kept30, v.entitlement30) : null;
  const paid30 = v ? formatAmount(v.paid30, v.denom) : null;

  return (
    <div className="flex flex-col gap-7">
      <Link href="/slots?tab=operators" className="font-mono text-xs text-text-muted hover:text-text">
        ← operators
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">{displayName}</h1>
          <span className="whitespace-nowrap rounded-full border border-primary/40 px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[.08em] text-primary">
            CoreSlot {p.identity.slotId}
            {slotStatus ? ` · ${slotStatus}` : ''}
          </span>
          <span className="whitespace-nowrap rounded-full border border-border-light px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
            {p.discovery
              ? `publishes status${p.discovery.ageSeconds !== null ? ` · ${p.discovery.ageSeconds}s old` : ''}`
              : 'no status published'}
          </span>
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-text-secondary">
          {v ? verdictSentence(v, mismatches) : 'No reward epochs owed yet — nothing to judge.'}{' '}
          Everything below is recomputable from indexed events; the operator&apos;s own claims
          are marked <SourceChip kind="attested" /> and checked against the chain.
        </p>
        <OperatorNav slotId={slotId} active="overview" />
      </div>

      {/* Do they pay? */}
      <Panel
        title="Do they pay?"
        meta={
          v ? (
            <>
              last 30 days · {v.settled30} epochs · <span className="text-primary">chain</span>
            </>
          ) : (
            <span className="text-primary">chain</span>
          )
        }
      >
        {v ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTriple
              label="Epochs settled"
              value={`${v.settledAll} / ${v.owedAll}`}
              tone={v.settledAll === v.owedAll ? 'mint' : 'text'}
              note={
                v.settledAll === v.owedAll
                  ? 'Every epoch with an entitlement has a settlement on chain. All time.'
                  : `${v.owedAll - v.settledAll} open.`
              }
            />
            <MetricTriple
              label="Paid out (30d)"
              value={paid30 ? paid30.display : '—'}
              unit={paid30?.symbol}
              note={`To ${v.recipients30} distinct participants across ${v.settled30} epochs.`}
            />
            <MetricTriple
              label="Kept as remainder"
              value={keptPct !== null ? keptPct.toFixed(1) : '—'}
              unit="%"
              tone={keptPct !== null && keptPct > 10 ? 'orange' : 'text'}
              note="Integer-division residue sent to the operator payout address. Equal split leaves ≤ admitted−1 units."
            />
            <MetricTriple
              label="Settlement latency"
              value={v.medianLatencyBlocks !== null ? `+${v.medianLatencyBlocks}` : '—'}
              unit="blocks"
              note={`Median blocks between epoch close and settlement tx.${worstLatency !== null ? ` Worst: +${worstLatency}.` : ''}`}
            />
          </div>
        ) : (
          <p className="text-sm text-text-muted">No reward epochs owed yet — nothing to judge.</p>
        )}
      </Panel>

      <CoreSlotHealthSection slotId={slotId} />
      {settledEpochs[0] !== undefined ? (
        <OperatorDrawPanel slotId={slotId} epoch={settledEpochs[0]} />
      ) : null}
      <OperatorTrackRecord slotId={slotId} />
    </div>
  );
}
