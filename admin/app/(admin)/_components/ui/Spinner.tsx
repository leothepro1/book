'use client';

import { forwardRef } from 'react';
import './Spinner.css';

/**
 * Spinner — continuous-arc activity indicator.
 *
 * A single ~270° SVG arc that rotates clockwise at constant velocity.
 * Same pattern shipped by Linear, Vercel, GitHub, and Stripe — reads
 * cleanly at any size, no per-bar choreography, no "iOS legacy" feel.
 *
 * Color: inherits `currentColor` on the stroke. Set color on a parent
 * (or the spinner itself) to match the surrounding context. This is
 * what lets one Spinner render correctly on Primary, Accent,
 * Secondary, Ghost, and Danger buttons without per-variant overrides.
 *
 * Size: fixed via the `size` prop ('sm' | 'md' | 'lg' or a number in
 * px). The SVG renders at exactly that pixel size — independent of
 * parent font-size, so the spinner is size-stable wherever it's
 * placed. Stroke width scales proportionally so thickness stays
 * visually consistent across sizes.
 *
 * A11y: by default rendered as `role="status"` with the Swedish
 * label "Laddar" (overridable via `label`). When the spinner is
 * decorative — e.g. inside a Button that already exposes
 * `aria-busy="true"` — pass `aria-hidden` to suppress it from
 * assistive tech. The `focusable="false"` attribute prevents IE/old
 * Edge from making the SVG tabbable.
 */

export type SpinnerSize = 'sm' | 'md' | 'lg';

export type SpinnerProps = {
  size?: SpinnerSize | number;
  label?: string;
  className?: string;
  'aria-hidden'?: boolean;
};

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

// Stroke-width is set in viewBox units (24×24), so the rendered
// thickness on screen = px * stroke / 24. To keep the arc visually
// readable at small sizes (where naive scaling produces a hairline),
// per-size strokes target ~2px rendered thickness:
//   sm  16px × 3 / 24    = 2.0px rendered
//   md  20px × 2.5 / 24  = 2.08px rendered
//   lg  24px × 2 / 24    = 2.0px rendered
const SIZE_STROKE: Record<SpinnerSize, number> = {
  sm: 3,
  md: 2.5,
  lg: 2,
};

// For numeric `size` props, interpolate stroke so the rendered
// thickness stays at ~2px regardless of how big or small.
function strokeWidthFor(size: SpinnerSize | number): number {
  if (typeof size === 'string') return SIZE_STROKE[size];
  return (2 * 24) / size;
}

// SVG geometry (inside a 24×24 viewBox):
//   - circle radius 9 → circumference = 2π·9 ≈ 56.55
//   - we want a ~270° arc (3/4 of the ring) → dash length 42.4, gap 14.15
//   - stroke-linecap round so the leading edge has the "tapered" look
//     that's standard in modern arc spinners
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.75;
const GAP = CIRCUMFERENCE - ARC_LENGTH;
const DASH_ARRAY = `${ARC_LENGTH.toFixed(2)} ${GAP.toFixed(2)}`;

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  function Spinner(
    { size = 'md', label = 'Laddar', className, 'aria-hidden': ariaHidden },
    ref,
  ) {
    const px = typeof size === 'number' ? size : SIZE_PX[size];
    const strokeWidth = strokeWidthFor(size);
    const cls = ['ui-spinner', className].filter(Boolean).join(' ');

    return (
      <svg
        ref={ref}
        className={cls}
        viewBox="0 0 24 24"
        width={px}
        height={px}
        role={ariaHidden ? undefined : 'status'}
        aria-label={ariaHidden ? undefined : label}
        aria-hidden={ariaHidden || undefined}
        focusable="false"
      >
        <circle
          className="ui-spinner__arc"
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={DASH_ARRAY}
        />
      </svg>
    );
  },
);

Spinner.displayName = 'Spinner';
