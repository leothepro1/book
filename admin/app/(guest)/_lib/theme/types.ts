import type { CatalogFontKey } from "@/app/_lib/fonts/catalog";

export type BackgroundMode = "fill" | "gradient" | "image";

export type GradientDirection = "up" | "down";
export type ButtonVariant = "solid" | "outline";
export type ButtonRadius = "square" | "rounded" | "round" | "rounder" | "full";
export type ButtonShadow = "none" | "soft" | "strong" | "hard";

export type FontKey = CatalogFontKey | "system";

export type ThemeConfig = {
  version: 1;

  colors: {
    background: string;  // --background
    text: string;        // --text
    buttonBg: string;    // --button-bg
    buttonText: string;  // --button-fg
  };

  header: {
    logoUrl?: string;
    logoWidth?: number;
  };

  background: {
    mode: BackgroundMode;
    // Fill: uses colors.background directly

    // Gradient
    gradientDirection?: GradientDirection;

    // Image
    imageUrl?: string;
    overlayOpacity?: number; // 0..1
  };

  buttons: {
    variant: ButtonVariant;
    radius: ButtonRadius;
    radiusPx?: number;  // numeric override — takes precedence over enum `radius`
    shadow: ButtonShadow;
    padding?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };

  typography: {
    headingFont: FontKey;
    bodyFont: FontKey;
    buttonFont?: FontKey; // undefined = inherits headingFont
    mutedOpacity: number;
  };

  tiles?: {
    background: string;       // hex color  → --tile-bg
    radius: ButtonRadius;     // reuses button radius type → --tile-radius
    shadow: ButtonShadow;     // reuses button shadow type → --tile-shadow
  };

};
