import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimingCard } from './ClaimingCard';

describe('ClaimingCard (non-actionable release explainer)', () => {
  it('explains entitlement -> settlement release without offering an action', () => {
    render(<ClaimingCard />);
    expect(screen.getByText(/There is no claim action/)).toBeInTheDocument();
    expect(screen.getByText(/x\/mining settlement/)).toBeInTheDocument();
  });

  it('never renders an actionable control', () => {
    render(<ClaimingCard />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not advertise the retired claim CLI command', () => {
    // twilight-core aa568f61 deleted MsgClaimRewards; `twilightd rewards claim` no longer
    // exists, so documenting it would send operators to a command that cannot work.
    const { container } = render(<ClaimingCard />);
    expect(container.textContent).not.toMatch(/twilightd rewards claim/);
    expect(container.textContent).not.toMatch(/claim now/i);
  });
});
