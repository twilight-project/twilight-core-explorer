import { clsx } from 'clsx';

// The provenance marks (phase 14 §7.3 / profile-v2 handoff): outlined Fira Code tags, one
// vocabulary everywhere, explained once by MarksLegend. Color grammar: mint = chain-grade
// (chain fact, or attested-and-matches-chain), ORANGE = the operator's own words (attested /
// declared — the design's amber, remapped because this product bans yellow), red = the chain
// disagreed, muted = configuration or silence.
export type Provenance =
  | 'chain'
  | 'verified'
  | 'attested'
  | 'declared'
  | 'configured'
  | 'estimate'
  | 'mismatch'
  | 'no-status';

const STYLE: Record<Provenance, string> = {
  chain: 'border-primary/50 text-primary',
  verified: 'border-primary/50 text-primary',
  attested: 'border-accent-orange/50 text-accent-orange',
  declared: 'border-accent-orange/50 text-accent-orange',
  configured: 'border-border-light text-text-muted',
  estimate: 'border-border-light text-text-muted',
  mismatch: 'border-accent-red/50 text-accent-red',
  'no-status': 'border-border-light text-text-muted',
};

const LABEL: Record<Provenance, string> = {
  chain: 'chain',
  verified: 'verified',
  attested: 'attested',
  declared: 'declared',
  configured: 'configured',
  estimate: 'estimate',
  mismatch: 'mismatch',
  'no-status': 'no status',
};

export function SourceChip({ kind, title }: { kind: Provenance; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px font-mono text-[10.5px] leading-4',
        STYLE[kind],
      )}
    >
      {LABEL[kind]}
    </span>
  );
}

/** The legend card ("How to read the marks") — the one place the vocabulary is explained. */
export function MarksLegend() {
  const rows: { kind: Provenance; text: string }[] = [
    { kind: 'chain', text: 'Indexed from blocks. Anyone can recompute it.' },
    { kind: 'attested', text: 'Published by the operator, shown with its age.' },
    { kind: 'verified', text: 'Attested figure matches the chain for that epoch.' },
    { kind: 'mismatch', text: 'Attested figure disagrees; the chain number wins.' },
    { kind: 'declared', text: 'Free-text metadata. Never verified.' },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-card-border px-5 py-3.5">
      <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
        How to read the marks
      </span>
      {rows.map((r) => (
        <div key={r.kind} className="grid grid-cols-[78px_1fr] items-baseline gap-2.5 text-xs leading-relaxed text-text-secondary">
          <SourceChip kind={r.kind} />
          <span>{r.text}</span>
        </div>
      ))}
    </div>
  );
}
