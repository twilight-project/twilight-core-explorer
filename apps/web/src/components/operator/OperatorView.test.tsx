import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useOperatorResolution } = vi.hoisted(() => ({
  useOperatorResolution: vi.fn(),
}));
vi.mock('@/lib/api/queries', () => ({ useOperatorResolution }));
// The profile is its own heavily-queried component — stub it; this test owns RESOLUTION only.
vi.mock('@/components/operators/OperatorProfile', () => ({
  OperatorProfile: ({ slotId }: { slotId: string }) => (
    <div data-testid="operator-profile">profile:{slotId}</div>
  ),
}));

import { OperatorView } from './OperatorView';

const slot = (slotId: string) => ({
  slotId,
  status: 'active',
  operatorAddress: 'twilight1op',
  payoutAddress: null,
  consensusAddress: 'cons',
  consensusPower: '1',
  rewardWeight: '1',
  createdHeight: '1',
  updatedHeight: '2',
  removedHeight: null,
});

afterEach(() => vi.clearAllMocks());

describe('OperatorView (phase 15: resolves an address to its operator profile)', () => {
  it('single match: role badge + renders the profile for the resolved slot', () => {
    useOperatorResolution.mockReturnValue({
      isPending: false,
      isError: false,
      data: { matchedRole: 'operator', slots: [slot('2')] },
    });
    render(<OperatorView address="twilight1op" />);
    expect(screen.getByText('matched by operator address')).toBeInTheDocument();
    expect(screen.getByTestId('operator-profile')).toHaveTextContent('profile:2');
  });

  it('multi-slot anomaly is surfaced and the FIRST slot renders', () => {
    useOperatorResolution.mockReturnValue({
      isPending: false,
      isError: false,
      data: { matchedRole: 'payout', slots: [slot('2'), slot('7')] },
    });
    render(<OperatorView address="twilight1pay" />);
    expect(screen.getByText(/Multiple CoreSlots matched/)).toBeInTheDocument();
    expect(screen.getByTestId('operator-profile')).toHaveTextContent('profile:2');
  });

  it('no match: honest empty state, no profile', () => {
    useOperatorResolution.mockReturnValue({
      isPending: false,
      isError: false,
      data: { matchedRole: null, slots: [] },
    });
    render(<OperatorView address="twilight1nobody" />);
    expect(screen.getByText(/No CoreSlot found/)).toBeInTheDocument();
    expect(screen.queryByTestId('operator-profile')).not.toBeInTheDocument();
  });

  it('pending renders the loading shell', () => {
    useOperatorResolution.mockReturnValue({ isPending: true, isError: false });
    render(<OperatorView address="twilight1op" />);
    expect(screen.queryByTestId('operator-profile')).not.toBeInTheDocument();
  });
});
