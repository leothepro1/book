import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { ClassicCard }  from "./ClassicCard";
import { FeaturedCard } from "./FeaturedCard";
import { ShowcaseCard } from "./ShowcaseCard";

export function SliderLayout({ cards, radius }: { cards: LooseCard[]; radius?: ButtonRadius }) {
  return (
    <div className="guest-layout-slider">
      {cards.map(card => {
        const layout = (card as any).layoutStyle ?? "classic";
        return (
          <div key={card.id} className="guest-layout-slider__item">
            {layout === "featured" ? <FeaturedCard card={card} aspectRatio="3 / 2" /> :
             layout === "showcase" ? <ShowcaseCard card={card} aspectRatio="3 / 2" /> :
             <ClassicCard card={card} radius={radius} />}
          </div>
        );
      })}
    </div>
  );
}
