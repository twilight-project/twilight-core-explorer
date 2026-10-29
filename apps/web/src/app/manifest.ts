import type { MetadataRoute } from 'next';
import { BRAND, SITE_DESCRIPTION, SITE_NAME } from './brand-image';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Twilight Explorer',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: BRAND.background,
    theme_color: BRAND.background,
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  };
}
