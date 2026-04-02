"use client";

import { useEffect, useRef } from "react";

/**
 * Client shell for ThankYouPreviewPage.
 * Applies initial CSS variables from page settings and listens
 * for live updates from the editor via postMessage.
 */
export function ThankYouPreviewShell({
  initialStyles,
  children,
}: {
  initialStyles: Record<string, string>;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);

  // Apply initial styles on mount
  useEffect(() => {
    if (!rootRef.current) return;
    for (const [varName, value] of Object.entries(initialStyles)) {
      rootRef.current.style.setProperty(varName, value);
    }
  }, [initialStyles]);

  // Listen for live CSS variable updates from the editor
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "checkin-css-update" && e.data.vars && rootRef.current) {
        const fontFamilies: string[] = [];
        for (const [varName, value] of Object.entries(e.data.vars)) {
          rootRef.current.style.setProperty(varName, value as string);
          if (varName.startsWith("--font-") && typeof value === "string") {
            const family = value.split(",")[0].trim();
            if (family) fontFamilies.push(family);
          }
        }
        if (fontFamilies.length > 0) {
          const params = fontFamilies
            .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
            .join("&");
          const url = `https://fonts.googleapis.com/css2?${params}&display=swap`;
          if (fontLinkRef.current) {
            fontLinkRef.current.href = url;
          } else {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = url;
            document.head.appendChild(link);
            fontLinkRef.current = link;
          }
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (fontLinkRef.current) {
        fontLinkRef.current.remove();
        fontLinkRef.current = null;
      }
    };
  }, []);

  return <div ref={rootRef}>{children}</div>;
}
