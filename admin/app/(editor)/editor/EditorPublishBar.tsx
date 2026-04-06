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
import { Tooltip } from "@/app/_components/Tooltip";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useEditor } from "./EditorContext";
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

  const { inspectorActive, setInspectorActive, viewportMode, setViewportMode } = useEditor();

  const canUndo = undoStack.length > 0 && !isUndoing && !isLingeringAfterPublish;
  const canRedo = redoStack.length > 0 && !isUndoing && !isLingeringAfterPublish;
  const canPublish = hasUnsavedChanges && !isPublishing && !isLingeringAfterPublish;

  return (
    <div className="editor-publish">
      <Tooltip label={inspectorActive ? "Inaktivera inspektör" : "Aktivera inspektör"}>
        <button
          type="button"
          className={`editor-publish__icon-btn editor-publish__inspector${inspectorActive ? " editor-publish__inspector--active" : ""}`}
          onClick={() => setInspectorActive(!inspectorActive)}
          aria-label={inspectorActive ? "Inaktivera inspektör" : "Aktivera inspektör"}
        >
          <EditorIcon name="web_traffic" size={20} />
        </button>
      </Tooltip>
      <Tooltip label={viewportMode === "mobile" ? "Datorvy" : "Mobilvy"}>
        <button
          type="button"
          className={`editor-publish__icon-btn editor-publish__inspector${viewportMode === "mobile" ? " editor-publish__inspector--active" : ""}`}
          onClick={() => setViewportMode(viewportMode === "mobile" ? "desktop" : "mobile")}
          aria-label={viewportMode === "mobile" ? "Datorvy" : "Mobilvy"}
        >
          <svg width={21} height={21} viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M7.75 13.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Z" /><path fillRule="evenodd" d="M4.75 5.75a2.75 2.75 0 0 1 2.75-2.75h5a2.75 2.75 0 0 1 2.75 2.75v8.5a2.75 2.75 0 0 1-2.75 2.75h-5a2.75 2.75 0 0 1-2.75-2.75v-8.5Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h5c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25h-.531a1 1 0 0 1-.969.75h-2a1 1 0 0 1-.969-.75h-.531Z" /></svg>
        </button>
      </Tooltip>
      <div className="editor-publish__group">
        <Tooltip label="Ångra">
          <button
            type="button"
            className="editor-publish__icon-btn"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Ångra"
          >
            <EditorIcon name="undo" size={20} />
          </button>
        </Tooltip>
        <Tooltip label="Gör om">
          <button
            type="button"
            className="editor-publish__icon-btn"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Gör om"
          >
            <EditorIcon name="redo" size={20} />
          </button>
        </Tooltip>
      </div>

      <Tooltip label="Spara">
        <PublishButton
          isPublishing={isPublishing}
          isLingeringAfterPublish={isLingeringAfterPublish}
          disabled={!canPublish}
          onClick={handlePublish}
        />
      </Tooltip>
    </div>
  );
}

/**
 * Publish button that maintains its width when the spinner replaces the label.
 * The label is always in the DOM (preserves intrinsic width) but becomes
 * invisible when the spinner is active via opacity + position: absolute overlay.
 */
function PublishButton({
  isPublishing,
  isLingeringAfterPublish,
  disabled,
  onClick,
}: {
  isPublishing: boolean;
  isLingeringAfterPublish: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="editor-publish__btn"
      onClick={onClick}
      disabled={disabled}
      style={{ position: "relative" }}
    >
      {/* Label always rendered to preserve button width */}
      <span style={{ opacity: isPublishing ? 0 : 1, transition: "opacity 0.15s" }}>
        {isLingeringAfterPublish ? "Publicerad" : "Publicera"}
      </span>
      {/* Spinner overlaid centered when publishing */}
      {isPublishing && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg
            className="publish-spinner"
            width="18"
            height="18"
            viewBox="0 0 21 21"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </button>
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
