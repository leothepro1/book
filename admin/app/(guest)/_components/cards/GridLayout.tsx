import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { ClassicCard }  from "./ClassicCard";
import { FeaturedCard } from "./FeaturedCard";
import { ShowcaseCard } from "./ShowcaseCard";

export function GridLayout({ cards, radius }: { cards: LooseCard[]; radius?: ButtonRadius }) {
  return (
    <div className="guest-layout-grid">
      {cards.map(card => {
        const layout = (card as any).layoutStyle ?? "classic";
        return (
          <div key={card.id} className="guest-layout-grid__item">
            {layout === "featured" ? <FeaturedCard card={card} aspectRatio="4 / 3" /> :
             layout === "showcase" ? <ShowcaseCard card={card} aspectRatio="4 / 3" /> :
             <ClassicCard card={card} radius={radius} />}
          </div>
        );
      })}
    </div>
  );
}
