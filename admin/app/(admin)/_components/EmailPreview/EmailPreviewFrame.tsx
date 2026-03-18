"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { BrandingSnapshot } from "./EmailBrandingContext";

// ── HTML cleanup for inline preview ─────────────────────────────

function cleanEmailHtml(html: string): string {
  return html
    .replace(/background-color:\s*#f6f6f6/gi, "background-color:#fff")
    .replace(/padding:\s*40px\s+0/gi, "padding:0")
    .replace(/padding:\s*40px\s+32px/gi, "padding:16px")
    .replace(/max-width:\s*600px/gi, "max-width:100%")
    .replace(/border-radius:\s*8px/gi, "border-radius:0")
    .replace(/margin:\s*0\s+auto/gi, "margin:0");
}

// ── Image preload cache ─────────────────────────────────────────
// Preload images in the parent document so the browser caches them
// before we set them in the iframe. Retries on failure.

const preloadCache = new Set<string>();
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

function preloadImage(url: string): Promise<void> {
  if (preloadCache.has(url)) return Promise.resolve();

  return new Promise((resolve) => {
    let attempt = 0;

    function tryLoad() {
      const img = new Image();
      img.onload = () => {
        preloadCache.add(url);
        resolve();
      };
      img.onerror = () => {
        attempt++;
        if (attempt <= MAX_RETRIES) {
          setTimeout(tryLoad, RETRY_DELAY_MS);
        } else {
          // Give up — still resolve so we don't block the UI
          resolve();
        }
      };
      img.src = url;
    }

    tryLoad();
  });
}

// ── DOM manipulation for instant branding updates ───────────────

function applyBrandingToIframe(
  iframe: HTMLIFrameElement,
  branding: BrandingSnapshot,
): void {
  const doc = iframe.contentDocument;
  if (!doc) return;

  // Logo
  const logo = doc.querySelector(
    '[data-branding="logo"]',
  ) as HTMLImageElement | null;
  const brandText = doc.querySelector(
    '[data-branding="brand-text"]',
  ) as HTMLElement | null;

  if (logo) {
    if (branding.logoUrl) {
      // Remove placeholder HTML attributes that conflict with style
      logo.removeAttribute("width");
      logo.removeAttribute("height");
      logo.style.width = `${branding.logoWidth}px`;
      logo.style.height = "auto";
      logo.style.display = "";
      logo.src = branding.logoUrl;
    } else {
      logo.style.display = "none";
    }
  }
  if (brandText) {
    brandText.style.display = branding.logoUrl ? "none" : "";
  }

  // CTA button accent colors
  doc.querySelectorAll('[data-branding="cta"]').forEach((btn) => {
    (btn as HTMLElement).style.backgroundColor = branding.accentColor;
  });

  // Re-measure iframe height after DOM changes
  iframe.style.height = doc.documentElement.scrollHeight + "px";
}

// ── Component ───────────────────────────────────────────────────

interface EmailPreviewFrameProps {
  /** Server-rendered email HTML */
  html: string;
  /** Current branding state (drives instant DOM updates) */
  branding: BrandingSnapshot;
  className?: string;
}

function EmailPreviewFrameInner({
  html,
  branding,
  className = "",
}: EmailPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const brandingRef = useRef(branding);

  useEffect(() => {
    brandingRef.current = branding;
  });

  const cleanedHtml = useMemo(() => cleanEmailHtml(html), [html]);

  // Auto-height + apply branding after iframe loads
  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (doc) {
      iframe.style.height = doc.documentElement.scrollHeight + "px";
    }
    // Apply current branding after load (new srcdoc resets DOM)
    const b = brandingRef.current;
    if (b.logoUrl) {
      // Preload then apply — ensures image is cached before setting src
      preloadImage(b.logoUrl).then(() => {
        if (iframeRef.current) applyBrandingToIframe(iframeRef.current, brandingRef.current);
      });
    } else {
      applyBrandingToIframe(iframe, b);
    }
  }, []);

  // Apply branding changes instantly via DOM manipulation
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;

    const b = branding;
    if (b.logoUrl && !preloadCache.has(b.logoUrl)) {
      // New logo URL — preload first, then apply
      preloadImage(b.logoUrl).then(() => {
        if (iframeRef.current?.contentDocument) {
          applyBrandingToIframe(iframeRef.current, brandingRef.current);
        }
      });
    } else {
      applyBrandingToIframe(iframe, b);
    }
  }, [branding]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={cleanedHtml}
      title="E-postförhandsgranskning"
      sandbox="allow-same-origin"
      className={`email-preview-card__iframe ${className}`}
      onLoad={handleLoad}
    />
  );
}

export const EmailPreviewFrame = memo(EmailPreviewFrameInner);
