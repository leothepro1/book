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

describe('Button — class emission', () => {
  it('emits ui-btn base + variant + size class', () => {
    render(<Button variant="primary" size="md">X</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('ui-btn');
    expect(btn.className).toContain('ui-btn--primary');
    expect(btn.className).toContain('ui-btn--md');
  });

  it('emits the correct ui-btn--<variant> class for each variant', () => {
    const variants: Array<'primary' | 'secondary' | 'accent' | 'ghost' | 'danger'> = [
      'primary',
      'secondary',
      'accent',
      'ghost',
      'danger',
    ];
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>X</Button>);
      expect(screen.getByRole('button').className).toContain(`ui-btn--${variant}`);
      unmount();
    }
  });

  it('does not emit the legacy admin-btn class (dual-emit removed)', () => {
    render(<Button variant="primary">X</Button>);
    expect(screen.getByRole('button').className).not.toContain('admin-btn');
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

  it('overlays a Spinner while keeping idle content in the DOM for width preservation', () => {
    const { container } = render(
      <Button loading leadingIcon="add">
        Saving
      </Button>,
    );
    // Spinner overlay renders the standalone <Spinner> inside .ui-btn__spinner-overlay
    expect(container.querySelector('.ui-btn__spinner-overlay .ui-spinner')).not.toBeNull();
    // The original icon and label remain in the DOM so the button's
    // width stays identical between idle and loading. CSS hides them
    // via `visibility: hidden` (asserted indirectly via class match).
    expect(container.querySelectorAll('.ui-btn__icon').length).toBe(1);
    expect(container.querySelector('.ui-btn__label')?.textContent).toBe('Saving');
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
