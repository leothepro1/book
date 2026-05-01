// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Spinner } from './Spinner';

describe('Spinner — rendering', () => {
  it('renders an SVG with 12 bars', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelectorAll('.ui-spinner__bar').length).toBe(12);
  });

  it('emits the ui-spinner base class', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.ui-spinner')).not.toBeNull();
  });

  it('forwards extra className', () => {
    const { container } = render(<Spinner className="extra-class" />);
    expect(container.querySelector('.extra-class')).not.toBeNull();
  });
});

describe('Spinner — sizing', () => {
  it('uses the medium pixel size by default (20px)', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('.ui-spinner');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });

  it('maps "sm" → 16px and "lg" → 24px', () => {
    const { container, rerender } = render(<Spinner size="sm" />);
    expect(container.querySelector('.ui-spinner')?.getAttribute('width')).toBe('16');

    rerender(<Spinner size="lg" />);
    expect(container.querySelector('.ui-spinner')?.getAttribute('width')).toBe('24');
  });

  it('accepts a numeric size in pixels', () => {
    const { container } = render(<Spinner size={48} />);
    expect(container.querySelector('.ui-spinner')?.getAttribute('width')).toBe('48');
  });
});

describe('Spinner — a11y', () => {
  it('uses role="status" and a default Swedish label', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toBe('Laddar');
  });

  it('respects a custom label', () => {
    render(<Spinner label="Sparar" />);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Sparar');
  });

  it('drops role and label when aria-hidden is true', () => {
    const { container } = render(<Spinner aria-hidden />);
    const svg = container.querySelector('.ui-spinner');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Spinner — staggered animation delays', () => {
  it('assigns a staggered negative delay per bar', () => {
    const { container } = render(<Spinner />);
    const bars = Array.from(container.querySelectorAll('.ui-spinner__bar')) as SVGElement[];
    expect(bars[0].style.animationDelay).toBe('-1.0000s');
    expect(bars[6].style.animationDelay).toBe('-0.5000s');
    expect(bars[11].style.animationDelay).toBe('-0.0833s');
  });
});

describe('Spinner — ref forwarding', () => {
  it('forwards a ref to the SVG element', () => {
    let received: SVGSVGElement | null = null;
    render(
      <Spinner
        ref={(node) => {
          received = node;
        }}
      />,
    );
    expect(received).toBeInstanceOf(SVGSVGElement);
  });
});
