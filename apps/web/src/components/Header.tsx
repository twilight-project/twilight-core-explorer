'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchBar } from './SearchBar';

// IA reshaped for Twilight (CoreSlot PoA + rewards) per the redesign review: dashboard-first, then the
// validators cluster (Network/Liveness/CoreSlots), the economics cluster (Rewards/Supply), the raw
// explorer grouped under an "Explorer" dropdown (Blocks/Transactions/Accounts), and Diagnostics last.
// Groups stay contiguous so the desktop separators fall on real concern boundaries.
export type NavGroup = 'overview' | 'validators' | 'economics' | 'explore' | 'diagnostics';

export type NavLink = { label: string; href: string; group: NavGroup };
export type NavMenu = { label: string; group: NavGroup; children: { label: string; href: string }[] };
export type NavEntry = NavLink | NavMenu;

export const NAV: NavEntry[] = [
  { label: 'Overview', href: '/', group: 'overview' },
  { label: 'Network', href: '/network', group: 'validators' },
  { label: 'Liveness', href: '/liveness', group: 'validators' },
  { label: 'CoreSlots', href: '/coreslots', group: 'validators' },
  { label: 'Rewards', href: '/rewards', group: 'economics' },
  { label: 'Supply', href: '/supply', group: 'economics' },
  {
    label: 'Explorer',
    group: 'explore',
    children: [
      { label: 'Blocks', href: '/blocks' },
      { label: 'Transactions', href: '/txs' },
      { label: 'Accounts', href: '/accounts' },
    ],
  },
  { label: 'Diagnostics', href: '/diagnostics', group: 'diagnostics' },
];

function isMenu(entry: NavEntry): entry is NavMenu {
  return 'children' in entry;
}

// Flattened link list for the compact (sub-xl) nav, where a dropdown in a wrap row is awkward: the
// Explorer group's children render inline instead.
const FLAT_NAV: { label: string; href: string }[] = NAV.flatMap((e) =>
  isMenu(e) ? e.children : [{ label: e.label, href: e.href }],
);

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Accessible desktop dropdown for a NavMenu (Explorer). Toggles on click; closes on Escape, on
// outside click, and on navigating to a child. The trigger is "active" when any child route is active.
function NavDropdown({ menu, pathname }: { menu: NavMenu; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = menu.children.some((c) => isActive(pathname, c.href));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm',
          active ? 'bg-card text-primary' : 'text-text-secondary hover:text-text',
        )}
      >
        {menu.label}
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-40 rounded-xl border border-card-border bg-card p-1 shadow-card"
        >
          {menu.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={clsx(
                'block rounded-lg px-3 py-1.5 text-sm',
                isActive(pathname, c.href)
                  ? 'bg-background-tertiary text-primary'
                  : 'text-text-secondary hover:bg-background-tertiary hover:text-text',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-card-border bg-background/90 backdrop-blur">
      <div className="mx-auto w-full lg:w-[1432px] px-4 sm:px-6 lg:px-[156px]">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-serif text-xl text-primary">Twilight</span>
            <span className="hidden text-sm text-text-muted sm:inline">Core Explorer</span>
          </Link>
          <div className="hidden flex-1 justify-center lg:flex">
            <SearchBar />
          </div>
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
            {NAV.map((item, i) => (
              <Fragment key={item.label}>
                {i > 0 && NAV[i - 1]?.group !== item.group ? (
                  <span aria-hidden="true" className="mx-1 h-4 w-px bg-card-border" />
                ) : null}
                {isMenu(item) ? (
                  <NavDropdown menu={item} pathname={pathname} />
                ) : (
                  <Link
                    href={item.href}
                    className={clsx(
                      'rounded-lg px-2.5 py-1.5 text-sm',
                      isActive(pathname, item.href)
                        ? 'bg-card text-primary'
                        : 'text-text-secondary hover:text-text',
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </Fragment>
            ))}
          </nav>
        </div>
        {/* Compact nav for narrower viewports. Visible until `xl` — where the inline desktop nav takes
            over — so there is NO nav gap in the lg..xl band (Codex 13b-ux review). The compact search
            hides at `lg`+, where the centered desktop search appears, to avoid a duplicate search.
            The Explorer group is flattened to inline links here (a dropdown in a wrap row is awkward). */}
        <div className="flex flex-col gap-2 pb-3 xl:hidden">
          <div className="lg:hidden">
            <SearchBar />
          </div>
          <nav className="flex flex-wrap gap-1" aria-label="Primary (compact)">
            {FLAT_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'rounded-lg px-2 py-1 text-xs',
                  isActive(pathname, item.href)
                    ? 'bg-card text-primary'
                    : 'text-text-secondary hover:text-text',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
