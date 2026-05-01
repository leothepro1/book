// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './Checkbox';

describe('Checkbox — rendering', () => {
  it('renders a button with role="checkbox"', () => {
    render(<Checkbox checked={false} onChange={() => {}} aria-label="X" />);
    expect(screen.getByRole('checkbox')).not.toBeNull();
  });

  it('emits ui-checkbox-row + .ui-checkbox child', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} aria-label="X" />,
    );
    expect(container.querySelector('.ui-checkbox-row')).not.toBeNull();
    expect(container.querySelector('.ui-checkbox')).not.toBeNull();
  });

  it('adds ui-checkbox--checked when checked=true', () => {
    const { container } = render(
      <Checkbox checked onChange={() => {}} aria-label="X" />,
    );
    expect(container.querySelector('.ui-checkbox--checked')).not.toBeNull();
  });

  it('omits ui-checkbox--checked when checked=false', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} aria-label="X" />,
    );
    expect(container.querySelector('.ui-checkbox--checked')).toBeNull();
  });

  it('renders the SVG checkmark', () => {
    const { container } = render(
      <Checkbox checked onChange={() => {}} aria-label="X" />,
    );
    expect(container.querySelector('.ui-checkbox__icon')).not.toBeNull();
  });
});

describe('Checkbox — label', () => {
  it('renders a label when label prop is set', () => {
    render(
      <Checkbox checked={false} onChange={() => {}} label="Acceptera villkor" />,
    );
    expect(screen.getByText('Acceptera villkor')).not.toBeNull();
  });

  it('does not render a label when label prop is omitted', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} aria-label="X" />,
    );
    expect(container.querySelector('.ui-checkbox__label')).toBeNull();
  });
});

describe('Checkbox — a11y', () => {
  it('sets aria-checked to match checked', () => {
    const { rerender } = render(
      <Checkbox checked={false} onChange={() => {}} aria-label="X" />,
    );
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe(
      'false',
    );
    rerender(<Checkbox checked onChange={() => {}} aria-label="X" />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('uses native disabled (not aria-disabled)', () => {
    render(<Checkbox checked={false} onChange={() => {}} disabled aria-label="X" />);
    expect((screen.getByRole('checkbox') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('Checkbox — interaction', () => {
  it('calls onChange with !checked on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} aria-label="X" />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('flips the value on each click (controlled)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Checkbox checked={false} onChange={onChange} aria-label="X" />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Checkbox checked onChange={onChange} aria-label="X" />);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onChange={onChange} disabled aria-label="X" />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking the label (whole row) toggles the checkbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onChange={onChange} label="Click me" />,
    );
    await user.click(screen.getByText('Click me'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Checkbox — ref forwarding', () => {
  it('forwards a ref to the underlying button', () => {
    let received: HTMLButtonElement | null = null;
    render(
      <Checkbox
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
