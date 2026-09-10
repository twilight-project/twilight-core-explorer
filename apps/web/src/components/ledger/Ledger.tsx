import Link from 'next/link';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';

// Ruled-ledger primitives (control-room handoff): a mint section marker, a hairline top rule,
// rows divided by soft hairlines, whole-row links whose text turns mint on hover. No cards.

export function LedgerMarker({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between font-mono text-xs">
      <span className="uppercase tracking-[.08em] text-primary">⸸ {children}</span>
      {action ?? null}
    </div>
  );
}

export function LedgerList({ children }: { children: ReactNode }) {
  return <div className="border-t border-card-border">{children}</div>;
}

/** A whole-row link on the ledger grid. Pass the row's grid via `grid` (a grid-cols class). */
export function LedgerRow({
  href,
  grid,
  children,
  flash = false,
  className,
}: {
  href: string;
  grid: string;
  children: ReactNode;
  /** New-row mint fade for live-prepended entries. */
  flash?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'grid w-full items-baseline gap-3 border-b border-card-hover py-2.5 text-[13px] text-text hover:text-primary',
        grid,
        flash && 'animate-ledger-flash',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Non-link ledger row (same grid + rules). */
export function LedgerLine({
  grid,
  children,
  className,
}: {
  grid: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'grid w-full items-baseline gap-3 border-b border-card-hover py-2.5 text-[13px]',
        grid,
        className,
      )}
    >
      {children}
    </div>
  );
}
