// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Calendar, type DateRange } from './Calendar';

// Stable "today" so tests aren't flaky around month boundaries.
// Wednesday, 2026-05-13 — a typical mid-month weekday.
const TODAY = new Date(2026, 4, 13);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Calendar — trigger', () => {
  it('renders placeholder when no value', () => {
    render(<Calendar mode="single" placeholder="Välj datum" />);
    expect(screen.getByRole('button', { name: /Välj datum/i })).toBeTruthy();
  });

  it('renders formatted date when value is set (single)', () => {
    const value = new Date(2026, 4, 13);
    render(<Calendar mode="single" value={value} />);
    // sv-SE format produces "13 maj 2026"
    expect(screen.getByText('13 maj 2026')).toBeTruthy();
  });

  it('opens the popover on trigger click', () => {
    render(<Calendar mode="single" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not open when disabled', () => {
    render(<Calendar mode="single" disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Calendar — single mode', () => {
  it('clicking a day stages it as pending; popover stays open and onChange has not fired', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Välj datum/i }));

    const cell = screen.getAllByRole('gridcell').find((el) => el.textContent === '15');
    expect(cell).toBeTruthy();
    fireEvent.click(cell!);

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeTruthy();
    // The clicked day is visually selected in pending state
    expect(cell!.classList.contains('ui-calendar__day--selected')).toBe(true);
  });

  it('Använd commits the pending day, fires onChange and closes the popover', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Välj datum/i }));

    const cell = screen.getAllByRole('gridcell').find((el) => el.textContent === '15')!;
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole('button', { name: /Använd/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0] as Date;
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(4);
    expect(arg.getDate()).toBe(15);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ESC discards pending selection (no onChange) and closes', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Välj datum/i }));
    const cell = screen.getAllByRole('gridcell').find((el) => el.textContent === '15')!;
    fireEvent.click(cell);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Calendar — range mode', () => {
  it('two day clicks stage pending range; Använd commits and closes', () => {
    const onChange = vi.fn();
    render(<Calendar mode="range" onChange={onChange} placeholder="Välj datumintervall" />);
    fireEvent.click(screen.getByRole('button', { name: /Välj datumintervall/i }));

    const findCell = (label: string) =>
      screen
        .getAllByRole('gridcell')
        .find((el) => el.textContent === label && !el.classList.contains('ui-calendar__day--outside'))!;

    fireEvent.click(findCell('10'));
    fireEvent.click(findCell('20'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Använd/i }));
    const finalRange = onChange.mock.calls.at(-1)![0] as DateRange;
    expect(finalRange.from?.getDate()).toBe(10);
    expect(finalRange.to?.getDate()).toBe(20);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reverse-order clicks swap so from <= to on commit', () => {
    const onChange = vi.fn();
    render(<Calendar mode="range" onChange={onChange} placeholder="Välj datumintervall" />);
    fireEvent.click(screen.getByRole('button', { name: /Välj datumintervall/i }));
    const findCell = (label: string) =>
      screen
        .getAllByRole('gridcell')
        .find((el) => el.textContent === label && !el.classList.contains('ui-calendar__day--outside'))!;

    fireEvent.click(findCell('20'));
    fireEvent.click(findCell('10'));
    fireEvent.click(screen.getByRole('button', { name: /Använd/i }));

    const finalRange = onChange.mock.calls.at(-1)![0] as DateRange;
    expect(finalRange.from?.getDate()).toBe(10);
    expect(finalRange.to?.getDate()).toBe(20);
  });
});

describe('Calendar — bounds', () => {
  it('disables days before minDate', () => {
    const minDate = new Date(2026, 4, 10);
    render(<Calendar mode="single" minDate={minDate} />);
    fireEvent.click(screen.getByRole('button'));
    const cell9 = screen
      .getAllByRole('gridcell')
      .find((el) => el.textContent === '9' && !el.classList.contains('ui-calendar__day--outside'))!;
    expect(cell9.hasAttribute('disabled')).toBe(true);
  });

  it('disables days after maxDate', () => {
    const maxDate = new Date(2026, 4, 20);
    render(<Calendar mode="single" maxDate={maxDate} />);
    fireEvent.click(screen.getByRole('button'));
    const cell21 = screen
      .getAllByRole('gridcell')
      .find((el) => el.textContent === '21' && !el.classList.contains('ui-calendar__day--outside'))!;
    expect(cell21.hasAttribute('disabled')).toBe(true);
  });
});

describe('Calendar — close on ESC', () => {
  it('ESC closes the popover', () => {
    render(<Calendar mode="single" />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Calendar — month navigation', () => {
  it('prev/next buttons change the visible month', () => {
    render(<Calendar mode="single" />);
    fireEvent.click(screen.getByRole('button'));
    // Initial label = May 2026 (capitalised via CSS, raw text "maj 2026")
    expect(screen.getByText(/maj 2026/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nästa månad/i }));
    expect(screen.getByText(/juni 2026/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Föregående månad/i }));
    fireEvent.click(screen.getByRole('button', { name: /Föregående månad/i }));
    expect(screen.getByText(/april 2026/i)).toBeTruthy();
  });
});
