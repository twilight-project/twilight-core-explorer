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
  Network,
  Server,
  Stethoscope,
  Users,
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

// Flattened link list for the compact (sub-xl) nav, where a dropdown in a wrap row is awkward: the
// Explorer group's children render inline instead.
const FLAT_NAV: NavChild[] = NAV.flatMap((e) =>
  isMenu(e) ? e.children : [{ label: e.label, href: e.href, icon: e.icon }],
);

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
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
                  'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs',
                  isActive(pathname, item.href)
                    ? 'bg-card text-primary'
                    : 'text-text-secondary hover:text-text',
                )}
              >
                <NavIcon icon={item.icon} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
