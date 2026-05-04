// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Toggle } from './Toggle';

describe('Toggle — rendering', () => {
  it('renders a button with role="switch"', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Test" />);
    expect(screen.getByRole('switch')).not.toBeNull();
  });

  it('emits ui-toggle and ui-toggle--md by default', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Test" />);
    const btn = screen.getByRole('switch');
    expect(btn.className).toContain('ui-toggle');
    expect(btn.className).toContain('ui-toggle--md');
  });

  it('emits ui-toggle--sm when size="sm"', () => {
    render(<Toggle checked={false} onChange={() => {}} size="sm" aria-label="X" />);
    expect(screen.getByRole('switch').className).toContain('ui-toggle--sm');
  });

  it('emits ui-toggle--checked when checked=true', () => {
    render(<Toggle checked onChange={() => {}} aria-label="X" />);
    expect(screen.getByRole('switch').className).toContain('ui-toggle--checked');
  });

  it('does not emit ui-toggle--checked when checked=false', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="X" />);
    expect(screen.getByRole('switch').className).not.toContain('ui-toggle--checked');
  });
});

describe('Toggle — a11y', () => {
  it('sets aria-checked to match the checked prop', () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} aria-label="X" />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    rerender(<Toggle checked onChange={() => {}} aria-label="X" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('forwards aria-label and aria-labelledby', () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} aria-label="Påslagen" />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('Påslagen');
    rerender(
      <Toggle
        checked={false}
        onChange={() => {}}
        aria-labelledby="label-id"
      />,
    );
    expect(screen.getByRole('switch').getAttribute('aria-labelledby')).toBe(
      'label-id',
    );
  });

  it('uses the native disabled attribute (not aria-disabled)', () => {
    render(<Toggle checked={false} onChange={() => {}} disabled aria-label="X" />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Toggle — interaction', () => {
  it('calls onChange with !checked when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} aria-label="X" />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('flips the value on each click (controlled)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Toggle checked={false} onChange={onChange} aria-label="X" />,
    );
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Toggle checked onChange={onChange} aria-label="X" />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Toggle checked={false} onChange={onChange} disabled aria-label="X" />,
    );
    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Toggle — ref forwarding', () => {
  it('forwards a ref to the underlying button', () => {
    let received: HTMLButtonElement | null = null;
    render(
      <Toggle
        checked={false}
        onChange={() => {}}
        aria-label="X"
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(HTMLButtonElement);
  });
});
