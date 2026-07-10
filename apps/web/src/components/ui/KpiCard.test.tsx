import { render } from '@testing-library/react';
import { Server } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { KpiCard } from './KpiCard';

describe('KpiCard icon slot', () => {
  it('renders a decorative (aria-hidden) icon when `icon` is provided, keeping the label as the name', () => {
    const { container, getByText } = render(
      <KpiCard icon={Server} label="Active CoreSlots" value="4" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Decorative: the glyph must not add an accessible name — the label is the sole name.
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(getByText('Active CoreSlots')).toBeTruthy();
  });

  it('renders no icon when `icon` is omitted (unchanged existing behavior)', () => {
    const { container } = render(<KpiCard label="Halt risk" value="Normal" mono={false} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('tints the chip by category when `iconTone` is set (color = domain, not the neutral chrome)', () => {
    const { container } = render(
      <KpiCard icon={Server} iconTone="coreslot" label="Active CoreSlots" value="4" />,
    );
    // The immediate parent of the glyph is the chip; a toned chip drops the neutral fallback classes.
    const chip = container.querySelector('svg')?.parentElement;
    expect(chip?.className).toContain('text-accent-violet');
    expect(chip?.className).not.toContain('bg-white/5');
  });

  it('keeps the neutral chip when `iconTone` is omitted', () => {
    const { container } = render(<KpiCard icon={Server} label="Latest height" value="1" />);
    const chip = container.querySelector('svg')?.parentElement;
    expect(chip?.className).toContain('text-text-muted');
  });
});
