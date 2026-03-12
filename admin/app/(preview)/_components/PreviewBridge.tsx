"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "@/app/(guest)/_lib/theme";
import type { ThemeConfig } from "@/app/(guest)/_lib/theme/types";
import type { PreviewScrollTarget } from "../_lib/previewMessages";
import { isValidPreviewMessage } from "../_lib/previewMessages";

const __DEV__ = process.env.NODE_ENV === "development";

/**
 * PreviewBridge — lives inside the preview iframe.
 *
 * Responsibilities:
 *  1. On mount, sends "preview-ready" to parent window
 *  2. Listens for "theme-update" → applies CSS vars + background + fonts instantly (DOM mutation)
 *  3. Listens for "content-refresh" → seamless router.refresh() to re-fetch server data (preserves scroll + DOM)
 *  4. Listens for "scroll-to-target" → smooth-scrolls to the selected section/block/element + highlight
 *
 * This component renders nothing visible — it's a communication bridge.
 */
export function PreviewBridge() {
  const router = useRouter();
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);
  const refreshInFlightRef = useRef(false);

  const applyTheme = useCallback((theme: ThemeConfig) => {
    // 1. CSS custom properties
    const cssVars = themeToStyleAttr(theme);
    const root = document.querySelector<HTMLElement>(".g-body");
    if (root) {
      for (const [key, value] of Object.entries(cssVars)) {
        root.style.setProperty(key, value as string);
      }
    }

    // 2. Background style on the inner wrapper
    const bgEl = root?.querySelector<HTMLElement>(".min-h-dvh");
    if (bgEl) {
      const bgStyle = backgroundStyle(theme.background, theme.colors);
      // Reset previous background properties
      bgEl.style.background = "";
      bgEl.style.backgroundImage = "";
      bgEl.style.backgroundSize = "";
      bgEl.style.backgroundPosition = "";
      bgEl.style.backdropFilter = "";

      for (const [key, value] of Object.entries(bgStyle)) {
        bgEl.style.setProperty(
          key.replace(/([A-Z])/g, "-$1").toLowerCase(),
          value as string,
        );
      }
    }

    // 3. Google Fonts — swap <link> if fonts changed
    const fontsToLoad = [
      theme.typography.headingFont,
      theme.typography.bodyFont,
      ...(theme.typography.buttonFont ? [theme.typography.buttonFont] : []),
    ];
    const newUrl = googleFontsUrl(fontsToLoad);

    if (newUrl) {
      if (fontLinkRef.current) {
        if (fontLinkRef.current.href !== newUrl) {
          fontLinkRef.current.href = newUrl;
        }
      } else {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = newUrl;
        document.head.appendChild(link);
        fontLinkRef.current = link;
      }
    }
  }, []);

  const handleContentRefresh = useCallback(() => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (__DEV__) console.log("[PreviewBridge] Refreshing server data");
    router.refresh();
    // Allow next refresh after a short cooldown
    setTimeout(() => { refreshInFlightRef.current = false; }, 500);
  }, [router]);

  // ── Scroll-to-target controller ──────────────────────────────
  // Smooth-scrolls to the selected section/block/element.
  //
  // Design:
  //   - Target lookup via data-* attributes (O(1) querySelector)
  //   - No dedup: every click scrolls, even to the same target
  //   - Retry: MutationObserver waits for DOM if target not yet rendered (max 3s)
  //   - Coalescing: new target cancels pending retry
  //   - No highlight/styling — just smooth scroll

  const retryCleanupRef = useRef<(() => void) | null>(null);

  const handleScrollToTarget = useCallback((target: PreviewScrollTarget) => {
    // Cancel any pending retry from a previous target
    if (retryCleanupRef.current) {
      retryCleanupRef.current();
      retryCleanupRef.current = null;
    }

    // Build selector — use the most specific ID available
    const selector = target.elementId
      ? `[data-element-id="${target.elementId}"]`
      : target.blockId
        ? `[data-block-id="${target.blockId}"]`
        : `[data-section-id="${target.sectionId}"]`;

    const scrollTo = (el: Element) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // Try to find the target immediately
    const el = document.querySelector(selector);
    if (el) {
      scrollTo(el);
      return;
    }

    // Target not in DOM yet (e.g., content-refresh in flight).
    // Watch for it with MutationObserver, timeout after 3s.
    if (__DEV__) console.log("[PreviewBridge] Target not found, watching for:", selector);

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      cancelled = true;
      observer.disconnect();
      retryCleanupRef.current = null;
      if (__DEV__) console.log("[PreviewBridge] Scroll target timeout:", selector);
    }, 3000);

    const observer = new MutationObserver(() => {
      if (cancelled) return;
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        clearTimeout(timeoutId);
        retryCleanupRef.current = null;
        requestAnimationFrame(() => {
          if (!cancelled) scrollTo(found);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    retryCleanupRef.current = () => {
      cancelled = true;
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    // Only activate if we're inside an iframe
    if (window === window.parent) return;

    if (__DEV__) console.log("[PreviewBridge] Mounted inside iframe");

    function onMessage(event: MessageEvent) {
      if (!isValidPreviewMessage(event)) return;
      const { data } = event;
      if (__DEV__) console.log("[PreviewBridge] Received:", data.type);

      switch (data.type) {
        case "theme-update":
          applyTheme(data.theme);
          break;
        case "content-refresh":
          handleContentRefresh();
          break;
        case "scroll-to-target":
          handleScrollToTarget(data.target);
          break;
      }
    }

    window.addEventListener("message", onMessage);

    // Signal parent that we're ready to receive messages
    if (__DEV__) console.log("[PreviewBridge] Sending preview-ready");
    window.parent.postMessage({ type: "preview-ready" }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
      if (retryCleanupRef.current) {
        retryCleanupRef.current();
        retryCleanupRef.current = null;
      }
    };
  }, [applyTheme, handleContentRefresh, handleScrollToTarget]);


  return null;
}
