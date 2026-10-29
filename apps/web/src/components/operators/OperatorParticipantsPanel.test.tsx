import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useOperatorParticipants } = vi.hoisted(() => ({ useOperatorParticipants: vi.fn() }));
vi.mock('@/lib/api/queries', () => ({ useOperatorParticipants }));

import { OperatorParticipantsPanel } from './OperatorParticipantsPanel';

const participant = (recipient: string) => ({
  recipient,
  epochsPaid: 2,
  totalReceived: '200',
  firstEpoch: '61',
  lastEpoch: '62',
});

function mockData(paidAll: number, rows: number) {
  useOperatorParticipants.mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      data: {
        paidAll,
        paid30: rows,
        denom: 'utwlt',
        provenance: 'chain',
        enrolled: null,
        participants: Array.from({ length: rows }, (_, i) => participant(`twilight1a${i}`)),
      },
    },
  });
}

afterEach(() => vi.resetAllMocks());

describe('OperatorParticipantsPanel', () => {
  it('says "top N of M" when the row cap truncates the list', () => {
    mockData(250, 100);
    render(<OperatorParticipantsPanel slotId="3" showAddresses />);
    expect(screen.getByText(/top 100 of 250/i)).toBeInTheDocument();
  });

  it('shows no truncation note when every paid address is listed', () => {
    mockData(2, 2);
    render(<OperatorParticipantsPanel slotId="3" showAddresses />);
    expect(screen.queryByText(/top \d+ of/i)).toBeNull();
  });

  it('the overview variant lists counts only, never addresses', () => {
    mockData(2, 2);
    render(<OperatorParticipantsPanel slotId="3" />);
    expect(screen.queryByText(/twilight1a0/)).toBeNull();
    expect(screen.getByText(/participants paid, all time/i)).toBeInTheDocument();
  });
});
