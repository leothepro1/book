import type { ThemeConfig } from "./types";

export function backgroundStyle(bg: ThemeConfig["background"]): React.CSSProperties {
  if (bg.mode === "fill") {
    return { background: "var(--background)" };
  }

  if (bg.mode === "gradient") {
    // Presets kan kopplas in senare; tills dess fallback till background.
    return { background: "var(--background)" };
  }

  if (bg.mode === "image") {
    const overlay = Math.min(Math.max(bg.overlayOpacity ?? 0.35, 0), 0.7);
    const img = bg.imageUrl ? `url(${bg.imageUrl})` : "";
    const layers = [
      `linear-gradient(180deg, rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay}))`,
      img,
    ].filter(Boolean).join(", ");

    return {
      backgroundImage: layers,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  // blur
  return {
    background: "var(--background)",
    backdropFilter: `blur(${bg.blurStrength ?? 16}px)`,
  };
}
