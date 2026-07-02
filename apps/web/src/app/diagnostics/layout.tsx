import type { ReactNode } from 'react';

// Diagnostics is a client component, so its title is set here (server layout) — M-005.
export const metadata = { title: 'Diagnostics' };

export default function DiagnosticsLayout({ children }: { children: ReactNode }) {
  return children;
}
