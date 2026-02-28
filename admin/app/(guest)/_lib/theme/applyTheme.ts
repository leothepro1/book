import type { ThemeConfig } from "./types";

export function themeToStyleAttr(theme: ThemeConfig) {
  return {
    "--background": theme.colors.background,
    "--text": theme.colors.text,
    "--button-bg": theme.colors.buttonBg,
    "--button-fg": theme.colors.buttonText,
  } as React.CSSProperties;
}
