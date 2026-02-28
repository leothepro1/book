export type BackgroundMode = "fill" | "gradient" | "blur" | "image";

export type ButtonVariant = "solid" | "outline";
export type ButtonRadius = "square" | "rounded" | "round" | "rounder" | "full";
export type ButtonShadow = "none" | "soft" | "strong" | "hard";

export type FontKey = "inter" | "system" | "poppins" | "dm_sans" | "playfair";

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
    gradientId?: "g1" | "g2" | "g3" | "g4" | "g5" | "g6";
    imageUrl?: string;
    overlayOpacity?: number; // 0..0.7
    blurStrength?: 0 | 8 | 16 | 24;
  };

  buttons: {
    variant: ButtonVariant;
    radius: ButtonRadius;
    shadow: ButtonShadow;
  };

  typography: {
    headingFont: FontKey;
    bodyFont: FontKey;
    mutedOpacity: number;
  };
};
