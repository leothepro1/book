import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { resolveCardRenderer } from "./LooseCardItem";

export function SliderLayout({ cards, radius, cardLayout }: { cards: LooseCard[]; radius?: ButtonRadius; cardLayout?: string }) {
  return (
    <div className="guest-layout-slider">
      {cards.map(card => (
        <div key={card.id} className="guest-layout-slider__item">
          {resolveCardRenderer(card, { card, radius })}
        </div>
      ))}
    </div>
  );
}
