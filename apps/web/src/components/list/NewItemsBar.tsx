'use client';

import { useStatus } from '@/lib/api/queries';

// Appears above a keyset list when the indexer head has advanced past the newest loaded row.
// Refreshing is the caller's job (usually a queryClient.resetQueries back to page one) — a
// keyset list must restart from the newest cursor, not refetch every loaded page.
export function NewItemsBar({
  newestLoadedHeight,
  label,
  onRefresh,
}: {
  newestLoadedHeight: string | null | undefined;
  /** Builds the button text from the block-height delta (a count of BLOCKS, not rows). */
  label: (deltaBlocks: string) => string;
  onRefresh: () => void;
}) {
  const status = useStatus();
  const head = status.data?.data.indexer?.lastIndexedHeight;
  if (
    !newestLoadedHeight ||
    !head ||
    !/^\d+$/.test(head) ||
    !/^\d+$/.test(newestLoadedHeight)
  ) {
    return null;
  }
  const delta = BigInt(head) - BigInt(newestLoadedHeight);
  if (delta <= 0n) return null;
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="w-full rounded-xl border border-primary/30 bg-primary/10 py-2 text-sm text-primary hover:bg-primary/20"
    >
      {label(delta.toString())}
    </button>
  );
}
