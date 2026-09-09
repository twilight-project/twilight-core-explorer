'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Boxes,
  Coins,
  Compass,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  Server,
  Users,
  X,
} from 'lucide-react';
import { SearchBar } from './SearchBar';

// Redesign IA: FOUR destinations — Overview, Validators (network+liveness+coreslots merged),
// Economy (rewards+entitlements+supply merged), Explorer (the raw block/tx/account streams).
// Diagnostics and the API move to the footer. No dropdown: Explorer is a plain link whose
// `match` list keeps it active across its three routes; the routes themselves are unchanged.
export type NavGroup = 'overview' | 'validators' | 'economics' | 'explore';

export type NavEntry = {
  label: string;
  href: string;
  group: NavGroup;
  icon: LucideIcon;
  /** Extra path prefixes that keep this entry active (Explorer spans three routes). */
  match?: string[];
};

export const NAV: NavEntry[] = [
  { label: 'Overview', href: '/', group: 'overview', icon: LayoutDashboard },
  { label: 'Validators', href: '/validators', group: 'validators', icon: Server, match: ['/coreslots', '/operator'] },
  { label: 'Economy', href: '/economy', group: 'economics', icon: Coins, match: ['/rewards', '/mining'] },
  { label: 'Explorer', href: '/blocks', group: 'explore', icon: Compass, match: ['/txs', '/accounts'] },
];

// The Explorer destination's three streams — surfaced as a tab row on those pages and as
// child links in the compact nav (replacing the removed dropdown).
export const EXPLORER_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Blocks', href: '/blocks', icon: Boxes },
  { label: 'Transactions', href: '/txs', icon: ArrowLeftRight },
  { label: 'Accounts', href: '/accounts', icon: Users },
];

// Decorative wayfinding glyph inside a nav link — inherits the link's text color (currentColor)
// so it dims/highlights with the active state. aria-hidden: the link text is the accessible name.
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}

function matchesPrefix(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActive(pathname: string, entry: NavEntry): boolean {
  if (matchesPrefix(pathname, entry.href)) return true;
  return (entry.match ?? []).some((m) => matchesPrefix(pathname, m));
}

// One row of the compact disclosure nav — a plain link with a comfortable touch target.
function CompactNavLink({
  label,
  href,
  icon,
  active,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        active
          ? 'bg-background-tertiary text-primary'
          : 'text-text-secondary hover:bg-background-tertiary hover:text-text',
      )}
    >
      <NavIcon icon={icon} />
      {label}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // A route change means a nav link was used — close the disclosure.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onDocClick(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setNavOpen(false);
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNavOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [navOpen]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-card-border bg-background/90 backdrop-blur"
    >
      <div className="mx-auto w-full lg:w-[1432px] px-4 sm:px-6 lg:px-[156px]">
        <div className="flex h-16 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-serif text-xl text-primary">Twilight</span>
            <span className="hidden text-sm text-text-muted sm:inline">Explorer</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 xl:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm',
                  isActive(pathname, item)
                    ? 'bg-card text-primary'
                    : 'text-text-secondary hover:text-text',
                )}
              >
                <NavIcon icon={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
          {/* Always-visible desktop search (redesign): a real input, not an icon-overlay — the
              4-item nav leaves room for it. Below lg the full-width row underneath takes over. */}
          <div className="ml-auto hidden w-[300px] shrink-0 lg:block">
            <SearchBar shortcut />
          </div>
          {/* Disclosure toggle for the compact nav (below `xl`, where the inline nav takes over).
              Constant accessible name + aria-expanded per the WAI-ARIA disclosure pattern. */}
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={navOpen}
            aria-controls="compact-nav"
            onClick={() => setNavOpen((v) => !v)}
            className="ml-auto flex items-center rounded-lg p-2 text-text-secondary lg:ml-0 hover:text-text xl:hidden"
          >
            {navOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
        {/* Compact search stays one tap away (hidden at `lg`+ where the inline search appears). */}
        <div className="pb-3 lg:hidden">
          <SearchBar />
        </div>
        {/* Compact nav: a vertical disclosure panel, available until `xl` (where the inline nav
            appears) so the lg..xl band keeps a primary nav. Explorer's three streams are listed
            as child links here — the desktop dropdown is gone. */}
        {navOpen ? (
          <div id="compact-nav" className="pb-3 xl:hidden">
            <nav
              aria-label="Primary (compact)"
              className="flex flex-col gap-0.5 rounded-xl border border-card-border bg-card p-2"
            >
              {NAV.map((item, i) => (
                <Fragment key={item.label}>
                  {i > 0 ? <span aria-hidden="true" className="my-1 h-px bg-card-border" /> : null}
                  {item.label === 'Explorer' ? (
                    <>
                      <span className="px-3 pt-1 text-[11px] uppercase tracking-wider text-text-muted">
                        Explorer
                      </span>
                      {EXPLORER_LINKS.map((c) => (
                        <CompactNavLink
                          key={c.href}
                          label={c.label}
                          href={c.href}
                          icon={c.icon}
                          active={matchesPrefix(pathname, c.href)}
                        />
                      ))}
                    </>
                  ) : (
                    <CompactNavLink
                      label={item.label}
                      href={item.href}
                      icon={item.icon}
                      active={isActive(pathname, item)}
                    />
                  )}
                </Fragment>
              ))}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}
