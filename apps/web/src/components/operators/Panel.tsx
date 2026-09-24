import type { ReactNode } from 'react';
import { clsx } from 'clsx';

// The profile-v2 titled panel: panel bg, hairline border, radius 10, a 14×20 header row with
// a 15/600 title and a right-aligned Fira meta line that NAMES THE SOURCE of everything in
// the body. Never a number without a panel that says where it came from.

export function Panel({
  title,
  meta,
  children,
  tinted = false,
  bodyClassName = 'px-5 py-[18px]',
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  /** Mint-tinted border for the join card. */
  tinted?: boolean;
  bodyClassName?: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border bg-card',
        tinted ? 'border-primary/35' : 'border-card-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-5 py-3.5">
        <span className="text-[15px] font-semibold">{title}</span>
        {meta ? (
          <span className="font-mono text-[11px] text-text-muted">{meta}</span>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** The metric triple: label / value(+unit) / formula caption. Never a bare number. */
export function MetricTriple({
  label,
  value,
  unit,
  note,
  tone = 'text',
  size = 26,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  note: string;
  tone?: 'text' | 'mint' | 'orange';
  size?: 16 | 20 | 26;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[.08em] text-text-muted">
        {label}
      </span>
      <span
        className={clsx(
          'font-mono leading-none',
          size === 26 ? 'text-[26px]' : size === 20 ? 'text-[20px]' : 'text-base',
          tone === 'mint' ? 'text-primary' : tone === 'orange' ? 'text-accent-orange' : 'text-text',
        )}
      >
        {value}
        {unit ? <span className="text-[13px] text-text-muted"> {unit}</span> : null}
      </span>
      <span className="font-mono text-[11.5px] leading-relaxed text-text-muted">{note}</span>
    </div>
  );
}
