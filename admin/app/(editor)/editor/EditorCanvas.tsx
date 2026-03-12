"use client";

/**
 * Main canvas area (column 3).
 *
 * Renders the live guest portal preview inside a phone-sized frame.
 * Uses the same GuestPreviewFrame component as /home and /design —
 * not a copy, the exact same component with the same postMessage
 * bridge, SSE sync, and theme-update pipeline.
 *
 * Passes `detailTarget` from editor context as `scrollTarget` to
 * sync iframe scroll position with the currently selected item.
 */

import { GuestPreviewFrame } from "@/app/(admin)/_components/GuestPreview";
import "@/app/(admin)/_components/GuestPreview/preview.css";
import { useEditor } from "./EditorContext";

export function EditorCanvas() {
  const { detailTarget } = useEditor();

  return (
    <div className="editor-canvas">
      <GuestPreviewFrame
        route="/p/[token]"
        className="editor-canvas__preview"
        scrollTarget={detailTarget}
      />
    </div>
  );
}
