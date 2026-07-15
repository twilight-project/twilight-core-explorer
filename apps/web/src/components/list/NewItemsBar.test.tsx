import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiGet: vi.fn(async () => ({
      data: {
        chainId: 'twilight-devnet-1',
        indexer: {
          lastIndexedHeight: '500',
          latestChainHeight: '200666',
          lagBlocks: '200166',
          status: 'indexing',
          lastIndexedHash: null,
          updatedAt: '1970-01-01T00:00:00.000Z',
          freshnessSeconds: 1,
          error: null,
        },
        projections: [],
        projectionFailures: { unresolvedCount: 0, byProjection: [] },
      },
    })),
  };
});

import { NewItemsBar } from './NewItemsBar';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('NewItemsBar', () => {
  it('offers a refresh once the indexer head passes the newest loaded row (BigInt delta)', async () => {
    const onRefresh = vi.fn();
    renderWithClient(
      <NewItemsBar
        newestLoadedHeight="450"
        label={(delta) => `${delta} new blocks — refresh`}
        onRefresh={onRefresh}
      />,
    );
    const button = await screen.findByRole('button', { name: '50 new blocks — refresh' });
    await userEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the newest loaded row IS the indexer head', async () => {
    const { container } = renderWithClient(
      <NewItemsBar newestLoadedHeight="500" label={(d) => d} onRefresh={() => {}} />,
    );
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing without a loaded row to compare against', () => {
    const { container } = renderWithClient(
      <NewItemsBar newestLoadedHeight={null} label={(d) => d} onRefresh={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
