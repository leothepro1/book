import type { LooseCard } from "./resolveHomeItems";
import { cardImageUrl } from "./cardImage";

export function ShowcaseCard({
  card,
  aspectRatio = "5 / 3.5",
}: {
  card: LooseCard;
  aspectRatio?: string;
}) {
  const imgUrl = cardImageUrl(card.image, "showcase");

  return (
    <div className="guest-showcase-card">
      <div
        className="guest-showcase-card__image"
        style={{
          aspectRatio,
          backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
        }}
      >
        {!imgUrl && (
          <div className="guest-showcase-card__image-empty">
            <svg width="28" height="28" viewBox="0 0 256 256" fill="currentColor" opacity="0.2">
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
            </svg>
          </div>
        )}
        {card.badge && (
          <span className="guest-showcase-card__badge">{card.badge}</span>
        )}
      </div>
      <div className="guest-showcase-card__content">
        <span className="guest-showcase-card__title">{card.title}</span>
        {card.ctaLabel && (
          <span className="guest-showcase-card__cta">{card.ctaLabel} →</span>
        )}
      </div>
    </div>
  );
}
