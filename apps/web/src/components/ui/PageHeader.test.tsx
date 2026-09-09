import { render } from '@testing-library/react';
import { Award } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader icon slot', () => {
  it('renders a decorative (aria-hidden) domain tile and keeps the title as the h1', () => {
    const { container, getByRole } = render(
      <PageHeader icon={Award} iconTone="rewards" eyebrow="Rewards" title="CoreSlot rewards" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.parentElement?.className).toContain('text-accent-gold');
    // The h1 stays the page's accessible name (icon adds no name).
    expect(getByRole('heading', { level: 1 }).textContent).toBe('CoreSlot rewards');
  });

  it('renders no tile when `icon` is omitted — unchanged existing behavior', () => {
    const { container } = render(<PageHeader eyebrow="Supply" title="Token supply" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
