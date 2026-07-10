'use client';

import { useEffect, useState } from 'react';

// Runtime brand controls: two independent, tokenized axes.
//  - Theme (brand identity — color + shape + elevation + heading tracking + display/metric face):
//    the converged "Twilight Operations Console" set. `auction` = the warm-gold operator console
//    (default; id kept for compatibility, labelled "Console"); `gold-orbit` = premium glow gold;
//    `minimal-operator` = blue-signal high-contrast engineering variant; `legacy` = older
//    violet-on-navy alt. Each theme owns its shape/elevation/type tokens, not just color.
//  - Density (spacing/type scale): `compact` = faithful to the handoff's dense console (default);
//    `airy` = the roomier treatment. Orthogonal to theme: magnitude, not character.
// Both persist in localStorage and are applied pre-paint by the inline script in layout.tsx.
const THEMES = [
  { id: 'auction', label: 'Console' },
  { id: 'gold-orbit', label: 'Orbit' },
  { id: 'minimal-operator', label: 'Minimal' },
  { id: 'legacy', label: 'Legacy' },
] as const;
type ThemeId = (typeof THEMES)[number]['id'];

const DENSITIES = [
  { id: 'compact', label: 'Compact' },
  { id: 'airy', label: 'Airy' },
] as const;
type DensityId = (typeof DENSITIES)[number]['id'];

export const THEME_STORAGE_KEY = 'tw-theme';
export const DENSITY_STORAGE_KEY = 'tw-density';

function Group<T extends string>({
  label,
  ariaLabel,
  items,
  active,
  onPick,
}: {
  label: string;
  ariaLabel: string;
  items: readonly { id: T; label: string }[];
  active: T;
  onPick: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={ariaLabel}>
      <span className="w-16 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
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

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeId>('auction');
  const [density, setDensity] = useState<DensityId>('compact');

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as ThemeId) || 'auction');
    setDensity((document.documentElement.dataset.density as DensityId) || 'compact');
  }, []);

  function pickTheme(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* localStorage unavailable — session-only switch is fine */
    }
    setTheme(id);
  }

  function pickDensity(id: DensityId) {
    document.documentElement.dataset.density = id;
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, id);
    } catch {
      /* localStorage unavailable — session-only switch is fine */
    }
    setDensity(id);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 rounded-2xl border border-border bg-card/90 p-2 shadow-card backdrop-blur">
      <Group
        label="Theme"
        ariaLabel="Brand theme"
        items={THEMES}
        active={theme}
        onPick={pickTheme}
      />
      <Group
        label="Density"
        ariaLabel="Layout density"
        items={DENSITIES}
        active={density}
        onPick={pickDensity}
      />
    </div>
  );
}
