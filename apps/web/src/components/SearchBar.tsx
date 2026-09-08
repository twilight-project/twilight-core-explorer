'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// Global header search. Submits to the /search page, which calls /api/v1/search and resolves the
// typed result(s). The bar itself invents no search behavior.
//
// The redesign's 4-item nav leaves room for a REAL, always-visible input on desktop, so the old
// expand-on-focus overlay is gone. `shortcut` adds the "/" affordance: a kbd hint in the input
// and a global keybinding that focuses it (ignored while any editable element has focus).
export function SearchBar({ shortcut = false }: { shortcut?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative w-full">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search hash, height, address…"
        aria-label="Search the explorer"
        className="w-full rounded-xl border border-card-border bg-background-secondary py-2 pl-9 pr-8 font-mono text-sm text-text placeholder:font-sans placeholder:text-text-muted focus:border-primary"
      />
      {shortcut ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border-light px-1.5 font-mono text-[11px] text-text-muted"
        >
          /
        </kbd>
      ) : null}
    </form>
  );
}
