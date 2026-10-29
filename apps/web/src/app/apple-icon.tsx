import { ImageResponse } from 'next/og';
import { BRAND, HourglassMark } from './brand-image';

// iOS home-screen icon. iOS rounds the corners itself, so the ground is a full square.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.background,
        }}
      >
        <HourglassMark size={112} />
      </div>
    ),
    size,
  );
}
