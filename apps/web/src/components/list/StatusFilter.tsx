'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { StatusOption } from '@/lib/status-filters';

// Reusable URL-synced list filter (13b-filters / J-002). One pattern for coreslots?status= and
// txs?status=. The current value comes from the server page's searchParams (a controlled select), and
// a change rewrites the URL via router.replace — so the server re-renders with the new searchParam and
// the list hook re-keys (resetting keyset pagination to page one). `''` means "all" (no `?status=`).
//
// `usePathname` (not `useSearchParams`) keeps this out of a Suspense boundary. Pages with MORE than
// one list-filter param pass the others via `preserve` so changing this one doesn't drop them.
export function StatusFilter({
  label,
  paramName,
  value,
  options,
  preserve,
}: {
  label: string;
  paramName: string;
  value: string;
  options: StatusOption[];
  preserve?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const id = `filter-${paramName}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(preserve ?? {})) {
            if (v) qs.set(k, v);
          }
          if (next) qs.set(paramName, next);
          router.replace(qs.size > 0 ? `${pathname}?${qs.toString()}` : pathname);
        }}
        className="rounded-lg border border-card-border bg-background-secondary px-2 py-1.5 text-sm text-text focus:border-primary"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
