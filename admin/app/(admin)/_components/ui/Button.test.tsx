// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/link the same way Tabs.test.tsx does — plain <a> + forwardRef
// so our polymorphic Button can render through Link without a Next router
// context. Without this, Link's router.push() throws in jsdom.
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef<
      HTMLAnchorElement,
      React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
    >(function MockLink({ children, href, ...rest }, ref) {
      return React.createElement('a', { ref, href, ...rest }, children);
    }),
  };
});

import { Button } from './Button';

describe('Button — rendering', () => {
  it('renders a <button> with the label', () => {
    render(<Button>Spara</Button>);
    // getByRole throws if not found, so this asserts presence.
    const btn = screen.getByRole('button', { name: 'Spara' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('defaults to type="button" so it never auto-submits a form', () => {
    render(<Button>X</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('renders as <a> when href is provided', () => {
    render(<Button href="/foo">Open</Button>);
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link.getAttribute('href')).toBe('/foo');
    expect(link.tagName).toBe('A');
  });
});

describe('Button — dual-emit (Phase 1)', () => {
  it('emits both ui-btn and admin-btn classes', () => {
    render(<Button variant="primary">X</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('ui-btn');
    expect(btn.className).toContain('ui-btn--primary');
    expect(btn.className).toContain('admin-btn');
    expect(btn.className).toContain('admin-btn--accent');
  });

  it('maps each variant to its legacy admin-btn--<x>', () => {
    const cases: Array<['primary' | 'secondary' | 'ghost' | 'danger', string]> = [
      ['primary', 'admin-btn--accent'],
      ['secondary', 'admin-btn--outline'],
      ['ghost', 'admin-btn--ghost'],
      ['danger', 'admin-btn--danger'],
    ];
    for (const [variant, legacy] of cases) {
      const { unmount } = render(<Button variant={variant}>X</Button>);
      expect(screen.getByRole('button').className).toContain(legacy);
      unmount();
    }
  });

  it('emits admin-btn--sm only for size="sm"', () => {
    const { rerender } = render(<Button size="sm">X</Button>);
    expect(screen.getByRole('button').className).toContain('admin-btn--sm');

    rerender(<Button size="md">X</Button>);
    expect(screen.getByRole('button').className).not.toContain('admin-btn--sm');

    rerender(<Button size="lg">X</Button>);
    expect(screen.getByRole('button').className).not.toContain('admin-btn--sm');
  });
});

describe('Button — disabled / loading', () => {
  it('respects the disabled prop on the button element', () => {
    render(<Button disabled>X</Button>);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sets aria-busy and disables the button while loading', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
  });

  it('uses aria-disabled on the link variant (anchors lack `disabled`)', () => {
    render(
      <Button href="/foo" disabled>
        Open
      </Button>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
  });
});

describe('Button — interaction', () => {
  it('forwards onClick when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        X
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onClick when loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        X
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button — icons + spinner', () => {
  it('renders a leading icon span when leadingIcon is set', () => {
    const { container } = render(<Button leadingIcon="add">Skapa</Button>);
    const icon = container.querySelector('.ui-btn__icon');
    expect(icon).not.toBeNull();
    expect(icon?.textContent).toBe('add');
  });

  it('renders a trailing icon span when trailingIcon is set', () => {
    const { container } = render(<Button trailingIcon="arrow_forward">Next</Button>);
    const icon = container.querySelector('.ui-btn__icon');
    expect(icon?.textContent).toBe('arrow_forward');
  });

  it('replaces the leading icon with a spinner while loading', () => {
    const { container } = render(
      <Button loading leadingIcon="add">
        Saving
      </Button>,
    );
    expect(container.querySelector('.ui-btn__spinner')).not.toBeNull();
    // Spinner takes the leading icon's slot — no .ui-btn__icon should render.
    expect(container.querySelectorAll('.ui-btn__icon').length).toBe(0);
  });
});

describe('Button — ref forwarding', () => {
  it('forwards a ref to the underlying button element', () => {
    let received: HTMLButtonElement | HTMLAnchorElement | null = null;
    render(
      <Button
        ref={(node) => {
          received = node;
        }}
      >
        X
      </Button>,
    );
    expect(received).toBeInstanceOf(HTMLButtonElement);
  });

  it('forwards a ref to the underlying anchor element when href is set', () => {
    let received: HTMLButtonElement | HTMLAnchorElement | null = null;
    render(
      <Button
        href="/foo"
        ref={(node) => {
          received = node;
        }}
      >
        X
      </Button>,
    );
    expect(received).toBeInstanceOf(HTMLAnchorElement);
  });
});
