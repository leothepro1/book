import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { ClassicCard }  from "./ClassicCard";
import { FeaturedCard } from "./FeaturedCard";
import { ShowcaseCard } from "./ShowcaseCard";

export function ShowcaseLayout({ cards, radius }: { cards: LooseCard[]; radius?: ButtonRadius }) {
  return (
    <div className="guest-layout-showcase">
      {cards.map(card => {
        const layout = (card as any).layoutStyle ?? "classic";
        return (
          <div key={card.id} className="guest-layout-showcase__item">
            {layout === "featured" ? <FeaturedCard card={card} /> :
             layout === "showcase" ? <ShowcaseCard card={card} /> :
             <ClassicCard card={card} radius={radius} />}
          </div>
        );
      })}
    </div>
  );
}
