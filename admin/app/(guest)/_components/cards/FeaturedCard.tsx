import type { LooseCard } from "./resolveHomeItems";
import { cardImageUrl } from "./cardImage";

export function FeaturedCard({
  card,
  aspectRatio = "5 / 3.5",
}: {
  card: LooseCard;
  aspectRatio?: string;
}) {
  const imgUrl = cardImageUrl(card.image, "featured");

  return (
    <div
      className="guest-featured-card"
      style={{ aspectRatio }}
    >
      <div
        className="guest-featured-card__bg"
        style={{
          backgroundImage: imgUrl
            ? `linear-gradient(rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.80) 100%), url("${imgUrl}")`
            : `linear-gradient(rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.80) 100%)`,
        }}
      />
      <div className="guest-featured-card__content">
        <span className="guest-featured-card__title">{card.title}</span>
        {card.badge && (
          <span className="guest-featured-card__badge">{card.badge}</span>
        )}
      </div>
    </div>
  );
}
