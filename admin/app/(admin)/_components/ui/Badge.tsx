'use client';

import { forwardRef, type ReactNode } from 'react';
import './Badge.css';

/**
 * Badge — status pill primitive.
 *
 * Used in lists, detail headers, and timelines to surface state:
 * "Aktiv", "Utkast", "Väntande", "Problem" etc. The component is
 * a styled `<span>` — it doesn't carry behaviour, just visual
 * status communication.
 *
 * Variants are abstract status categories rather than colour names
 * so they survive a palette redesign:
 *
 *   - success   — green: completed positive state (Aktiv)
 *   - info      — blue:  informational / pre-publish (Utkast)
 *   - warning   — orange: awaiting action / payment due (Väntande)
 *   - attention — yellow: in progress / mid-flow (Pågående)
 *   - critical  — red:    error / rejection (Problem)
 *   - neutral   — grey:   archived / closed / dormant (Arkiverad)
 *
 * Default variant: `neutral`. The 6 variants cover every status
 * palette already in use across products, orders, customers etc —
 * see the mapping comment in base.css.
 *
 * The prop is `variant` (not `tone`) to match the rest of the
 * library — Button, Toast, Menu.Item all use `variant` for the
 * same colour/intent role. */

export type BadgeVariant =
  | 'success'
  | 'info'
  | 'warning'
  | 'attention'
  | 'critical'
  | 'neutral';

export type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', children, className },
  ref,
) {
  const cls = ['ui-badge', `ui-badge--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <span ref={ref} className={cls}>
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';
