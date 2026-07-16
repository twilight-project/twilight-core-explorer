'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// Global header search. Submits to the /search page, which calls /api/v1/search and resolves the
// typed result(s). The bar itself invents no search behavior.
//
// Two renderings:
// - inline (default): a full-width input — used in the sub-`lg` header row, which owns the row.
// - `overlay`: a compact icon trigger that expands into an input spanning the FULL header row,
//   over the nav. The desktop row's leftover width beside the 8-item nav is ~50px — no inline
//   input there can show a 64-char hash, so expansion must escape the flex slot entirely.
export function SearchBar({ overlay = false }: { overlay?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const input = (
    <input
      ref={inputRef}
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search height, hash, address, or CoreSlot…"
      aria-label="Search the explorer"
      // Overlay collapses on blur/Escape; the typed value survives for the next expansion.
      onBlur={overlay ? () => setOpen(false) : undefined}
      onKeyDown={
        overlay
          ? (e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
              }
            }
          : undefined
      }
      className="w-full rounded-xl border border-card-border bg-background-secondary py-2.5 pl-9 pr-3 font-mono text-sm text-text placeholder:font-sans placeholder:text-text-muted focus:border-primary"
    />
  );

  if (!overlay) {
    return (
      <form onSubmit={onSubmit} role="search" className="relative w-full">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        {input}
      </form>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="rounded-xl border border-card-border bg-background-secondary p-2.5 text-text-muted hover:text-text"
      >
        <Search size={16} aria-hidden />
      </button>
      {open ? (
        // Positioned against the header ROW (its nearest `relative` ancestor), over logo + nav.
        <form
          onSubmit={onSubmit}
          role="search"
          className="absolute inset-x-0 top-1/2 z-50 -translate-y-1/2"
        >
          <div className="relative shadow-card">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted"
            />
            {input}
          </div>
        </form>
      ) : null}
    </>
  );
}
