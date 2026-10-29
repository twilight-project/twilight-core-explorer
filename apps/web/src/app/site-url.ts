// Absolute origin for canonical/OG URLs, the sitemap and robots.txt. NEXT_PUBLIC_SITE_URL is
// inlined at build time; set it for a deployment on another hostname. `||`, not `??`: the Docker
// build passes the ARG through as an EMPTY string when it is unset, and `new URL('')` (layout's
// metadataBase) throws — empty must fall back to the default exactly like unset.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://explorer.twilight.org').replace(
  /\/+$/,
  '',
);
