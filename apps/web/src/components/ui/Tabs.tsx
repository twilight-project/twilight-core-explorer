import Link from 'next/link';
import { clsx } from 'clsx';

export type TabDef = { id: string; label: string };

/**
 * URL-driven tab bar (redesign: "tabs, not stacks").
 *
 * Tabs are plain links carrying `?tab=` so the active tab survives reload/share and the server
 * shell re-renders with the right panel — the same URL-state pattern StatusFilter already uses.
 * Only the ACTIVE tab's panel should be mounted by the caller, which is what keeps inactive
 * tabs' queries from firing (the lazy RawSection pattern, generalized).
 */
export function Tabs({
  tabs,
  active,
  hrefFor,
  ariaLabel,
}: {
  tabs: readonly TabDef[];
  active: string;
  hrefFor: (id: string) => string;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto border-b border-card-border"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={hrefFor(t.id)}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Resolve the active tab id from a raw ?tab= search param, defaulting to the first tab. */
export function activeTab(tabs: readonly TabDef[], raw: string | string[] | undefined): string {
  const wanted = Array.isArray(raw) ? raw[0] : raw;
  return tabs.some((t) => t.id === wanted) ? (wanted as string) : (tabs[0]?.id ?? '');
}
