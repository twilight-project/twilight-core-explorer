import type { MetadataRoute } from 'next';
import { SITE_URL } from './site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Search results and the in-app diagnostics page are not useful landing pages.
      disallow: ['/search', '/diagnostics'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
