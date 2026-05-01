'use client';

import {
  forwardRef,
  type HTMLAttributeAnchorTarget,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import Link from 'next/link';
import './Button.css';

/**
 * Button — Phase 1 primitive. See `_components/ui/README.md` for the
 * contract this component satisfies (composite Polaris-pattern,
 * discriminated-union props, no `...rest` spread, dual-emit during
 * migration, lift-and-shift).
 *
 * Variants govern *color only* — background, foreground, hover/active
 * tints. Sizes govern *padding + font-size only*. All other behaviour
 * (transitions, focus ring, disabled, loading, scale-on-press) is
 * shared across every (variant, size) combination.
 *
 * Loading state is unified — a spinner inherits the variant's text
 * colour via `currentColor` and replaces the leading icon while the
 * label stays visible (Geist pattern). The button is non-interactive
 * while loading, with `aria-busy="true"`.
 *
 * Polymorphic: pass `href` to render a `next/link` <a>; otherwise a
 * native `<button>`. The discriminated union enforces this — you
 * can't pass `type="submit"` to a link, or `target="_blank"` to a
 * button.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonShared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: string;
  trailingIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
};

type ButtonAsButton = ButtonShared & {
  href?: undefined;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
};

type ButtonAsLink = ButtonShared & {
  href: string;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

// Maps the new variant to the legacy `.admin-btn--<x>` class for
// dual-emit during Phase 1 migration. See README §3.1 for sunset
// criterion. The mapping picks the closest legacy match:
//   primary  → admin-btn--accent           (today's most-used filled CTA)
//   secondary → admin-btn--outline
//   ghost    → admin-btn--ghost
//   danger   → admin-btn--danger           (filled red; `danger-secondary`
//                                           tint variant is dropped — its
//                                           5 call-sites map to `danger`)
const LEGACY_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'admin-btn--accent',
  secondary: 'admin-btn--outline',
  ghost: 'admin-btn--ghost',
  danger: 'admin-btn--danger',
};

function buildClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  loading: boolean,
  extra?: string,
): string {
  return [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    loading && 'ui-btn--loading',
    // Dual-emit
    'admin-btn',
    LEGACY_VARIANT_CLASS[variant],
    size === 'sm' && 'admin-btn--sm',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const variant = props.variant ?? 'primary';
    const size = props.size ?? 'md';
    const loading = props.loading ?? false;
    const disabled = props.disabled ?? false;
    const className = buildClassName(variant, size, loading, props.className);

    const content = (
      <>
        {loading ? (
          <span className="material-symbols-rounded ui-btn__spinner" aria-hidden>
            progress_activity
          </span>
        ) : props.leadingIcon ? (
          <span className="material-symbols-rounded ui-btn__icon" aria-hidden>
            {props.leadingIcon}
          </span>
        ) : null}
        {props.children !== undefined && props.children !== null && (
          <span className="ui-btn__label">{props.children}</span>
        )}
        {!loading && props.trailingIcon && (
          <span className="material-symbols-rounded ui-btn__icon" aria-hidden>
            {props.trailingIcon}
          </span>
        )}
      </>
    );

    if (props.href !== undefined) {
      const inactive = disabled || loading;
      return (
        <Link
          ref={ref as Ref<HTMLAnchorElement>}
          href={props.href}
          target={props.target}
          rel={props.rel}
          className={className}
          // Anchors can't use the `disabled` attribute. Block the
          // navigation and surface the state via aria.
          onClick={inactive ? (e) => e.preventDefault() : props.onClick}
          aria-disabled={inactive || undefined}
          aria-busy={loading || undefined}
          aria-label={props['aria-label']}
          tabIndex={inactive ? -1 : undefined}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type={props.type ?? 'button'}
        className={className}
        onClick={props.onClick}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-label={props['aria-label']}
      >
        {content}
      </button>
    );
  },
);

Button.displayName = 'Button';
