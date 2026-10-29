import { ImageResponse } from 'next/og';
import { BRAND, HourglassMark, SITE_NAME } from './brand-image';

// Link-preview card (1200x630, the size X, LinkedIn, Slack, Discord and Telegram all crop to).
export const alt = `${SITE_NAME} — CoreSlot PoA, liveness, rewards and network health`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PILLARS = ['CoreSlot PoA', 'Liveness', 'Rewards', 'Network health'];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: BRAND.background,
          backgroundImage: `radial-gradient(circle at 85% 15%, rgba(232, 158, 40, 0.18), transparent 55%)`,
          color: BRAND.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <HourglassMark size={64} />
          <div style={{ display: 'flex', fontSize: 34, letterSpacing: -0.5 }}>Twilight</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', fontSize: 84, lineHeight: 1.05, letterSpacing: -2 }}>
            Core Explorer
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: BRAND.muted, maxWidth: 900 }}>
            Blocks, transactions, slots and operator rewards on the Twilight testnet.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            {PILLARS.map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  padding: '10px 20px',
                  borderRadius: 999,
                  border: `1px solid ${BRAND.hairline}`,
                  background: BRAND.card,
                  fontSize: 22,
                  color: BRAND.text,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: BRAND.gold }}>explorer.twilight.org</div>
        </div>
      </div>
    ),
    size,
  );
}
