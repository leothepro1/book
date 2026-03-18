"use client";

import { useState, useCallback, useRef, useLayoutEffect, useEffect, type ReactNode } from "react";

export type Phase = "closed" | "morph-in" | "open" | "pre-close" | "morph-out";

const OPEN_DURATION  = "0.32s";
const CLOSE_DURATION = "0.4s";
const OPEN_EASE  = "cubic-bezier(0.4, 0, 0.2, 1)";
const CLOSE_EASE = "cubic-bezier(0.36, 0, 0.06, 1)";

const CARD_SHADOW = "0 0 0 1px #0000000a, 0 2px 4px #0000000f";
const MODAL_SHADOW = "0 8px 32px rgba(0,0,0,0.12)";

export function MorphModal({
  title,
  subtitle,
  cardContent,
  bodyContent,
  ctaLabel,
  ctaUrl,
  footerExtra,
  closeTitleStyle: _closeTitleStyle,
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
  const modalRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);
  const [modalRect, setModalRect] = useState<DOMRect | null>(null);

  /* ── handlers ──────────────────────────────────────────── */

  const handleOpen = useCallback(() => {
    if (!cardRef.current) return;
    setCardRect(cardRef.current.getBoundingClientRect());
    setPhase("morph-in");
  }, []);

  const handleClose = useCallback(() => {
    setPhase("closed");
    setCardRect(null);
    setModalRect(null);
  }, []);

  useLayoutEffect(() => {
    if (phase === "morph-in" || phase === "pre-close") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() =>
          setPhase(phase === "morph-in" ? "open" : "morph-out"),
        );
      });
    }
  }, [phase]);

  /* Lock scroll during close animation so the card target doesn't drift */
  useEffect(() => {
    if (phase !== "pre-close" && phase !== "morph-out") return;
    const scrollY = window.scrollY;
    const onScroll = () => window.scrollTo(0, scrollY);
    window.addEventListener("scroll", onScroll, { passive: false });
    return () => window.removeEventListener("scroll", onScroll);
  }, [phase]);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    // Only respond to the outer container's transition, not the inner freeze layer
    if (phase === "morph-out" && e.propertyName === "height" && e.target === modalRef.current) {
      setPhase("closed");
      setCardRect(null);
      setModalRect(null);
    }
  }, [phase]);

  /* ── derived state ─────────────────────────────────────── */

  const isVisible = phase !== "closed";
  const isOpening = phase === "morph-in";
  const isClosing = phase === "pre-close" || phase === "morph-out";
  const isMorphingOut = phase === "morph-out";

  /* ── OUTER CONTAINER: position / size ──────────────────── */
  /*  Entrance: card rect → modal rect (position-based)      */
  /*  Close:    modal rect → card rect (position-based)       */
  /*  The outer rect defines the visible clipping area.       */

  const openTransition = `top ${OPEN_DURATION} ${OPEN_EASE}, left ${OPEN_DURATION} ${OPEN_EASE}, width ${OPEN_DURATION} ${OPEN_EASE}, height ${OPEN_DURATION} ${OPEN_EASE}, border-radius ${OPEN_DURATION} ${OPEN_EASE}, box-shadow ${OPEN_DURATION} ${OPEN_EASE}`;
  const closeTransition = `top ${CLOSE_DURATION} ${CLOSE_EASE}, left ${CLOSE_DURATION} ${CLOSE_EASE}, width ${CLOSE_DURATION} ${CLOSE_EASE}, height ${CLOSE_DURATION} ${CLOSE_EASE}, border-radius ${CLOSE_DURATION} ${CLOSE_EASE}, box-shadow ${CLOSE_DURATION} ${CLOSE_EASE}`;

  const base: React.CSSProperties = {
    position: "fixed",
    zIndex: 1001,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "var(--surface, #fff)",
  };

  let modalStyle: React.CSSProperties = {};

  if (isVisible && cardRect) {
    if (isOpening) {
      // Entrance: start at card position (unchanged)
      modalStyle = {
        ...base,
        top: cardRect.top, left: cardRect.left,
        width: cardRect.width, height: cardRect.height,
        borderRadius: 14, boxShadow: CARD_SHADOW,
        transition: openTransition,
      };
    } else if (isClosing && modalRect) {
      // Close: outer shrinks from modal rect → card rect
      modalStyle = {
        ...base,
        top:    isMorphingOut ? cardRect.top    : modalRect.top,
        left:   isMorphingOut ? cardRect.left   : modalRect.left,
        width:  isMorphingOut ? cardRect.width  : modalRect.width,
        height: isMorphingOut ? cardRect.height : modalRect.height,
        borderRadius: isMorphingOut ? 14 : "1.5rem",
        boxShadow: isMorphingOut ? CARD_SHADOW : MODAL_SHADOW,
        transition: closeTransition,
        willChange: "top, left, width, height",
      };
    } else {
      // Open: full modal position
      modalStyle = {
        ...base,
        top: 14, left: 14,
        width: "calc(100% - 28px)" as any,
        height: "calc(100% - 28px)" as any,
        borderRadius: "1.5rem", boxShadow: MODAL_SHADOW,
        transition: openTransition,
      };
    }
  }

  /* ── INNER FREEZE LAYER ────────────────────────────────── */
  /*  During close the freeze layer keeps modal dimensions    */
  /*  and applies a uniform scale (width-ratio only) so       */
  /*  content shrinks without distortion. The outer container */
  /*  clips any excess with overflow:hidden.                  */

  const uniformScale = (isClosing && modalRect && cardRect)
    ? cardRect.width / modalRect.width
    : 1;

  const freezeStyle: React.CSSProperties = isClosing && modalRect ? {
    width: modalRect.width,
    height: modalRect.height,
    flexShrink: 0,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    transformOrigin: "0 0",
    transform: isMorphingOut ? `scale(${uniformScale})` : "scale(1)",
    transition: `transform ${CLOSE_DURATION} ${CLOSE_EASE}`,
    willChange: "transform",
  } : {
    // Normal (non-closing): transparent wrapper that fills the modal
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  };

  /* ── backdrop ──────────────────────────────────────────── */
  const duration = isClosing ? CLOSE_DURATION : OPEN_DURATION;
  const ease     = isClosing ? CLOSE_EASE    : OPEN_EASE;
  const backdropStyle: React.CSSProperties = isVisible ? {
    opacity: (isOpening || isMorphingOut) ? 0 : 1,
    transition: `opacity ${duration} ${ease}`,
  } : {};

  /* ── body: modal-only content fades out on close ───────── */
  const bodyVisible = phase === "open";
  const bodyStyle: React.CSSProperties = {
    opacity: bodyVisible ? 1 : 0,
    transition: bodyVisible ? "opacity 0.18s 0.15s ease" : "opacity 0.12s ease",
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const titleStyle: React.CSSProperties = {
    opacity: 1,
    transition: "opacity 0.15s ease",
  };

  const cardWrapStyle: React.CSSProperties = {
    cursor: "pointer",
    visibility: isVisible ? "hidden" : "visible",
  };

  /* ── render ────────────────────────────────────────────── */

  return (
    <>
      <div ref={cardRef} onClick={handleOpen} style={cardWrapStyle}>
        {cardContent}
      </div>

      {isVisible && (
        <>
          <div className="morph-modal-backdrop" style={backdropStyle} onClick={handleClose} />

          <div
            ref={modalRef}
            style={modalStyle}
            onTransitionEnd={handleTransitionEnd}
            onClick={e => e.stopPropagation()}
          >
            <div style={freezeStyle}>
              {imageGhost?.({ isAtCard: isOpening || isClosing, isClosing, duration, ease })}

              <div className="morph-modal__header" style={titleStyle}>
                <span className="morph-modal__title">{title}</span>
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
          </div>
        </>
      )}
    </>
  );
}
