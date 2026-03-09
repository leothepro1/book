/**
 * Quick Links Section — "floating-bar" variant
 *
 * Immersive horizontal pill bar:
 * - Horizontally scrollable row of icon-only pills
 * - Frosted glass background (backdrop-blur)
 * - Negative top margin to overlap with previous section (hero)
 * - No labels — icon-only for a clean, minimal look
 *
 * Designed to overlay the bottom of a fullscreen hero.
 *
 * Settings:
 *   showLabels — Show text labels below icons (default: false)
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

type FloatingBarSettings = {
  showLabels?: boolean;
};

type Tile = {
  id: string;
  label: string;
  svg: React.ReactNode;
  href?: string;
  disabled?: boolean;
};

const STROKE = {
  stroke: "white",
  strokeWidth: "1.5",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true as const,
  style: { width: 22, height: 22 } as React.CSSProperties,
};

const MAP_ICON = (
  <svg {...ICON_PROPS}>
    <path d="m1 6 8-4 6 4 8-4v16l-8 4-6-4-8 4V6Z" {...STROKE} />
    <path d="M9 2v16m6-12v16" {...STROKE} />
  </svg>
);

const INFO_ICON = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="11.25" stroke="white" strokeWidth="1.5" />
    <path d="M12 10.5V18" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 6v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const STATIC_TILES: Tile[] = [
  { id: "map", label: "Karta", svg: MAP_ICON },
  { id: "info", label: "Info", svg: INFO_ICON },
];

function QuickLinksFloatingBar({ settings }: SectionProps<FloatingBarSettings>) {
  const showLabels = settings.showLabels === true;
  const tiles: Tile[] = STATIC_TILES;

  return (
    <div
      style={{
        marginTop: -64,
        position: "relative",
        zIndex: 10,
        display: "flex",
        justifyContent: "center",
        padding: "0 17px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
      >
        {tiles.map((tile) => {
          const disabled = !!tile.disabled;

          const pill = (
            <button
              key={tile.id}
              type="button"
              disabled={disabled}
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                border: "none",
                background: disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.18)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                opacity: disabled ? 0.45 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "background 0.15s ease",
                color: "white",
                padding: 0,
              }}
            >
              {tile.svg}
              {showLabels && (
                <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1, color: "white" }}>
                  {tile.label}
                </span>
              )}
            </button>
          );

          if (tile.href && !disabled) {
            return (
              <a key={tile.id} href={tile.href} style={{ textDecoration: "none" }}>
                {pill}
              </a>
            );
          }

          return <span key={tile.id}>{pill}</span>;
        })}
      </div>
    </div>
  );
}

registerSection("quick-links", "floating-bar", QuickLinksFloatingBar);

export default QuickLinksFloatingBar;
