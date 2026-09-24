'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Tabs, activeTab, type TabDef } from '@/components/ui/Tabs';
import { MonoCopy } from '@/components/ui/MonoCopy';
import { CopyButton } from '@/components/ui/CopyButton';
import { MetadataFields, PubkeyInline } from '@/components/detail/MetadataFields';
import { OperatorLink } from '@/components/operator/OperatorLink';
import { ErrorState, InvalidInput, LoadingState } from '@/components/states/States';
import { useCoreSlot } from '@/lib/api/queries';
import { parseOperatorMetadata } from '@/lib/operator-metadata';
import { formatHeight } from '@/lib/format/height';
import { isHealthyStatus, statusTone } from '@/lib/format/status';
import { bpsToPercent } from '@/lib/format/bps';
import { CoreSlotHealthSection } from './sections/CoreSlotHealthSection';
import { CoreSlotLivenessSection } from './sections/CoreSlotLivenessSection';
import { CoreSlotProposedBlocksSection } from './sections/CoreSlotProposedBlocksSection';
import { CoreSlotAuthorityHistorySection } from './sections/CoreSlotAuthorityHistorySection';
import { CoreSlotSettlementsSection } from './sections/CoreSlotSettlementsSection';
import { CoreSlotParticipantsChart } from './sections/CoreSlotParticipantsChart';
import { EntitlementsSection } from '@/components/rewards/sections/EntitlementsSection';
import { CoreSlotRawSection } from './sections/CoreSlotRawSection';

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'signing', label: 'Signing' },
  { id: 'rewards', label: 'Rewards' },
  { id: 'history', label: 'History' },
  { id: 'raw', label: 'Raw' },
];

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-card-border py-3 text-sm">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

