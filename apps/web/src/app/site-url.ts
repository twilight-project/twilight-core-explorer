// Absolute origin for canonical/OG URLs, the sitemap and robots.txt. NEXT_PUBLIC_SITE_URL is
// inlined at build time; set it for a deployment on another hostname.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://explorer.twilight.org').replace(
  /\/+$/,
  '',
);
