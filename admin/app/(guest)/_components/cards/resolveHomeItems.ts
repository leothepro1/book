import type { Card, CategoryCard } from "@/app/(guest)/_lib/portal/homeLinks";

export type LooseCard = Exclude<Card, CategoryCard>;

export type HomeItem =
  | { kind: "card";     sortOrder: number; card: LooseCard }
  | { kind: "category"; sortOrder: number; category: CategoryCard; cards: LooseCard[] };

/**
 * Takes the raw cards array from HomeConfig and returns a sorted list
 * of HomeItems — either a loose card or a fully-resolved category.
 * A card that belongs to a category will NOT appear as a loose card.
 */
export function resolveHomeItems(cards: Card[]): HomeItem[] {
  // 1. Collect all cardIds owned by any category
  const ownedIds = new Set<string>();
  for (const card of cards) {
    if (card.type === "category") {
      for (const id of card.cardIds) ownedIds.add(id);
    }
  }

  // 2. Build a lookup map for fast resolution
  const cardMap = new Map<string, LooseCard>();
  for (const card of cards) {
    if (card.type !== "category") {
      cardMap.set(card.id, card as LooseCard);
    }
  }

  // 3. Build items list
  const items: HomeItem[] = [];

  for (const card of cards) {
    if (card.type === "category") {
      const category = card as CategoryCard;
      const resolvedCards = category.cardIds
        .map(id => cardMap.get(id))
        .filter((c): c is LooseCard => !!c && c.isActive);

      items.push({
        kind: "category",
        sortOrder: category.sortOrder,
        category,
        cards: resolvedCards,
      });
    } else if (!ownedIds.has(card.id) && card.isActive) {
      items.push({
        kind: "card",
        sortOrder: card.sortOrder,
        card: card as LooseCard,
      });
    }
  }

  // 4. Sort by sortOrder
  return items.sort((a, b) => a.sortOrder - b.sortOrder);
}
