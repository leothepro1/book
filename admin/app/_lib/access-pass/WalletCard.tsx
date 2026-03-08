"use client";

import type { CardDesignConfig } from "./card-design";
import "./wallet-card.css";

interface WalletCardProps {
  design: CardDesignConfig;
  dateLabel: string;
  className?: string;
}

/**
 * The canonical wallet card component.
 *
 * This is the SINGLE SOURCE OF TRUTH for how the check-in card looks.
 * Used in:
 *  - Admin preview panel (live editing)
 *  - Apple Wallet renderer (screenshot → .pkpass)
 *  - Google Wallet renderer (screenshot → JWT payload)
 *  - Guest portal card display
 *
 * Any change here changes ALL rendered cards everywhere.
 */
export function WalletCard({ design, dateLabel, className = "" }: WalletCardProps) {
  const bg = design.background;
  const isImage = bg.mode === "IMAGE";

  return (
    <div className={`wallet-card ${className}`} style={resolveBackgroundStyle(design)}>
      {isImage && bg.overlayOpacity != null && bg.overlayOpacity > 0 && (
        <div className="wallet-card__overlay" style={{ opacity: bg.overlayOpacity }} />
      )}
      <div className="wallet-card__header">
        <div className="wallet-card__logo">
          {design.logoUrl ? (
            <img src={design.logoUrl} alt="" className="wallet-card__logo-img" />
          ) : (
            <div className="wallet-card__logo-placeholder" />
          )}
        </div>
        <span className="wallet-card__dates" style={{ color: design.dateTextColor }}>
          {dateLabel}
        </span>
      </div>
    </div>
  );
}

function resolveBackgroundStyle(design: CardDesignConfig): React.CSSProperties {
  const bg = design.background;
  switch (bg.mode) {
    case "SOLID":
      return { background: bg.color };
    case "GRADIENT":
      return { background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` };
    case "IMAGE":
      return { backgroundImage: `url(${bg.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#1a1a2e" };
  }
}
