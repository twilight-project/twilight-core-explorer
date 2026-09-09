import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, apiGet };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/liveness' }));

import { SigningHeatmap } from './SigningHeatmap';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => apiGet.mockReset());

describe('SigningHeatmap', () => {
  it('renders a slot row per CoreSlot with an accessible signed/missed summary', async () => {
    apiGet.mockResolvedValue({
      data: {
        window: 48,
        blocksInWindow: 3,
        fromHeight: '100',
        toHeight: '102',
        heights: ['100', '101', '102'],
        slots: [
          {
            slotId: '1',
            operatorAddress: 'twilight1op1',
            consensusAddress: 'c1',
            signed: 2,
            missed: 1,
            cells: ['signed', 'signed', 'missed'],
          },
          {
            slotId: '2',
            operatorAddress: null, // falls back to "slot 2"
            consensusAddress: 'c2',
            signed: 3,
            missed: 0,
            cells: ['signed', 'signed', 'signed'],
          },
        ],
      },
    });

    renderWithClient(<SigningHeatmap />);

    // Each row's cell strip is a labelled image summarising signed/missed (the a11y contract).
    expect(
      await screen.findByLabelText(/twilight1op1: 2 signed, 1 missed/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/slot 2: 3 signed, 0 missed/)).toBeInTheDocument();
    // Legend present.
    expect(screen.getByText('Signed')).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(screen.getByText('No evidence')).toBeInTheDocument();
  });

  it('shows an empty state when there is no signing evidence', async () => {
    apiGet.mockResolvedValue({
      data: {
        window: 48,
        blocksInWindow: 0,
        fromHeight: null,
        toHeight: null,
        heights: [],
        slots: [],
      },
    });
    renderWithClient(<SigningHeatmap />);
    expect(await screen.findByText('No per-block signing evidence yet.')).toBeInTheDocument();
  });
});
