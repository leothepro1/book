import type { ThemeConfig } from "./types";

/**
 * Converts ThemeConfig.background → React inline CSS properties.
 * Applied to the .min-h-dvh wrapper in the guest layout.
 */
export function backgroundStyle(bg: ThemeConfig["background"], colors?: ThemeConfig["colors"]): React.CSSProperties {
  switch (bg.mode) {
    case "fill":
      return { background: "var(--background)" };

    case "gradient":
      return gradientStyle(colors?.background, bg.gradientDirection);

    case "image":
      return imageStyle(bg.imageUrl, bg.overlayOpacity);

    default:
      return { background: "var(--background)" };
  }
}

/* ── Helpers ── */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/** Shift hue, boost saturation, and lighten to create a vibrant companion color */
function vibrantShift(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(
    h - 35,
    Math.min(s + 0.15, 1),
    Math.min(l + 0.12, 0.85),
  );
}

/* ── Gradient ── */

function gradientStyle(
  color?: string,
  direction?: "up" | "down",
): React.CSSProperties {
  const base = color || "#ffffff";
  const isHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(base);
  const end = isHex ? vibrantShift(base) : base;
  const dir = direction === "up" ? "to top" : "to bottom";

  return {
    background: `linear-gradient(${dir}, ${base}, ${end})`,
  };
}

/* ── Image ── */

/** Inject Cloudinary transforms into an existing Cloudinary URL */
function optimizeCloudinaryUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  // Insert responsive transforms after /upload/
  return url.replace(
    "/upload/",
    "/upload/w_1600,c_limit,q_auto:low,f_auto,dpr_auto,fl_strip_profile/",
  );
}

function imageStyle(
  imageUrl?: string,
  overlayOpacity?: number,
): React.CSSProperties {
  if (!imageUrl) {
    return { background: "var(--background)" };
  }

  const optimized = optimizeCloudinaryUrl(imageUrl);
  const opacity = Math.min(Math.max(overlayOpacity ?? 0.3, 0), 1);
  const overlay = `linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity}))`;

  return {
    backgroundImage: `${overlay}, url(${optimized})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}
