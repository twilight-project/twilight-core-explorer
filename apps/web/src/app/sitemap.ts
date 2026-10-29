import type { MetadataRoute } from 'next';
import { SITE_URL } from './site-url';

// Top-level sections only. Detail pages (blocks, txs, accounts, slots) are reachable from these
// and change every few seconds, so listing them would just churn the sitemap. Redirecting paths
// (/operators -> /slots?tab=operators) stay out: a sitemap entry should be a destination.
const SECTIONS: Array<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/blocks', priority: 0.8 },
  { path: '/txs', priority: 0.8 },
  { path: '/accounts', priority: 0.6 },
  { path: '/slots', priority: 0.8 },
  { path: '/economy', priority: 0.7 },
  { path: '/chain', priority: 0.5 },
  { path: '/node', priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return SECTIONS.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: 'always',
    priority,
  }));
}
