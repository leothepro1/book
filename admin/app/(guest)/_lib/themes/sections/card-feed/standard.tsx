/**
 * Card Feed Section — "standard" variant
 *
 * The default card feed layout:
 * - Resolves home cards from config
 * - Renders categories (with their layout: stack/grid/slider/showcase)
 * - Renders loose cards individually
 * - Sorted by sortOrder
 *
 * This section has no custom settings — all content comes from
 * config.home.cards which is managed in the admin Home editor.
 * Cards are home-specific legacy content and always read from config.home.
 */

import { resolveHomeItems } from "../../../../_components/cards/resolveHomeItems";
import { CategorySection } from "../../../../_components/cards/CategorySection";
import { LooseCardItem } from "../../../../_components/cards/LooseCardItem";
import { registerSection } from "../../registry";
import type { SectionProps } from "../../types";

function CardFeedStandard({ config, token }: SectionProps) {
  const items = resolveHomeItems(config.home?.cards ?? []);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      {items.map((item) =>
        item.kind === "category" ? (
          <CategorySection
            key={item.category.id}
            category={item.category}
            cards={item.cards}
            radius={config.theme.buttons.radius}
          />
        ) : (
          <LooseCardItem
            key={item.card.id}
            card={item.card}
            token={token}
            radius={config.theme.buttons.radius}
          />
        ),
      )}
    </div>
  );
}

registerSection("card-feed", "standard", CardFeedStandard);

export default CardFeedStandard;
