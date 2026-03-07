"use client";

import { useState, useCallback, useRef, useLayoutEffect, type ReactNode } from "react";

export type Phase = "closed" | "morph-in" | "open" | "morph-out";

const OPEN_DURATION  = "0.32s";
const CLOSE_DURATION = "0.4s";
const OPEN_EASE  = "cubic-bezier(0.4, 0, 0.2, 1)";
const CLOSE_EASE = "cubic-bezier(0.36, 0, 0.06, 1)";

const CARD_SHADOW = "0 0 0 1px #0000000a, 0 2px 4px #0000000f";

export function MorphModal({
  title,
  subtitle,
  cardContent,
  bodyContent,
  ctaLabel,
  ctaUrl,
  footerExtra,
  closeTitleStyle,
  imageGhost,
}: {
  title: string;
  subtitle?: string;
  cardContent: ReactNode;
  bodyContent?: ReactNode;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Content rendered in the footer area above the CTA row (always visible, not scrollable) */
  footerExtra?: ReactNode;
  closeTitleStyle?: React.CSSProperties;
  imageGhost?: (opts: { isAtCard: boolean; isClosing: boolean; duration: string; ease: string }) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);

  const handleOpen = useCallback(() => {
    if (!cardRef.current) return;
    setCardRect(cardRef.current.getBoundingClientRect());
    setPhase("morph-in");
  }, []);

  const handleClose = useCallback(() => {
    if (cardRef.current) {
      setCardRect(cardRef.current.getBoundingClientRect());
    }
    setPhase("morph-out");
  }, []);

  useLayoutEffect(() => {
    if (phase === "morph-in") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("open"));
      });
    }
  }, [phase]);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    if (e.propertyName !== "height") return;
    if (phase === "morph-out") {
      setPhase("closed");
      setCardRect(null);
    }
  }, [phase]);

  const isVisible = phase !== "closed";
  const isAtCard = phase === "morph-in" || phase === "morph-out";
  const isClosing = phase === "morph-out";

  const duration = isClosing ? CLOSE_DURATION : OPEN_DURATION;
  const ease     = isClosing ? CLOSE_EASE    : OPEN_EASE;
  const transition = `top ${duration} ${ease}, left ${duration} ${ease}, width ${duration} ${ease}, height ${duration} ${ease}, border-radius ${duration} ${ease}, box-shadow ${duration} ${ease}`;

  const modalStyle: React.CSSProperties = isVisible && cardRect ? {
    position: "fixed",
    top:    isAtCard ? cardRect.top    : 14,
    left:   isAtCard ? cardRect.left   : 14,
    width:  isAtCard ? cardRect.width  : "calc(100% - 28px)" as any,
    height: isAtCard ? cardRect.height : "calc(100% - 28px)" as any,
    borderRadius: isAtCard ? 14 : 20,
    boxShadow: isAtCard ? CARD_SHADOW : "0 8px 32px rgba(0,0,0,0.12)",
    transition,
    zIndex: 1001,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--surface, #fff)",
  } : {};

  const backdropStyle: React.CSSProperties = isVisible ? {
    opacity: isAtCard ? 0 : 1,
    transition: `opacity ${duration} ${ease}`,
  } : {};

  const titleStyle: React.CSSProperties = {
    opacity: 1,
    transition: "opacity 0.15s ease",
  };

  const bodyVisible = phase === "open";
  const bodyStyle: React.CSSProperties = {
    opacity: bodyVisible ? 1 : 0,
    transition: bodyVisible ? "opacity 0.18s 0.15s ease" : "opacity 0.1s ease",
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const cardWrapStyle: React.CSSProperties = {
    cursor: "pointer",
    visibility: isVisible ? "hidden" : "visible",
  };

  return (
    <>
      <div ref={cardRef} onClick={handleOpen} style={cardWrapStyle}>
        {cardContent}
      </div>

      {isVisible && (
        <>
          <div
            className="morph-modal-backdrop"
            style={backdropStyle}
            onClick={handleClose}
          />

          <div
            style={modalStyle}
            onTransitionEnd={handleTransitionEnd}
            onClick={e => e.stopPropagation()}
          >
            {imageGhost?.({ isAtCard, isClosing, duration, ease })}

            <div className="morph-modal__header" style={{
              ...titleStyle,
              ...(isClosing ? { textAlign: closeTitleStyle?.textAlign } : {}),
            }}>
              <span
                className="morph-modal__title"
                style={isClosing ? closeTitleStyle : undefined}
              >{title}</span>
              {subtitle && (
                <span className="morph-modal__subtitle">{subtitle}</span>
              )}
            </div>

            <div style={bodyStyle}>
              <div className="morph-modal__divider" />
              <div className="morph-modal__body">
                {bodyContent}
              </div>
              <div className="morph-modal__footer">
                {footerExtra}
                <div className="morph-modal__footer-actions">
                <div className="morph-modal__footer-left">
                  {ctaLabel && (
                    ctaUrl ? (
                      <a
                        href={ctaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="morph-modal__cta"
                      >
                        {ctaLabel}
                      </a>
                    ) : (
                      <span className="morph-modal__cta morph-modal__cta--disabled">
                        {ctaLabel}
                      </span>
                    )
                  )}
                </div>
                <button type="button" className="morph-modal__close" onClick={handleClose} aria-label="Stäng">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
                  </svg>
                </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
