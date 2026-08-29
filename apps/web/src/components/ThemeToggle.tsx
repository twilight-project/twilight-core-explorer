'use client';

import { clsx } from 'clsx';
import { Palette } from 'lucide-react';
import { useEffect, useState } from 'react';

// Theme switch: one ground, two grounds. `dark` is the operator console (default), `light` is the
// same voice and shape language on paper — only the palette depth differs. Persisted in
// localStorage and applied pre-paint by the inline script in layout.tsx, which also migrates any
// id stored before the set was reduced to these two.
//
// The former `density` axis (compact/airy) was removed: the dense console spacing is now the only
// scale, so its tokens are plain constants in globals.css rather than a runtime switch.
const THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
] as const;
type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_STORAGE_KEY = 'tw-theme';

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
  const [theme, setTheme] = useState<ThemeId>('dark');
  // On phones the full chip panel would sit on top of content — collapse it behind a button.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as ThemeId) || 'dark');
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

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-1.5">
      <div
        className={clsx(
          'flex-col gap-1.5 rounded-2xl border border-border bg-card/90 p-2 shadow-card backdrop-blur',
          open ? 'flex' : 'hidden sm:flex',
        )}
      >
        <Group
          label="Theme"
          ariaLabel="Color theme"
          items={THEMES}
          active={theme}
          onPick={pickTheme}
        />
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-border bg-card/90 p-2.5 text-text-secondary shadow-card backdrop-blur hover:text-text sm:hidden"
      >
        <Palette className="h-4 w-4" aria-hidden />
        <span className="sr-only">Appearance</span>
      </button>
    </div>
  );
}
