'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { MarksLegend, SourceChip } from '@/components/provenance/SourceChip';
import { MetadataFields, hasMetadataFields } from '@/components/detail/MetadataFields';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorState, LoadingState } from '@/components/states/States';
import { Panel, MetricTriple } from './Panel';
import { AboutRow, CodeLine, OperatorSubpageHeader } from './OperatorShell';
import {
  useOperatorProfile,
  useSettlementStatus,
  useSlotSettlements,
} from '@/lib/api/queries';
import { asRecord, feedNumber, feedString } from '@/lib/operator-feed';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';
import { formatRewardWeight } from '@/lib/format/slot';
import { curatedOperator } from '@/lib/operator-directory';

// Operator Details: the WHO and HOW-TO layer — curated About, the join card, the split rules,
// transparency checks and on-chain identity. Live per-epoch numbers live on the Data page.

export function OperatorDetails({ slotId }: { slotId: string }) {
  const profile = useOperatorProfile(slotId);
  const settlements = useSettlementStatus({ slotId });
  const activity = useSlotSettlements(slotId);

  if (profile.isPending) return <LoadingState rows={10} />;
  if (profile.isError) return <ErrorState error={profile.error} context="Operator details" />;

  const p = profile.data.data;
  const v = p.verdict;
  const curated = curatedOperator(p.identity.slotId);
  const meta = asRecord(p.identity.metadata);
  const moniker = feedString(meta['moniker']);
  const declaredExtras = Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'moniker'));
  const discovery = p.discovery ? asRecord(p.discovery.payload) : null;
  const drawRecord = discovery ? feedString(discovery['draw_record']) : null;
  const allocHash = discovery
    ? asRecord(discovery['commitments'])['allocation_result_hash'] === true
    : false;

  // YOUR ESTIMATED SHARE: latest entitlement ÷ (admitted + 1).
  const statusRows = settlements.data?.pages.flatMap((pg) => pg.data) ?? [];
  const latestEnt = statusRows[0] ?? null;
  const acts = activity.data?.pages.flatMap((pg) => pg.data) ?? [];
  const lastPaying = acts.find((a) => a.payoutCount > 0);
  const admitted = lastPaying ? lastPaying.payoutCount : null;
  let estShare: { value: string; note: string } | null = null;
  if (latestEnt && admitted !== null) {
    try {
      const budget = BigInt(latestEnt.entitlementAmount);
      const share = budget / BigInt(admitted + 1);
      estShare = {
        value: `~${formatAmount(share.toString(), latestEnt.denom).display}`,
        note: `${formatAmount(latestEnt.entitlementAmount, latestEnt.denom).display} ÷ ${admitted + 1} if you join and everyone else stays. Equal split; the chain sets the budget.`,
      };
    } catch {
      estShare = null;
    }
  }

  const transparencyChecks: {
    name: string;
    note: string;
    state: 'yes' | 'no' | 'not-published';
    src: 'chain' | 'attested' | null;
  }[] = [
    {
      name: 'Publishes operator status',
      note: p.discovery
        ? `twilight-operator-status-v1${p.discovery.ageSeconds !== null ? ` · ${p.discovery.ageSeconds}s old` : ''}${
            discovery && discovery['retention_epochs'] != null
              ? ` · ${String(discovery['retention_epochs'])} epochs of history`
              : ''
          }`
        : 'no feed discovered for this slot',
      state: p.discovery ? 'yes' : 'no',
      src: p.discovery ? 'attested' : null,
    },
    {
      name: 'Draw record published',
      note: drawRecord ?? 'no draw record advertised',
      state: drawRecord ? 'yes' : 'not-published',
      src: drawRecord ? 'attested' : null,
    },
    {
      name: 'Sealed allocation hash',
      note: allocHash
        ? 'recorded per epoch; verifiable once the chain carries it'
        : 'not advertised',
      state: allocHash ? 'yes' : 'not-published',
      src: allocHash ? 'attested' : null,
    },
    {
      name: 'Dedicated settlement account',
      note: p.settlementAccountCheck
        ? `${p.settlementAccountCheck.foreignTxCount} non-settlement txs from the settlement address (ADR-MINIS-0010)`
        : 'no settlement address on record',
      state: p.settlementAccountCheck
        ? p.settlementAccountCheck.foreignTxCount === 0
          ? 'yes'
          : 'no'
        : 'not-published',
      src: p.settlementAccountCheck ? 'chain' : null,
    },
    {
      name: 'Payout-change aggregates',
      note: 'the feed does not carry this today',
      state: 'not-published',
      src: null,
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      <OperatorSubpageHeader
        slotId={slotId}
        active="details"
        caption="Who runs this slot, how rewards are shared, and how to connect. Live per-epoch figures are on the Data tab."
      />

      <div className="flex flex-row-reverse flex-wrap items-start gap-6">
        <div className="flex max-w-full flex-[1_1_300px] flex-col gap-4 min-[1100px]:sticky min-[1100px]:top-6">
          <Panel title="Mine with this operator" tinted bodyClassName="flex flex-col gap-4 px-5 py-[18px]">
            {estShare ? (
              <MetricTriple
                label="Your estimated share"
                value={estShare.value}
                unit={`${latestEnt ? formatAmount('0', latestEnt.denom).symbol : 'TWLT'} / epoch`}
                tone="mint"
                note={estShare.note}
              />
            ) : null}
            <div className="flex flex-col gap-2">
              {[
                'Install the client and run connect. It registers your agent and prints one claim link.',
                'Open the claim link once. Search works immediately; mining is opt-in at the terminal.',
                'Set the slot below. Payouts go to an address your client declares.',
              ].map((text, i) => (
                <div key={i} className="grid grid-cols-[20px_1fr] gap-2.5 text-[13px] leading-relaxed text-text-secondary">
                  <span className="font-mono text-text-muted">{i + 1}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
                Config
              </span>
              <CodeLine text={`[mining] slot_id = ${p.identity.slotId}`} />
              <CodeLine text="dropin-miner connect" />
            </div>
            <span className="font-mono text-[11.5px] leading-relaxed text-text-muted">
              Your own per-epoch status is served only to you via{' '}
              <span className="text-text-secondary">dropin-miner status</span>.
            </span>
            <Link
              href={`/operators/${encodeURIComponent(slotId)}/auth`}
              className="font-mono text-[12px] text-text-muted hover:text-text"
            >
              How sign-in works (device flow, DPoP, signing keys) →
            </Link>
          </Panel>
          <MarksLegend />
        </div>

        <div className="flex min-w-0 flex-[1000_1_460px] flex-col gap-6">
          {/* About this operator — curated by the explorer until operators publish it on chain. */}
          {curated ? (
            <Panel
              title="About this operator"
              meta={
                <>
                  curated by the explorer · <SourceChip kind="configured" />
                </>
              }
            >
              <div className="flex flex-col gap-4">
                {curated.disclaimer ? (
                  <p className="rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-4 py-2.5 text-[13px] leading-relaxed text-accent-orange">
                    {curated.disclaimer}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-x-10 gap-y-2.5 text-sm md:grid-cols-2">
                  <AboutRow label="Who runs it">{curated.ownedBy}</AboutRow>
                  <AboutRow label="Website">
                    {curated.website ? (
                      <a
                        href={curated.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary hover:text-primary-light"
                      >
                        {curated.website.replace(/^https?:\/\//, '')} ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </AboutRow>
                  <AboutRow label="What it does">{curated.service}</AboutRow>
                  <AboutRow label="Rewards given till now">
                    {v ? (
                      <span>
                        <span className="font-mono text-text">
                          {formatAmount(v.paidAll, v.denom).display}
                        </span>{' '}
                        {formatAmount(v.paidAll, v.denom).symbol} paid out to participants{' '}
                        <SourceChip kind="chain" title="Sum of every settlement payout, from indexed events" />
                      </span>
                    ) : (
                      'none yet'
                    )}
                  </AboutRow>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
                    How rewards are shared
                  </span>
                  <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
                    {curated.distributionPolicy}
                  </p>
                </div>
                {curated.about.map((para, i) => (
                  <p key={i} className="max-w-3xl text-sm leading-relaxed text-text-secondary">
                    {para}
                  </p>
                ))}
              </div>
            </Panel>
          ) : null}

          {/* Rules + Transparency */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <Panel title="How the pot is split" meta={<span className="text-primary">chain</span>}>
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-card-border bg-background-secondary px-3.5 py-3 font-mono text-[15px] leading-relaxed">
                  share = ⌊ budget ÷ admitted ⌋
                  <br />
                  <span className="text-text-muted">remainder → operator payout address</span>
                </div>
                {[
                  ['Budget', `Fixed by the chain per epoch: this slot's reward at weight ${formatRewardWeight(p.identity.rewardWeight)}. The operator cannot change it.`],
                  ['Who gets it', 'Anyone admitted for the epoch: enrolled in time, verified activity, valid payout address.'],
                  ['Enforcement', 'The chain does not check the split. The explorer does, for every settled epoch. Result is the mark on each Track record row.'],
                ].map(([label, text]) => (
                  <div key={label} className="grid grid-cols-[110px_1fr] gap-3 text-[13px] leading-relaxed">
                    <span className="pt-0.5 font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
                      {label}
                    </span>
                    <span className="text-text-secondary">{text}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Transparency" meta={`${transparencyChecks.length} checks`} bodyClassName="">
              {transparencyChecks.map((c) => (
                <div
                  key={c.name}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-card-hover px-5 py-2.5 text-[13px] last:border-b-0"
                >
                  <span className="flex flex-col gap-0.5">
                    <span>{c.name}</span>
                    <span className="break-all font-mono text-[11px] leading-relaxed text-text-muted">
                      {c.note}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span
                      className={clsx(
                        'whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px]',
                        c.state === 'yes'
                          ? 'border-primary/50 text-primary'
                          : c.state === 'no'
                            ? 'border-accent-red/50 text-accent-red'
                            : 'border-border-light text-text-muted',
                      )}
                    >
                      {c.state === 'yes' ? '✓ yes' : c.state === 'no' ? '✕ no' : '— not published'}
                    </span>
                    {c.src ? <SourceChip kind={c.src} /> : null}
                  </span>
                </div>
              ))}
            </Panel>
          </div>

          {/* Identity */}
          <Panel
            title="Identity on chain"
            meta={
              <>
                admitted by the chain authority, not by fee ·{' '}
                <span className="text-primary">chain</span>
              </>
            }
            bodyClassName="px-5 pb-4 pt-1.5"
          >
            <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
              {(
                [
                  ['Operator address', p.identity.operatorAddress, null],
                  ['Registered', p.identity.createdHeight ? `block ${formatHeight(p.identity.createdHeight)}` : null, null],
                  ['Payout address', p.identity.payoutAddress, 'remainder goes here'],
                  ['Settlement address', p.identity.settlementAddress, 'signs settlements'],
                  ['Consensus power', p.identity.consensusPower, null],
                  ['Reward weight', formatRewardWeight(p.identity.rewardWeight), null],
                ] as [string, string | null, string | null][]
              ).map(([label, value, hint]) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-card-hover py-2.5">
                  <span className="text-xs text-text-muted">{label}</span>
                  <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-2.5 font-mono text-[13px]">
                    <span className="min-w-0 flex-[1_1_200px] truncate" title={value ?? undefined}>
                      {value ?? '—'}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                      {hint}
                      {value && value.startsWith('twilight1') ? (
                        <CopyButton value={value} label={label} />
                      ) : null}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {p.settlementAccountCheck && p.settlementAccountCheck.foreignTxCount > 0 ? (
              <p className="pt-3 text-xs leading-relaxed text-accent-red">
                {p.settlementAccountCheck.foreignTxCount} non-settlement transaction
                {p.settlementAccountCheck.foreignTxCount === 1 ? '' : 's'} from the settlement
                address:{' '}
                {p.settlementAccountCheck.foreignTxHashes.slice(0, 3).map((h, i) => (
                  <Link key={h} href={`/txs/${encodeURIComponent(h)}`} className="underline">
                    {i > 0 ? ', ' : ''}
                    {h.slice(0, 10)}…
                  </Link>
                ))}
              </p>
            ) : null}
            <div className="mt-3.5 flex flex-col gap-2 rounded-lg border border-dashed border-border-light px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
                  Declared by the operator
                </span>
                <SourceChip kind="declared" title="Never verified" />
              </div>
              {moniker || hasMetadataFields(declaredExtras) ? (
                <div className="flex flex-col gap-1.5 text-[13px]">
                  {moniker ? (
                    <div className="flex gap-3.5">
                      <span className="text-text-muted">Name</span>
                      <span>{moniker}</span>
                    </div>
                  ) : null}
                  <MetadataFields value={declaredExtras} />
                </div>
              ) : (
                <span className="text-[13px] text-text-muted">declared: nothing</span>
              )}
              <span className="font-mono text-[11px] leading-relaxed text-text-muted">
                The operator&apos;s own words from on-chain metadata. Rendered, never verified.
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
