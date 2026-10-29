// Shared icon-chip tint vocabulary for KpiCard/StatCard. Each key maps to a faint category surface +
// a matching icon color, resolved from the theme's --accent-* tokens (so every tint tracks the active
// theme's palette). Domain tints (infra/coreslot/liveness/risk/rewards) color by metric FAMILY so a
// metric reads the same color on every page; `warn` is the one severity tint (amber) for watch/
// degraded states, reusing the same accent-yellow the "warning" status pills use.
//
// Color = which metric family (or watch severity); the status delta pill still owns health — the two
// channels never collide. Class strings are STATIC LITERALS (not built from the key) so Tailwind's JIT
// keeps them in the build; omitting a tone falls back to the card's neutral white-alpha/muted chrome.
export type IconTone = 'infra' | 'coreslot' | 'liveness' | 'risk' | 'rewards' | 'warn';

// The glyph is a BandGlyph (twilight.org band art): no chip surface, the text class sets
// currentColor, which is the top colour of every band — so the tone IS the legend.
export const ICON_TONE: Record<IconTone, string> = {
  infra: 'text-accent-blue',
  coreslot: 'text-accent-violet',
  liveness: 'text-accent-green',
  risk: 'text-accent-red',
  rewards: 'text-accent-gold',
  warn: 'text-accent-yellow',
};

/** Tone class for a glyph with no category: the theme's lavender. */
export const ICON_TONE_NEUTRAL = 'text-primary-light';
