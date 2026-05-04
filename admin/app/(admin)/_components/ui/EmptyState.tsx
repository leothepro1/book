'use client';

import { forwardRef, type ReactNode } from 'react';
import { Button } from './Button';
import './EmptyState.css';

/**
 * EmptyState — placeholder for views with no content.
 *
 * Two design flavours emerge from a single component by which props
 * are passed:
 *
 *   Blank slate    — `icon` + `title` + `description`. Quiet.
 *                    "There's nothing here yet."
 *
 *   Informational  — same three slots, plus `primaryAction` and
 *                    `secondaryAction`. The two buttons sit on a
 *                    horizontal row (primary left, secondary right,
 *                    8px gap, both `size="sm"`).
 *
 * Centred column layout. Action variants are locked: primary stays
 * primary, secondary stays secondary — keeps every empty state
 * across the admin reading as one pattern.
 */

export type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

export type EmptyStateProps = {
  /** Material Symbols Rounded icon name. Decorative — `aria-hidden`. */
  icon?: string;
  /** Headline. The only required slot. */
  title: ReactNode;
  /** Body text. ReactNode so it can include inline links. */
  description?: ReactNode;
  /** Left button. Renders `<Button variant="primary" size="sm">`. */
  primaryAction?: EmptyStateAction;
  /** Right button. Renders `<Button variant="secondary" size="sm">`. */
  secondaryAction?: EmptyStateAction;
  className?: string;
};

function renderAction(
  action: EmptyStateAction,
  variant: 'primary' | 'secondary',
) {
  if (action.href !== undefined) {
    return (
      <Button variant={variant} size="sm" href={action.href}>
        {action.label}
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    { icon, title, description, primaryAction, secondaryAction, className },
    ref,
  ) {
    const cls = ['ui-empty-state', className].filter(Boolean).join(' ');
    return (
      <div ref={ref} className={cls}>
        {icon && (
          <span
            className="ui-empty-state__icon material-symbols-rounded"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h2 className="ui-empty-state__title">{title}</h2>
        {description && (
          <p className="ui-empty-state__description">{description}</p>
        )}
        {(primaryAction || secondaryAction) && (
          <div className="ui-empty-state__actions">
            {primaryAction && renderAction(primaryAction, 'primary')}
            {secondaryAction && renderAction(secondaryAction, 'secondary')}
          </div>
        )}
      </div>
    );
  },
);

EmptyState.displayName = 'EmptyState';
