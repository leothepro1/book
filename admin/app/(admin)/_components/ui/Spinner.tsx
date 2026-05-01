'use client';

import { forwardRef, type CSSProperties } from 'react';
import './Spinner.css';

/**
 * Spinner — iOS-style activity indicator. 12 capsule-shaped bars
 * arranged radially around a 24×24 viewBox. Each bar fades opacity
 * from 1 → 0.15 over a 1s linear cycle, with a per-bar staggered
 * `animation-delay` so a "leading bright bar" appears to rotate
 * clockwise around the circle (Apple UIActivityIndicatorView pattern).
 *
 * Color: inherits `currentColor` — set color on a parent (or the
 * spinner itself) to match its surrounding context. This is what
 * lets one Spinner render correctly on Primary, Accent, Secondary,
 * Ghost, and Danger buttons without per-variant overrides.
 *
 * Size: fixed via the `size` prop ('sm' | 'md' | 'lg' or a number
 * in px). The SVG renders at exactly that pixel size — independent
 * of parent font-size, so the spinner is size-stable wherever it's
 * placed.
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

const NUM_BARS = 12;
const CYCLE_SECONDS = 1;
const BARS = Array.from({ length: NUM_BARS }, (_, i) => i);

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  function Spinner(
    { size = 'md', label = 'Laddar', className, 'aria-hidden': ariaHidden },
    ref,
  ) {
    const px = typeof size === 'number' ? size : SIZE_PX[size];
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
        {BARS.map((i) => {
          // Bar i is "brightest" at clock time t = i * CYCLE / N.
          // Setting animation-delay = -(N-i)/N * CYCLE puts each
          // bar at the right phase of its fade cycle so the leading
          // bar rotates clockwise. (i / N - 1) is algebraically
          // identical and reads cleanest at the call site.
          const delay = ((i / NUM_BARS) - 1) * CYCLE_SECONDS;
          const style: CSSProperties = { animationDelay: `${delay.toFixed(4)}s` };
          // Geometry tuned to match Apple's UIActivityIndicatorView:
          //   - viewBox 24, center (12,12)
          //   - bars from y=2 → y=6 with strokeWidth 2 + round caps
          //     → outer tip at radius 11, inner tip at radius 5
          //   - 12 bars at 30° spacing → arc length at inner radius =
          //     5 × π/6 ≈ 2.62 vs bar width 2, so each bar still has
          //     ~0.62 of visual gap to its neighbour at the inner end
          //     (no crowding, but bars reach satisfyingly close to
          //     the centre).
          return (
            <line
              key={i}
              className="ui-spinner__bar"
              x1="12"
              y1="2"
              x2="12"
              y2="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${i * 30} 12 12)`}
              style={style}
            />
          );
        })}
      </svg>
    );
  },
);

Spinner.displayName = 'Spinner';
