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
 * The iframe loads immediately but is non-interactive (pointer-events: none)
 * until activated. Activation happens via:
 *   - Clicking the phone overlay (with cursor-following tooltip)
 *   - Clicking "Visa demo" in the footer
 *
 * When demo is active:
 *   - Footer slides down out of view
 *   - Two floating controls appear beside the phone (close + "Välj tema")
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
  const [showSideControls, setShowSideControls] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);

  // When interactive becomes true, hide footer then show side controls after transition
  useEffect(() => {
    if (interactive) {
      setFooterHidden(true);
      // Show side controls after footer slide-down completes (650ms)
      const t = setTimeout(() => setShowSideControls(true), 650);
      return () => clearTimeout(t);
    } else {
      setShowSideControls(false);
      setFooterHidden(false);
    }
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

  const handleCloseDemo = useCallback(() => {
    setInteractive(false);
  }, []);

  const handleSelect = useCallback(() => {
    setSelectLoading(true);
    setTimeout(() => {
      setSelectLoading(false);
      onSelect(manifest.id);
    }, SPINNER_MIN_MS);
  }, [onSelect, manifest.id]);

  const handleSideSelect = useCallback(() => {
    setSelectLoading(true);
    setTimeout(() => {
      setSelectLoading(false);
      onSelect(manifest.id);
    }, SPINNER_MIN_MS);
  }, [onSelect, manifest.id]);

  return (
    <div className="td">
      {/* ── Dark preview container ── */}
      <div className="td__preview">
        {/* Back button */}
        <button type="button" className="td__back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Phone frame with side controls */}
        <div className="td__phone-wrap">
          {/* Left: close button */}
          <div className={`td__side-control td__side-control--left ${showSideControls ? "td__side-control--visible" : ""}`}>
            <button type="button" className="td__close-btn" onClick={handleCloseDemo}>
              <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
              </svg>
            </button>
          </div>

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

          {/* Right: select theme button */}
          <div className={`td__side-control td__side-control--right ${showSideControls ? "td__side-control--visible" : ""}`}>
            <button
              type="button"
              className="td__btn td__btn--ghost"
              onClick={handleSideSelect}
              disabled={selectLoading}
            >
              <AnimatedSpinner visible={selectLoading} />
              <span>Välj tema</span>
            </button>
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
