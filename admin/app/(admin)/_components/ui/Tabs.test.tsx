// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { Tabs } from './Tabs';

const ITEMS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
];

describe('Tabs — rendering', () => {
  it('renders one tab per item', () => {
    render(<Tabs items={ITEMS} value="a" onChange={() => {}} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('emits ui-tabs base class on the tablist', () => {
    render(<Tabs items={ITEMS} value="a" onChange={() => {}} />);
    expect(screen.getByRole('tablist').className).toContain('ui-tabs');
  });

  it('marks the active tab with aria-selected="true" and tabIndex=0', () => {
    render(<Tabs items={ITEMS} value="b" onChange={() => {}} />);
    const active = screen.getByRole('tab', { name: 'B' });
    const inactive = screen.getByRole('tab', { name: 'A' });
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(active.getAttribute('tabindex')).toBe('0');
    expect(inactive.getAttribute('aria-selected')).toBe('false');
    expect(inactive.getAttribute('tabindex')).toBe('-1');
  });

  it('emits the selected modifier class on the active tab', () => {
    render(<Tabs items={ITEMS} value="c" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'C' }).className).toContain(
      'ui-tabs__tab--selected',
    );
  });

  it('forwards aria-label to the tablist', () => {
    render(
      <Tabs
        items={ITEMS}
        value="a"
        onChange={() => {}}
        aria-label="Inställningar"
      />,
    );
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe(
      'Inställningar',
    );
  });

  it('forwards extra className to the tablist', () => {
    render(
      <Tabs items={ITEMS} value="a" onChange={() => {}} className="extra" />,
    );
    expect(screen.getByRole('tablist').className).toContain('extra');
  });
});

describe('Tabs — interaction', () => {
  it('calls onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('does not fire onChange for disabled tabs', () => {
    const items = [...ITEMS, { id: 'd', label: 'D', disabled: true }];
    const onChange = vi.fn();
    render(<Tabs items={items} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'D' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks disabled tabs with the native disabled attribute', () => {
    const items = [...ITEMS, { id: 'd', label: 'D', disabled: true }];
    render(<Tabs items={items} value="a" onChange={() => {}} />);
    expect(
      (screen.getByRole('tab', { name: 'D' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('Tabs — keyboard navigation', () => {
  it('ArrowRight moves to the next tab', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ArrowLeft moves to the previous tab', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="b" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'B' }), {
      key: 'ArrowLeft',
    });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ArrowRight wraps from last to first', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="c" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('ArrowLeft wraps from first to last', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), {
      key: 'ArrowLeft',
    });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('Home jumps to the first tab', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="c" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('End jumps to the last tab', () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('skips disabled tabs during keyboard nav', () => {
    const items = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', disabled: true },
      { id: 'c', label: 'C' },
    ];
    const onChange = vi.fn();
    render(<Tabs items={items} value="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

describe('Tabs — ref forwarding', () => {
  it('forwards a ref to the tablist', () => {
    let received: HTMLDivElement | null = null;
    render(
      <Tabs
        items={ITEMS}
        value="a"
        onChange={() => {}}
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(HTMLDivElement);
  });
});
