// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Textarea } from './Textarea';

describe('Textarea — rendering', () => {
  it('renders a <textarea>', () => {
    render(<Textarea aria-label="X" />);
    const node = screen.getByRole('textbox');
    expect(node.tagName).toBe('TEXTAREA');
  });

  it('emits the ui-textarea base class', () => {
    render(<Textarea aria-label="X" />);
    expect(screen.getByRole('textbox').className).toContain('ui-textarea');
  });

  it('renders placeholder', () => {
    render(<Textarea aria-label="X" placeholder="Skriv något…" />);
    expect(
      (screen.getByRole('textbox') as HTMLTextAreaElement).placeholder,
    ).toBe('Skriv något…');
  });

  it('respects the rows prop', () => {
    render(<Textarea aria-label="X" rows={8} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).rows).toBe(8);
  });

  it('forwards extra className', () => {
    render(<Textarea aria-label="X" className="my-class" />);
    expect(screen.getByRole('textbox').className).toContain('my-class');
  });
});

describe('Textarea — invalid', () => {
  it('adds ui-textarea--invalid + aria-invalid when invalid', () => {
    render(<Textarea aria-label="X" invalid />);
    const node = screen.getByRole('textbox');
    expect(node.className).toContain('ui-textarea--invalid');
    expect(node.getAttribute('aria-invalid')).toBe('true');
  });

  it('omits the invalid class when not invalid', () => {
    render(<Textarea aria-label="X" />);
    expect(screen.getByRole('textbox').className).not.toContain(
      'ui-textarea--invalid',
    );
  });
});

describe('Textarea — required', () => {
  it('sets aria-required when required', () => {
    render(<Textarea aria-label="X" required />);
    expect(screen.getByRole('textbox').getAttribute('aria-required')).toBe(
      'true',
    );
  });
});

describe('Textarea — controlled', () => {
  it('renders the controlled value', () => {
    render(<Textarea aria-label="X" value="hello" onChange={() => {}} />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'hello',
    );
  });

  it('calls onChange with the new string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Textarea aria-label="X" value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('Textarea — disabled', () => {
  it('uses the native disabled attribute', () => {
    render(<Textarea aria-label="X" disabled />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
  });
});

describe('Textarea — ref forwarding', () => {
  it('forwards a ref to the underlying textarea', () => {
    let received: HTMLTextAreaElement | null = null;
    render(
      <Textarea
        aria-label="X"
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(HTMLTextAreaElement);
  });
});
