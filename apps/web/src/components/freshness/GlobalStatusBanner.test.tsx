import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock the API client: the banner's three states are driven entirely by /status.
const state: { status: () => unknown } = { status: () => ({}) };

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiGet: vi.fn(async () => state.status()),
  };
});

import { ApiError, ERROR_CODES } from '@/lib/api/client';
import { GlobalStatusBanner } from './GlobalStatusBanner';

const statusFixture = (indexer: Record<string, unknown> | null) => ({
  data: {
    chainId: 'twilight-devnet-1',
    indexer,
    projections: [],
    projectionFailures: { unresolvedCount: 0, byProjection: [] },
  },
});

const indexerFixture = (lagBlocks: string) => ({
  lastIndexedHeight: '369',
  latestChainHeight: '200666',
  lagBlocks,
  status: 'indexing',
  lastIndexedHash: null,
  updatedAt: '1970-01-01T00:00:00.000Z',
  freshnessSeconds: 1,
  error: null,
});

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('GlobalStatusBanner', () => {
  it('announces indexer lag with heights and supports dismissal', async () => {
    state.status = () => statusFixture(indexerFixture('200,297'.replace(/,/g, '')));
    renderWithClient(<GlobalStatusBanner />);
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('blocks behind chain tip');
    expect(banner.textContent).toContain('369');
    expect(banner.textContent).toContain('200,666');

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing when the indexer is synced', async () => {
    state.status = () => statusFixture(indexerFixture('0'));
    const { container } = renderWithClient(<GlobalStatusBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('alerts with a Retry action when the API is unreachable', async () => {
    state.status = () => {
      throw new ApiError(ERROR_CODES.networkUnavailable, 'unreachable', 0);
    };
    renderWithClient(<GlobalStatusBanner />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('API unreachable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
