"use client";

/**
 * LoadingScreen — full-cover transition overlay
 * ══════════════════════════════════════════════
 *
 * 100% width + height overlay used for page transitions and flow steps.
 * Takes over the entire parent (or viewport) with a white background
 * and the global Lottie Loading animation centered.
 *
 * Usage:
 *   <LoadingScreen />                        — fills parent (position: absolute)
 *   <LoadingScreen fixed />                  — fills viewport (position: fixed)
 *   <LoadingScreen label="Laddar..." />      — with text below animation
 *   <LoadingScreen size={80} />              — custom animation size
 */

import { Loading } from "./Loading";
import "./loading.css";

type LoadingScreenProps = {
  /** Use fixed positioning (viewport) instead of absolute (parent). */
  fixed?: boolean;
  /** Optional label shown below the animation. */
  label?: string;
  /** Animation size in px. Default 56. */
  size?: number;
  /** Additional CSS class. */
  className?: string;
};

export function LoadingScreen({
  fixed = false,
  label,
  size = 56,
  className,
}: LoadingScreenProps) {
  return (
    <div
      className={`loading-screen${fixed ? " loading-screen--fixed" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="loading-screen__content">
        <Loading size={size} />
        {label && <p className="loading-screen__label">{label}</p>}
      </div>
    </div>
  );
}
