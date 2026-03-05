import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { cardImageUrl } from "./cardImage";

function imageRadius(r?: ButtonRadius): string {
  switch (r) {
    case "square":  return "4px";
    case "rounded": return "8px";
    case "round":   return "12px";
    case "rounder": return "16px";
    case "full":    return "999px";
    default:        return "10px";
  }
}

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

export function ClassicCard({
  card,
  radius,
}: {
  card: LooseCard;
  radius?: ButtonRadius;
}) {
  const imgUrl = cardImageUrl(card.image, "classic");

  return (
    <div
      className="guest-classic-card"
      style={{ borderRadius: cardRadius(radius) }}
    >
      <div
        className="guest-classic-card__image"
        style={{
          borderRadius: imageRadius(radius),
          backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
        }}
      >
        {!imgUrl && (
          <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" opacity="0.25">
            <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
          </svg>
        )}
      </div>
      <span className="guest-classic-card__title">{card.title}</span>
      {card.badge && (
        <span className="guest-classic-card__badge">{card.badge}</span>
      )}
    </div>
  );
}
