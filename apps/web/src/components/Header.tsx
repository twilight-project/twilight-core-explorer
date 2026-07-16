'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  ArrowLeftRight,
  Award,
  Boxes,
  Coins,
  Compass,
  type LucideIcon,
  LayoutDashboard,
  Menu,
  Network,
  Server,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { SearchBar } from './SearchBar';

// IA reshaped for Twilight (CoreSlot PoA + rewards) per the redesign review: dashboard-first, then the
// validators cluster (Network/Liveness/CoreSlots), the economics cluster (Rewards/Supply), the raw
// explorer grouped under an "Explorer" dropdown (Blocks/Transactions/Accounts), and Diagnostics last.
// Groups stay contiguous so the desktop separators fall on real concern boundaries.
export type NavGroup = 'overview' | 'validators' | 'economics' | 'explore' | 'diagnostics';

export type NavChild = { label: string; href: string; icon: LucideIcon };
export type NavLink = { label: string; href: string; group: NavGroup; icon: LucideIcon };
export type NavMenu = { label: string; group: NavGroup; icon: LucideIcon; children: NavChild[] };
export type NavEntry = NavLink | NavMenu;

// Nav icons are wayfinding glyphs: they follow the link's text color (muted → primary when active),
// NOT the category tones — a horizontal nav tinted six ways would read as noise. Where a destination
// has a domain icon on its page (CoreSlots→Server, Rewards→Award, …) the nav reuses it for continuity.
export const NAV: NavEntry[] = [
  { label: 'Overview', href: '/', group: 'overview', icon: LayoutDashboard },
  { label: 'Network', href: '/network', group: 'validators', icon: Network },
  { label: 'Liveness', href: '/liveness', group: 'validators', icon: Activity },
  { label: 'CoreSlots', href: '/coreslots', group: 'validators', icon: Server },
  { label: 'Rewards', href: '/rewards', group: 'economics', icon: Award },
  { label: 'Supply', href: '/supply', group: 'economics', icon: Coins },
  {
    label: 'Explorer',
    group: 'explore',
    icon: Compass,
    children: [
      { label: 'Blocks', href: '/blocks', icon: Boxes },
      { label: 'Transactions', href: '/txs', icon: ArrowLeftRight },
      { label: 'Accounts', href: '/accounts', icon: Users },
    ],
  },
  { label: 'Diagnostics', href: '/diagnostics', group: 'diagnostics', icon: Stethoscope },
];

function isMenu(entry: NavEntry): entry is NavMenu {
  return 'children' in entry;
}

// Decorative wayfinding glyph inside a nav link — inherits the link's text color (currentColor) so it
// dims/highlights with the active state. aria-hidden: the link text is the accessible name.
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 shrink-0" aria-hidden />;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// One row of the compact disclosure nav — a plain link with a comfortable touch target.
function CompactNavLink({ item, pathname }: { item: NavChild; pathname: string }) {
  return (
    <Link
      href={item.href}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        isActive(pathname, item.href)
          ? 'bg-background-tertiary text-primary'
          : 'text-text-secondary hover:bg-background-tertiary hover:text-text',
      )}
    >
      <NavIcon icon={item.icon} />
      {item.label}
    </Link>
  );
}

// Accessible desktop dropdown for a NavMenu (Explorer), implementing the WAI-ARIA menu-button pattern:
// click/ArrowDown opens and moves focus into the menu; Arrow/Home/End roves between items; Escape
// closes and returns focus to the trigger; outside-click and navigating to a child also close.
function NavDropdown({ menu, pathname }: { menu: NavMenu; pathname: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = menu.children.some((c) => isActive(pathname, c.href));
  const menuId = `nav-menu-${menu.label.toLowerCase()}`;

  useEffect(() => {
    if (!open) return;
    // Move focus into the menu on open (menu-button pattern).
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onDocKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onDocKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onDocKey);
    };
  }, [open]);

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }
  function focusAt(index: number) {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]?.focus();
  }

  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setOpen(true); // the open effect moves focus to the first item
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const list = items();
    if (list.length === 0) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusAt(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusAt(0);
        break;
      case 'End':
        e.preventDefault();
        focusAt(list.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false); // close, but let Tab move focus onward naturally
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm',
          active ? 'bg-card text-primary' : 'text-text-secondary hover:text-text',
        )}
      >
        <NavIcon icon={menu.icon} />
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
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menu.label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-1 min-w-40 rounded-xl border border-card-border bg-card p-1 shadow-card"
        >
          {menu.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                isActive(pathname, c.href)
                  ? 'bg-background-tertiary text-primary'
                  : 'text-text-secondary hover:bg-background-tertiary hover:text-text',
              )}
            >
              <NavIcon icon={c.icon} />
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
        {/* `relative` anchors the search overlay, which expands across this whole row. */}
        <div className="relative flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-serif text-xl text-primary">Twilight</span>
            <span className="hidden text-sm text-text-muted sm:inline">Core Explorer</span>
          </Link>
          {/* Icon trigger only: beside the full nav this slot bottoms out around ~50px wide, so
              the search input can never live INSIDE it — it overlays the row on demand instead. */}
          <div className="hidden flex-1 justify-end lg:flex">
            <SearchBar overlay />
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
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm',
                      isActive(pathname, item.href)
                        ? 'bg-card text-primary'
                        : 'text-text-secondary hover:text-text',
                    )}
                  >
                    <NavIcon icon={item.icon} />
                    {item.label}
                  </Link>
                )}
              </Fragment>
            ))}
          </nav>
          {/* Disclosure toggle for the compact nav (below `xl`, where the inline nav takes over).
              Constant accessible name + aria-expanded per the WAI-ARIA disclosure pattern. */}
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={navOpen}
            aria-controls="compact-nav"
            onClick={() => setNavOpen((v) => !v)}
            className="flex items-center rounded-lg p-2 text-text-secondary hover:text-text xl:hidden"
          >
            {navOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
        {/* Compact search stays one tap away (hidden at `lg`+ where the centered search appears). */}
        <div className="pb-3 lg:hidden">
          <SearchBar />
        </div>
        {/* Compact nav is a vertical disclosure panel (was a ~190px chip-wrap on phones). It stays
            available until `xl` — where the inline desktop nav appears — so there is NO nav gap in
            the lg..xl band (Codex 13b-ux review). Links are plain links (disclosure navigation
            pattern), grouped with the same concern boundaries as the desktop nav. */}
        {navOpen ? (
          <div id="compact-nav" className="pb-3 xl:hidden">
            <nav
              aria-label="Primary (compact)"
              className="flex flex-col gap-0.5 rounded-xl border border-card-border bg-card p-2"
            >
              {NAV.map((item, i) => (
                <Fragment key={item.label}>
                  {i > 0 && NAV[i - 1]?.group !== item.group ? (
                    <span aria-hidden="true" className="my-1 h-px bg-card-border" />
                  ) : null}
                  {isMenu(item) ? (
                    <>
                      <span className="px-3 pt-1 text-[11px] uppercase tracking-wider text-text-muted">
                        {item.label}
                      </span>
                      {item.children.map((c) => (
                        <CompactNavLink key={c.href} item={c} pathname={pathname} />
                      ))}
                    </>
                  ) : (
                    <CompactNavLink
                      item={{ label: item.label, href: item.href, icon: item.icon }}
                      pathname={pathname}
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
