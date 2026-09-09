'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { HandCoins } from 'lucide-react';

// The participant's door: an address in, that address's reward history out. The header search
// already resolves addresses — this states the intent on the one page a participant lands on.
export function AddressDoor() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (q.length === 0) return;
    router.push(`/accounts/${encodeURIComponent(q)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2.5 rounded-2xl border border-card-border bg-card px-5 py-4 sm:flex-row sm:items-center"
    >
      <label
        htmlFor="address-door"
        className="flex shrink-0 items-center gap-2 text-sm text-text-secondary"
      >
        <HandCoins size={16} className="text-primary" aria-hidden />
        Check rewards for an address
      </label>
      <input
        id="address-door"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="twilight1…"
        className="w-full rounded-xl border border-card-border bg-background-secondary px-3.5 py-2 font-mono text-sm text-text placeholder:text-text-muted focus:border-primary"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-card-border bg-background-tertiary px-4 py-2 text-sm text-text hover:border-border-light"
      >
        Look up
      </button>
    </form>
  );
}
