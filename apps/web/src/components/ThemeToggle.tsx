'use client';

import { useEffect, useState } from 'react';

// Brand themes selectable at runtime. `auction` = the current gold brand (default); `twilight-cool` =
// the redesign direction #1 (deep indigo + violet); `legacy` = the older violet-on-navy alt.
// The choice is persisted in localStorage and applied pre-paint by the inline script in layout.tsx.
const THEMES = [
  { id: 'auction', label: 'Gold' },
  { id: 'twilight-cool', label: 'Twilight' },
  { id: 'legacy', label: 'Legacy' },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];
export const THEME_STORAGE_KEY = 'tw-theme';

export function ThemeToggle() {
  const [active, setActive] = useState<ThemeId>('auction');

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as ThemeId) || 'auction';
    setActive(current);
  }, []);

  function pick(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* localStorage unavailable — session-only switch is fine */
    }
    setActive(id);
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-full border border-border bg-card/90 px-1.5 py-1 shadow-card backdrop-blur"
      role="group"
      aria-label="Brand theme"
    >
      <span className="px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        Theme
      </span>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => pick(t.id)}
          aria-pressed={active === t.id}
          className={
            'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
            (active === t.id
              ? 'bg-accent-gold text-background'
              : 'text-text-secondary hover:text-text')
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
