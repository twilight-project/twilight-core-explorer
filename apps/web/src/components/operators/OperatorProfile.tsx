'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clsx } from 'clsx';
import { SourceChip } from '@/components/provenance/SourceChip';
import { MetadataFields, hasMetadataFields } from '@/components/detail/MetadataFields';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { ErrorState, LoadingState } from '@/components/states/States';
import { CoreSlotDetail } from '@/components/coreslots/CoreSlotDetail';
import { OperatorTrackRecord } from './OperatorTrackRecord';
import { OperatorClockPanel } from './OperatorClockPanel';
import {
  useOperatorProfile,
  type OperatorProfileResponse,
} from '@/lib/api/queries';
import { asRecord, feedString } from '@/lib/operator-feed';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';

// The Operator Profile (phase 15): the page an operator hands a prospective participant.
// Ordered by the newcomer's three questions — who is this, do they pay, what am I signing up
// for — with every figure carrying its provenance. There is NO trust score: the verdict line
// IS the score, and any visitor can recompute it from indexed events.

type Profile = OperatorProfileResponse['data'];

function Section({ title, chip, children }: { title: string; chip?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
        {title}
        {chip}
      </h2>
      {children}
    </section>
  );
}

function keptRatioPercent(kept: string, entitlement: string): string {
  try {
    const k = BigInt(kept);
    const e = BigInt(entitlement);
    if (e === 0n) return '0';
    return (Number((k * 1000n) / e) / 10).toFixed(1);
  } catch {
    return '—';
  }
}

function VerdictLine({ v }: { v: NonNullable<Profile['verdict']> }) {
  const paid = formatAmount(v.paid30, v.denom);
  const ratio = keptRatioPercent(v.kept30, v.entitlement30);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-relaxed text-text-secondary">
      <span>
        Settled <span className="font-mono text-text">{v.settledAll}</span> of{' '}
        <span className="font-mono text-text">{v.owedAll}</span> epochs
        {v.medianLatencyBlocks !== null ? (
          <> · median <span className="font-mono text-text">{v.medianLatencyBlocks}</span> blocks after close</>
        ) : null}
        {' · '}
        <span className="font-mono text-text">{paid.display}</span> {paid.symbol} paid to{' '}
        <span className="font-mono text-text">{v.recipients30}</span> participant
        {v.recipients30 === 1 ? '' : 's'} in the last 30 days ·{' '}
        <span className="font-mono text-text">{ratio}%</span> kept as remainder
      </span>
      <SourceChip kind="chain" title="Recomputable from indexed events" />
    </p>
  );
}

