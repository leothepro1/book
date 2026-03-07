import type { ThemeConfig, FontKey } from "./types";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";

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
    "--button-radius": (() => {
      const r = theme?.buttons?.radius ?? "rounder";
      if (r === "square") return "0px";
      if (r === "rounded") return "8px";
      if (r === "round") return "12px";
      if (r === "rounder") return "16px";
      return "999px";
    })(),

    "--tile-bg": theme.tiles?.background ?? "#F1F0EE",
    "--tile-radius": (() => {
      const r = theme.tiles?.radius ?? "round";
      if (r === "square") return "0px";
      if (r === "rounded") return "8px";
      if (r === "round") return "12px";
      if (r === "rounder") return "16px";
      return "999px";
    })(),
    "--tile-shadow": (() => {
      const s = theme.tiles?.shadow ?? "none";
      if (s === "soft") return "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)";
      if (s === "strong") return "0 4px 12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)";
      if (s === "hard") return "0 8px 24px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)";
      return "none";
    })(),
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
    radius === "square"
      ? "rounded-none"
      : radius === "rounded"
      ? "rounded-lg"
      : radius === "round"
      ? "rounded-xl"
      : radius === "rounder"
      ? "rounded-2xl"
      : "rounded-full";

  const shadowClass =
    shadow === "none"
      ? "shadow-none"
      : shadow === "soft"
      ? "shadow"
      : shadow === "strong"
      ? "shadow-lg"
      : "shadow-2xl";

  const base =
    "inline-flex w-full items-start justify-start gap-2 px-4 py-4 text-sm font-semibold transition g-btn-font";

  const solid = "bg-[var(--button-bg)] text-[var(--button-fg)]";
  const outline =
    "border border-[var(--border)] bg-transparent text-[var(--text)]";

  return [base, radiusClass, shadowClass, variant === "solid" ? solid : outline].join(
    " "
  );
}
