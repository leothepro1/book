"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeManifest } from "@/app/(guest)/_lib/themes/types";
import "./theme-detail.css";

const SPINNER_MIN_MS = 2000;

/* ── Animated spinner (same pattern as PublishBar) ── */

function AnimatedSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") {
      setMounted(false);
      setAnimState("idle");
    } else if (animState === "enter") {
      setAnimState("idle");
    }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`td__btn-spinner ${animState === "exit" ? "td__btn-spinner--out" : ""}`}
      width="21"
      height="21"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * ThemeDetailView — Full detail page shown when clicking a theme card.
 *
 * Toolbar row: back button (absolute left), viewport toggle (centered),
 * "Välj tema" button (right). Desktop viewport is default.
 *
 * The iframe loads immediately but is non-interactive (pointer-events: none)
 * until activated via clicking the phone overlay or "Visa demo" in the footer.
 */
export function ThemeDetailView({
  manifest,
  onBack,
  onSelect,
}: {
  manifest: ThemeManifest;
  onBack: () => void;
  onSelect: (themeId: string) => void;
}) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [selectLoading, setSelectLoading] = useState(false);
  const [footerHidden, setFooterHidden] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [fullscreen, setFullscreen] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFooterHidden(interactive);
  }, [interactive]);

  const handleOverlayMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cursorRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.style.left = `${e.clientX - rect.left}px`;
    el.style.top = `${e.clientY - rect.top}px`;
  }, []);

  const handleOverlayClick = useCallback(() => {
    setInteractive(true);
  }, []);

  const handleDemoToggle = useCallback(() => {
    setInteractive(!interactive);
  }, [interactive]);

  const handleSelect = useCallback(() => {
    setSelectLoading(true);
    setTimeout(() => {
      setSelectLoading(false);
      onSelect(manifest.id);
    }, SPINNER_MIN_MS);
  }, [onSelect, manifest.id]);

  return (
    <div className={`td ${fullscreen ? "td--fullscreen" : ""}`}>
      {/* ── Dark preview container ── */}
      <div className="td__preview">
        {/* Back button (outside toolbar in normal mode) */}
        {!fullscreen && (
          <button type="button" className="td__back" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Toolbar: viewport toggle (centered) + select button (right) */}
        <div className="td__toolbar">
          {fullscreen && (
            <button type="button" className="td__back" onClick={() => setFullscreen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="td__viewport-toggle">
            <button
              type="button"
              className={`td__viewport-btn ${viewport === "desktop" ? "td__viewport-btn--active" : ""}`}
              onClick={() => { setViewport("desktop"); setFullscreen(false); }}
              aria-label="Datorvy"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="24" height="24" fill="currentColor"><path fillRule="evenodd" d="M3.5 6.25a2.75 2.75 0 0 1 2.75-2.75h7.5a2.75 2.75 0 0 1 2.75 2.75v4.5a2.75 2.75 0 0 1-2.75 2.75h-1.25v1.5h.75a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h.75v-1.5h-1.25a2.75 2.75 0 0 1-2.75-2.75v-4.5Zm5.5 7.25h2v1.5h-2v-1.5Zm-2.75-8.5c-.69 0-1.25.56-1.25 1.25v3.25h10v-3.25c0-.69-.56-1.25-1.25-1.25h-7.5Zm8.725 6c-.116.57-.62 1-1.225 1h-7.5a1.25 1.25 0 0 1-1.225-1h9.95Z" /></svg>
            </button>
            <button
              type="button"
              className={`td__viewport-btn ${viewport === "mobile" ? "td__viewport-btn--active" : ""}`}
              onClick={() => { setViewport("mobile"); setFullscreen(false); }}
              aria-label="Mobilvy"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="24" height="24" fill="currentColor"><path d="M7.75 13.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Z" /><path fillRule="evenodd" d="M4.75 5.75a2.75 2.75 0 0 1 2.75-2.75h5a2.75 2.75 0 0 1 2.75 2.75v8.5a2.75 2.75 0 0 1-2.75 2.75h-5a2.75 2.75 0 0 1-2.75-2.75v-8.5Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h5c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25h-.531a1 1 0 0 1-.969.75h-2a1 1 0 0 1-.969-.75h-.531Z" /></svg>
            </button>
            {interactive && (
              <button
                type="button"
                className={`td__viewport-btn ${fullscreen ? "td__viewport-btn--active" : ""}`}
                onClick={() => setFullscreen(!fullscreen)}
                aria-label="Helskärm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="24" height="24" fill="currentColor"><path d="M12.75 3.5a.75.75 0 0 0 0 1.5h1.19l-3.22 3.22a.75.75 0 0 0 1.06 1.06l3.22-3.22v1.19a.75.75 0 0 0 1.5 0v-3a.75.75 0 0 0-.75-.75h-3Z" /><path d="M7.25 16.5a.75.75 0 0 0 0-1.5h-1.19l3.22-3.22a.75.75 0 1 0-1.06-1.06l-3.22 3.22v-1.19a.75.75 0 0 0-1.5 0v3c0 .414.336.75.75.75h3Z" /></svg>
              </button>
            )}
          </div>
          {interactive && (
            <button
              type="button"
              className="td__btn td__btn--ghost"
              onClick={handleSelect}
              disabled={selectLoading}
            >
              <AnimatedSpinner visible={selectLoading} />
              <span>Välj tema</span>
            </button>
          )}
        </div>

        {/* Phone frame */}
        <div className={`td__phone-wrap ${viewport === "desktop" ? "td__phone-wrap--desktop" : ""} ${fullscreen ? "td__phone-wrap--fullscreen" : ""}`}>
          <div className={`td__phone ${!iframeLoaded ? "td__phone--loading" : ""} ${interactive ? "td__phone--interactive" : ""}`}>
            {!iframeLoaded && (
              <div className="td__phone-spinner">
                <div className="td__spinner" />
              </div>
            )}
            <iframe
              src={`/theme-demo/${manifest.id}`}
              className="td__phone-iframe"
              title={`${manifest.name} demo`}
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setIframeLoaded(true)}
            />
            {!interactive && (
              <div
                className="td__phone-overlay"
                onMouseMove={handleOverlayMove}
                onClick={handleOverlayClick}
              >
                <div ref={cursorRef} className="td__cursor-tooltip">
                  Visa demo
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer bar */}
        <div className={`td__footer ${footerHidden ? "td__footer--hidden" : ""}`}>
          <div className="td__footer-inner">
            <div className="td__footer-name">{manifest.name}</div>
            <div className="td__footer-actions">
              <button
                type="button"
                className={`td__btn ${interactive ? "td__btn--secondary-active" : "td__btn--secondary"}`}
                onClick={handleDemoToggle}
              >
                {interactive ? "Lås preview" : "Visa demo"}
              </button>
              <button
                type="button"
                className="td__btn td__btn--primary"
                onClick={handleSelect}
                disabled={selectLoading}
              >
                <AnimatedSpinner visible={selectLoading} />
                <span>Välj tema</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── White info container ── */}
      <div className="td__info">
        <div className="td__info-inner">
          <h3 className="td__heading">{manifest.detail.heading}</h3>
          <p className="td__description">{manifest.detail.description}</p>

          <div className="td__features">
            {manifest.detail.features.map((feature, i) => (
              <div key={i} className="td__feature">
                <div className="td__feature-img">
                  <img src={feature.image} alt={feature.title} draggable={false} />
                </div>
                <div className="td__feature-title">{feature.title}</div>
                <p className="td__feature-desc">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
