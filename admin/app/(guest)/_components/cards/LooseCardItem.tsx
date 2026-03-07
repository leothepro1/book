import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import type { ReactNode } from "react";
import { getCardTypeConfig, getDefaultLayoutKey } from "@/app/_lib/cardTypes/registry";
import { ClassicCard }   from "./ClassicCard";
import { FeaturedCard }  from "./FeaturedCard";
import { ShowcaseCard }  from "./ShowcaseCard";
import { TextClassicCard, TextCompactCard } from "./TextCard";
import { HeaderCard } from "./HeaderCard";
import { DocClassicCard, DocCompactCard } from "./DocumentCard";

export type CardRendererProps = { card: LooseCard; token?: string; radius?: ButtonRadius };

/**
 * Registry for guest layout renderers, keyed by LayoutOption.guestRenderer.
 * Each card type's layouts reference these keys to determine how to render.
 * Built-in renderers (classic/featured/showcase) are handled in the default path.
 *
 * To add a custom layout renderer:
 *   1. Create your component
 *   2. Add it here with the matching guestRenderer key
 *   3. Reference the key in your card type's LayoutOption.guestRenderer
 */
export const GUEST_LAYOUT_RENDERERS: Record<string, (props: CardRendererProps) => ReactNode> = {
  "text-classic": ({ card, radius }) => <TextClassicCard card={card} radius={radius} />,
  "text-compact": ({ card, radius }) => <TextCompactCard card={card} radius={radius} />,
  "header-default": ({ card }) => <HeaderCard card={card} />,
  "doc-classic": ({ card, radius }) => <DocClassicCard card={card} radius={radius} />,
  "doc-compact": ({ card, radius }) => <DocCompactCard card={card} radius={radius} />,
};

/** Built-in layout keys that map to the existing card components */
const BUILTIN_RENDERERS: Record<string, (props: CardRendererProps) => ReactNode> = {
  classic:  ({ card, radius }) => <ClassicCard card={card} radius={radius} />,
  featured: ({ card }) => <FeaturedCard card={card} />,
  showcase: ({ card }) => <ShowcaseCard card={card} />,
};

/** Resolve the inner card component for a given card + layout */
export function resolveCardRenderer(
  card: LooseCard,
  props: CardRendererProps,
  aspectRatioOverride?: string,
): ReactNode {
  const ctConfig = getCardTypeConfig(card.cardType);
  const layoutKey = (card as any).layoutStyle ?? getDefaultLayoutKey(card.cardType);
  const layoutConfig = ctConfig.layouts.find(l => l.key === layoutKey);

  if (layoutConfig?.guestRenderer && GUEST_LAYOUT_RENDERERS[layoutConfig.guestRenderer]) {
    return GUEST_LAYOUT_RENDERERS[layoutConfig.guestRenderer](props);
  }
  if (BUILTIN_RENDERERS[layoutKey]) {
    return BUILTIN_RENDERERS[layoutKey](props);
  }
  return BUILTIN_RENDERERS.classic(props);
}

/** Resolve href for a card via registry, with legacy fallback */
function resolveHref(card: LooseCard, token?: string): string | undefined {
  const ctConfig = getCardTypeConfig(card.cardType);
  if (ctConfig.resolveHref) return ctConfig.resolveHref(card, token);
  // Legacy fallback for cards without cardType set
  if (card.type === "link") return card.url;
  if (card.type === "article") return `/p/${token}/article/${card.slug}`;
  if (card.type === "download") return card.fileUrl;
  return undefined;
}

export function LooseCardItem({
  card,
  token,
  radius,
}: {
  card: LooseCard;
  token?: string;
  radius?: ButtonRadius;
}) {
  const inner = resolveCardRenderer(card, { card, token, radius });
  const href = resolveHref(card, token);

  const wrapped = href ? (
    <a
      href={href}
      style={{ textDecoration: "none", display: "block" }}
      target={card.type === "link" && card.openMode === "external" ? "_blank" : undefined}
      rel={card.type === "link" && card.openMode === "external" ? "noopener noreferrer" : undefined}
    >
      {inner}
    </a>
  ) : inner;

  return <div className="guest-loose-card">{wrapped}</div>;
}
