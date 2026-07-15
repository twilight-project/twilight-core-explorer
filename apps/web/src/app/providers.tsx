'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { isRetryable } from '@/lib/api/client';

// Client-leaning posture: a single browser QueryClient owns all API data. No RSC server-fetching.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            // Only transient transport failures are worth retrying; structured API answers
            // (not_found, invalid_*, not_ready) are definitive and retrying them just delays
            // the common "not indexed yet" case during backfill.
            retry: (failureCount, error) => isRetryable(error) && failureCount < 2,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 5_000),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