export function OperatorProfile({ slotId }: { slotId: string }) {
  const profile = useOperatorProfile(slotId);
  const [showSlotDetail, setShowSlotDetail] = useState(false);

  if (profile.isPending) return <LoadingState rows={10} />;
  if (profile.isError) return <ErrorState error={profile.error} context="Operator profile" />;

  const p = profile.data.data;
  const meta = asRecord(p.identity.metadata);
  const moniker = feedString(meta['moniker']);
  const declaredExtras = Object.fromEntries(
    Object.entries(meta).filter(([k]) => k !== 'moniker'),
  );
  const discovery = p.discovery ? asRecord(p.discovery.payload) : null;
  const drawRecord = discovery ? feedString(discovery['draw_record']) : null;

  return (
    <div className="flex flex-col gap-9">
      {/* Header + verdict */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.025em]">
            {moniker ?? `CoreSlot ${p.identity.slotId} operator`}
          </h1>
          <span className="whitespace-nowrap rounded-full border border-primary/40 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[.08em] text-primary">
            CoreSlot {p.identity.slotId}
            {p.identity.status ? ` · ${p.identity.status}` : ''}
          </span>
        </div>
        {p.verdict ? (
          <VerdictLine v={p.verdict} />
        ) : (
          <p className="text-sm text-text-muted">
            No reward epochs owed yet — this slot has no entitlement history to judge.{' '}
            <SourceChip kind="chain" />
          </p>
        )}
      </div>

      {/* 1 — Who is this: identity on chain */}
      <Section title="Identity on chain" chip={<SourceChip kind="chain" />}>
        <div className="grid max-w-4xl grid-cols-1 gap-x-12 md:grid-cols-2">
          <Fact label="Operator address">
            {p.identity.operatorAddress ? (
              <MonoCopy value={p.identity.operatorAddress} head={16} tail={8} label="operator" />
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Registered at">
            <span className="font-mono">
              {p.identity.createdHeight ? `block ${formatHeight(p.identity.createdHeight)}` : '—'}
            </span>
          </Fact>
          <Fact label="Payout address (remainder goes here)">
            {p.identity.payoutAddress ? (
              <MonoCopy value={p.identity.payoutAddress} head={16} tail={8} label="payout" />
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Settlement address (signs settlements)">
            {p.identity.settlementAddress ? (
              <MonoCopy value={p.identity.settlementAddress} head={16} tail={8} label="settlement" />
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Consensus power">
            <span className="font-mono">{p.identity.consensusPower ?? '—'}</span>
          </Fact>
          <Fact label="Reward weight">
            <span className="font-mono">{p.identity.rewardWeight ?? '—'}</span>
          </Fact>
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-text-muted">
          Registration is authority-controlled — an operator on this list was admitted by the
          chain&apos;s authority, not by paying a fee.
        </p>
        {p.settlementAccountCheck ? (
          <p className="max-w-3xl text-xs leading-relaxed text-text-muted">
            Settlement-account check (ADR-MINIS-0010 expects a dedicated account):{' '}
            {p.settlementAccountCheck.foreignTxCount === 0 ? (
              <span className="text-primary">
                0 non-settlement transactions from the settlement address.
              </span>
            ) : (
              <span className="text-accent-red">
                {p.settlementAccountCheck.foreignTxCount} non-settlement transaction
                {p.settlementAccountCheck.foreignTxCount === 1 ? '' : 's'} from the settlement
                address —{' '}
                {p.settlementAccountCheck.foreignTxHashes.slice(0, 3).map((h, i) => (
                  <Link key={h} href={`/txs/${encodeURIComponent(h)}`} className="text-accent-red underline">
                    {i > 0 ? ', ' : ''}
                    {h.slice(0, 10)}…
                  </Link>
                ))}
              </span>
            )}{' '}
            <SourceChip kind="chain" />
          </p>
        ) : null}
      </Section>

      {/* 1b — Declared profile: the operator's own words */}
      <Section title="Declared by the operator" chip={<SourceChip kind="declared" />}>
        <div className="max-w-3xl rounded-xl border border-dashed border-border-light bg-card px-5 py-4">
          {moniker || hasMetadataFields(declaredExtras) ? (
            <div className="flex flex-col gap-2 text-sm">
              {moniker ? (
                <div className="flex gap-2">
                  <span className="text-text-muted">Name:</span>
                  <span className="text-text">{moniker}</span>
                </div>
              ) : null}
              <MetadataFields value={declaredExtras} />
            </div>
          ) : (
            <span className="text-sm text-text-muted">declared: nothing</span>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            These are the operator&apos;s own words from its on-chain metadata. The explorer
            renders them and never verifies them.
          </p>
        </div>
      </Section>

      {/* 1c — Independent standing */}
      <Section title="Independent standing">
        <div className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-hover py-2">
            <span className="text-text-muted">Publishes operator status:</span>
            {p.discovery ? (
              <>
                <span className="text-primary">yes</span>
                {p.discovery.ageSeconds !== null ? (
                  <span className="font-mono text-xs text-text-muted">
                    discovery fetched {p.discovery.ageSeconds}s ago
                  </span>
                ) : null}
                <SourceChip kind="attested" />
              </>
            ) : (
              <>
                <span>no</span>
                <SourceChip kind="no-status" />
              </>
            )}
          </div>
          {discovery ? (
            <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-hover py-2">
              <span className="text-text-muted">History served:</span>
              <span className="font-mono">
                {String(discovery['retention_epochs'] ?? '—')} epochs
              </span>
              <span className="text-text-muted">· rate limit:</span>
              <span className="font-mono">
                {String(asRecord(discovery['rate_limit'])['per_minute'] ?? '—')}/min
              </span>
              <SourceChip kind="attested" />
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-2 py-2">
            <span className="text-text-muted">Draw record published:</span>
            {drawRecord ? (
              <>
                <span className="text-primary">yes</span>
                <span className="break-all font-mono text-xs text-text-muted">{drawRecord}</span>
                <SourceChip kind="attested" title="Published by the operator; not re-derived by the explorer" />
              </>
            ) : (
              <span>no draw record advertised</span>
            )}
          </div>
        </div>
      </Section>

      {/* 2 — Do they pay: the rules */}
      <Section title="The rules they apply" chip={<SourceChip kind="chain" />}>
        <ul className="max-w-3xl list-none space-y-2 text-sm leading-relaxed text-text-secondary">
          <li>
            Distribution mode:{' '}
            <span className="font-mono text-text">{p.rules.distributionMethod ?? 'unknown'}</span>{' '}
            — the chain fixes what this slot earns; the operator decides who receives it.
          </li>
          <li>
            The share rule is <span className="font-mono text-text">equal</span>:{' '}
            <span className="font-mono">budget ÷ K admitted</span>, integer division, residue to
            the remainder.
          </li>
          <li>
            The undistributed remainder goes to the operator&apos;s payout address at
            finalization.
          </li>
          <li className="text-text">
            The chain does not check that the operator followed this rule; the explorer checks
            it for every settled epoch, and the result is the verified mark on each row below.
          </li>
        </ul>
      </Section>

      {/* 2b — Track record */}
      <Section title="Track record" chip={<SourceChip kind="chain" />}>
        <OperatorTrackRecord slotId={slotId} />
      </Section>

      {/* 3 — What you sign up for: clock + enrollment */}
      <Section title="Enrollment now & the clock">
        <OperatorClockPanel slotId={slotId} />
      </Section>

      {/* 3b — Commitments */}
      <Section title="The operator's commitments">
        <div className="max-w-3xl text-sm leading-relaxed text-text-secondary">
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-card-hover py-2">
            <span className="text-text-muted">Sealed allocation hash per epoch:</span>
            {discovery && asRecord(discovery['commitments'])['allocation_result_hash'] === true ? (
              <>
                <span className="text-primary">published</span>
                <span className="text-xs text-text-muted">
                  (recorded; verifiable retroactively once the chain carries the commitment)
                </span>
                <SourceChip kind="attested" />
              </>
            ) : (
              <span>{p.discovery ? 'not advertised' : 'no status'}</span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 py-2">
            <span className="text-text-muted">Payout-change aggregates:</span>
            <span>not published</span>
            <span className="text-xs text-text-muted">(the feed does not carry this today)</span>
          </div>
        </div>
      </Section>

      {/* 3c — How to join (static, the same on every profile) */}
      <Section title="How to join">
        <ul className="max-w-3xl list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-secondary">
          <li>
            Install the client and run <code className="rounded bg-background-secondary px-1.5 py-0.5 font-mono text-xs">dropin-miner connect</code>{' '}
            — it registers your agent and prints one claim link. Search works immediately at the
            unclaimed tier; one visit to the claim page is the only human step.
          </li>
          <li>Mining is opt-in and asked once at the terminal; the claim page grants it.</li>
          <li>
            Payout goes to an address you control, declared by your client. The explorer only
            ever links an address to a person if that person does.
          </li>
          <li>
            This operator&apos;s slot number is{' '}
            <span className="font-mono text-text">{p.identity.slotId}</span> — check{' '}
            <code className="rounded bg-background-secondary px-1.5 py-0.5 font-mono text-xs">
              [mining] slot_id
            </code>{' '}
            in your client&apos;s config.
          </li>
          <li className="text-text-muted">
            Your own per-epoch status is served only to you, through your client:{' '}
            <code className="rounded bg-background-secondary px-1.5 py-0.5 font-mono text-xs">
              dropin-miner status
            </code>
            . This page shows aggregates and chain facts only.
          </li>
        </ul>
      </Section>

      {/* 4 — Full slot detail (the existing embed) */}
      <Section title="Full slot detail">
        <button
          type="button"
          onClick={() => setShowSlotDetail((v) => !v)}
          className={clsx('self-start font-mono text-[12.5px] text-text-muted hover:text-text')}
        >
          {showSlotDetail ? '− hide slot detail' : '+ show slot detail'}
        </button>
        {showSlotDetail ? <CoreSlotDetail slotId={slotId} embedded /> : null}
      </Section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-card-hover py-2.5 text-sm">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
