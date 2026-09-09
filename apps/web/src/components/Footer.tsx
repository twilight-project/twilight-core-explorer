'use client';

import { API_BASE_URL } from '@/lib/env';
import { useStatus } from '@/lib/api/queries';

// Footer picks up the two destinations the redesign removed from the primary nav — Diagnostics
// (operator plumbing) and the machine API (the OpenAPI spec) — plus the product's provenance
// (chain id, build), rendered from what /status already returns. A read-only product's
// provenance is part of its trust.
export function Footer() {
  const status = useStatus();
  const s = status.data?.data;
  const build = s?.build;
  const provenance = s
    ? [
        s.chainId,
        build?.version ? `v${build.version}` : null,
        build?.gitSha ? build.gitSha.slice(0, 7) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <footer className="border-t border-card-border">
      <div className="mx-auto w-full lg:w-[1432px] px-4 sm:px-6 lg:px-[156px] py-6 text-xs text-text-muted">
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <span>
            Twilight Explorer — read-only · native denom utwlt (TWLT).
            {provenance ? <span className="ml-2 font-mono">{provenance}</span> : null}
          </span>
          <span className="flex items-center gap-4">
            <a href="/diagnostics" className="hover:text-text">
              Diagnostics
            </a>
            <a href={`${API_BASE_URL}/openapi.json`} className="hover:text-text">
              API
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
