import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME } from './site-meta';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'Twilight Explorer',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#E7EAF3',
    theme_color: '#E7EAF3',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  };
}
