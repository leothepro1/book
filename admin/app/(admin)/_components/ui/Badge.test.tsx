// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Badge } from './Badge';

describe('Badge — rendering', () => {
  it('renders the label', () => {
    render(<Badge>Aktiv</Badge>);
    expect(screen.getByText('Aktiv')).not.toBeNull();
  });

  it('emits ui-badge base class', () => {
    render(<Badge>X</Badge>);
    expect(screen.getByText('X').className).toContain('ui-badge');
  });

  it('defaults to tone="neutral"', () => {
    render(<Badge>X</Badge>);
    expect(screen.getByText('X').className).toContain('ui-badge--neutral');
  });

  it('emits the correct tone class for each value', () => {
    const tones: Array<
      'success' | 'info' | 'warning' | 'attention' | 'critical' | 'neutral'
    > = ['success', 'info', 'warning', 'attention', 'critical', 'neutral'];
    for (const tone of tones) {
      const { unmount } = render(<Badge tone={tone}>X</Badge>);
      expect(screen.getByText('X').className).toContain(`ui-badge--${tone}`);
      unmount();
    }
  });

  it('forwards extra className', () => {
    render(<Badge className="extra">X</Badge>);
    expect(screen.getByText('X').className).toContain('extra');
  });
});

describe('Badge — ref forwarding', () => {
  it('forwards a ref to the underlying span', () => {
    let received: HTMLSpanElement | null = null;
    render(
      <Badge
        ref={(node) => {
          received = node;
        }}
      >
        X
      </Badge>,
    );
    expect(received).toBeInstanceOf(HTMLSpanElement);
  });
});
