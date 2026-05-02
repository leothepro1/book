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
 * Loading state animates a vertical CTA → spinner transition. The
 * label and icons slide up and fade out while the spinner slides up
 * from below into the centred position; reversing on exit. Both
 * slots are always in the DOM so the button's width is identical
 * idle and loading — the CTA→spinner swap is purely transform +
 * opacity (no layout reflow). The spinner inherits the variant's
 * text colour via `currentColor`. The button is non-interactive
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

    // Render BOTH slots unconditionally so each can transition into
    // and out of view without layout reflow:
    //   - Regular content (icons + label) — at its natural position
    //     in flex flow; CSS slides it up and fades it out when
    //     `.ui-btn--loading` is set.
    //   - Spinner overlay — absolutely positioned over the button,
    //     parked below (translated down + opacity 0) when idle, slides
    //     up to centre when `.ui-btn--loading` is set.
    // Width stays identical because neither slot is added/removed —
    // only `transform` and `opacity` change.
    const content = (
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
        <span className="ui-btn__spinner-overlay" aria-hidden>
          <Spinner size={size} aria-hidden />
        </span>
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
