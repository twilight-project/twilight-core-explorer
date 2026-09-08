'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { EXPLORER_LINKS } from '@/components/Header';

// The Explorer destination's three streams as a tab row shared by /blocks, /txs and /accounts —
// the redesign's replacement for the removed header dropdown. Route-driven (usePathname), same
// visual grammar as ui/Tabs but these are real page routes, not a ?tab= param.
export function ExplorerTabs() {
  const pathname = usePathname();
  return (
    <div role="navigation" aria-label="Explorer streams" className="border-b border-card-border">
      <div className="-mb-px flex gap-1">
        {EXPLORER_LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'border-b-2 px-3.5 py-2.5 text-sm',
                active
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-text-secondary hover:border-border-light hover:text-text',
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
