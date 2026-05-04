// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { Tooltip } from './Tooltip';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Hover the trigger and let all timers settle so the tooltip enters. */
function hoverAndAdvance(trigger: HTMLElement) {
  fireEvent.pointerEnter(trigger);
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

describe('Tooltip — rendering', () => {
  it('renders the trigger child', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Trigger' })).not.toBeNull();
  });

  it('does not render the tooltip until hovered', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders the tooltip with role="tooltip" after hover + delay', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    hoverAndAdvance(screen.getByRole('button').parentElement!);
    const tip = screen.getByRole('tooltip');
    expect(tip).not.toBeNull();
    expect(tip.textContent).toContain('Hjälp');
  });

  it('emits ui-tooltip class on the visible tooltip', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    hoverAndAdvance(screen.getByRole('button').parentElement!);
    expect(screen.getByRole('tooltip').className).toContain('ui-tooltip');
  });
});

describe('Tooltip — disabled', () => {
  it('does not show when disabled prop is true', () => {
    render(
      <Tooltip label="Hjälp" disabled>
        <button>Trigger</button>
      </Tooltip>,
    );
    hoverAndAdvance(screen.getByRole('button').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not show when the child button is natively disabled', () => {
    render(
      <Tooltip label="Hjälp">
        <button disabled>Trigger</button>
      </Tooltip>,
    );
    hoverAndAdvance(screen.getByRole('button').parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tooltip — pointer interaction', () => {
  it('hides the tooltip on pointerLeave', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    const wrapper = screen.getByRole('button').parentElement!;
    hoverAndAdvance(wrapper);
    expect(screen.getByRole('tooltip')).not.toBeNull();

    fireEvent.pointerLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses on pointerDown (click suppression)', () => {
    render(
      <Tooltip label="Hjälp">
        <button>Trigger</button>
      </Tooltip>,
    );
    const wrapper = screen.getByRole('button').parentElement!;
    hoverAndAdvance(wrapper);
    expect(screen.getByRole('tooltip')).not.toBeNull();

    fireEvent.pointerDown(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
