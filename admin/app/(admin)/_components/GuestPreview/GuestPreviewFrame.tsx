"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { usePreview } from "./PreviewContext";
import { usePublishBar } from "../PublishBar";
import type { GuestPreviewProps } from "./types";
import type { ParentToPreviewMessage } from "@/app/(preview)/_lib/previewMessages";
import { isValidPreviewMessage } from "@/app/(preview)/_lib/previewMessages";
import "./preview-spinner.css";

const __DEV__ = process.env.NODE_ENV === "development";

const ROUTE_TO_SLUG: Readonly<Record<string, string>> = {
  "/p/[token]": "home",
  "/p/[token]/account": "account",
  "/p/[token]/stays": "stays",
  "/check-in": "check-in",
  "/check-out": "check-out",
  "/p/[token]/help-center": "help-center",
  "/p/[token]/support": "support",
} as const;

const SHARE_URL = "https://hospitality-8hca.onrender.com/p/test";
const COPY_FEEDBACK_MS = 2000;

function GuestPreviewFrame({
  route,
  className = "",
}: Omit<GuestPreviewProps, "device">) {
  const { config, draftVersion } = usePreview();
  const { hasUnsavedChanges } = usePublishBar();
  const [copied, setCopied] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  const previewSlug = ROUTE_TO_SLUG[route] || "home";
  const iframeSrc = `/preview/${previewSlug}?draft=1`;

  // Reset loading state when src changes
  const prevSrcRef = useRef(iframeSrc);
  if (iframeSrc !== prevSrcRef.current) {
    prevSrcRef.current = iframeSrc;
    setIframeLoaded(false);
  }

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

  // ── When bridge signals ready, push full current theme ───────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isValidPreviewMessage(event)) return;
      if (event.data.type === "preview-ready") {
        if (__DEV__) console.log("[GuestPreview] Received preview-ready");
        if (config?.theme) {
          const w = iframeRef.current?.contentWindow;
          if (w) w.postMessage({ type: "theme-update", theme: config.theme } satisfies ParentToPreviewMessage, window.location.origin);
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [config]);

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
              <div className="preview-spinner" />
            </div>
          )}
          <iframe
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
