"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePublishBarInternal } from "./PublishBarContext";
import "./publish-bar.css";

// ── Shared animated spinner (white by default) ──────────────────

function ActionSpinner({ visible, className = "" }: { visible: boolean; className?: string }) {
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
      className={`publish-spinner ${animState === "exit" ? "publish-spinner--out" : ""} ${className}`}
      width="16"
      height="16"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2.5" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

// ── Generic publish bar (props-driven, no context dependency) ───

export interface PublishBarProps {
  hasUnsavedChanges: boolean;
  isPublishing: boolean;
  isDiscarding: boolean;
  isLingeringAfterPublish: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  /** Optional error message */
  error?: string | null;
  /** Extra class name on the root element */
  className?: string;
}

export function PublishBarUI({
  hasUnsavedChanges,
  isPublishing,
  isDiscarding,
  isLingeringAfterPublish,
  onPublish,
  onDiscard,
  error,
  className,
}: PublishBarProps) {
  const visible = hasUnsavedChanges || isLingeringAfterPublish;
  const busy = isPublishing || isDiscarding;

  const bar = (
    <div className={`publish-actions ${visible ? "publish-actions--visible" : ""}${className ? ` ${className}` : ""}`}>
      {/* Left: status */}
      <div className="publish-status">
        <span className="publish-status__text">Osparade ändringar</span>
      </div>

      {/* Right: actions */}
      <div className="publish-actions-right">
        <button
          type="button"
          className="publish-discard"
          onClick={onDiscard}
          disabled={busy || isLingeringAfterPublish}
        >
          <ActionSpinner visible={isDiscarding} />
          {!isDiscarding && <span>Ignorera</span>}
        </button>
        <button
          type="button"
          className={`publish-save${isLingeringAfterPublish ? " publish-save--done" : ""}`}
          onClick={onPublish}
          disabled={busy || isLingeringAfterPublish}
        >
          <ActionSpinner visible={isPublishing} />
          {!isPublishing && <span>Spara</span>}
        </button>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(bar, document.body);
  }
  return bar;
}

// ── Editor publish bar (reads from PublishBarContext) ────────────

export function PublishBar() {
  const {
    isPublishing,
    isDiscarding,
    isLingeringAfterPublish,
    hasUnsavedChanges,
    handlePublish,
    handleDiscard,
  } = usePublishBarInternal();

  return (
    <PublishBarUI
      hasUnsavedChanges={hasUnsavedChanges}
      isPublishing={isPublishing}
      isDiscarding={isDiscarding}
      isLingeringAfterPublish={isLingeringAfterPublish}
      onPublish={handlePublish}
      onDiscard={handleDiscard}
    />
  );
}
