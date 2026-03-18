"use client";

/**
 * SpecialLinkProvider — Global handler for special link schemes
 * ═══════════════════════════════════════════════════════════════
 *
 * Intercepts clicks on any <a> element whose href matches a special
 * link scheme (#map:, #text:, #doc:) and opens the appropriate
 * full-screen overlay. This lets menu items, buttons, images, and
 * any other clickable element open maps/text/documents without
 * needing a dedicated element on the page.
 *
 * Uses event delegation on the container — no per-link listeners.
 *
 * Special link schemes:
 *   #map:{mapId}              → full-screen interactive map
 *   #text:{encodedContent}    → text overlay modal
 *   #doc:{fileUrl}            → document/PDF viewer modal (future)
 */

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { MapConfig } from "@/app/(guest)/_lib/tenant/types";
import { MapModalBody } from "./sections/elements/MapElement";

// ─── Types ───────────────────────────────────────────────────

type OverlayState =
  | { type: "map"; map: MapConfig }
  | { type: "text"; title: string; content: string }
  | null;

// ─── URL scheme parsing ──────────────────────────────────────

function parseSpecialHref(
  href: string,
  maps: MapConfig[],
): OverlayState {
  if (href.startsWith("#map:")) {
    const mapId = href.slice(5);
    const map = maps.find((m) => m.id === mapId);
    if (map) return { type: "map", map };
    return null;
  }

  if (href.startsWith("#text:")) {
    const encoded = href.slice(6);
    const content = decodeURIComponent(encoded);
    // Title is first line if content has multiple lines, otherwise empty
    const firstNewline = content.indexOf("\n");
    const title = firstNewline > 0 ? content.slice(0, firstNewline).trim() : "";
    const body = firstNewline > 0 ? content.slice(firstNewline + 1).trim() : content;
    return { type: "text", title, content: body || content };
  }

  return null;
}

// ─── Component ───────────────────────────────────────────────

export function SpecialLinkProvider({
  maps,
  children,
}: {
  maps: MapConfig[];
  children: ReactNode;
}) {
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable ref for maps so the click handler always sees current data
  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  const handleClose = useCallback(() => setOverlay(null), []);

  // Event delegation: intercept clicks on <a> elements with special hrefs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      // Walk up from target to find nearest <a>
      let el = e.target as HTMLElement | null;
      while (el && el !== container) {
        if (el.tagName === "A") {
          const href = el.getAttribute("href");
          if (href && (href.startsWith("#map:") || href.startsWith("#text:"))) {
            e.preventDefault();
            e.stopPropagation();
            const result = parseSpecialHref(href, mapsRef.current);
            if (result) setOverlay(result);
          }
          return;
        }
        el = el.parentElement;
      }
    };

    container.addEventListener("click", handler, true);
    return () => container.removeEventListener("click", handler, true);
  }, []);

  return (
    <div ref={containerRef}>
      {children}

      {/* Map overlay — same as MapMorphModal but triggered by link click */}
      {overlay?.type === "map" && (
        <MapOverlay
          map={overlay.map}
          onClose={handleClose}
        />
      )}

      {/* Text overlay */}
      {overlay?.type === "text" && (
        <TextOverlay
          title={overlay.title}
          content={overlay.content}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

// ─── Map Overlay (reuses MapModalBody) ───────────────────────

function MapOverlay({
  map,
  onClose,
}: {
  map: MapConfig;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="morph-modal-backdrop" style={{ opacity: 1 }} onClick={onClose} />

      <div className="map-morph__modal">
        <div className="map-morph__canvas">
          <MapModalBody mapConfig={map} />
        </div>

        <div className="map-morph__title">
          <span>{map.name || "Karta"}</span>
        </div>

        <button
          type="button"
          className="map-morph__close"
          onClick={onClose}
          aria-label="Stäng"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
          </svg>
        </button>
      </div>
    </>
  );
}

// ─── Text Overlay (MorphModal transition without card source) ──

const DURATION = "0.32s";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const CLOSE_SVG = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
  </svg>
);

type TextPhase = "entering" | "open" | "exiting" | "closed";

function TextOverlay({
  title,
  content,
  onClose,
}: {
  title: string;
  content: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<TextPhase>("entering");
  const modalRef = useRef<HTMLDivElement>(null);

  // Trigger enter animation
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("open"));
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleClose = useCallback(() => {
    setPhase("exiting");
  }, []);

  const handleTransitionEnd = useCallback(() => {
    if (phase === "exiting") {
      onClose();
    }
  }, [phase, onClose]);

  const isOpen = phase === "open";
  const isEntering = phase === "entering";

  const backdropStyle: React.CSSProperties = {
    opacity: isOpen ? 1 : 0,
    transition: `opacity ${DURATION} ${EASE}`,
  };

  const modalStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9998,
    background: "var(--background, #fff)",
    color: "var(--text, #1a1a1a)",
    display: "flex",
    flexDirection: "column",
    borderRadius: isOpen ? 0 : 16,
    transform: isOpen ? "scale(1)" : "scale(0.92)",
    opacity: isOpen ? 1 : 0,
    transition: `transform ${DURATION} ${EASE}, opacity ${DURATION} ${EASE}, border-radius ${DURATION} ${EASE}`,
  };

  return (
    <>
      <div className="morph-modal-backdrop" style={backdropStyle} onClick={handleClose} />

      <div
        ref={modalRef}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="morph-modal__header">
          <span className="morph-modal__title">{title || ""}</span>
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="morph-modal__divider" />
          <div className="morph-modal__body">
            <p className="morph-modal__content">{content}</p>
          </div>
          <div className="morph-modal__footer">
            <div className="morph-modal__footer-actions">
              <div className="morph-modal__footer-left" />
              <button type="button" className="morph-modal__close" onClick={handleClose} aria-label="Stäng">
                {CLOSE_SVG}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
