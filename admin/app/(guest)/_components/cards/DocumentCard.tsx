"use client";

import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
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

/* ── URL helpers ── */
function pdfPageUrl(fileUrl: string, page: number): string {
  return fileUrl.replace("/upload/", `/upload/pg_${page},w_600,f_jpg/`);
}

/** Open PDF in Google Docs viewer so it renders in the browser */
function pdfViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=false`;
}

/* ── PDF Viewer ── */

const MAX_PAGES = 50;

function PdfViewer({ fileUrl }: { fileUrl: string }) {
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [discovering, setDiscovering] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLImageElement>>(new Map());

  // Discover total pages by probing
  useEffect(() => {
    let cancelled = false;
    let page = 2;

    const probe = () => {
      if (cancelled || page > MAX_PAGES) { setDiscovering(false); return; }
      const img = new Image();
      const p = page;
      img.onload = () => {
        if (cancelled) return;
        setTotalPages(p);
        page++;
        probe();
      };
      img.onerror = () => {
        if (!cancelled) setDiscovering(false);
      };
      img.src = pdfPageUrl(fileUrl, p);
    };

    probe();
    return () => { cancelled = true; };
  }, [fileUrl]);

  // Track current visible page
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pg = Number(entry.target.getAttribute("data-page"));
            if (pg) setCurrentPage(pg);
          }
        }
      },
      { root: container, threshold: 0.5 }
    );

    const imgs = pageRefs.current;
    imgs.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [totalPages]);

  const setPageRef = useCallback((page: number, el: HTMLImageElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {totalPages > 1 && (
        <div className="pdf-viewer__counter">
          {currentPage} av {totalPages}
        </div>
      )}
      <div className="pdf-viewer__pages">
        {pages.map((pg) => (
          <img
            key={pg}
            ref={(el) => setPageRef(pg, el)}
            data-page={pg}
            src={pdfPageUrl(fileUrl, pg)}
            alt={`Sida ${pg}`}
            className="pdf-viewer__page-img"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Document body content (PDF only) ── */
function DocBodyContent({ fileUrl }: { fileUrl: string }) {
  if (!fileUrl) return null;
  return <PdfViewer fileUrl={fileUrl} />;
}

/* ── Classic layout — showcase style (full image + title below) ── */
export function DocClassicCard({ card, radius }: { card: LooseCard; radius?: ButtonRadius }) {
  const imgUrl = cardImageUrl(card.image, "showcase");
  const description: string = (card as any).fileDescription ?? "";
  const fileUrl: string = (card as any).fileUrl ?? "";

  return (
    <MorphModal
      title={card.title}
      subtitle="Dokument"
      cardContent={
        <div className="guest-showcase-card">
          <div
            className="guest-showcase-card__image"
            style={{
              aspectRatio: "5 / 3.5",
              backgroundImage: imgUrl ? `url("${imgUrl}")` : undefined,
            }}
          >
            {!imgUrl && (
              <div className="guest-showcase-card__image-empty">
                <svg width="28" height="28" viewBox="0 0 256 256" fill="currentColor" opacity="0.2">
                  <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z"/>
                </svg>
              </div>
            )}
            {card.badge && (
              <span className="guest-showcase-card__badge">{card.badge}</span>
            )}
          </div>
          <div className="guest-showcase-card__content">
            <span className="guest-showcase-card__title">{card.title}</span>
            <span className="guest-doc-card__sub">Dokument</span>
          </div>
        </div>
      }
      bodyContent={<DocBodyContent fileUrl={fileUrl} />}
      footerExtra={description ? <p className="morph-modal__content">{description}</p> : undefined}
      ctaLabel="Visa"
      ctaUrl={fileUrl ? pdfViewerUrl(fileUrl) : undefined}
      closeTitleStyle={{
        fontFamily: "var(--font-body)",
        fontSize: 15,
        fontWeight: 500,
        textAlign: "left",
      }}
    />
  );
}

/* ── Compact layout — ClassicCard style with heading font title ── */
export function DocCompactCard({ card, radius }: { card: LooseCard; radius?: ButtonRadius }) {
  const imgUrl = cardImageUrl(card.image, "classic");
  const description: string = (card as any).fileDescription ?? "";
  const fileUrl: string = (card as any).fileUrl ?? "";

  return (
    <MorphModal
      title={card.title}
      subtitle="Dokument"
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
            <span className="guest-doc-card__sub">Dokument</span>
          </div>
          {card.badge && (
            <span className="guest-classic-card__badge">{card.badge}</span>
          )}
        </div>
      }
      bodyContent={<DocBodyContent fileUrl={fileUrl} />}
      footerExtra={description ? <p className="morph-modal__content">{description}</p> : undefined}
      ctaLabel="Visa"
      ctaUrl={fileUrl ? pdfViewerUrl(fileUrl) : undefined}
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
