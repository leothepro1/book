// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Input } from './Input';

describe('Input — rendering', () => {
  it('renders an <input>', () => {
    render(<Input aria-label="X" />);
    const node = screen.getByRole('textbox');
    expect(node.tagName).toBe('INPUT');
  });

  it('emits the ui-input base class', () => {
    render(<Input aria-label="X" />);
    expect(screen.getByRole('textbox').className).toContain('ui-input');
  });

  it('defaults to type="text"', () => {
    render(<Input aria-label="X" />);
    expect(
      (screen.getByRole('textbox') as HTMLInputElement).type,
    ).toBe('text');
  });

  it('respects the type prop', () => {
    render(<Input aria-label="X" type="email" />);
    expect(
      (screen.getByRole('textbox') as HTMLInputElement).type,
    ).toBe('email');
  });

  it('renders placeholder', () => {
    render(<Input aria-label="X" placeholder="Sök…" />);
    expect(
      (screen.getByRole('textbox') as HTMLInputElement).placeholder,
    ).toBe('Sök…');
  });

  it('forwards extra className', () => {
    render(<Input aria-label="X" className="my-class" />);
    expect(screen.getByRole('textbox').className).toContain('my-class');
  });
});

describe('Input — invalid', () => {
  it('adds ui-input--invalid + aria-invalid when invalid', () => {
    render(<Input aria-label="X" invalid />);
    const node = screen.getByRole('textbox');
    expect(node.className).toContain('ui-input--invalid');
    expect(node.getAttribute('aria-invalid')).toBe('true');
  });

  it('omits the invalid class when not invalid', () => {
    render(<Input aria-label="X" />);
    expect(screen.getByRole('textbox').className).not.toContain(
      'ui-input--invalid',
    );
  });
});

describe('Input — required', () => {
  it('sets aria-required when required', () => {
    render(<Input aria-label="X" required />);
    expect(screen.getByRole('textbox').getAttribute('aria-required')).toBe(
      'true',
    );
  });
});

describe('Input — controlled', () => {
  it('renders the controlled value', () => {
    render(<Input aria-label="X" value="hello" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      'hello',
    );
  });

  it('calls onChange with the new string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input aria-label="X" value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('Input — disabled', () => {
  it('uses the native disabled attribute', () => {
    render(<Input aria-label="X" disabled />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});

describe('Input — readOnly', () => {
  it('uses the native readOnly attribute', () => {
    render(<Input aria-label="X" readOnly value="locked" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).readOnly).toBe(
      true,
    );
  });
});

describe('Input — ref forwarding', () => {
  it('forwards a ref to the underlying input', () => {
    let received: HTMLInputElement | null = null;
    render(
      <Input
        aria-label="X"
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(HTMLInputElement);
  });
});
