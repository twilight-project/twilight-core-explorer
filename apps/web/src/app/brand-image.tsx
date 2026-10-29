// Shared artwork for the generated brand images (apple-icon, opengraph-image, twitter-image).
// Rendered by next/og at build time, so only inline styles and plain SVG are available here —
// no Tailwind classes and no CSS variables. Colours are the dark-theme brand tokens.

export const BRAND = {
  background: '#050505',
  card: '#0A0A0C',
  hairline: '#1F1F23',
  gold: '#E89E28',
  text: '#F5F5F4',
  muted: '#A1A1AA',
} as const;

export const SITE_NAME = 'Twilight Core Explorer';
export const SITE_DESCRIPTION =
  'Operator-grade explorer for Twilight Core — CoreSlot PoA, liveness, rewards, and network health.';

// The official hourglass mark (same path as components/brand/Logo.tsx), in brand gold.
export function HourglassMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-1 -1 19 20" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.52165e-06 0.582764L16.9654 0.582767L8.51652 9.12973C5.67768 9.06243 1.35437e-06 7.25881 2.52165e-06 0.582764ZM16.9654 17.835L-3.01647e-06 17.835L8.44893 9.12973C11.2878 9.19827 16.9654 11.0353 16.9654 17.835Z"
        fill={BRAND.gold}
      />
    </svg>
  );
}
