import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { resolveCardRenderer } from "./LooseCardItem";

export function StackLayout({ cards, radius }: { cards: LooseCard[]; radius?: ButtonRadius }) {
  return (
    <div className="guest-layout-stack">
      {cards.map(card => (
        <div key={card.id} className="guest-layout-stack__item">
          {resolveCardRenderer(card, { card, radius })}
        </div>
      ))}
    </div>
  );
}
