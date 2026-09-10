'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

// The control-room search: a bg-deep Fira Code prompt with a ⌘K focus shortcut. Accepts a
// height, a tx/block hash, an address, or `slot N` (parsed here → the slot page; everything
// else goes to /search, which resolves via /api/v1/search — the bar itself invents no
// search semantics beyond the one `slot N` convenience).
export function CommandSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    const slot = q.match(/^slot\s+(\d+)$/i);
    if (slot) {
      router.push(`/coreslots/${slot[1]}`);
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="flex min-w-0 flex-[1_1_200px] items-center gap-2.5 rounded-xl border border-card-border bg-background-secondary px-3 py-[7px] font-mono text-[12.5px] text-text-muted sm:max-w-[340px]"
    >
      <span aria-hidden="true" className="text-primary">
        ›
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="height, hash, address or slot"
        aria-label="Search the explorer"
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-text outline-none placeholder:text-text-muted"
      />
      <kbd
        aria-hidden="true"
        className="ml-auto hidden rounded border border-border-light px-[5px] text-[11px] sm:inline"
      >
        {isMac ? '⌘K' : '^K'}
      </kbd>
    </form>
  );
}
