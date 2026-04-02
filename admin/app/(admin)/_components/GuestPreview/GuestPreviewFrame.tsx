"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { usePreview } from "./PreviewContext";
import { usePublishBar } from "../PublishBar";
import type { GuestPreviewProps } from "./types";
import type {
  ParentToPreviewMessage,
  PreviewScrollTarget,
  InspectorSectionMeta,
} from "@/app/(preview)/_lib/previewMessages";
import { isValidPreviewMessage } from "@/app/(preview)/_lib/previewMessages";
import { getSectionDefinition, getElementDefinition } from "@/app/_lib/sections/registry";
import { getPageSections } from "@/app/_lib/pages/config";
import "./preview-spinner.css";

const __DEV__ = process.env.NODE_ENV === "development";

const ROUTE_TO_SLUG: Readonly<Record<string, string>> = {
  "/p/[token]": "home",
  "/p/[token]/account": "account",
  "/p/[token]/stays": "stays",
  "/check-in": "check-in",
  "/check-out": "check-out",
  "/login": "login",
  "/p/[token]/help-center": "help-center",
  "/p/[token]/support": "support",
  "/preview/product": "product",
  "/preview/checkout": "checkout",
  "/preview/thank-you": "thank-you",
  "/preview/bookings": "bookings",
  "/preview/order-status": "order-status",
  "/preview/profile": "profile",
} as const;

// Share URL uses the app's base URL for now. Once tenant context is
// available in PreviewContext, this should use portalSlugToUrl(tenant.portalSlug).
const SHARE_URL = `${process.env.NEXT_PUBLIC_APP_URL || "https://rutgr.com"}/p/test`;
const COPY_FEEDBACK_MS = 2000;

