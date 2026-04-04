"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { themeToStyleAttr, backgroundStyle, googleFontsUrl } from "@/app/(guest)/_lib/theme";
import type { ThemeConfig } from "@/app/(guest)/_lib/theme/types";
import type { PreviewScrollTarget, InspectorSectionMeta } from "../_lib/previewMessages";
import { isValidPreviewMessage } from "../_lib/previewMessages";

const __DEV__ = process.env.NODE_ENV === "development";

const INSPECTOR_COLOR = "#2783de";

/**
 * PreviewBridge — lives inside the preview iframe.
 *
 * Responsibilities:
 *  1. On mount, sends "preview-ready" to parent window
 *  2. Listens for "theme-update" → applies CSS vars + background + fonts instantly
 *  3. Listens for "content-refresh" → seamless router.refresh()
 *  4. Listens for "scroll-to-target" → smooth-scrolls to section/block/element
 *  5. Listens for "inspector-mode" → enables/disables section inspector overlay
 */
export function PreviewBridge() {
  const router = useRouter();
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);
  const refreshInFlightRef = useRef(false);

  // ── Inspector state refs (no re-renders needed) ───────────────
  const inspectorActiveRef = useRef(false);
  const sectionMetaRef = useRef<Map<string, InspectorSectionMeta>>(new Map());
  const hoveredSectionRef = useRef<string | null>(null);
  const selectedSectionRef = useRef<string | null>(null);
  const styleSheetRef = useRef<HTMLStyleElement | null>(null);
  const labelElRef = useRef<HTMLDivElement | null>(null);

  const applyTheme = useCallback((theme: ThemeConfig) => {
    const cssVars = themeToStyleAttr(theme);
    const root = document.querySelector<HTMLElement>(".g-body");
    if (root) {
      for (const [key, value] of Object.entries(cssVars)) {
        root.style.setProperty(key, value as string);
      }
    }

    const bgEl = root?.querySelector<HTMLElement>(".min-h-dvh");
    if (bgEl) {
      const bgStyle = backgroundStyle(theme.background, theme.colors);
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

    const fontsToLoad = [
      theme.typography.headingFont,
      theme.typography.bodyFont,
      ...(theme.typography.buttonFont ? [theme.typography.buttonFont] : []),
    ];
    const newUrl = googleFontsUrl(fontsToLoad);

    if (newUrl) {
      if (fontLinkRef.current) {
        if (fontLinkRef.current.href !== newUrl) fontLinkRef.current.href = newUrl;
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
    setTimeout(() => { refreshInFlightRef.current = false; }, 500);
  }, [router]);

  // ── Scroll-to-target controller ──────────────────────────────
  const retryCleanupRef = useRef<(() => void) | null>(null);

  const handleScrollToTarget = useCallback((target: PreviewScrollTarget) => {
    if (retryCleanupRef.current) {
      retryCleanupRef.current();
      retryCleanupRef.current = null;
    }

    const selector = target.elementId
      ? `[data-element-id="${target.elementId}"]`
      : target.blockId
        ? `[data-block-id="${target.blockId}"]`
        : `[data-section-id="${target.sectionId}"]`;

    const scrollTo = (el: Element) => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const el = document.querySelector(selector);
    if (el) { scrollTo(el); return; }

    if (__DEV__) console.log("[PreviewBridge] Target not found, watching for:", selector);

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      cancelled = true;
      observer.disconnect();
      retryCleanupRef.current = null;
    }, 3000);

    const observer = new MutationObserver(() => {
      if (cancelled) return;
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        clearTimeout(timeoutId);
        retryCleanupRef.current = null;
        requestAnimationFrame(() => { if (!cancelled) scrollTo(found); });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    retryCleanupRef.current = () => { cancelled = true; observer.disconnect(); clearTimeout(timeoutId); };
  }, []);

  // ── Inspector: inject stylesheet ──────────────────────────────

  const ensureStyleSheet = useCallback(() => {
    if (styleSheetRef.current) return;
    const style = document.createElement("style");
    style.id = "__inspector-styles";
    style.textContent = `
      [data-inspector-hover] {
        outline: 1.5px solid ${INSPECTOR_COLOR} !important;
        outline-offset: -1.5px;
        position: relative;
      }
      [data-inspector-selected] {
        outline: 1.5px solid ${INSPECTOR_COLOR} !important;
        outline-offset: -1.5px;
        position: relative;
      }
    `;
    document.head.appendChild(style);
    styleSheetRef.current = style;
  }, []);

  // ── Inspector: floating label ─────────────────────────────────

  const getLabel = useCallback((): HTMLDivElement => {
    if (labelElRef.current) return labelElRef.current;

    const el = document.createElement("div");
    el.id = "__inspector-label";
    el.style.cssText = `
      position:absolute;top:0;left:0;z-index:99999;
      display:flex;align-items:center;gap:7px;
      padding:6px 10px;background:${INSPECTOR_COLOR};color:#fff;
      font-size:14px;font-weight:500;font-family:'Inter',system-ui,sans-serif;
      white-space:nowrap;line-height:1;border-radius:0 0 6px 0;
      pointer-events:auto;cursor:default;
    `;
    el.innerHTML = `
      <span data-role="icon-wrap" style="position:relative;display:flex;width:18px;height:18px;">
        <span data-role="icon" class="material-symbols-rounded" style="font-size:18px;font-variation-settings:'wght' 500;transition:opacity 0.15s;"></span>
        <span data-role="icon-close" class="material-symbols-rounded" style="font-size:18px;font-variation-settings:'wght' 500;position:absolute;inset:0;opacity:0;transition:opacity 0.15s;">close</span>
      </span>
      <span data-role="name"></span>
    `;
    labelElRef.current = el;
    return el;
  }, []);

  /** Attach the label to a section element */
  const showLabel = useCallback((sectionEl: Element, selected: boolean) => {
    const label = getLabel();
    const sectionId = sectionEl.getAttribute("data-section-id") || "";
    const meta = sectionMetaRef.current.get(sectionId);

    label.querySelector<HTMLElement>('[data-role="icon"]')!.textContent = meta?.icon || "grid_view";
    label.querySelector<HTMLElement>('[data-role="name"]')!.textContent = meta?.name || sectionId;

    // When selected: hover on label swaps icon → close
    if (selected) {
      label.style.cursor = "pointer";
      label.setAttribute("data-selected", "");
      label.onmouseenter = () => {
        label.querySelector<HTMLElement>('[data-role="icon"]')!.style.opacity = "0";
        label.querySelector<HTMLElement>('[data-role="icon-close"]')!.style.opacity = "1";
      };
      label.onmouseleave = () => {
        label.querySelector<HTMLElement>('[data-role="icon"]')!.style.opacity = "1";
        label.querySelector<HTMLElement>('[data-role="icon-close"]')!.style.opacity = "0";
      };
    } else {
      label.style.cursor = "default";
      label.removeAttribute("data-selected");
      label.onmouseenter = null;
      label.onmouseleave = null;
      label.querySelector<HTMLElement>('[data-role="icon"]')!.style.opacity = "1";
      label.querySelector<HTMLElement>('[data-role="icon-close"]')!.style.opacity = "0";
    }

    // Attach label inside the section element (follows scroll naturally)
    if (label.parentElement !== sectionEl) {
      sectionEl.prepend(label);
    }
  }, [getLabel]);

  const hideLabel = useCallback(() => {
    const label = labelElRef.current;
    if (label?.parentElement) label.remove();
  }, []);

  /** Send message to parent */
  const postToParent = useCallback((msg: Record<string, unknown>) => {
    if (window === window.parent) return;
    window.parent.postMessage(msg, window.location.origin);
  }, []);

  /** Find the section element from any child target */
  const findSection = useCallback((target: EventTarget | null): Element | null => {
    if (!target || !(target instanceof HTMLElement)) return null;
    return target.closest("[data-section-id]");
  }, []);

  // ── Clear all inspector highlights ─────────────────────────────

  const clearHighlights = useCallback(() => {
    document.querySelectorAll("[data-inspector-hover]").forEach((el) => el.removeAttribute("data-inspector-hover"));
    document.querySelectorAll("[data-inspector-selected]").forEach((el) => el.removeAttribute("data-inspector-selected"));
    hideLabel();
  }, [hideLabel]);

  // ── Inspector event handlers ──────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!inspectorActiveRef.current) return;
    const section = findSection(e.target);
    const id = section?.getAttribute("data-section-id") || null;

    if (id === hoveredSectionRef.current) return;
    hoveredSectionRef.current = id;

    postToParent({ type: "inspector-hover", sectionId: id });

    // Don't change visual highlight if we have a selected section
    if (selectedSectionRef.current) return;

    // Clear previous hover
    document.querySelectorAll("[data-inspector-hover]").forEach((el) => el.removeAttribute("data-inspector-hover"));

    if (section) {
      section.setAttribute("data-inspector-hover", "");
      showLabel(section, false);
    } else {
      hideLabel();
    }
  }, [findSection, postToParent, showLabel, hideLabel]);

  const handleClick = useCallback((e: MouseEvent) => {
    if (!inspectorActiveRef.current) return;

    // Let links and buttons work normally
    const target = e.target as HTMLElement;
    if (target.closest("a[href], button:not([data-role='close'])")) return;

    const section = findSection(target);
    if (!section) return;

    const sectionId = section.getAttribute("data-section-id") || "";

    // Clear previous selection
    document.querySelectorAll("[data-inspector-selected]").forEach((el) => el.removeAttribute("data-inspector-selected"));
    document.querySelectorAll("[data-inspector-hover]").forEach((el) => el.removeAttribute("data-inspector-hover"));

    // Toggle: click same section → deselect
    if (selectedSectionRef.current === sectionId) {
      selectedSectionRef.current = null;
      hideLabel();
      return;
    }

    selectedSectionRef.current = sectionId;
    section.setAttribute("data-inspector-selected", "");
    showLabel(section, true);
    postToParent({ type: "inspector-click", sectionId });
  }, [findSection, showLabel, hideLabel, postToParent]);

  const handleCloseClick = useCallback(() => {
    selectedSectionRef.current = null;
    hoveredSectionRef.current = null;
    clearHighlights();
    postToParent({ type: "inspector-hover", sectionId: null });
  }, [clearHighlights, postToParent]);

  /** Label click — only deselects when label is in selected state */
  const handleLabelClick = useCallback((e: Event) => {
    e.stopPropagation();
    const label = labelElRef.current;
    if (!label?.hasAttribute("data-selected")) return;
    handleCloseClick();
  }, [handleCloseClick]);

  const handleMouseLeave = useCallback(() => {
    if (!inspectorActiveRef.current) return;
    hoveredSectionRef.current = null;
    postToParent({ type: "inspector-hover", sectionId: null });
    if (!selectedSectionRef.current) {
      document.querySelectorAll("[data-inspector-hover]").forEach((el) => el.removeAttribute("data-inspector-hover"));
      hideLabel();
    }
  }, [hideLabel, postToParent]);

  // ── Activate/deactivate inspector ──────────────────────────────

  const activateInspector = useCallback((sections: InspectorSectionMeta[]) => {
    inspectorActiveRef.current = true;
    sectionMetaRef.current = new Map(sections.map((s) => [s.id, s]));
    ensureStyleSheet();

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("click", handleClick, true);
    document.addEventListener("mouseleave", handleMouseLeave);

    // Attach close handler to entire label (click when selected)
    const label = getLabel();
    label.addEventListener("click", handleLabelClick);
  }, [handleMouseMove, handleClick, handleMouseLeave, handleLabelClick, ensureStyleSheet, getLabel]);

  const deactivateInspector = useCallback(() => {
    inspectorActiveRef.current = false;
    hoveredSectionRef.current = null;
    selectedSectionRef.current = null;

    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("mouseleave", handleMouseLeave);

    const label = labelElRef.current;
    label?.removeEventListener("click", handleLabelClick);

    clearHighlights();
  }, [handleMouseMove, handleClick, handleMouseLeave, handleLabelClick, clearHighlights]);

  // ── Main message listener ─────────────────────────────────────

  useEffect(() => {
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
        case "inspector-mode":
          if (data.active) {
            activateInspector(data.sections);
          } else {
            deactivateInspector();
          }
          break;
      }
    }

    window.addEventListener("message", onMessage);

    if (__DEV__) console.log("[PreviewBridge] Sending preview-ready");
    window.parent.postMessage({ type: "preview-ready" }, window.location.origin);

    // ── Persistent navigation reporter ────────────────────────
    // Monkey-patch history.pushState/replaceState so navigation is
    // reported to the parent EVEN when PreviewBridge unmounts during
    // a route-group transition (e.g. /preview/* → /search).
    // This is intentionally NOT cleaned up — the patch must survive
    // across layouts for the editor to stay in sync.
    const PATCHED = "__preview_nav_patched__";
    if (!(window.history as any)[PATCHED]) {
      const parentOrigin = window.location.origin;
      const notify = () => {
        window.parent.postMessage(
          { type: "preview-navigate", pathname: window.location.pathname },
          parentOrigin,
        );
      };

      const origPush = window.history.pushState.bind(window.history);
      const origReplace = window.history.replaceState.bind(window.history);

      window.history.pushState = function (...args: Parameters<typeof origPush>) {
        origPush(...args);
        notify();
      };
      window.history.replaceState = function (...args: Parameters<typeof origReplace>) {
        origReplace(...args);
        notify();
      };

      window.addEventListener("popstate", notify);
      (window.history as any)[PATCHED] = true;

      if (__DEV__) console.log("[PreviewBridge] History patched for persistent nav reporting");
    }

    return () => {
      window.removeEventListener("message", onMessage);
      if (retryCleanupRef.current) {
        retryCleanupRef.current();
        retryCleanupRef.current = null;
      }
      if (inspectorActiveRef.current) deactivateInspector();
      if (styleSheetRef.current) {
        styleSheetRef.current.remove();
        styleSheetRef.current = null;
      }
      if (labelElRef.current) {
        labelElRef.current.remove();
        labelElRef.current = null;
      }
    };
  }, [applyTheme, handleContentRefresh, handleScrollToTarget, activateInspector, deactivateInspector]);

  // ── Report navigation changes to parent ────────────────────
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (window === window.parent) return;
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;
    if (__DEV__) console.log("[PreviewBridge] Navigate:", pathname);
    window.parent.postMessage(
      { type: "preview-navigate", pathname },
      window.location.origin,
    );
  }, [pathname]);

  return null;
}
