import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { ICON_TONE, type IconTone } from './icon-tone';

// Compact stat tile (denser than KpiCard) for inner grids. Optionally leads with a decorative icon
// chip: `icon` is a lucide component and `iconTone` tints it by category using the shared tone map, so
// these tiles carry the same color legend as the KpiCard strips. The chip is smaller here to fit the
// tighter tile. The icon is aria-hidden — the label stays the sole accessible name.
export function StatCard({
  label,
  value,
  hint,
  mono = false,
  icon,
  iconTone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  mono?: boolean;
  icon?: LucideIcon;
  iconTone?: IconTone;
}) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-card-border bg-background-secondary px-4 py-3">
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <span
            className={clsx(
              'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
              iconTone ? ICON_TONE[iconTone] : 'bg-white/5 text-text-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        <span className="truncate text-xs uppercase tracking-tighter-1 text-text-muted">{label}</span>
      </div>
      <div className={mono ? 'mt-1 font-metric text-lg text-text' : 'mt-1 text-lg text-text'}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </div>
  );
}
