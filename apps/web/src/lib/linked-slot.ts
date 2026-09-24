// The viewer's linked CoreSlot — the "My node" identity. Purely client-side (localStorage):
// linking is a per-browser convenience, never an authentication. Wrapped in try/catch because
// storage can be unavailable (private mode, blocked site data) — then the viewer simply has no
// linked slot and the UI falls back to Chain mode / the link prompt.

export interface LinkedSlot {
  slotId: string;
  /** Operator address the slot was linked from, when known (moniker lookups, "you" tags). */
  operatorAddress?: string | undefined;
}

const KEY = 'tw-linked-slot';

export function getLinkedSlot(): LinkedSlot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { slotId?: unknown }).slotId === 'string' &&
      /^\d+$/.test((parsed as { slotId: string }).slotId)
    ) {
      const p = parsed as { slotId: string; operatorAddress?: unknown };
      return {
        slotId: p.slotId,
        operatorAddress:
          typeof p.operatorAddress === 'string' ? p.operatorAddress : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function setLinkedSlot(slot: LinkedSlot | null): void {
  try {
    if (slot === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(slot));
  } catch {
    // non-fatal: the link just won't persist
  }
}
