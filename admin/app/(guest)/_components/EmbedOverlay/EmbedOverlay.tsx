"use client";

/**
 * EmbedOverlay — Fullscreen iframe overlay
 * ─────────────────────────────────────────
 * Slides in from right with iOS-style animation.
 * Header bar with back button, title, and "open in browser" action.
 * Loading spinner while iframe loads.
 */

import { useState, useEffect } from "react";
import AppLoader from "../AppLoader";
import "./embed-overlay.css";

interface EmbedOverlayProps {
  url: string;
  title: string;
  closing: boolean;
  onClose: () => void;
  onAnimationEnd: () => void;
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function EmbedOverlay({ url, title, closing, onClose, onAnimationEnd }: EmbedOverlayProps) {
  const [loading, setLoading] = useState(true);

  // Reset loading state when URL changes
  useEffect(() => {
    setLoading(true);
  }, [url]);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onClose]);

  // Browser back button support
  useEffect(() => {
    window.history.pushState({ embed: true }, "");
    const handle = () => onClose();
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, [onClose]);

  return (
    <div
      className={`embed-overlay ${closing ? "embed-overlay--closing" : "embed-overlay--open"}`}
      onAnimationEnd={onAnimationEnd}
    >
      {/* Header */}
      <div className="embed-overlay__header">
        <button type="button" className="embed-overlay__back" onClick={onClose} aria-label="Stäng">
          <BackIcon />
        </button>
        <span className="embed-overlay__title">{title}</span>
        <a
          className="embed-overlay__external"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Öppna i webbläsare"
        >
          <ExternalIcon />
        </a>
      </div>

      {/* Content */}
      <div className="embed-overlay__content">
        {loading && (
          <div className="embed-overlay__loader">
            <AppLoader size={96} colorVar="--text" ariaLabel="Laddar innehåll" />
          </div>
        )}
        <iframe
          src={url}
          title={title || "Inbäddat innehåll"}
          className="embed-overlay__iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
}
