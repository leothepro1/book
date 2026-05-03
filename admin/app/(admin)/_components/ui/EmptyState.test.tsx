// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { EmptyState } from './EmptyState';

describe('EmptyState — rendering', () => {
  it('renders the title', () => {
    render(<EmptyState title="Inga ordrar än" />);
    expect(screen.getByText('Inga ordrar än')).not.toBeNull();
  });

  it('emits ui-empty-state base class', () => {
    const { container } = render(<EmptyState title="X" />);
    expect(container.querySelector('.ui-empty-state')).not.toBeNull();
  });

  it('renders the title as a level-2 heading', () => {
    render(<EmptyState title="Heading" />);
    const h = screen.getByRole('heading', { level: 2 });
    expect(h.textContent).toBe('Heading');
    expect(h.className).toContain('ui-empty-state__title');
  });

  it('forwards extra className', () => {
    const { container } = render(<EmptyState title="X" className="extra" />);
    expect(container.querySelector('.ui-empty-state.extra')).not.toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(
      <EmptyState icon="inventory_2" title="Inga produkter" />,
    );
    const icon = container.querySelector('.ui-empty-state__icon');
    expect(icon?.textContent).toBe('inventory_2');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the description when provided', () => {
    render(
      <EmptyState
        title="Inga produkter"
        description="Lägg till din första produkt."
      />,
    );
    expect(screen.getByText('Lägg till din första produkt.')).not.toBeNull();
  });
});

describe('EmptyState — blank slate (no actions)', () => {
  it('omits the actions row when no actions are provided', () => {
    const { container } = render(
      <EmptyState
        icon="inbox"
        title="Inga ordrar"
        description="Inget att visa än."
      />,
    );
    expect(container.querySelector('.ui-empty-state__actions')).toBeNull();
  });
});

describe('EmptyState — informational (with actions)', () => {
  it('renders primary action as a primary sm Button', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="X"
        primaryAction={{ label: 'Skapa produkt', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Skapa produkt' });
    expect(btn.className).toContain('ui-btn--primary');
    expect(btn.className).toContain('ui-btn--sm');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action as a secondary sm Button', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="X"
        secondaryAction={{ label: 'Läs mer', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Läs mer' });
    expect(btn.className).toContain('ui-btn--secondary');
    expect(btn.className).toContain('ui-btn--sm');
  });

  it('renders an href action as a link', () => {
    render(
      <EmptyState
        title="X"
        primaryAction={{ label: 'Skapa', href: '/products/new' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Skapa' });
    expect(link.getAttribute('href')).toBe('/products/new');
  });

  it('renders both actions side by side, primary first', () => {
    const { container } = render(
      <EmptyState
        title="X"
        primaryAction={{ label: 'Skapa', onClick: () => {} }}
        secondaryAction={{ label: 'Läs mer', onClick: () => {} }}
      />,
    );
    const buttons = container.querySelectorAll(
      '.ui-empty-state__actions button',
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Skapa');
    expect(buttons[0].className).toContain('ui-btn--primary');
    expect(buttons[1].textContent).toContain('Läs mer');
    expect(buttons[1].className).toContain('ui-btn--secondary');
  });
});

describe('EmptyState — ref forwarding', () => {
  it('forwards a ref to the outer div', () => {
    let received: HTMLDivElement | null = null;
    render(
      <EmptyState
        title="X"
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(HTMLDivElement);
  });
});
