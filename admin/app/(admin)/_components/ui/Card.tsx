'use client';

import { forwardRef, type ReactNode } from 'react';
import './Card.css';

/**
 * Card — surface container primitive.
 *
 * The base unit of the card-heavy admin UI. Renders a single `<div>`
 * with locked chrome — white bg, 12px radius, 16px padding — and a
 * shadow stack chosen via `elevation`.
 *
 *   flat — chrome-only, no lift. Use for grouping in dense lists
 *          where stacked card shadows would compete.
 *   sm   — single subtle shadow (default). Standard card lift.
 *   md   — 4-layer mid-distance shadow. Hover state, floating panels.
 *   lg   — 5-layer dramatic shadow. Overlays, modal-like cards.
 *
 * The primitive owns four things and only four things: padding,
 * radius, background, shadow. Headers, sections, dividers, spacing
 * between cards — all consumer composition concerns.
 */

export type CardElevation = 'flat' | 'sm' | 'md' | 'lg';

export type CardProps = {
  children: ReactNode;
  elevation?: CardElevation;
  className?: string;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, elevation = 'sm', className },
  ref,
) {
  const cls = ['ui-card', `ui-card--elevation-${elevation}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';
