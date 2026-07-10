import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { BadgeTone } from '@/lib/format/status';
import { ICON_TONE, type IconTone } from './icon-tone';

// A big, airy KPI stat card for the redesigned pages. Top row: an optional decorative icon chip +
// uppercase label + an optional status "delta" chip (tone-colored). Then a large mono value (+ optional
// unit), then a muted sub line. All colors resolve from theme tokens; spacing/size from density tokens
// — so it rebrands + re-densifies.
//
// `icon` is a lucide component (concept, not tone): it renders muted + aria-hidden so the label stays
// the sole accessible name and the glyph never competes with the value or status pill.
//
// `preview` marks a card whose metric IS derivable from the indexed DB but has no API endpoint YET:
// it renders a dashed border, a "preview" pill, and a "Real data coming up" note so the mock value is
// unmistakably a placeholder (never mistaken for live data). Wire the real endpoint next iteration.

const DELTA_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-text-muted',
  success: 'text-accent-green',
  warning: 'text-accent-yellow',
  danger: 'text-accent-red',
  info: 'text-primary',
};

// `iconTone` colors the icon chip by DOMAIN (which metric); the status delta pill still owns TONE (how
// the metric is doing) — the two color channels never collide. The tint vocabulary is shared with
// StatCard via ./icon-tone so a metric reads the same color on every page.

export function KpiCard({
  label,
  value,
  unit,
  sub,
  delta,
  deltaTone = 'neutral',
  mono = true,
  preview = false,
  icon,
  iconTone,
}: {
  label: string;
  value: ReactNode;
  unit?: string | undefined;
  sub?: ReactNode;
  delta?: ReactNode;
  deltaTone?: BadgeTone;
  mono?: boolean;
  preview?: boolean;
  icon?: LucideIcon;
  iconTone?: IconTone;
}) {
  // Capitalized alias so the optional icon can be used as a JSX component.
  const Icon = icon;
  return (
    <div
      className={clsx(
        'flex flex-col gap-3 rounded-2xl bg-card px-card-x py-card-y shadow-card',
        // Preview keeps an explicit dashed 1px marker regardless of theme; live cards take the
        // theme-owned border width (0 for elevation-led themes that float on their shadow ring).
        preview
          ? 'border border-dashed border-border'
          : 'border-card-border [border-width:var(--card-border-width,1px)]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {Icon ? (
            // Decorative chip: rounded-lg so the corner follows the theme. With `iconTone` it takes a
            // faint category-hued surface + matching icon (color = domain); without one it falls back
            // to the neutral white-alpha/muted chrome. Either way the icon is aria-hidden, never a name.
            <span
              className={clsx(
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                iconTone ? ICON_TONE[iconTone] : 'bg-white/5 text-text-muted',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          <span className="truncate text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {label}
          </span>
        </span>
        {preview ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
            preview
          </span>
        ) : delta ? (
          <span className={clsx('text-[11px] font-medium tabular-nums', DELTA_TEXT[deltaTone])}>
            {delta}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx(
            'text-kpi font-semibold leading-none tracking-tight',
            preview ? 'text-text-secondary' : 'text-text',
            // Hero numerals use the theme's metric face (defaults to mono → auction unchanged).
            mono && 'font-metric',
          )}
        >
          {value}
        </span>
        {/* Hide the unit next to a loading/empty placeholder so a pending card reads "…" not "… s".
            '…' (pending) and '—' (missing) are the shared placeholder convention used by every strip. */}
        {unit && value !== '…' && value !== '—' ? (
          <span className="text-xs text-text-muted">{unit}</span>
        ) : null}
      </div>
      {preview ? (
        <div className="text-[11px] italic text-text-muted">Real data coming up</div>
      ) : sub ? (
        <div className="text-xs text-text-muted">{sub}</div>
      ) : null}
    </div>
  );
}
