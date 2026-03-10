"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
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
      <button
        type="button"
        onClick={handleBack}
        className="editor-header__back"
        aria-label="Tillbaka till Home"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M10 3L5 8l5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <span className="editor-header__title">Editor</span>

      <div className="editor-header__spacer" />

      <EditorPublishBar />
    </header>
  );
}
