import type { ReactNode } from 'react';

// Airy/premium page header used across the redesign: a small brand-accent eyebrow, a serif h1, an
// optional muted sub-paragraph, and a right-aligned actions slot (status pill, "updated Ns ago", etc.).
// Purely presentational + token-driven, so it rebrands with the active theme.
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </div>
        <h1 className="font-serif text-3xl leading-tight tracking-tight text-text">{title}</h1>
        {sub ? <p className="max-w-xl text-sm leading-relaxed text-text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
