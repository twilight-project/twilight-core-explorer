'use client';

import { API_BASE_URL } from '@/lib/env';
import { useStatus } from '@/lib/api/queries';

// Control-room footer: one centered Fira Code line — provenance (chain id) plus the
// operator/machine destinations that live below the fold by design.
export function Footer() {
  const status = useStatus();
  const chainId = status.data?.data.chainId;

  return (
    <footer className="border-t border-card-border">
      <div className="flex items-center justify-center gap-6 px-5 py-4 font-mono text-[11.5px] text-text-muted">
        <span>{chainId ?? '…'}</span>
        <a href="/diagnostics" className="hover:text-text">
          diagnostics
        </a>
        {/* /docs (Swagger UI) is registered non-prod only — the spec is the stable machine surface. */}
        <a href={`${API_BASE_URL}/openapi.json`} className="hover:text-text">
          api
        </a>
      </div>
    </footer>
  );
}
