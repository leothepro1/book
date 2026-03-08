"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "@/app/(guest)/_lib/theme";
import type { ThemeConfig } from "@/app/(guest)/_lib/theme/types";
import { isValidPreviewMessage } from "../_lib/previewMessages";

/**
 * PreviewBridge — lives inside the preview iframe.
 *
 * Responsibilities:
 *  1. On mount, sends "preview-ready" to parent window
 *  2. Listens for "theme-update" → applies CSS vars + background + fonts instantly (DOM mutation)
 *  3. Listens for "content-refresh" → seamless router.refresh() to re-fetch server data (preserves scroll + DOM)
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
    console.log("[PreviewBridge] Refreshing server data (seamless)");
    router.refresh();
    // Allow next refresh after a short cooldown
    setTimeout(() => { refreshInFlightRef.current = false; }, 500);
  }, [router]);

  useEffect(() => {
    // Only activate if we're inside an iframe
    if (window === window.parent) return;

    console.log("[PreviewBridge] Mounted inside iframe, registering listener");

    function onMessage(event: MessageEvent) {
      if (!isValidPreviewMessage(event)) return;
      const { data } = event;
      console.log("[PreviewBridge] Received:", data.type);

      switch (data.type) {
        case "theme-update":
          applyTheme(data.theme);
          break;
        case "content-refresh":
          handleContentRefresh();
          break;
      }
    }

    window.addEventListener("message", onMessage);

    // Signal parent that we're ready to receive messages
    console.log("[PreviewBridge] Sending preview-ready to parent");
    window.parent.postMessage({ type: "preview-ready" }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [applyTheme, handleContentRefresh]);

  return null;
}