function GuestPreviewFrame({
  route,
  className = "",
  scrollTarget,
  inspectorActive = false,
  inspectorPageId = "home",
  onInspectorHover,
  onInspectorClick,
}: Omit<GuestPreviewProps, "device"> & {
  scrollTarget?: PreviewScrollTarget | null;
  inspectorActive?: boolean;
  inspectorPageId?: import("@/app/_lib/pages/types").PageId;
  onInspectorHover?: (sectionId: string | null) => void;
  onInspectorClick?: (sectionId: string) => void;
}) {
  const { config, draftVersion } = usePreview();
  const { hasUnsavedChanges } = usePublishBar();
  const [copied, setCopied] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeKeyRef = useRef(0);

  // Sync preview-header height with admin-header
  useEffect(() => {
    const adminHeader = document.querySelector<HTMLElement>(".admin-header");
    if (!adminHeader) return;
    const sync = () => {
      document.documentElement.style.setProperty(
        "--admin-header-h",
        `${adminHeader.offsetHeight}px`,
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(adminHeader);
    return () => ro.disconnect();
  }, []);

  const previewSlug = ROUTE_TO_SLUG[route];
  const iframeSrc = previewSlug ? `/preview/${previewSlug}?draft=1` : route;

  // Reset loading state when src changes
  const prevSrcRef = useRef(iframeSrc);
  if (iframeSrc !== prevSrcRef.current) {
    prevSrcRef.current = iframeSrc;
    setIframeLoaded(false);
    setLoadFailed(false);
  }

  // ── Load timeout — if iframe doesn't load within 10s, show retry ──
  const LOAD_TIMEOUT_MS = 10_000;

  useEffect(() => {
    if (iframeLoaded || loadFailed) {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      return;
    }
    loadTimeoutRef.current = setTimeout(() => {
      if (!iframeLoaded) {
        setLoadFailed(true);
        if (__DEV__) console.warn("[GuestPreview] Load timeout — iframe did not load within", LOAD_TIMEOUT_MS, "ms");
      }
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [iframeLoaded, loadFailed]);

  // ── Retry handler — force reload iframe ──
  const handleRetry = useCallback(() => {
    iframeKeyRef.current += 1;
    setIframeLoaded(false);
    setLoadFailed(false);
  }, []);

  // ── Resource picker change — show spinner while iframe reloads ──
  useEffect(() => {
    const handler = () => {
      setIframeLoaded(false);
      setLoadFailed(false);
    };
    window.addEventListener("preview-resource-change", handler);
    return () => window.removeEventListener("preview-resource-change", handler);
  }, []);

  // ── PostMessage — fire-and-forget, no ready gate ─────────────
  const postToPreview = useCallback((message: ParentToPreviewMessage) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (w) {
        if (__DEV__) console.log("[GuestPreview] Sending:", message.type);
        w.postMessage(message, window.location.origin);
      }
    } catch (e) {
      if (__DEV__) console.warn("[GuestPreview] postMessage failed:", e);
    }
  }, []);

  // ── Build section metadata for inspector ────────────────────
  const buildInspectorMeta = useCallback((): InspectorSectionMeta[] => {
    const sections = getPageSections(config, inspectorPageId);
    return sections
      .filter((s: any) => s.isActive)
      .map((s: any) => {
        let name: string;
        let icon = "grid_view";

        if (s.definitionId === "__loose-element") {
          const firstEl = s.blocks?.[0]?.slots?.content?.[0];
          name = s.title || (firstEl ? (getElementDefinition(firstEl.type)?.name ?? s.definitionId) : s.definitionId);
          icon = "widgets";
        } else {
          const def = getSectionDefinition(s.definitionId);
          name = s.title || def?.name || s.definitionId;
          const bt = def?.presets[0]?.blockTypes[0];
          icon = bt?.icon || "grid_view";
        }

        return { id: s.id, name, icon };
      });
  }, [config, inspectorPageId]);

  // ── When bridge signals ready, push full current theme + active scroll target ──
  const scrollTargetRef = useRef(scrollTarget);
  scrollTargetRef.current = scrollTarget;

  // Keep stable refs for inspector callbacks
  const onInspectorHoverRef = useRef(onInspectorHover);
  onInspectorHoverRef.current = onInspectorHover;
  const onInspectorClickRef = useRef(onInspectorClick);
  onInspectorClickRef.current = onInspectorClick;
  const inspectorActiveRef = useRef(inspectorActive);
  inspectorActiveRef.current = inspectorActive;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isValidPreviewMessage(event)) return;
      const { data } = event;

      if (data.type === "preview-ready") {
        if (__DEV__) console.log("[GuestPreview] Received preview-ready");
        const w = iframeRef.current?.contentWindow;
        if (!w) return;
        if (config?.theme) {
          w.postMessage({ type: "theme-update", theme: config.theme } satisfies ParentToPreviewMessage, window.location.origin);
        }
        const target = scrollTargetRef.current;
        if (target) {
          w.postMessage({ type: "scroll-to-target", target } satisfies ParentToPreviewMessage, window.location.origin);
        }
        // Re-send inspector state after iframe reload
        if (inspectorActiveRef.current) {
          w.postMessage({
            type: "inspector-mode",
            active: true,
            sections: buildInspectorMeta(),
          } satisfies ParentToPreviewMessage, window.location.origin);
        }
      }

      // Inspector events from iframe
      if (data.type === "inspector-hover") {
        onInspectorHoverRef.current?.(data.sectionId);
      }
      if (data.type === "inspector-click") {
        onInspectorClickRef.current?.(data.sectionId);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [config, buildInspectorMeta]);

  // ── Theme updates → instant CSS vars in iframe ───────────────
  const prevThemeJson = useRef("");
  useEffect(() => {
    if (!config?.theme) return;
    const json = JSON.stringify(config.theme);
    if (json === prevThemeJson.current) return;
    prevThemeJson.current = json;
    if (__DEV__) console.log("[GuestPreview] Theme changed, posting to iframe");
    postToPreview({ type: "theme-update", theme: config.theme });
  }, [config?.theme, postToPreview]);

  // ── Content refresh → after draft persisted to DB ────────────
  const prevDraftVersion = useRef(draftVersion);
  useEffect(() => {
    if (draftVersion === 0 || draftVersion === prevDraftVersion.current) return;
    prevDraftVersion.current = draftVersion;
    if (__DEV__) console.log("[GuestPreview] Draft saved, sending content-refresh");
    postToPreview({ type: "content-refresh" });
  }, [draftVersion, postToPreview]);

  // ── Scroll-to-target → postMessage to iframe on every selection click ──
  useEffect(() => {
    if (!scrollTarget) return;
    postToPreview({ type: "scroll-to-target", target: scrollTarget });
  }, [scrollTarget, postToPreview]);

  // ── Inspector mode → send to iframe when toggled ─────────────
  useEffect(() => {
    postToPreview({
      type: "inspector-mode",
      active: inspectorActive,
      sections: inspectorActive ? buildInspectorMeta() : [],
    });
  }, [inspectorActive, postToPreview, buildInspectorMeta]);

  // ── Copy handler ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(SHARE_URL).catch(() => {
      const input = document.querySelector<HTMLInputElement>(".preview-share-input");
      if (input) { input.select(); document.execCommand("copy"); }
    });
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, []);

  const handleInputClick = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  }, []);

  return (
    <div className={`preview-widget ${className}`}>
      {/* Preview header */}
      <div className="preview-header">
        {hasUnsavedChanges ? (
          <div className="preview-header__unsaved">Osparade ändringar</div>
        ) : (
          <div className="preview-header__share">
            <input
              type="text"
              readOnly
              value={SHARE_URL}
              className="preview-header__input"
              onClick={handleInputClick}
              aria-label="Share URL"
            />
            <button onClick={handleCopy} className="preview-header__copy" aria-label={copied ? "Copied" : "Copy link"} type="button">
              {copied ? <CheckIcon /> : <ShareIcon />}
            </button>
          </div>
        )}
      </div>

      {/* Scaled phone frame */}
      <div className="preview-widget-inner">
        <div className="preview-phone">
          {!iframeLoaded && (
            <div className="preview-spinner-overlay">
              {loadFailed ? (
                <div className="preview-failed">
                  <div className="preview-failed__icon">!</div>
                  <p className="preview-failed__text">Förhandsgranskningen kunde inte laddas</p>
                  <button type="button" className="preview-failed__retry" onClick={handleRetry}>
                    Försök igen
                  </button>
                </div>
              ) : (
                <div className="preview-spinner" />
              )}
            </div>
          )}
          <iframe
            key={iframeKeyRef.current}
            ref={iframeRef}
            src={iframeSrc}
            className="preview-phone__iframe"
            title="Guest Portal Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(GuestPreviewFrame);

const CheckIcon = memo(function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#22c55e" viewBox="0 0 256 256" aria-hidden="true">
      <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
    </svg>
  );
});

const ShareIcon = memo(function ShareIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
      <path d="M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z" />
    </svg>
  );
});
