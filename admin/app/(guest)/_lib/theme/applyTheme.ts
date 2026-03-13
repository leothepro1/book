import type { ThemeConfig, ButtonRadius, ButtonShadow } from "./types";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import type { FontKey } from "./types";

// ─── Font Stack Resolution ───────────────────────────────

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
const SERIF_FALLBACK = "ui-serif, Georgia, Times New Roman, serif";

const fontStackMap = new Map<string, string>();
for (const f of FONT_CATALOG) {
  const fallback = f.serif ? SERIF_FALLBACK : SANS_FALLBACK;
  fontStackMap.set(f.key, `${f.label}, ${fallback}`);
}
fontStackMap.set("system", SANS_FALLBACK);

function fontStack(key: FontKey): string {
  return fontStackMap.get(key) || SANS_FALLBACK;
}

// ─── Design Token Maps ──────────────────────────────────

const RADIUS_MAP: Record<ButtonRadius, string> = {
  square: "0px",
  rounded: "8px",
  round: "12px",
  rounder: "16px",
  full: "999px",
};

const SHADOW_MAP: Record<ButtonShadow, string> = {
  none: "none",
  soft: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
  strong: "0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
  hard: "0 8px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
};

// ─── ThemeConfig → CSS Custom Properties ─────────────────

export function themeToStyleAttr(theme: ThemeConfig) {
  return {
    "--background": theme.colors.background,
    "--text": theme.colors.text,
    "--button-bg": theme.colors.buttonBg,
    "--button-fg": theme.colors.buttonText,
    "--muted-opacity": String(theme.typography.mutedOpacity ?? 0.72),
    "--font-heading": fontStack(theme.typography.headingFont),
    "--font-body": fontStack(theme.typography.bodyFont),
    "--font-button": fontStack(theme.typography.buttonFont ?? theme.typography.headingFont),
    "--button-radius": theme.buttons?.radiusPx != null
      ? `${theme.buttons.radiusPx}px`
      : RADIUS_MAP[theme.buttons?.radius ?? "rounder"],
    ...(theme.buttons?.padding ? {
      "--button-padding": `${theme.buttons.padding.top}px ${theme.buttons.padding.right}px ${theme.buttons.padding.bottom}px ${theme.buttons.padding.left}px`,
    } : {}),
    "--tile-bg": theme.tiles?.background ?? "#F1F0EE",
    "--tile-radius": RADIUS_MAP[theme.tiles?.radius ?? "round"],
    "--tile-shadow": SHADOW_MAP[theme.tiles?.shadow ?? "none"],
  } as React.CSSProperties;
}

// ─── Button Class Builder ────────────────────────────────

const RADIUS_CLASS: Record<ButtonRadius, string> = {
  square: "rounded-none",
  rounded: "rounded-lg",
  round: "rounded-xl",
  rounder: "rounded-2xl",
  full: "rounded-full",
};

const SHADOW_CLASS: Record<ButtonShadow, string> = {
  none: "shadow-none",
  soft: "shadow",
  strong: "shadow-lg",
  hard: "shadow-2xl",
};

/**
 * Controlled button styling (white-label safe).
 * Uses limited presets from ThemeConfig.buttons.
 */
export function buttonClass(theme: Pick<ThemeConfig, "buttons">): string {
  const variant = theme.buttons?.variant ?? "solid";
  const radius = theme.buttons?.radius ?? "rounder";
  const shadow = theme.buttons?.shadow ?? "soft";

  const base =
    "inline-flex w-full items-start justify-start gap-2 px-4 py-4 text-sm font-semibold transition g-btn-font";
  const solid = "bg-[var(--button-bg)] text-[var(--button-fg)]";
  const outline =
    "border border-[var(--border)] bg-transparent text-[var(--text)]";

  return [
    base,
    RADIUS_CLASS[radius],
    SHADOW_CLASS[shadow],
    variant === "solid" ? solid : outline,
  ].join(" ");
}
