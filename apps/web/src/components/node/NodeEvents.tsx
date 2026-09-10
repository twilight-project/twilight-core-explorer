'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { useCoreSlotEvents } from '@/lib/api/queries';
import { formatAmount } from '@/lib/format/amount';
import { formatHeight } from '@/lib/format/height';
import { deriveSettlementState } from '@/lib/settlement-state';
import type { SettlementSlotSummary, SettlementStatusRow } from '@/lib/settlement-state';

// EVENTS feed (right rail): settlements + authority history, newest first, capped at 8.
// Dot vocabulary: mint = settled, red = late/missed, muted = lifecycle.

interface FeedItem {
  key: string;
  tone: 'mint' | 'red' | 'muted';
  text: string;
  when: string;
  sortHeight: bigint;
}

export function NodeEvents({
  slotId,
  statusRows,
  summary,
}: {
  slotId: string;
  statusRows: SettlementStatusRow[];
  summary: SettlementSlotSummary | undefined;
}) {
  const authority = useCoreSlotEvents(slotId);

  const items: FeedItem[] = [];
  for (const r of statusRows.slice(0, 6)) {
    const state = deriveSettlementState(r, summary);
    const amt = formatAmount(r.entitlementAmount, r.denom);
    if (r.settled && r.finalizedHeight) {
      items.push({
        key: `settle-${r.epochNumber}`,
        tone: 'mint',
        text: `Epoch ${r.epochNumber} settled · +${amt.display} ${amt.symbol}`,
        when: `block ${formatHeight(r.finalizedHeight)}`,
        sortHeight: BigInt(r.finalizedHeight),
      });
    } else if (state === 'late') {
      items.push({
        key: `late-${r.epochNumber}`,
        tone: 'red',
        text: `Epoch ${r.epochNumber} settlement is late`,
        when: r.openForBlocks ? `open ${r.openForBlocks} blocks` : '',
        sortHeight: r.epochCloseHeight ? BigInt(r.epochCloseHeight) : 0n,
      });
    }
  }
  for (const e of (authority.data?.pages[0]?.data ?? []).slice(0, 4)) {
    items.push({
      key: `auth-${e.eventId}`,
      tone: 'muted',
      text: `${e.kind.replace(/_/g, ' ')}`,
      when: `block ${formatHeight(e.height)}`,
      sortHeight: BigInt(e.height),
    });
  }
  items.sort((a, b) => (a.sortHeight === b.sortHeight ? 0 : a.sortHeight > b.sortHeight ? -1 : 1));

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="pb-2 font-mono text-xs text-text-muted">EVENTS</div>
      {items.slice(0, 8).map((it) => (
        <div
          key={it.key}
          className="grid grid-cols-[8px_1fr] gap-3 border-t border-card-hover py-2 text-[13px]"
        >
          <span
            aria-hidden="true"
            className={clsx(
              'mt-[5px] h-2 w-2 rounded-full',
              it.tone === 'mint' ? 'bg-primary' : it.tone === 'red' ? 'bg-accent-red' : 'bg-text-muted',
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span>{it.text}</span>
            <span className="font-mono text-[11.5px] text-text-muted">{it.when}</span>
          </span>
        </div>
      ))}
      <Link
        href="/node/settlements"
        className="pt-2 text-[13px] text-text-muted hover:text-text"
      >
        more →
      </Link>
    </div>
  );
}
