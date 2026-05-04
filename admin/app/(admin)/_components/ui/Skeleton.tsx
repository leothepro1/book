'use client';

import { forwardRef, type CSSProperties } from 'react';
import './Skeleton.css';

/**
 * Skeleton — shimmer placeholder primitive.
 *
 * The component is THE EFFECT, not the layout. It renders a single
 * `<span>` with a left-to-right sliding gradient highlight that
 * communicates "content loading here". Layout, count, and grouping
 * of skeletons live in the calling page — this primitive just owns
 * dimensions and the shimmer.
 *
 * Sizing is explicit per instance — `width` and `height` accept a
 * number (px) or any CSS length string (`100%`, `12rem`, etc). No
 * intrinsic size: a Skeleton with no width/height is a 0×0 element.
 * This is deliberate; placeholder geometry must match the real
 * content it stands in for.
 *
 * Shape via `radius`: `'sm' | 'md' | 'lg' | 'full'` map to the
 * shared admin radius tokens. `'full'` produces a circle (used for
 * avatars). A numeric `radius` is allowed for one-off pixel matches
 * but discouraged.
 *
 * Reduced-motion: the shimmer animation is disabled and replaced
 * with a static muted background. The "this is a placeholder" cue
 * remains; the motion does not.
 *
 * A11y: rendered as `<span aria-hidden="true">` by default — the
 * visual shimmer carries no information for screen readers, and
 * page-level loading status should be announced via the parent
 * (e.g. `aria-busy="true"` on the container, or a live region).
 */

export type SkeletonRadius = 'sm' | 'md' | 'lg' | 'full';

export type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  radius?: SkeletonRadius | number;
  className?: string;
};

const RADIUS_VAR: Record<SkeletonRadius, string> = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
};

function toCssLength(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function resolveRadius(r: SkeletonRadius | number | undefined): string | undefined {
  if (r === undefined) return RADIUS_VAR.sm;
  if (typeof r === 'number') return `${r}px`;
  return RADIUS_VAR[r];
}

export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(
  function Skeleton({ width, height, radius, className }, ref) {
    const cls = ['ui-skeleton', className].filter(Boolean).join(' ');
    const style: CSSProperties = {
      width: toCssLength(width),
      height: toCssLength(height),
      borderRadius: resolveRadius(radius),
    };
    return <span ref={ref} className={cls} style={style} aria-hidden="true" />;
  },
);

Skeleton.displayName = 'Skeleton';
