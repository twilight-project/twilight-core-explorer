import { clsx } from 'clsx';

// The three-label provenance model (phase 14 §7.3) + this page's extra states (phase 15 §9):
// one visual grammar for "where did this figure come from". chain = fact from an indexed
// event; verified = operator-published AND matching a chain commitment; attested =
// operator-published with no commitment; declared = the operator's own words; configured =
// explorer configuration, not the chain; estimate = derived with no commitment; mismatch =
// the operator's figure contradicts the chain (the chain's number is shown); no-status =
// the operator publishes nothing (silence, a state).
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
  chain: 'border-primary/40 text-primary',
  verified: 'border-primary/40 text-primary',
  attested: 'border-border-light text-text-secondary',
  declared: 'border-border-light text-text-muted',
  configured: 'border-border-light text-text-muted',
  estimate: 'border-border-light text-text-muted',
  mismatch: 'border-accent-red/40 text-accent-red',
  'no-status': 'border-border-light text-text-muted',
};

const LABEL: Record<Provenance, string> = {
  chain: 'chain',
  verified: '✓ verified',
  attested: 'attested',
  declared: 'declared',
  configured: 'configured',
  estimate: 'est.',
  mismatch: '✕ mismatch',
  'no-status': 'no status',
};

export function SourceChip({ kind, title }: { kind: Provenance; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-px font-mono text-[10.5px] leading-4',
        STYLE[kind],
      )}
    >
      {LABEL[kind]}
    </span>
  );
}
