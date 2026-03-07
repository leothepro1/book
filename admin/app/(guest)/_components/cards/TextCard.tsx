"use client";

import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { ClassicCard } from "./ClassicCard";
import { cardImageUrl } from "./cardImage";
import { MorphModal } from "./MorphModal";

function cardRadius(r?: ButtonRadius): string {
  switch (r) {
    case "square":  return "6px";
    case "rounded": return "10px";
    case "round":   return "14px";
    case "rounder": return "18px";
    case "full":    return "22px";
    default:        return "14px";
  }
}

/* ── Classic layout: title + body text, no image ── */

export function TextClassicCard({ card, radius }: { card: LooseCard; radius?: ButtonRadius }) {
  const bodyText: string = (card as any).content ?? "";
  const ctaLabel: string = card.ctaLabel ?? "";
  const ctaUrl: string = (card as any).ctaUrl ?? "";

  return (
    <MorphModal
      title={card.title}
      cardContent={
        <div
          className="guest-text-card"
          style={{ borderRadius: cardRadius(radius) }}
        >
          <span className="guest-text-card__title">{card.title}</span>
          {bodyText && (
            <p className="guest-text-card__body">{bodyText}</p>
          )}
        </div>
      }
      bodyContent={<p className="morph-modal__content">{bodyText}</p>}
      ctaLabel={ctaLabel}
      ctaUrl={ctaUrl}
      closeTitleStyle={{
        fontFamily: "var(--font-heading)",
        fontSize: 16,
        fontWeight: 600,
        textAlign: "left",
      }}
    />
  );
}

/* ── Compact layout: uses ClassicCard (image + centered title) ── */

export function TextCompactCard({ card, radius }: { card: LooseCard; radius?: ButtonRadius }) {
  const imgUrl = cardImageUrl(card.image, "classic");
  const bodyText: string = (card as any).content ?? "";
  const ctaLabel: string = card.ctaLabel ?? "";
  const ctaUrl: string = (card as any).ctaUrl ?? "";

  return (
    <MorphModal
      title={card.title}
      cardContent={<ClassicCard card={card} radius={radius} />}
      bodyContent={<p className="morph-modal__content">{bodyText}</p>}
      ctaLabel={ctaLabel}
      ctaUrl={ctaUrl}
      closeTitleStyle={{
        fontFamily: "var(--font-body)",
        fontSize: 15,
        fontWeight: 500,
        textAlign: "center",
      }}
      imageGhost={({ isAtCard, duration, ease }) => {
        const style: React.CSSProperties = {
          position: "absolute",
          top: 12,
          left: 14,
          width: 48,
          height: 48,
          borderRadius: 10,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
          backgroundColor: !imgUrl ? "var(--surface-muted, #f1f0ee)" : undefined,
          opacity: isAtCard ? 1 : 0,
          transition: `opacity ${duration} ${ease}`,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text)",
        };
        return (
          <div style={style}>
            {!imgUrl && (
              <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" opacity="0.25">
                <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
              </svg>
            )}
          </div>
        );
      }}
    />
  );
}
