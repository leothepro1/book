import type { Card, CategoryCard } from "@/app/(guest)/_lib/portal/homeLinks";

export type LooseCard = Exclude<Card, CategoryCard>;

export type HomeItem =
  | { kind: "card";     sortOrder: number; card: LooseCard }
  | { kind: "category"; sortOrder: number; category: CategoryCard; cards: LooseCard[] };

/** Check if a card is currently visible based on its schedule */
function isScheduleVisible(card: { scheduledShow?: string; scheduledHide?: string }): boolean {
  const now = Date.now();
  if (card.scheduledShow && new Date(card.scheduledShow).getTime() > now) return false;
  if (card.scheduledHide && new Date(card.scheduledHide).getTime() <= now) return false;
  return true;
}

/**
 * Takes the raw cards array from HomeConfig and returns a sorted list
 * of HomeItems — either a loose card or a fully-resolved category.
 * A card that belongs to an ACTIVE category will NOT appear as a loose card.
 * Cards in inactive categories are released back to the loose card pool.
 */
export function resolveHomeItems(cards: Card[]): HomeItem[] {
  // 1. Collect cardIds owned by ACTIVE categories only.
  //    Cards in inactive categories should appear as loose cards.
  const ownedIds = new Set<string>();
  for (const card of cards) {
    if (card.type === "category" && card.isActive) {
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
      // Skip inactive categories entirely
      if (!card.isActive) continue;

      const category = card as CategoryCard;
      const resolvedCards = category.cardIds
        .map(id => cardMap.get(id))
        .filter((c): c is LooseCard => !!c && c.isActive && isScheduleVisible(c));

      // Only include categories that have visible child cards
      if (resolvedCards.length > 0) {
        items.push({
          kind: "category",
          sortOrder: category.sortOrder,
          category,
          cards: resolvedCards,
        });
      }
    } else if (!ownedIds.has(card.id) && card.isActive && isScheduleVisible(card)) {
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
