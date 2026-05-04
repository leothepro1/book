'use client';

import { forwardRef, type ReactNode } from 'react';
import './Banner.css';

/**
 * Banner — inline status primitive.
 *
 * Full-width container that surfaces a status message inline on the
 * page (vs Toast, which floats and auto-dismisses). Three semantic
 * variants — success / warning / error — share the same chrome and
 * differ only in colour treatment.
 *
 * Layout is icon → text → cta, all inline and horizontally centred
 * inside a 100%-wide container. Both `icon` and `cta` are optional
 * and set per call-site — the component supports them but never
 * imposes them. With neither, the banner is a centred line of text
 * styled by variant.
 *
 * The CTA renders as an anchor styled exactly like the surrounding
 * text but with an underline. It's a link affordance, not a button —
 * banners point at "go read more" / "go fix this", not "do the
 * action right here".
 *
 * A11y:
 *   - error  → role="alert"  (assertive announcement)
 *   - others → role="status" (polite announcement)
 *   - icon is decorative (`aria-hidden`) — the variant carries the
 *     same semantic via role; doubling it through the icon would
 *     produce noisy screen-reader output.
 */

export type BannerVariant = 'success' | 'warning' | 'error';

export type BannerCta = {
  label: string;
  href: string;
};

export type BannerProps = {
  variant: BannerVariant;
  children: ReactNode;
  /** Material Symbols Rounded ligature name — e.g. "check_circle",
      "warning", "error". Rendered to the left of the text. */
  icon?: string;
  /** Inline link rendered to the right of the text. Styled exactly
      like the body text, with an underline as the link affordance. */
  cta?: BannerCta;
  className?: string;
};

export const Banner = forwardRef<HTMLDivElement, BannerProps>(function Banner(
  { variant, children, icon, cta, className },
  ref,
) {
  const cls = ['ui-banner', `ui-banner--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  const role = variant === 'error' ? 'alert' : 'status';
  return (
    <div ref={ref} className={cls} role={role}>
      {icon && (
        <span
          className="ui-banner__icon material-symbols-rounded"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="ui-banner__text">{children}</span>
      {cta && (
        <a className="ui-banner__cta" href={cta.href}>
          {cta.label}
        </a>
      )}
    </div>
  );
});

Banner.displayName = 'Banner';
