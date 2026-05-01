'use client';

import {
  forwardRef,
  type HTMLAttributeAnchorTarget,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import Link from 'next/link';
import { Spinner } from './Spinner';
import './Button.css';

/**
 * Button — Phase 1 primitive. See `_components/ui/README.md` for the
 * contract this component satisfies (composite Polaris-pattern,
 * discriminated-union props, no `...rest` spread).
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

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
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

    const hasLabel = props.children !== undefined && props.children !== null;

    const content = loading ? (
      // Dedicated loading wrapper so size-specific tweaks (gap, label
      // visibility) can target `.ui-btn__loading` instead of leaking
      // into the regular content layout. The spinner is the standalone
      // <Spinner> component; its size matches the button's size, and
      // it inherits `currentColor` from the button text — no per-
      // variant overrides needed.
      <span className="ui-btn__loading">
        <Spinner size={size} aria-hidden />
        {hasLabel && <span className="ui-btn__label">{props.children}</span>}
      </span>
    ) : (
      <>
        {props.leadingIcon && (
          <span className="material-symbols-rounded ui-btn__icon" aria-hidden>
            {props.leadingIcon}
          </span>
        )}
        {hasLabel && <span className="ui-btn__label">{props.children}</span>}
        {props.trailingIcon && (
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
