"use client";

/**
 * Global Loading Component
 * ════════════════════════
 *
 * Single source of truth for all loading states across the platform.
 * Uses a dotLottie animation (binary, compressed, ~1KB).
 *
 * Usage variants:
 *   <Loading />                          — inline, 24px (default)
 *   <Loading size={40} />                — custom size
 *   <Loading variant="button" />         — for inside buttons (20px, no margin)
 *   <Loading variant="section" />        — centered in a section (48px + padding)
 *   <Loading variant="page" />           — full viewport centered (64px)
 *   <Loading variant="overlay" />        — dark overlay + centered (64px)
 *
 * The animation file is served from /animations/loading.lottie (public dir).
 * Loaded once, cached by the browser — zero re-fetches across navigations.
 */

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import "./loading.css";

// Inlined as data URI (1.1KB) — zero network latency, renders instantly
const LOTTIE_SRC = "data:application/octet-stream;base64,UEsDBBQAAAAIAAAAAADtqwuZkgAAAL0AAAANAAAAbWFuaWZlc3QuanNvbiXOSw7CMAwE0Lt43aBGLErpAVhxA8QiHxcCbYycAEJV705ClrbejGYFHfyik6cQYTyv4B2MYAfToZqcUAfViR6NFEajFr0czKSGfe9sCw0s5DDrQLzoOd/OM9pSBaPcLg3oV7oRZ3GilDwe/YyxMIyW/bNCyI8rBmSd/tRRqlrci33g90Ps8rYC38ixpuSuhe0HUEsDBBQAAAAIAAAAAADwOe8/oQIAAMcRAAA0AAAAYW5pbWF0aW9ucy9jOGIzZTdmZC03OTczLTRlYjEtYmFlYS00MThiZjc4NTRkYzAuanNvbu1W246bMBD9FeRnFmFDAuGtl7QvrVR1q76sVhUNTnCXm4BeVlG+px/SH+sZA4FcNiuttIm0IlFsxzOeOXPxkdfsFwuYa3HbEsxky5IFjm0yVbAAU47JmZnsNwtcYbKYBdwzWZbiSJKHkcpWOBNFkVYOq0rWFQtubk2WhPeypPV6K1YZZm6y+h7GWiMf5LKGhQpeIbnDgTXLaQibDW1A0cYfLG3LdxwYh4F2vQHEXsqn3lZKa0gz/GF2Ad1v3QhJMzIo1xoaAXVs/JVYcNvGyWd3yyeNX3J3XseedeAawZNnSB3bsunDheAzMeEbaCi44xzWUSZdGqQMpaGaksSGBH0ykNwIx+K+b/rwRC5ITUALCkMt28S3sw+xLn8vBjyz/bVK0w0ZQQaoZnFYyKbDqKPYqkQjKURALbdtNCYT6q9dw55JeetA7UHvITmUT+rSN2Gqsjg3otCQiSoqaXAYTZFr9urt67nxVS7qvDSuCZFxZcwTrQSVGECWYVJJnVyCU1G7L/Y8Wjbnvrk78QGI7kY0+pQSLXIhwsU8rMgEggROkIPkh57SpL9zX8rw398wyo8H8b4Mi1gtEMZ1XeZ3x6NYUlIPopgKgO+GDj+BfAA/wWwuvsb1qZQyW8QqlVn9KLh3KiEMh9BqaoO9kl5xtCMHLu6ebMZHW3FQk6NXYfpwsB4ZxcbhIcpQtQtmkKCuZFm1zMs0LBldSL0571sxI5pGRXRobRBH05f/LHayRgH1TO92d38qZsJx0DBoVxJ+hz/c8j0uh6chl39U0aWpnF+Iy0Xr9+xcLsRJLp+09XTFZOLNxNO43MHjYOTykctHLn/BXA6PQy7/rFbxxR/m3Qv57Gx+qZe5OPky36/o09jcdS2fi5HNRzYf2fzFsPnt5j9QSwECAAAUAAAACAAAAAAA7asLmZIAAAC9AAAADQAAAAAAAAAAAAAAAAAAAAAAbWFuaWZlc3QuanNvblBLAQIAABQAAAAIAAAAAADwOe8/oQIAAMcRAAA0AAAAAAAAAAAAAAAAAL0AAABhbmltYXRpb25zL2M4YjNlN2ZkLTc5NzMtNGViMS1iYWVhLTQxOGJmNzg1NGRjMC5qc29uUEsFBgAAAAACAAIAnQAAALADAAAAAA==";

export type LoadingVariant = "inline" | "button" | "section" | "page" | "overlay";

type LoadingProps = {
  /** Visual variant — controls size, layout, and wrapping. */
  variant?: LoadingVariant;
  /** Override size in px (ignored for overlay/page which have fixed sizes). */
  size?: number;
  /** Additional CSS class on the outermost element. */
  className?: string;
};

const VARIANT_SIZES: Record<LoadingVariant, number> = {
  inline: 24,
  button: 20,
  section: 48,
  page: 64,
  overlay: 64,
};

export function Loading({ variant = "inline", size, className }: LoadingProps) {
  const effectiveSize = size ?? VARIANT_SIZES[variant];

  const lottie = (
    <DotLottieReact
      src={LOTTIE_SRC}
      loop
      autoplay
      speed={1.6}
      style={{ width: effectiveSize, height: effectiveSize, filter: "brightness(0.3)" }}
    />
  );

  if (variant === "overlay") {
    return (
      <div className={`loading loading--overlay${className ? ` ${className}` : ""}`}>
        {lottie}
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div className={`loading loading--page${className ? ` ${className}` : ""}`}>
        {lottie}
      </div>
    );
  }

  if (variant === "section") {
    return (
      <div className={`loading loading--section${className ? ` ${className}` : ""}`}>
        {lottie}
      </div>
    );
  }

  if (variant === "button") {
    return (
      <span className={`loading loading--button${className ? ` ${className}` : ""}`}>
        {lottie}
      </span>
    );
  }

  // inline (default)
  return (
    <span className={`loading loading--inline${className ? ` ${className}` : ""}`}>
      {lottie}
    </span>
  );
}
