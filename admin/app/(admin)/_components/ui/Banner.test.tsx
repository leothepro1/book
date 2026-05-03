// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Banner } from './Banner';

describe('Banner — rendering', () => {
  it('renders the message text', () => {
    render(<Banner variant="success">Allt klart</Banner>);
    expect(screen.getByText('Allt klart')).not.toBeNull();
  });

  it('emits ui-banner base class on the outer container', () => {
    render(<Banner variant="success">X</Banner>);
    expect(screen.getByRole('status').className).toContain('ui-banner');
  });

  it('emits the correct variant class for each value', () => {
    const variants: Array<'success' | 'warning' | 'error'> = [
      'success',
      'warning',
      'error',
    ];
    for (const variant of variants) {
      const { unmount } = render(<Banner variant={variant}>X</Banner>);
      const role = variant === 'error' ? 'alert' : 'status';
      expect(screen.getByRole(role).className).toContain(`ui-banner--${variant}`);
      unmount();
    }
  });

  it('forwards extra className', () => {
    render(
      <Banner variant="success" className="extra">
        X
      </Banner>,
    );
    expect(screen.getByRole('status').className).toContain('extra');
  });
});

describe('Banner — icon slot', () => {
  it('renders an icon when `icon` is provided', () => {
    const { container } = render(
      <Banner variant="success" icon="check_circle">
        Klart
      </Banner>,
    );
    const icon = container.querySelector('.ui-banner__icon');
    expect(icon).not.toBeNull();
    expect(icon?.textContent).toBe('check_circle');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not render an icon node when `icon` is omitted', () => {
    const { container } = render(<Banner variant="success">Klart</Banner>);
    expect(container.querySelector('.ui-banner__icon')).toBeNull();
  });
});

describe('Banner — cta slot', () => {
  it('renders a cta link when `cta` is provided', () => {
    render(
      <Banner
        variant="warning"
        cta={{ label: 'Läs mer', href: '/help/limits' }}
      >
        Du närmar dig din gräns
      </Banner>,
    );
    const link = screen.getByRole('link', { name: 'Läs mer' });
    expect(link.getAttribute('href')).toBe('/help/limits');
    expect(link.className).toContain('ui-banner__cta');
  });

  it('does not render a cta when `cta` is omitted', () => {
    const { container } = render(
      <Banner variant="warning">Du närmar dig din gräns</Banner>,
    );
    expect(container.querySelector('.ui-banner__cta')).toBeNull();
  });
});

describe('Banner — accessibility', () => {
  it('uses role="alert" for the error variant', () => {
    render(<Banner variant="error">Något gick fel</Banner>);
    expect(screen.getByRole('alert')).not.toBeNull();
  });

  it('uses role="status" for success and warning variants', () => {
    const { unmount } = render(<Banner variant="success">Klart</Banner>);
    expect(screen.getByRole('status')).not.toBeNull();
    unmount();

    render(<Banner variant="warning">Varning</Banner>);
    expect(screen.getByRole('status')).not.toBeNull();
  });
});

describe('Banner — ref forwarding', () => {
  it('forwards a ref to the outer div', () => {
    let received: HTMLDivElement | null = null;
    render(
      <Banner
        variant="success"
        ref={(node) => {
          received = node;
        }}
      >
        X
      </Banner>,
    );
    expect(received).toBeInstanceOf(HTMLDivElement);
  });
});
