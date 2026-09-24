// Slot-field display normalizers.

/** "1.000000000000000000" → "1.000" — string-safe, never Number() (weights are decimals). */
export function formatRewardWeight(raw: string | null | undefined): string {
  if (!raw) return '—';
  const [whole = '0', frac = ''] = raw.split('.');
  return `${whole}.${(frac + '000').slice(0, 3)}`;
}

/** The chain stores two spellings ('ACTIVE' from the genesis seed, 'SLOT_STATUS_ACTIVE' from
 *  events) — one display word, lowercase, prefix stripped. Tone checks get the same value. */
export function formatSlotStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/^SLOT_STATUS_/i, '').toLowerCase();
}
