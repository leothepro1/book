"use client";

/**
 * Editor Publish Bar
 * ──────────────────
 * Always-visible undo/redo/publish controls for the editor header.
 *
 * Unlike the admin PublishBar (which hides when no changes exist),
 * this component is always rendered. Buttons are disabled until
 * there are unsaved changes.
 *
 * Reuses PublishBarContext internals — same undo/redo stacks,
 * same publish workflow, same navigation guard integration.
 */

import { useState, useEffect, useRef } from "react";
import { usePublishBarInternal } from "@/app/(admin)/_components/PublishBar/PublishBarContext";
import "@/app/(admin)/_components/PublishBar/publish-bar.css";

export function EditorPublishBar() {
  const {
    undoStack,
    redoStack,
    isUndoing,
    isPublishing,
    isLingeringAfterPublish,
    hasUnsavedChanges,
    handleUndo,
    handleRedo,
    handlePublish,
  } = usePublishBarInternal();

  const canUndo = undoStack.length > 0 && !isUndoing && !isLingeringAfterPublish;
  const canRedo = redoStack.length > 0 && !isUndoing && !isLingeringAfterPublish;
  const canPublish = hasUnsavedChanges && !isPublishing && !isLingeringAfterPublish;

  return (
    <div className="editor-publish">
      <div className="editor-publish__group">
        <button
          type="button"
          className="editor-publish__icon-btn"
          onClick={handleUndo}
          disabled={!canUndo}
          aria-label="Ångra"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M232,184a8,8,0,0,1-16,0A88,88,0,0,0,65.78,121.78L43.4,144H88a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V88a8,8,0,0,1,16,0v44.77l22.48-22.33A104,104,0,0,1,232,184Z" />
          </svg>
        </button>
        <button
          type="button"
          className="editor-publish__icon-btn"
          onClick={handleRedo}
          disabled={!canRedo}
          aria-label="Gör om"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M240,88v64a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h44.6l-22.36-22.21A88,88,0,0,0,40,184a8,8,0,0,1-16,0,104,104,0,0,1,177.54-73.54L224,132.77V88a8,8,0,0,1,16,0Z" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="editor-publish__btn"
        onClick={handlePublish}
        disabled={!canPublish}
      >
        <PublishSpinner visible={isPublishing} />
        <span>{isLingeringAfterPublish ? "Publicerad" : "Publicera"}</span>
      </button>
    </div>
  );
}

/**
 * Animated spinner with enter/exit transitions.
 * Stays mounted during exit animation for smooth collapse.
 */
function PublishSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") {
      setMounted(false);
      setAnimState("idle");
    } else if (animState === "enter") {
      setAnimState("idle");
    }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`publish-spinner ${animState === "exit" ? "publish-spinner--out" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}
