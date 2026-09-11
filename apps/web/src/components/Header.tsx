'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CommandSearch } from './CommandSearch';
import { getLinkedSlot } from '@/lib/linked-slot';

// Control-room chrome: logo ring + a MODE SWITCH (My node · Chain) + the active mode's
// sub-nav + the ⌘K search. The mode is a per-browser choice (localStorage 'tw-mode',
// overridable with ?mode=), defaulting to My node only when a slot is linked. The routes
// themselves stay mode-agnostic — the switch just picks which set the sub-nav shows and
// where the logo/mode buttons land.

export type Mode = 'node' | 'chain';

export interface SubnavEntry {
  label: string;
  href: string;
  /** Extra path prefixes that keep this entry active. */
  match?: string[];
}

export const NODE_SUBNAV: SubnavEntry[] = [
  { label: 'Overview', href: '/node' },
  { label: 'Rewards', href: '/node/rewards' },
  { label: 'Settlements', href: '/node/settlements' },
];

export const CHAIN_SUBNAV: SubnavEntry[] = [
  { label: 'Blocks', href: '/blocks', match: ['/chain'] },
  { label: 'Transactions', href: '/txs' },
  { label: 'Slots', href: '/slots', match: ['/coreslots', '/operator', '/operators'] },
  { label: 'Economy', href: '/economy', match: ['/rewards', '/mining', '/accounts'] },
];

function matchesPrefix(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSubnavActive(pathname: string, entry: SubnavEntry, all: SubnavEntry[]): boolean {
  // Longest-prefix wins so /node/rewards doesn't also light up /node.
  const direct = matchesPrefix(pathname, entry.href);
  if (direct) {
    const longer = all.some(
      (o) => o.href.length > entry.href.length && matchesPrefix(pathname, o.href),
    );
    if (!longer) return true;
  }
  return (entry.match ?? []).some((m) => matchesPrefix(pathname, m));
}

export function readStoredMode(): Mode | null {
  try {
    const raw = localStorage.getItem('tw-mode');
    return raw === 'node' || raw === 'chain' ? raw : null;
  } catch {
    return null;
  }
}

function HeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mode resolution order: ?mode= (and persist it) → stored choice → linked-slot default.
  // Resolved after mount so SSR renders the neutral Chain chrome without storage access.
  const [mode, setMode] = useState<Mode>('chain');
  useEffect(() => {
    const fromQuery = searchParams.get('mode');
    if (fromQuery === 'node' || fromQuery === 'chain') {
      setMode(fromQuery);
      try {
        localStorage.setItem('tw-mode', fromQuery);
      } catch {
        /* non-fatal */
      }
      return;
    }
    const stored = readStoredMode();
    if (stored) {
      setMode(stored);
      return;
    }
    setMode(getLinkedSlot() ? 'node' : 'chain');
  }, [searchParams]);

  // A navigation into the other mode's territory flips the switch to match.
  useEffect(() => {
    if (pathname.startsWith('/node')) setMode('node');
    else if (
      CHAIN_SUBNAV.some((e) => isSubnavActive(pathname, e, CHAIN_SUBNAV)) ||
      pathname === '/chain'
    ) {
      setMode('chain');
    }
  }, [pathname]);

  function choose(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem('tw-mode', next);
    } catch {
      /* non-fatal */
    }
  }

  const subnav = mode === 'node' ? NODE_SUBNAV : CHAIN_SUBNAV;

  return (
    <header className="sticky top-0 z-40 border-b border-card-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-4 px-5 lg:gap-7">
        <Link href={mode === 'node' ? '/node' : '/chain'} className="flex shrink-0 items-center gap-2.5 text-text">
          {/* Logo mark: 22px mint ring with an inner dot. */}
          <span
            aria-hidden="true"
            className="inline-block h-[22px] w-[22px] rounded-full border-2 border-primary shadow-[inset_0_0_0_4px_rgb(var(--background)),inset_0_0_0_7px_rgb(var(--primary))]"
          />
          <span className="text-base font-semibold tracking-[-0.01em]">Twilight</span>
        </Link>

        {/* Mode switch */}
        <div
          role="group"
          aria-label="Mode"
          className="flex shrink-0 gap-0.5 rounded-lg border border-card-border bg-card p-[3px]"
        >
          {(
            [
              { id: 'node' as const, label: 'My node', href: '/node' },
              { id: 'chain' as const, label: 'Chain', href: '/chain' },
            ] as const
          ).map((m) => (
            <Link
              key={m.id}
              href={m.href}
              onClick={() => choose(m.id)}
              aria-current={mode === m.id ? 'true' : undefined}
              className={clsx(
                'whitespace-nowrap rounded-md px-3.5 py-1.5 text-[13px] font-semibold',
                mode === m.id ? 'bg-background-tertiary text-text' : 'text-text-muted hover:text-text',
              )}
            >
              {m.label}
            </Link>
          ))}
        </div>

        {/* Sub-nav for the active mode (scrolls horizontally when cramped). */}
        <nav
          aria-label="Primary"
          className="flex min-w-0 shrink gap-0.5 overflow-x-auto [scrollbar-width:none]"
        >
          {subnav.map((entry) => {
            const active = isSubnavActive(pathname, entry, subnav);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[13.5px] font-medium',
                  active
                    ? 'border-primary text-text'
                    : 'border-transparent text-text-muted hover:text-text',
                )}
              >
                {entry.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden min-w-0 flex-1 justify-end sm:flex">
          <CommandSearch />
        </div>
      </div>
      {/* Compact search: its own row below the header on small screens. */}
      <div className="px-5 pb-2.5 sm:hidden">
        <CommandSearch />
      </div>
    </header>
  );
}

export function Header() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="h-14 border-b border-card-border" />}>
      <HeaderInner />
    </Suspense>
  );
}
