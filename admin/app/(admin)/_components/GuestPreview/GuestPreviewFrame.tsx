"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { usePreview } from "./PreviewContext";
import type { GuestPreviewProps } from "./types";
import type { ParentToPreviewMessage } from "@/app/(preview)/_lib/previewMessages";
import "./preview-spinner.css";

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
const IFRAME_WIDTH = 375;
const IFRAME_HEIGHT = 667;

function GuestPreviewFrame({
  route,
  className = "",
}: Omit<GuestPreviewProps, "device">) {
  const { config, draftVersion } = usePreview();
  const [copied, setCopied] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
        console.log("[GuestPreview] Sending:", message.type);
        w.postMessage(message, window.location.origin);
      } else {
        console.log("[GuestPreview] No contentWindow for:", message.type);
      }
    } catch (e) {
      console.log("[GuestPreview] postMessage failed:", e);
    }
  }, []);

  // ── When bridge signals ready, push full current theme ───────
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "preview-ready") {
        console.log("[GuestPreview] Received preview-ready from iframe");
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
    console.log("[GuestPreview] Theme changed, posting to iframe");
    postToPreview({ type: "theme-update", theme: config.theme });
  }, [config?.theme, postToPreview]);

  // ── Content refresh → after draft persisted to DB ────────────
  const prevDraftVersion = useRef(draftVersion);
  useEffect(() => {
    if (draftVersion === 0 || draftVersion === prevDraftVersion.current) return;
    prevDraftVersion.current = draftVersion;
    console.log("[GuestPreview] Draft saved, sending content-refresh");
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
      <div className="preview-widget-inner">
        {/* Share URL */}
        <div style={shareContainerStyle}>
          <div style={shareInnerStyle}>
            <input
              type="text"
              readOnly
              value={SHARE_URL}
              className="preview-share-input"
              style={inputStyle}
              onClick={handleInputClick}
              aria-label="Share URL"
            />
            <button onClick={handleCopy} style={copyBtnStyle} aria-label={copied ? "Copied" : "Copy link"} type="button">
              {copied ? <CheckIcon /> : <ShareIcon />}
            </button>
          </div>
        </div>

        {/* Mobile iframe */}
        <div style={iframeContainerStyle}>
          {!iframeLoaded && (
            <div className="preview-spinner-overlay">
              <div className="preview-spinner" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            style={iframeStyle}
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

const shareContainerStyle: React.CSSProperties = {
  background: "white",
  padding: 0,
  borderRadius: 50,
  boxShadow: "none",
  marginBottom: 32,
};

const shareInnerStyle: React.CSSProperties = {
  position: "relative",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e5e5e5",
  borderRadius: 8000,
  fontSize: 14,
  fontFamily: "monospace",
  color: "#666",
  cursor: "text",
  boxSizing: "border-box",
  textOverflow: "ellipsis",
  paddingTop: "0.75rem",
  paddingBottom: "0.75rem",
  paddingRight: "2.5rem",
  paddingLeft: "1.5rem",
  background: "#fff",
};

const copyBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#2b2b2b",
  transition: "color 0.2s",
};

const iframeContainerStyle: React.CSSProperties = {
  width: IFRAME_WIDTH,
  height: IFRAME_HEIGHT,
  position: "relative",
  background: "white",
  borderRadius: 20,
  overflow: "hidden",
  boxShadow: "rgba(0, 0, 0, 0.2) 0px 18px 50px -10px",
};

const iframeStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  border: "none",
  background: "white",
};

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
