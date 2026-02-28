import type { ThemeConfig } from "./types";

export function themeToStyleAttr(theme: ThemeConfig) {
  return {
    "--background": theme.colors.background,
    "--text": theme.colors.text,
    "--button-bg": theme.colors.buttonBg,
    "--button-fg": theme.colors.buttonText,
  } as React.CSSProperties;
}

/**
 * Controlled button styling (white-label safe).
 * Uses limited presets from ThemeConfig.buttons if present, otherwise defaults.
 */
export function buttonClass(theme: any): string {
  const variant = theme?.buttons?.variant ?? "solid";
  const radius = theme?.buttons?.radius ?? "rounder";
  const shadow = theme?.buttons?.shadow ?? "soft";

  const radiusClass =
    radius === "square" ? "rounded-none" :
    radius === "rounded" ? "rounded-lg" :
    radius === "round" ? "rounded-xl" :
    radius === "rounder" ? "rounded-2xl" :
    "rounded-full";

  const shadowClass =
    shadow === "none" ? "shadow-none" :
    shadow === "soft" ? "shadow" :
    shadow === "strong" ? "shadow-lg" :
    "shadow-2xl";

  const base =
    "inline-flex w-full items-start justify-start gap-2 px-4 py-4 text-sm font-semibold transition";

  const solid = "bg-[var(--button-bg)] text-[var(--button-fg)]";
  const outline = "border border-[var(--border)] bg-transparent text-[var(--text)]";

  return [base, radiusClass, shadowClass, variant === "solid" ? solid : outline].join(" ");
}
