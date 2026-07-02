import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { BadgeTone } from '@/lib/format/status';

// A big, airy KPI stat card for the redesigned Overview. Top row: uppercase label + an optional
// status "delta" chip (tone-colored). Then a large mono value (with optional trailing unit), then a
// muted sub line. All colors resolve from theme tokens, so the card rebrands Gold <-> Twilight.
//
// Deliberately NO sparkline: the handoff's per-KPI sparklines are mock time-series, and we have no
// history endpoint to source them truthfully. Adding one would fabricate data (forbidden). A real
// series (e.g. a /metrics time-series) can light this up later.

const DELTA_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-accent-green',
  warning: 'text-accent-yellow',
  danger: 'text-accent-red',
  info: 'text-primary',
};

export function KpiCard({
  label,
  value,
  unit,
  sub,
  delta,
  deltaTone = 'neutral',
  mono = true,
}: {
  label: string;
  value: ReactNode;
  unit?: string | undefined;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaTone?: BadgeTone;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-card-border bg-card px-card-x py-card-y shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {delta ? (
          <span className={clsx('text-[11px] font-medium tabular-nums', DELTA_TEXT[deltaTone])}>
            {delta}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx(
            'text-kpi font-semibold leading-none tracking-tight text-text',
            mono && 'font-mono',
          )}
        >
          {value}
        </span>
        {unit ? <span className="text-xs text-text-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="text-xs text-text-muted">{sub}</div> : null}
    </div>
  );
}
