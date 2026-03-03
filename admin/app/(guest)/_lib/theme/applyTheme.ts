import type { ThemeConfig, FontKey } from "./types";

function fontStack(key: FontKey): string {
  const sans = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const serif = "ui-serif, Georgia, Times New Roman, serif";

  const map: Record<FontKey, string> = {
    albert_sans: `Albert Sans, ${sans}`,
    dm_sans: `DM Sans, ${sans}`,
    epilogue: `Epilogue, ${sans}`,
    ibm_plex_sans: `IBM Plex Sans, ${sans}`,
    inter: `Inter, ${sans}`,
    link_sans: `Link Sans, ${sans}`,
    manrope: `Manrope, ${sans}`,
    oxanium: `Oxanium, ${sans}`,
    poppins: `Poppins, ${sans}`,
    red_hat_display: `Red Hat Display, ${sans}`,
    roboto: `Roboto, ${sans}`,
    rubik: `Rubik, ${sans}`,
    space_grotesk: `Space Grotesk, ${sans}`,
    syne: `Syne, ${sans}`,
    biorhyme: `BioRhyme, ${serif}`,
    bitter: `Bitter, ${serif}`,
    caudex: `Caudex, ${serif}`,
    corben: `Corben, ${serif}`,
    domine: `Domine, ${serif}`,
    hahmlet: `Hahmlet, ${serif}`,
    avenir: `Avenir, ${sans}`,
    playfair: `Playfair Display, ${serif}`,
    system: sans,
  };

  return map[key] || sans;
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
    "--button-radius": (() => {
      const r = theme?.buttons?.radius ?? "rounder";
      if (r === "square") return "0px";
      if (r === "rounded") return "8px";
      if (r === "round") return "12px";
      if (r === "rounder") return "16px";
      return "999px";
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
    "inline-flex w-full items-start justify-start gap-2 px-4 py-4 text-sm font-semibold transition";

  const solid = "bg-[var(--button-bg)] text-[var(--button-fg)]";
  const outline =
    "border border-[var(--border)] bg-transparent text-[var(--text)]";

  return [base, radiusClass, shadowClass, variant === "solid" ? solid : outline].join(
    " "
  );
}
