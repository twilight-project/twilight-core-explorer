'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SourceChip } from '@/components/provenance/SourceChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, LoadingState } from '@/components/states/States';
import { CoreSlotHealthSection } from '@/components/coreslots/sections/CoreSlotHealthSection';
import { OperatorTrackRecord } from './OperatorTrackRecord';
import { OperatorDrawPanel } from './OperatorDrawPanel';
import { OperatorParticipantsPanel } from './OperatorParticipantsPanel';
import { OperatorNav, operatorDisplayName } from './OperatorShell';
import {
  useFeedEpochFanout,
  useOperatorProfile,
  useSettlementStatus,
  type OperatorProfileResponse,
} from '@/lib/api/queries';
import { formatSlotStatus } from '@/lib/format/slot';

// The dashboard carries ECharts (~195 kB gzipped): load it on demand, client-only, so the rest of
// the overview (verdict, health, draw, track record) doesn't wait for or pay for the chart code.
const OperatorDashboard = dynamic(
  () => import('./OperatorDashboard').then((m) => m.OperatorDashboard),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[440px] rounded-2xl" />,
  },
);

// Operator Overview: the verdict, then the DefiLlama-style dashboard (headline, key metrics,
// history chart, tiles), signing health and the recent track record. Everything explanatory (who runs it, how to join,
// rules, identity) lives on the Details tab; the full per-epoch ledger on the Data tab.

type Profile = OperatorProfileResponse['data'];

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

      <OperatorDashboard slotId={slotId} />

      <CoreSlotHealthSection slotId={slotId} />
      <OperatorParticipantsPanel slotId={slotId} />
      {settledEpochs[0] !== undefined ? (
        <OperatorDrawPanel slotId={slotId} epoch={settledEpochs[0]} />
      ) : null}
      <OperatorTrackRecord slotId={slotId} />
    </div>
  );
}
