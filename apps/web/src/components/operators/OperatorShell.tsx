'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { CopyButton } from '@/components/ui/CopyButton';
import { useOperatorProfile } from '@/lib/api/queries';
import { asRecord, feedString } from '@/lib/operator-feed';
import { formatSlotStatus } from '@/lib/format/slot';
import { curatedOperator } from '@/lib/operator-directory';

// The operator pages' shared chrome: back link, the name + pills header and a four-tab nav
// (Overview · Details · Data · Authentication). Each subpage mounts this above its own
// content; the profile query is shared through the react-query cache, so the header costs
// no extra request.

export type OperatorTab = 'overview' | 'details' | 'data' | 'auth';

const TABS: { id: OperatorTab; label: string; path: (s: string) => string }[] = [
  { id: 'overview', label: 'Overview', path: (s) => `/operators/${s}` },
  { id: 'details', label: 'Details', path: (s) => `/operators/${s}/details` },
  { id: 'data', label: 'Data', path: (s) => `/operators/${s}/data` },
  { id: 'auth', label: 'Authentication', path: (s) => `/operators/${s}/auth` },
];

export function operatorDisplayName(slotId: string, metadata: unknown): string {
  const curated = curatedOperator(slotId);
  const moniker = feedString(asRecord(metadata)['moniker']);
  return curated?.name ?? moniker ?? `CoreSlot ${slotId} operator`;
}

export function OperatorNav({ slotId, active }: { slotId: string; active: OperatorTab }) {
  const s = encodeURIComponent(slotId);
  return (
    <nav className="flex gap-0.5 border-b border-card-border" aria-label="Operator views">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.path(s)}
          scroll={false}
          aria-current={active === t.id ? 'page' : undefined}
          className={clsx(
            '-mb-px border-b-2 px-3 py-[9px] text-[13px] font-medium',
            active === t.id
              ? 'border-primary text-text'
              : 'border-transparent text-text-muted hover:text-text',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Header for the operator subpages (Details / Data): back link, name, slot + feed pills, nav.
 * The Overview page renders its own richer header (verdict sentence) and only reuses the nav.
 */
export function OperatorSubpageHeader({
  slotId,
  active,
  caption,
}: {
  slotId: string;
  active: OperatorTab;
  caption: string;
}) {
  const profile = useOperatorProfile(slotId);
  const p = profile.data?.data;
  const name = operatorDisplayName(slotId, p?.identity.metadata ?? null);
  const slotStatus = p ? formatSlotStatus(p.identity.status) : null;
  return (
    <div className="flex flex-col gap-3.5">
      <Link href={`/operators/${encodeURIComponent(slotId)}`} className="font-mono text-xs text-text-muted hover:text-text">
        ← operator overview
      </Link>
      <div className="flex flex-wrap items-center gap-3.5">
        <h1 className="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">{name}</h1>
        <span className="whitespace-nowrap rounded-full border border-primary/40 px-2.5 py-[3px] font-mono text-[11px] uppercase tracking-[.08em] text-primary">
          CoreSlot {slotId}
          {slotStatus ? ` · ${slotStatus}` : ''}
        </span>
      </div>
      <p className="max-w-3xl text-[15px] leading-relaxed text-text-muted">{caption}</p>
      <OperatorNav slotId={slotId} active={active} />
    </div>
  );
}

// Small shared primitives used by more than one operator subpage.
export function AboutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-card-hover py-2">
      <span className="shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right text-text-secondary">{children}</span>
    </div>
  );
}

export function CodeLine({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-between gap-2 rounded-lg border border-card-border bg-background-secondary px-3 py-2 font-mono text-xs">
      <span>{text}</span>
      <CopyButton value={text} label={text} />
    </span>
  );
}
