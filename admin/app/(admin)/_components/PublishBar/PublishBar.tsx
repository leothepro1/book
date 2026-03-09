"use client";

import { useState, useEffect, useRef } from "react";
import { usePublishBarInternal } from "./PublishBarContext";
import "./publish-bar.css";

/**
 * Animated spinner with enter/exit transitions.
 * Stays mounted during exit animation to allow smooth collapse.
 */
function AnimatedSpinner({ visible }: { visible: boolean }) {
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

  // Unmount after exit animation completes
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
      width="21"
      height="21"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

export function PublishBar() {
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

  const visible = hasUnsavedChanges || isLingeringAfterPublish;
  const publishDisabled = isPublishing || isLingeringAfterPublish;

  return (
    <div className={`publish-actions ${visible ? "publish-actions--visible" : ""}`}>
      <div className="publish-actions-left">
        <button
          type="button"
          className="publish-action-icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0 || isUndoing || isLingeringAfterPublish}
          aria-label="Undo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
            <path d="M232,184a8,8,0,0,1-16,0A88,88,0,0,0,65.78,121.78L43.4,144H88a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V88a8,8,0,0,1,16,0v44.77l22.48-22.33A104,104,0,0,1,232,184Z" />
          </svg>
        </button>
        <button
          type="button"
          className="publish-action-icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0 || isUndoing || isLingeringAfterPublish}
          aria-label="Redo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
            <path d="M240,88v64a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h44.6l-22.36-22.21A88,88,0,0,0,40,184a8,8,0,0,1-16,0,104,104,0,0,1,177.54-73.54L224,132.77V88a8,8,0,0,1,16,0Z" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        className={`publish-btn${publishDisabled ? " publish-btn--done" : ""}`}
        onClick={handlePublish}
        disabled={publishDisabled}
      >
        <AnimatedSpinner visible={isPublishing} />
        <span>Publicera</span>
      </button>
    </div>
  );
}
