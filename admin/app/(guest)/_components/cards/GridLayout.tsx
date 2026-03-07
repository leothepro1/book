import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { resolveCardRenderer } from "./LooseCardItem";
import { ShowcaseCard } from "./ShowcaseCard";
import { getCardTypeConfig, getDefaultLayoutKey } from "@/app/_lib/cardTypes/registry";
import { GUEST_LAYOUT_RENDERERS } from "./LooseCardItem";

export function GridLayout({ cards, radius }: { cards: LooseCard[]; radius?: ButtonRadius }) {
  return (
    <div className="guest-layout-grid">
      {cards.map(card => {
        const layoutKey = (card as any).layoutStyle ?? getDefaultLayoutKey(card.cardType);
        const isFullWidth = layoutKey === "featured" || layoutKey === "showcase";
        const ctConfig = getCardTypeConfig(card.cardType);
        const layoutConfig = ctConfig.layouts.find(l => l.key === layoutKey);
        const hasCustomRenderer = !!(layoutConfig?.guestRenderer && GUEST_LAYOUT_RENDERERS[layoutConfig.guestRenderer]);

        return (
          <div key={card.id} className={isFullWidth ? "guest-layout-grid__item--full" : "guest-layout-grid__item"}>
            {hasCustomRenderer
              ? resolveCardRenderer(card, { card, radius })
              : <ShowcaseCard card={card} aspectRatio={isFullWidth ? "5 / 3.5" : "4 / 3"} />
            }
          </div>
        );
      })}
    </div>
  );
}
