"use client";

import { useState, useCallback } from "react";
import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { cardImageUrl } from "./cardImage";
import { ShowcaseCard } from "./ShowcaseCard";
import { resolveCardRenderer, GUEST_LAYOUT_RENDERERS } from "./LooseCardItem";
import { getCardTypeConfig, getDefaultLayoutKey } from "@/app/_lib/cardTypes/registry";

export function ShowcaseLayout({ cards, title, radius }: { cards: LooseCard[]; radius?: ButtonRadius; cardLayout?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const count = cards.length;

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250);
  }, []);
  const images = cards
    .map(c => cardImageUrl(c.image, "showcase"))
    .filter(Boolean) as string[];

  return (
    <>
      <div className="guest-showcase-layout" onClick={() => setOpen(true)}>
        <div className="guest-showcase-layout__mosaic" style={{ aspectRatio: "5 / 3" }}>
          {count === 1 && (
            <div
              className="guest-showcase-layout__tile"
              style={{ backgroundImage: images[0] ? `url("${images[0]}")` : undefined }}
            />
          )}
          {count === 2 && (
            <div className="guest-showcase-layout__row">
              {images.slice(0, 2).map((img, i) => (
                <div
                  key={i}
                  className="guest-showcase-layout__tile"
                  style={{ backgroundImage: img ? `url("${img}")` : undefined }}
                />
              ))}
            </div>
          )}
          {count === 3 && (
            <div className="guest-showcase-layout__row">
              {images.slice(0, 3).map((img, i) => (
                <div
                  key={i}
                  className="guest-showcase-layout__tile"
                  style={{ backgroundImage: img ? `url("${img}")` : undefined }}
                />
              ))}
            </div>
          )}
          {count >= 4 && (
            <div className="guest-showcase-layout__grid">
              {images.slice(0, 4).map((img, i) => (
                <div
                  key={i}
                  className="guest-showcase-layout__tile"
                  style={{ backgroundImage: img ? `url("${img}")` : undefined }}
                />
              ))}
            </div>
          )}
        </div>
        {title && <span className="guest-showcase-layout__title">{title}</span>}
        <span className="guest-showcase-layout__count">{count} objekt</span>
      </div>

      {open && (
        <div className={"guest-showcase-modal" + (closing ? " guest-showcase-modal--closing" : "")}>
          <button type="button" className="guest-showcase-modal__back" onClick={handleClose} aria-label="Tillbaka">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" /></svg>
          </button>
          <div className="guest-showcase-modal__header">
            <span className="guest-showcase-modal__title">{title}</span>
            <span className="guest-showcase-modal__count">{count} objekt</span>
          </div>
          <div className="guest-showcase-modal__grid">
            {cards.map(card => {
              const layoutKey = (card as any).layoutStyle ?? getDefaultLayoutKey(card.cardType);
              const isFullWidth = layoutKey === "featured" || layoutKey === "showcase";
              const ctConfig = getCardTypeConfig(card.cardType);
              const layoutConfig = ctConfig.layouts.find(l => l.key === layoutKey);
              const hasCustomRenderer = !!(layoutConfig?.guestRenderer && GUEST_LAYOUT_RENDERERS[layoutConfig.guestRenderer]);
              return (
                <div key={card.id} className={isFullWidth ? "guest-showcase-modal__item--full" : "guest-showcase-modal__item"}>
                  {hasCustomRenderer
                    ? resolveCardRenderer(card, { card, radius })
                    : <ShowcaseCard card={card} aspectRatio={isFullWidth ? "5 / 3.5" : "4 / 3"} />
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
