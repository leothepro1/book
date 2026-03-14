"use client";

/**
 * Main canvas area (column 3).
 *
 * Renders the live guest portal preview inside a phone-sized frame.
 * The preview route is driven by currentPageId via the config accessor.
 */

import { useCallback, useMemo } from "react";
import { GuestPreviewFrame } from "@/app/(admin)/_components/GuestPreview";
import type { PreviewRoute } from "@/app/(admin)/_components/GuestPreview/types";
import "@/app/(admin)/_components/GuestPreview/preview.css";
import { useEditor } from "./EditorContext";
import { getPreviewRoute } from "@/app/_lib/pages/config";

export function EditorCanvas() {
  const {
    detailTarget,
    inspectorActive,
    currentPageId,
    setInspectorHoveredSectionId,
    openDetail,
  } = useEditor();

  const previewRoute = useMemo(
    () => getPreviewRoute(currentPageId) as PreviewRoute,
    [currentPageId],
  );

  const handleInspectorHover = useCallback(
    (sectionId: string | null) => setInspectorHoveredSectionId(sectionId),
    [setInspectorHoveredSectionId],
  );

  const handleInspectorClick = useCallback(
    (sectionId: string) => openDetail({ sectionId }),
    [openDetail],
  );

  return (
    <div className="editor-canvas">
      <GuestPreviewFrame
        route={previewRoute}
        className="editor-canvas__preview"
        scrollTarget={detailTarget}
        inspectorActive={inspectorActive}
        inspectorPageId={currentPageId}
        onInspectorHover={handleInspectorHover}
        onInspectorClick={handleInspectorClick}
      />
    </div>
  );
}
