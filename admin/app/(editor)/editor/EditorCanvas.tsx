"use client";

/**
 * Main canvas area (column 3).
 *
 * Renders the live guest portal preview inside a phone-sized frame.
 * The preview route is driven by currentPageId via the config accessor.
 *
 * When the iframe navigates internally (e.g. user clicks search),
 * it reports the new pathname via postMessage. EditorCanvas maps
 * the preview pathname to a PageId and syncs the editor panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GuestPreviewFrame } from "@/app/(admin)/_components/GuestPreview";
import type { PreviewRoute } from "@/app/(admin)/_components/GuestPreview/types";
import "@/app/(admin)/_components/GuestPreview/preview.css";
import { useEditor } from "./EditorContext";
import { getPreviewRoute } from "@/app/_lib/pages/config";
import { getPageDefinition, isPageId } from "@/app/_lib/pages/registry";
import type { PageId } from "@/app/_lib/pages/types";

/**
 * Maps a preview iframe pathname back to a PageId.
 * Returns null if the path doesn't correspond to an editor page.
 */
function resolvePageIdFromPreviewPath(pathname: string): PageId | null {
  // /preview/{slug}?draft=1 — the primary pattern
  const previewMatch = pathname.match(/^\/preview\/([^/?]+)/);
  if (previewMatch) {
    const slug = previewMatch[1];
    if (isPageId(slug)) return slug;
    return null;
  }

  // /p/test — home page
  if (/^\/p\/[^/]+\/?$/.test(pathname)) return "home";
  // /p/test/account
  if (/^\/p\/[^/]+\/account/.test(pathname)) return "account";
  // /p/test/stays
  if (/^\/p\/[^/]+\/stays/.test(pathname)) return "stays";
  // /p/test/check-in
  if (/^\/p\/[^/]+\/check-in/.test(pathname)) return "check-in";
  // /p/test/help-center
  if (/^\/p\/[^/]+\/help-center/.test(pathname)) return "help-center";
  // /p/test/support
  if (/^\/p\/[^/]+\/support/.test(pathname)) return "support";

  // Guest routes without token
  if (/^\/search/.test(pathname)) return "stays";
  if (/^\/stays/.test(pathname)) return "stays";
  if (/^\/checkout/.test(pathname)) return "checkout";
  if (/^\/login/.test(pathname)) return "login";
  if (/^\/check-in/.test(pathname)) return "check-in";
  if (/^\/check-out/.test(pathname)) return "check-in";

  return null;
}

export function EditorCanvas() {
  const {
    detailTarget,
    inspectorActive,
    currentPageId,
    activeStepId,
    viewportMode,
    setInspectorHoveredSectionId,
    setCurrentPageId,
    openDetail,
  } = useEditor();

  // ── Iframe route management ────────────────────────────────
  // The iframe route is tracked separately from currentPageId so that
  // iframe-driven navigation (user clicking links in the preview) can
  // update editor panels WITHOUT reloading the iframe — it's already
  // showing the correct content.
  //
  // iframeRoute only changes when the user picks a page from the
  // dropdown (EditorHeader), not when the iframe navigates internally.

  // Stores the pageId that an iframe navigation targeted, so the
  // effect can distinguish "iframe drove this change" from "dropdown
  // drove this change". A boolean flag would race — if the iframe
  // sends preview-navigate right before the user clicks the dropdown,
  // the flag bleeds across and the dropdown click is swallowed.
  const iframeNavTargetRef = useRef<PageId | null>(null);
  const [iframeRoute, setIframeRoute] = useState<PreviewRoute>(
    () => getPreviewRoute(currentPageId) as PreviewRoute,
  );

  // Sync iframe route when currentPageId changes from the dropdown.
  // Skip when the change was driven by iframe navigation (the iframe
  // is already showing the right content).
  const prevPageIdRef = useRef(currentPageId);
  useEffect(() => {
    if (currentPageId === prevPageIdRef.current) return;
    prevPageIdRef.current = currentPageId;

    if (iframeNavTargetRef.current === currentPageId) {
      // This change matches what the iframe reported — don't reload it
      iframeNavTargetRef.current = null;
      return;
    }
    // Dropdown click (or target mismatch) — reload iframe
    iframeNavTargetRef.current = null;
    setIframeRoute(getPreviewRoute(currentPageId) as PreviewRoute);
  }, [currentPageId]);

  const handleInspectorHover = useCallback(
    (sectionId: string | null) => setInspectorHoveredSectionId(sectionId),
    [setInspectorHoveredSectionId],
  );

  const handleInspectorClick = useCallback(
    (sectionId: string) => openDetail({ sectionId }),
    [openDetail],
  );

  const handlePreviewNavigate = useCallback(
    (pathname: string) => {
      const pageId = resolvePageIdFromPreviewPath(pathname);
      if (!pageId || pageId === currentPageId) return;

      // Only navigate to pages that are visible in the editor
      const def = getPageDefinition(pageId);
      if (!def.editorVisible) return;

      iframeNavTargetRef.current = pageId;
      setCurrentPageId(pageId);
    },
    [currentPageId, setCurrentPageId],
  );

  return (
    <div className="editor-canvas" data-viewport={viewportMode}>
      <GuestPreviewFrame
        route={iframeRoute}
        className={`editor-canvas__preview${viewportMode === "desktop" ? " editor-canvas__preview--desktop" : ""}`}
        scrollTarget={detailTarget}
        inspectorActive={inspectorActive}
        inspectorPageId={currentPageId}
        onInspectorHover={handleInspectorHover}
        onInspectorClick={handleInspectorClick}
        onNavigate={handlePreviewNavigate}
      />
    </div>
  );
}