// Redesign CoreSlot page: status pill + verdict h1 ("CoreSlot 1 — healthy, signing"),
// then tabs Overview / Signing / Rewards / History / Raw. Only the active tab's sections
// mount, so their queries fire on demand.
//
// Embedded (inside the operator page) keeps the old headless stacked layout — the host owns
// the single h1 (M-010) and its URL can't carry this component's ?tab= param.
export function CoreSlotDetail({
  slotId,
  embedded = false,
  tab: rawTab,
}: {
  slotId: string;
  embedded?: boolean;
  tab?: string | string[] | undefined;
}) {
  // String-safe numeric-slot-id check (no Number()). Neutral message matches the regex; the API still
  // validates (invalid_slot_id / not_found) and ErrorState branches on error.code.
  const valid = /^\d+$/.test(slotId);
  const query = useCoreSlot(valid ? slotId : '');

  const wrap = (title: string, node: ReactNode) =>
    embedded ? (
      <div className="space-y-6">{node}</div>
    ) : (
      <div className="flex flex-col gap-7">
        <Link href="/slots?tab=registry" className="text-sm text-text-muted hover:text-text">
          ← CoreSlots
        </Link>
        {title ? <h1 className="font-serif text-3xl text-text">{title}</h1> : null}
        {node}
      </div>
    );

  if (!valid) {
    return wrap(`CoreSlot ${slotId}`, <InvalidInput message="CoreSlot id must be a numeric slot id." />);
  }
  if (query.isPending) {
    return wrap('', <LoadingState rows={5} />);
  }
  if (query.isError) {
    return wrap(`CoreSlot ${slotId}`, <ErrorState error={query.error} context="CoreSlot" />);
  }

  const c = query.data.data;
  const operatorMeta = parseOperatorMetadata(c.metadata);

  const identity = (
    <div className="grid max-w-4xl grid-cols-1 gap-x-12 md:grid-cols-2">
      <FieldRow label="Operator">
        {c.operatorAddress ? (
          <span className="inline-flex items-center gap-1.5">
            <OperatorLink operatorAddress={c.operatorAddress} name={operatorMeta.moniker} />
            <CopyButton value={c.operatorAddress} label="operator address" />
          </span>
        ) : (
          '—'
        )}
      </FieldRow>
      <FieldRow label="Payout">
        <MonoCopy value={c.payoutAddress} label="payout" />
      </FieldRow>
      <FieldRow label="Consensus">
        <MonoCopy value={c.consensusAddress} label="consensus" />
      </FieldRow>
      <FieldRow label="Consensus power">
        <span className="font-mono">{c.consensusPower ?? '—'}</span>
      </FieldRow>
      <FieldRow label="Reward weight">
        <span className="font-mono">{c.rewardWeight ?? '—'}</span>
      </FieldRow>
      <FieldRow label="Created / updated">
        <span className="font-mono">{`${formatHeight(c.createdHeight)} / ${formatHeight(c.updatedHeight)}`}</span>
      </FieldRow>
      <FieldRow label="Removed">
        {c.removedHeight ? <span className="font-mono">{formatHeight(c.removedHeight)}</span> : '—'}
      </FieldRow>
      <FieldRow label="Consensus pubkey">
        <PubkeyInline value={c.consensusPubkey} />
      </FieldRow>
      <FieldRow label="Metadata">
        <MetadataFields value={c.metadata} />
      </FieldRow>
    </div>
  );

  // Embedded: keep the stacked layout unchanged (the operator page owns the composition).
  if (embedded) {
    return wrap(
      '',
      <>
        {identity}
        <CoreSlotHealthSection slotId={c.slotId} />
        <CoreSlotLivenessSection slotId={c.slotId} />
        <CoreSlotProposedBlocksSection slotId={c.slotId} />
        <CoreSlotAuthorityHistorySection slotId={c.slotId} />
        <CoreSlotSettlementsSection slotId={slotId} />
        <EntitlementsSection filter={{ slotId }} />
        <CoreSlotRawSection slotId={c.slotId} />
      </>,
    );
  }

  const tab = activeTab(TABS, rawTab);
  const healthy = isHealthyStatus(c.health?.healthStatus);
  const verdict = c.health
    ? `CoreSlot ${c.slotId} — ${c.health.healthStatus.toLowerCase()}${
        c.health.isActiveAtLatest ? ', signing' : ', not signing'
      }`
    : `CoreSlot ${c.slotId}`;

  return (
    <div className="flex flex-col gap-7">
      <Link href="/slots?tab=registry" className="text-sm text-text-muted hover:text-text">
        ← CoreSlots
      </Link>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {c.status ? <Badge tone={statusTone(c.status)}>{c.status}</Badge> : null}
          {c.health ? (
            <Badge tone={healthy ? 'success' : statusTone(c.health.healthStatus)}>
              uptime {bpsToPercent(c.health.uptimeBps)}
            </Badge>
          ) : null}
          {c.health?.summaryStatus ? (
            <Badge tone={statusTone(c.health.summaryStatus)}>{c.health.summaryStatus}</Badge>
          ) : null}
        </div>
        <h1 className="font-serif text-3xl text-text">{verdict}</h1>
        <p className="text-[15px] text-text-secondary">
          {operatorMeta.moniker ? (
            <>
              Operated by <span className="text-text">{operatorMeta.moniker}</span>
              {' · '}
            </>
          ) : null}
          <Link
            href={`/operators/${encodeURIComponent(slotId)}`}
            className="text-primary hover:text-primary-light"
          >
            Operator profile →
          </Link>
        </p>
      </div>

      <Tabs
        tabs={TABS}
        active={tab}
        hrefFor={(id) =>
          id === 'overview'
            ? `/coreslots/${encodeURIComponent(slotId)}`
            : `/coreslots/${encodeURIComponent(slotId)}?tab=${id}`
        }
        ariaLabel="CoreSlot views"
      />

      {tab === 'overview' ? identity : null}
      {tab === 'signing' ? (
        <>
          <CoreSlotHealthSection slotId={c.slotId} />
          <CoreSlotLivenessSection slotId={c.slotId} />
        </>
      ) : null}
      {tab === 'rewards' ? (
        <>
          <CoreSlotSettlementsSection slotId={slotId} />
          <CoreSlotParticipantsChart slotId={slotId} />
          <EntitlementsSection filter={{ slotId }} />
        </>
      ) : null}
      {tab === 'history' ? (
        <>
          <CoreSlotProposedBlocksSection slotId={c.slotId} />
          <CoreSlotAuthorityHistorySection slotId={c.slotId} />
        </>
      ) : null}
      {tab === 'raw' ? <CoreSlotRawSection slotId={c.slotId} /> : null}
    </div>
  );
}
