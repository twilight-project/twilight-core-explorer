import { render } from '@testing-library/react';
import { Server } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { CardHeader } from './Card';

describe('CardHeader icon slot', () => {
  it('renders a decorative (aria-hidden) category chip and keeps the title as the heading', () => {
    const { container, getByRole } = render(
      <CardHeader icon={Server} iconTone="coreslot" title="Validator set" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // Tone tints the chip (icon's parent) violet; neutral fallback dropped.
    expect(svg?.parentElement?.className).toContain('text-accent-violet');
    expect(svg?.parentElement?.className).not.toContain('bg-white/5');
    // The title remains the accessible section name.
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Validator set');
  });

  it('renders no icon (and no chip) when `icon` is omitted — unchanged existing behavior', () => {
    const { container, getByRole } = render(<CardHeader title="Params" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(getByRole('heading', { level: 2 }).textContent).toBe('Params');
  });
});
