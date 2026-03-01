"use client";

import { useEffect, useRef } from "react";
import lottie, { AnimationItem } from "lottie-web";

import animationData from "../_assets/lottie/loader.json";

type Props = {
  /** Convenience: sets both width and height if provided */
  size?: number;
  /** Explicit dimensions (preferred for horizontal loaders) */
  width?: number;
  height?: number;

  className?: string;
  ariaLabel?: string;

  /** Which CSS variable should drive color */
  colorVar?: string; // e.g. "--button-fg"
};

export default function AppLoader({
  size,
  width,
  height,
  className,
  ariaLabel = "Loading",
  colorVar = "--button-fg",
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);

  // dimensions:
  // - if size is provided -> square
  // - else prefer width/height
  // - defaults: horizontal loader
  const w = typeof size === "number" ? size : typeof width === "number" ? width : 56;
  const h = typeof size === "number" ? size : typeof height === "number" ? height : 22;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return;

    animRef.current = lottie.loadAnimation({
      container: el,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });

    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, []);

  return (
    <span
      className={["appLoader", className].filter(Boolean).join(" ")}
      style={{
        width: w,
        height: h,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Följer --button-fg (fallback till --text)
        color: `var(${colorVar}, var(--text))`,
      }}
      role="status"
      aria-label={ariaLabel}
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} aria-hidden="true" />
      <span className="sr-only">{ariaLabel}</span>
    </span>
  );
}
