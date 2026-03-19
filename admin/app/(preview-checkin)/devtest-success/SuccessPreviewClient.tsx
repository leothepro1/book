"use client";

import { useMemo } from "react";
import { PreviewProvider, usePreview } from "@/app/(admin)/_components/GuestPreview";
import { themeToStyleAttr } from "@/app/(guest)/_lib/theme/applyTheme";
import type { CardDesignConfig } from "@/app/_lib/access-pass/card-design";
import "@/app/(guest)/check-in/checkin.css";
import "@/app/_lib/access-pass/wallet-success.css";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

type Props = {
  initialConfig: TenantConfig;
  cardDesign: CardDesignConfig;
  dateLabel: string;
};

export default function SuccessPreviewClient({ initialConfig, cardDesign, dateLabel }: Props) {
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <SuccessPreviewInner cardDesign={cardDesign} dateLabel={dateLabel} />
    </PreviewProvider>
  );
}

/**
 * Flatten CardDesignConfig into a single inline style object.
 * Zero child elements, zero img tags — pure CSS rendering.
 * Logo via background-image, overlay via box-shadow inset.
 */
function flattenCardStyle(design: CardDesignConfig): React.CSSProperties {
  const bg = design.background;
  const layers: string[] = [];

  // Logo as background-image layer (top-left, no-repeat, contained)
  if (design.logoUrl) {
    layers.push(`url(${design.logoUrl}) 18px 16px / auto 32px no-repeat`);
  }

  // Overlay for IMAGE mode (dark inset)
  if (bg.mode === "IMAGE" && bg.overlayOpacity && bg.overlayOpacity > 0) {
    layers.push(`linear-gradient(rgba(0,0,0,${bg.overlayOpacity}), rgba(0,0,0,${bg.overlayOpacity}))`);
  }

  // Main background
  switch (bg.mode) {
    case "SOLID":
      layers.push(bg.color);
      break;
    case "GRADIENT":
      layers.push(`linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`);
      break;
    case "IMAGE":
      layers.push(`url(${bg.imageUrl}) center / cover no-repeat`);
      layers.push("#1a1a2e"); // fallback while image loads
      break;
  }

  return {
    background: layers.join(", "),
    aspectRatio: "3.375 / 2.125",
    borderRadius: 12,
  };
}

function SuccessPreviewInner({ cardDesign, dateLabel }: { cardDesign: CardDesignConfig; dateLabel: string }) {
  const { config } = usePreview();

  const themeVars = useMemo(() => {
    if (!config?.theme) return {} as React.CSSProperties;
    return themeToStyleAttr(config.theme);
  }, [config?.theme]);

  const tenantName = config?.property?.name || "Hotellet";

  return (
    <div
      style={{
        ...themeVars,
        background: "var(--background, #fff)",
        minHeight: "100vh",
        padding: "0",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 18px" }}>
        <div className="sektion73-success" style={{ background: "transparent" }}>
          <div className="sektion73-success__top">
            <div className="sektion73-success__title" style={{ color: "var(--text, #121212)" }}>
              Välkommen!
            </div>
            <div className="sektion73-success__body">
              Incheckningen är klar. Varmt välkommen till {tenantName}!
            </div>
          </div>

          {/* Wallet card with holder animation */}
          <div className="wallet-container">
            <div className="wallet-stage">
              {/* Holder + shadow — animate together */}
              <div className="wallet-holder-group">
                <div className="wallet-pass__shadow" />
                <div className="wallet-pass__holder">
                  <span className="material-symbols-rounded wallet-pass__holder-icon">sensors</span>
                </div>
              </div>
              {/* Card — tenant's wallet card, single-element GPU-composited */}
              <div className="wallet-pass">
                <div style={{ ...flattenCardStyle(cardDesign), display: "flex", justifyContent: "flex-end", padding: "16px 18px" }}>
                  <span style={{ color: cardDesign.dateTextColor, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", lineHeight: 1 }}>
                    {dateLabel}
                  </span>
                </div>
              </div>
              {/* Shine — separate layer, animates independently after card settles */}
              <div className="wallet-pass__shine" />
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div className="sektion73-cta" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="sektion73-btn sektion73-btn--primary"
              onClick={() => {}}
            >
              Fortsätt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
