// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Choicebox, ChoiceboxGroup } from './Choicebox';

describe('ChoiceboxGroup — radio (single-select)', () => {
  it('renders a radiogroup with role=radio items', () => {
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={() => {}}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    expect(screen.getByRole('radiogroup')).not.toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the selected item with aria-checked=true', () => {
    render(
      <ChoiceboxGroup type="radio" value="b" onChange={() => {}}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    const a = screen.getByRole('radio', { name: 'A' });
    const b = screen.getByRole('radio', { name: 'B' });
    expect(a.getAttribute('aria-checked')).toBe('false');
    expect(b.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onChange with the new value on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={onChange}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not fire onChange when re-clicking the selected radio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={onChange}>
        <Choicebox value="a" title="A" />
      </ChoiceboxGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ChoiceboxGroup — checkbox (multi-select)', () => {
  it('renders a group with role=checkbox items', () => {
    render(
      <ChoiceboxGroup type="checkbox" values={[]} onChange={() => {}}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    expect(screen.getByRole('group')).not.toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('marks each selected item with aria-checked=true', () => {
    render(
      <ChoiceboxGroup type="checkbox" values={['a', 'c']} onChange={() => {}}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
        <Choicebox value="c" title="C" />
      </ChoiceboxGroup>,
    );
    expect(
      screen.getByRole('checkbox', { name: 'A' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('checkbox', { name: 'B' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen.getByRole('checkbox', { name: 'C' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('toggles the value on click — adds when off', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceboxGroup type="checkbox" values={['a']} onChange={onChange}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    await user.click(screen.getByRole('checkbox', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('toggles the value on click — removes when on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceboxGroup type="checkbox" values={['a', 'b']} onChange={onChange}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    await user.click(screen.getByRole('checkbox', { name: 'A' }));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });
});

describe('ChoiceboxGroup — disabled', () => {
  it('disables every item when group disabled=true', () => {
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={() => {}} disabled>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" />
      </ChoiceboxGroup>,
    );
    expect(
      (screen.getByRole('radio', { name: 'A' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'B' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('disables a single item via item-level disabled', () => {
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={() => {}}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" disabled />
      </ChoiceboxGroup>,
    );
    expect(
      (screen.getByRole('radio', { name: 'A' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole('radio', { name: 'B' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not call onChange when a disabled item is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={onChange}>
        <Choicebox value="a" title="A" />
        <Choicebox value="b" title="B" disabled />
      </ChoiceboxGroup>,
    );
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Choicebox — body content', () => {
  it('renders title and description', () => {
    render(
      <ChoiceboxGroup type="radio" value="a" onChange={() => {}}>
        <Choicebox value="a" title="Standard" description="3–5 dagar" />
      </ChoiceboxGroup>,
    );
    expect(screen.getByText('Standard')).not.toBeNull();
    expect(screen.getByText('3–5 dagar')).not.toBeNull();
  });

  it('omits description span when no description prop', () => {
    const { container } = render(
      <ChoiceboxGroup type="radio" value="a" onChange={() => {}}>
        <Choicebox value="a" title="Just title" />
      </ChoiceboxGroup>,
    );
    expect(container.querySelector('.ui-choicebox__description')).toBeNull();
  });
});

describe('Choicebox — guard', () => {
  it('throws when used outside ChoiceboxGroup', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Choicebox value="a" title="A" />)).toThrow(
      /inside <ChoiceboxGroup>/,
    );
    spy.mockRestore();
  });
});
