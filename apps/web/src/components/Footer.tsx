import { API_BASE_URL } from '@/lib/env';

// Footer picks up the two destinations the redesign removed from the primary nav:
// Diagnostics (operator plumbing) and the machine API (the OpenAPI spec).
export function Footer() {
  return (
    <footer className="border-t border-card-border">
      <div className="mx-auto w-full lg:w-[1432px] px-4 sm:px-6 lg:px-[156px] py-6 text-xs text-text-muted">
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <span>Twilight Explorer — read-only · native denom utwlt (TWLT).</span>
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
