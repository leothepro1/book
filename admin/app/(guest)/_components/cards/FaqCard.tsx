"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { LooseCard } from "./resolveHomeItems";
import type { ButtonRadius } from "@/app/(guest)/_lib/theme/types";
import { cardImageUrl } from "./cardImage";
import { MorphModal } from "./MorphModal";

function imageRadius(r?: ButtonRadius): string {
  switch (r) {
    case "square":  return "4px";
    case "rounded": return "8px";
    case "round":   return "12px";
    case "rounder": return "16px";
    case "full":    return "999px";
    default:        return "10px";
  }
}

function cardRadius(r?: ButtonRadius): string {
  switch (r) {
    case "square":  return "6px";
    case "rounded": return "10px";
    case "round":   return "14px";
    case "rounder": return "18px";
    case "full":    return "22px";
    default:        return "14px";
  }
}

type FaqItem = { id: string; question: string; answer: string; isActive: boolean };

function FaqAccordionItem({ faq }: { faq: FaqItem }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (open && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [open]);

  return (
    <div className="faq-body__item">
      <button type="button" className="faq-body__question" onClick={() => setOpen(o => !o)}>
        <span>{faq.question}</span>
        <svg className={"faq-body__chevron" + (open ? " faq-body__chevron--open" : "")} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="currentColor" d="m1.7 4 .36.35L7.71 10l5.64-5.65.36-.35.7.7-.35.36-6 6h-.7l-6-6L1 4.71 1.7 4Z" />
        </svg>
      </button>
      <div className="faq-body__collapse" style={{ height }}>
        <div ref={contentRef}>
          <p className="faq-body__answer">{faq.answer}</p>
        </div>
      </div>
    </div>
  );
}

function FaqBodyContent({ faqs }: { faqs: FaqItem[] }) {
  const active = faqs.filter(f => f.isActive !== false);
  if (active.length === 0) return null;
  return (
    <div className="faq-body">
      {active.map((faq, i) => (
        <FaqAccordionItem key={faq.id ?? i} faq={faq} />
      ))}
    </div>
  );
}

/* ── Compact layout ── */
export function FaqCompactCard({ card, radius }: { card: LooseCard; radius?: ButtonRadius }) {
  const imgUrl = cardImageUrl(card.image, "classic");
  const faqs: FaqItem[] = (card as any).faqs ?? [];
  const activeCount = faqs.filter(f => f.isActive !== false).length;

  return (
    <MorphModal
      title={card.title}
      subtitle={`FAQs · ${activeCount} frågor`}
      cardContent={
        <div
          className="guest-classic-card"
          style={{ borderRadius: cardRadius(radius) }}
        >
          <div
            className="guest-classic-card__image"
            style={{
              borderRadius: imageRadius(radius),
              backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
            }}
          >
            {!imgUrl && (
              <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" opacity="0.25">
                <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
              </svg>
            )}
          </div>
          <div className="guest-doc-card__center">
            <span className="guest-doc-card__title" style={{ fontFamily: "var(--font-heading)" }}>
              {card.title}
            </span>
            <span className="guest-doc-card__sub">FAQs · {activeCount} frågor</span>
          </div>
        </div>
      }
      bodyContent={<FaqBodyContent faqs={faqs} />}
      closeTitleStyle={{
        fontFamily: "var(--font-heading)",
        fontSize: 15,
        fontWeight: 500,
        textAlign: "center",
      }}
      imageGhost={({ isAtCard, duration, ease }) => {
        const style: React.CSSProperties = {
          position: "absolute",
          top: 12,
          left: 14,
          width: 48,
          height: 48,
          borderRadius: 10,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
          backgroundColor: !imgUrl ? "var(--surface-muted, #f1f0ee)" : undefined,
          opacity: isAtCard ? 1 : 0,
          transition: `opacity ${duration} ${ease}`,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text)",
        };
        return (
          <div style={style}>
            {!imgUrl && (
              <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor" opacity="0.25">
                <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
              </svg>
            )}
          </div>
        );
      }}
    />
  );
}

/* ── Classic layout — title + inline accordion ── */
export function FaqClassicCard({ card }: { card: LooseCard }) {
  const faqs: FaqItem[] = (card as any).faqs ?? [];
  const active = faqs.filter(f => f.isActive !== false);

  return (
    <div className="guest-faq-classic">
      <h2 className="guest-section-title">{card.title || "FAQs"}</h2>
      {active.length > 0 && (
        <div className="faq-body">
          {active.map((faq, i) => (
            <FaqAccordionItem key={faq.id ?? i} faq={faq} />
          ))}
        </div>
      )}
    </div>
  );
}
