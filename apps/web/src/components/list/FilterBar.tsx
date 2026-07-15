'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { InvalidInput } from '@/components/states/States';
import { isDigits } from '@/lib/format/height';

// Free-text/height list filters — the 13b StatusFilter pattern extended to text inputs, applied
// on submit (Enter or Apply), never per keystroke (each application is a server-side re-query).
// Two modes: URL mode (default) rewrites searchParams via router.replace so the server page
// re-renders and the list hook re-keys (keyset pagination restarts at page one); `onApply` mode
// keeps the values in caller state for filter surfaces on pages that don't read searchParams
// (the rewards hub sections). Validation is client-side and string-safe (no Number()).
export type FilterField = {
  param: string;
  label: string;
  placeholder?: string;
  /** 'digits' constrains to a decimal string (heights/ids) before anything is applied. */
  kind?: 'text' | 'digits';
};

export type FilterValues = Record<string, string | undefined>;

export function FilterBar(props: {
  fields: FilterField[];
  values: FilterValues;
  /** Local mode: receive the applied values instead of rewriting the URL. */
  onApply?: (values: FilterValues) => void;
}) {
  // Split so LOCAL mode never touches the app router (hub sections render outside a route
  // transition; jsdom tests render them without a router too).
  return props.onApply ? <FilterForm {...props} /> : <UrlFilterBar {...props} />;
}

function UrlFilterBar(props: { fields: FilterField[]; values: FilterValues }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <FilterForm
      {...props}
      onApply={(next) => {
        const qs = new URLSearchParams();
        for (const f of props.fields) {
          const v = next[f.param];
          if (v) qs.set(f.param, v);
        }
        router.replace(qs.size > 0 ? `${pathname}?${qs.toString()}` : pathname);
      }}
    />
  );
}

function FilterForm({
  fields,
  values,
  onApply,
}: {
  fields: FilterField[];
  values: FilterValues;
  onApply?: (values: FilterValues) => void;
}) {
  const snapshot = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.param, values[f.param] ?? ''])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by content, not identity
    [JSON.stringify(fields.map((f) => f.param)), JSON.stringify(values)],
  );
  const [draft, setDraft] = useState<Record<string, string>>(snapshot);
  const [error, setError] = useState<string | null>(null);

  // Back/forward (or a cross-link) changed the applied values — resync the drafts.
  useEffect(() => setDraft(snapshot), [snapshot]);

  const applied = fields.some((f) => (values[f.param] ?? '') !== '');

  function apply(e: FormEvent) {
    e.preventDefault();
    const next: FilterValues = {};
    for (const f of fields) {
      const v = (draft[f.param] ?? '').trim();
      if (!v) continue;
      if (f.kind === 'digits' && !isDigits(v)) {
        setError(`${f.label} must be a number.`);
        return;
      }
      next[f.param] = v;
    }
    setError(null);
    onApply?.(next);
  }

  function clear() {
    setDraft(Object.fromEntries(fields.map((f) => [f.param, ''])));
    setError(null);
    onApply?.({});
  }

  return (
    <form onSubmit={apply} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        {fields.map((f) => {
          const id = `filter-${f.param}`;
          return (
            <div key={f.param} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-xs text-text-muted">
                {f.label}
              </label>
              <input
                id={id}
                value={draft[f.param] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.param]: e.target.value }))}
                placeholder={f.placeholder ?? ''}
                inputMode={f.kind === 'digits' ? 'numeric' : 'text'}
                className="w-40 rounded-lg border border-card-border bg-background-secondary px-2 py-1.5 font-mono text-sm text-text placeholder:text-text-muted focus:border-primary"
              />
            </div>
          );
        })}
        <button
          type="submit"
          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
        >
          Apply
        </button>
        {applied ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-card-border px-3 py-1.5 text-sm text-text-secondary hover:text-text"
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <InvalidInput message={error} /> : null}
    </form>
  );
}
