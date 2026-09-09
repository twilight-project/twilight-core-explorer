import { render } from '@testing-library/react';
import { HeartPulse } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

describe('StatCard icon slot', () => {
  it('renders a decorative (aria-hidden) icon and keeps the label as the accessible name', () => {
    const { container, getByText } = render(
      <StatCard icon={HeartPulse} iconTone="liveness" label="Healthy" value="4" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // The tone tints the chip (icon's parent) green; the neutral fallback is dropped.
    expect(svg?.parentElement?.className).toContain('text-accent-green');
    expect(svg?.parentElement?.className).not.toContain('bg-white/5');
    expect(getByText('Healthy')).toBeTruthy();
  });

  it('falls back to the neutral chip when a toneless icon is given (e.g. "Unknown")', () => {
    const { container } = render(<StatCard icon={HeartPulse} label="Unknown" value="0" />);
    expect(container.querySelector('svg')?.parentElement?.className).toContain('text-text-muted');
  });

  it('renders no icon (and no chip) when `icon` is omitted — unchanged existing behavior', () => {
    const { container } = render(<StatCard label="Down" value="0" mono />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
