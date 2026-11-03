import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryDay, HistoryUndated } from '@/lib/operator-dashboard';

const { useOperatorHistory, useOperatorProfile, useOperatorParticipants } = vi.hoisted(() => ({
  useOperatorHistory: vi.fn(),
  useOperatorProfile: vi.fn(),
  useOperatorParticipants: vi.fn(),
}));
vi.mock('@/lib/api/queries', () => ({ useOperatorHistory, useOperatorProfile, useOperatorParticipants }));
// The charts draw on a canvas; the figures under test are plain text.
vi.mock('@/components/charts/EChart', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/charts/EChart')>()),
  EChart: () => null,
}));

import { OperatorDashboard } from './OperatorDashboard';

function day(over: Partial<HistoryDay> & { day: string }): HistoryDay {
  return {
    firstEpoch: '1',
    lastEpoch: '45',
    epochs: 45,
    settledEpochs: 45,
    entitlement: '1685569500',
    paid: '973884600',
    kept: '711684900',
    payouts: 2,
    activeMiners: 2,
    newMiners: 2,
    medianLatencyBlocks: '518',
    feed: { epochs: 0, avgEnrolled: null, maxEnrolled: null, admitted: null, provenance: 'attested' },
    ...over,
  };
}

const UNDATED: HistoryUndated = {
  epochs: 2,
  settledEpochs: 1,
  entitlement: '300000000',
  paid: '250000000',
  kept: '50000000',
  payouts: 3,
};
const NO_UNDATED: HistoryUndated = { ...UNDATED, epochs: 0, settledEpochs: 0, entitlement: '0', paid: '0', kept: '0', payouts: 0 };

function mockHistory(days: HistoryDay[], undated: HistoryUndated) {
  useOperatorHistory.mockReturnValue({ isPending: false, isError: false, data: { data: { days, undated } } });
  useOperatorProfile.mockReturnValue({ data: undefined });
  useOperatorParticipants.mockReturnValue({ data: undefined });
}

afterEach(() => vi.resetAllMocks());

describe('OperatorDashboard', () => {
  it('renders the all-time figures when every owed epoch is still undated (#109)', () => {
    mockHistory([], UNDATED);
    render(<OperatorDashboard slotId="3" />);
    expect(screen.getByRole('region', { name: 'Operator dashboard' })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('from 2 epochs with no close time yet')).toBeInTheDocument();
    expect(screen.getByText(/includes 250 TWLT from 2 epochs with no close time yet/)).toBeInTheDocument();
    expect(screen.getByText('No dated history yet')).toBeInTheDocument();
  });

  it('renders nothing when the slot has no owed epoch at all', () => {
    mockHistory([], NO_UNDATED);
    const { container } = render(<OperatorDashboard slotId="3" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the dated-only parts when undated epochs add to the all-time total', () => {
    mockHistory([day({ day: '2026-10-07' })], UNDATED);
    render(<OperatorDashboard slotId="3" />);
    expect(screen.getByText(/, plus 2 epochs with no close time yet$/)).toBeInTheDocument();
    expect(screen.getByText(/chart counts dated epochs only, 250 undated/)).toBeInTheDocument();
    expect(screen.queryByText('No dated history yet')).toBeNull();
  });
});
