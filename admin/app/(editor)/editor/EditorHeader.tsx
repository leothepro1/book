"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Tooltip } from "@/app/_components/Tooltip";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { EditorPublishBar } from "./EditorPublishBar";

/**
 * Editor header bar.
 *
 * Full-width top bar with:
 *   - Back navigation (left)
 *   - Title
 *   - Spacer
 *   - Undo / Redo / Publish controls (right, always visible)
 */
export function EditorHeader() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.push("/home");
  }, [router]);

  return (
    <header className="editor-header">
      <Tooltip label="Stäng">
        <button
          type="button"
          onClick={handleBack}
          className="editor-header__back"
          aria-label="Tillbaka till Home"
        >
          <EditorIcon name="logout" size={22} style={{ transform: "rotate(180deg)" }} />
        </button>
      </Tooltip>

      <span className="editor-header__title">Editor</span>

      <div className="editor-header__spacer" />

      <EditorPublishBar />
    </header>
  );
}
