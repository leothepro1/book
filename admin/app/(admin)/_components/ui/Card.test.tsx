// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Card } from './Card';

describe('Card — rendering', () => {
  it('renders its children', () => {
    render(<Card>Inner content</Card>);
    expect(screen.getByText('Inner content')).not.toBeNull();
  });

  it('emits ui-card base class', () => {
    render(<Card>X</Card>);
    expect(screen.getByText('X').className).toContain('ui-card');
  });

  it('defaults to elevation="sm"', () => {
    render(<Card>X</Card>);
    expect(screen.getByText('X').className).toContain('ui-card--elevation-sm');
  });

  it('emits the correct elevation modifier for each value', () => {
    const elevations: Array<'flat' | 'sm' | 'md' | 'lg'> = [
      'flat',
      'sm',
      'md',
      'lg',
    ];
    for (const elevation of elevations) {
      const { unmount } = render(<Card elevation={elevation}>X</Card>);
      expect(screen.getByText('X').className).toContain(
        `ui-card--elevation-${elevation}`,
      );
      unmount();
    }
  });

  it('forwards extra className', () => {
    render(<Card className="extra">X</Card>);
    expect(screen.getByText('X').className).toContain('extra');
  });
});

describe('Card — ref forwarding', () => {
  it('forwards a ref to the underlying div', () => {
    let received: HTMLDivElement | null = null;
    render(
      <Card
        ref={(node) => {
          received = node;
        }}
      >
        X
      </Card>,
    );
    expect(received).toBeInstanceOf(HTMLDivElement);
  });
});
