/**
 * Quick Links Section — "grid" variant (Classic theme)
 *
 * Horizontal slider layout:
 * - Scrollable row of pill-shaped containers (border-radius: 50px)
 * - Icon + label inside each pill
 * - Static utility links only (no check-in/check-out — handled by checkin-slot)
 *
 * Settings:
 *   columns — not used in slider mode (kept for backwards compat)
 */

import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

type QuickLinksGridSettings = {
  columns?: number;
};

type Tile = {
  id: string;
  label: string;
  svg: React.ReactNode;
  href?: string;
  disabled?: boolean;
};

/* ── Tile icons ──────────────────────────────────────────── */

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true as const,
  width: 20,
  height: 20,
};

const STROKE = {
  stroke: "var(--text)",
  strokeWidth: "1.5",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const MAP_ICON = (
  <svg {...ICON_PROPS}>
    <path d="m1 6 8-4 6 4 8-4v16l-8 4-6-4-8 4V6Z" {...STROKE} />
    <path d="M9 2v16m6-12v16" {...STROKE} />
  </svg>
);

const INFO_ICON = (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="11.25" stroke="var(--text)" strokeWidth="1.5" />
    <path d="M12 10.5V18" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 6v.5" stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const WIFI_ICON = (
  <svg {...ICON_PROPS}>
    <path d="M12 19.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" fill="var(--text)" />
    <path d="M6.713 13.428a7.5 7.5 0 0 1 10.568 0M3.532 10.247a12 12 0 0 1 16.935 0M.781 6.652a16.5 16.5 0 0 1 22.438 0" {...STROKE} />
  </svg>
);

const STATIC_TILES: Tile[] = [
  { id: "map", label: "Karta", svg: MAP_ICON },
  { id: "info", label: "Info", svg: INFO_ICON },
  { id: "wifi", label: "Wi-Fi", svg: WIFI_ICON },
];

/* ── Component ─────────────────────────────────────────── */

function QuickLinksGrid({}: SectionProps<QuickLinksGridSettings>) {
  const tiles: Tile[] = STATIC_TILES;

  return (
    <div
      style={{
        marginTop: 21,
        display: "flex",
        gap: 10,
        overflowX: "auto",
        scrollbarWidth: "none",
        paddingBottom: 4,
      }}
    >
      {tiles.map((tile) => {
        const disabled = !!tile.disabled;

        const pill = (
          <button
            type="button"
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 50,
              border: "none",
              background: "var(--tile-bg)",
              boxShadow: "var(--tile-shadow)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "opacity 0.15s ease",
            }}
          >
            {tile.svg}
            <span
              style={{
                fontWeight: 600,
                fontSize: 13.5,
                lineHeight: 1,
                color: "var(--text)",
                fontFamily: "var(--font-body)",
              }}
            >
              {tile.label}
            </span>
          </button>
        );

        if (tile.href && !disabled) {
          return (
            <a key={tile.id} href={tile.href} style={{ textDecoration: "none", flexShrink: 0 }}>
              {pill}
            </a>
          );
        }

        return <div key={tile.id} style={{ flexShrink: 0 }}>{pill}</div>;
      })}
    </div>
  );
}

registerSection("quick-links", "grid", QuickLinksGrid);

export default QuickLinksGrid;
