import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { ClassicCard }   from "./ClassicCard";
import { FeaturedCard }  from "./FeaturedCard";
import { ShowcaseCard }  from "./ShowcaseCard";

export function LooseCardItem({
  card,
  token,
  radius,
}: {
  card: LooseCard;
  token?: string;
  radius?: ButtonRadius;
}) {
  const href =
    card.type === "link"     ? card.url :
    card.type === "article"  ? `/p/${token}/article/${card.slug}` :
    card.type === "download" ? card.fileUrl :
    undefined;

  const layout = (card as any).layoutStyle ?? "classic";

  const inner =
    layout === "featured" ? <FeaturedCard card={card} /> :
    layout === "showcase" ? <ShowcaseCard card={card} /> :
    <ClassicCard card={card} radius={radius} />;

  if (!href) return inner;

  return (
    <a
      href={href}
      style={{ textDecoration: "none", display: "block" }}
      target={card.type === "link" && card.openMode === "external" ? "_blank" : undefined}
      rel={card.type === "link" && card.openMode === "external" ? "noopener noreferrer" : undefined}
    >
      {inner}
    </a>
  );
}
